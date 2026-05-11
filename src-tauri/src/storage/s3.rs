//! S3-compatible storage backend (AWS S3, Cloudflare R2, MinIO).
//!
//! Implemented as a thin layer over `reqwest` with manual SigV4 signing,
//! deliberately avoiding the full `aws-sdk-s3` because its TLS path
//! (`rustls-native-certs`) fails silently on Android — the OS cert store
//! is inaccessible from a normal app and the request hangs forever.
//! Using reqwest with `rustls-tls-webpki-roots` ships the Mozilla CA bundle
//! inside the binary, which works the same on every platform we target.

use crate::error::{AppError, AppResult};
use crate::storage::{S3Init, StorageBackend};
use async_trait::async_trait;
use aws_credential_types::Credentials;
use aws_sigv4::http_request::{
    sign, PayloadChecksumKind, SignableBody, SignableRequest, SigningSettings,
};
use aws_sigv4::sign::v4;
use percent_encoding::{utf8_percent_encode, AsciiSet, CONTROLS};
use reqwest::{Client, Method, StatusCode};
use std::time::{Duration, SystemTime};

// Encoding set used for S3 keys in URLs. S3 wants UriEncode that leaves
// "A-Z a-z 0-9 - . _ ~" alone and percent-encodes everything else.
const S3_KEY_ENCODE: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'!')
    .add(b'"')
    .add(b'#')
    .add(b'$')
    .add(b'%')
    .add(b'&')
    .add(b'\'')
    .add(b'(')
    .add(b')')
    .add(b'*')
    .add(b'+')
    .add(b',')
    .add(b'/')
    .add(b':')
    .add(b';')
    .add(b'<')
    .add(b'=')
    .add(b'>')
    .add(b'?')
    .add(b'@')
    .add(b'[')
    .add(b'\\')
    .add(b']')
    .add(b'^')
    .add(b'`')
    .add(b'{')
    .add(b'|')
    .add(b'}');

pub struct S3Storage {
    client: Client,
    /// Endpoint without trailing slash, e.g. `https://<account>.r2.cloudflarestorage.com`
    /// or `https://s3.us-east-1.amazonaws.com`.
    endpoint: String,
    region: String,
    bucket: String,
    access_key_id: String,
    secret_access_key: String,
    force_path_style: bool,
}

impl S3Storage {
    pub async fn new(init: S3Init) -> AppResult<Self> {
        let endpoint = init
            .endpoint
            .unwrap_or_else(|| format!("https://s3.{}.amazonaws.com", init.region))
            .trim_end_matches('/')
            .to_string();

        let client = Client::builder()
            .connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| AppError::Msg(format!("reqwest build: {e}")))?;

        Ok(Self {
            client,
            endpoint,
            region: init.region,
            bucket: init.bucket,
            access_key_id: init.access_key_id,
            secret_access_key: init.secret_access_key,
            force_path_style: init.force_path_style,
        })
    }

    fn encode_key(path: &str) -> String {
        // S3 keys can contain `/` which we must NOT escape — but everything else
        // should be percent-encoded per-segment.
        path.trim_start_matches('/')
            .split('/')
            .map(|seg| utf8_percent_encode(seg, S3_KEY_ENCODE).to_string())
            .collect::<Vec<_>>()
            .join("/")
    }

    /// Builds the request URL.
    fn build_url(&self, key: &str, query: &[(&str, String)]) -> String {
        let encoded_key = Self::encode_key(key);
        let base = if self.force_path_style {
            format!("{}/{}/{}", self.endpoint, self.bucket, encoded_key)
        } else {
            // Virtual-hosted-style: bucket.endpoint
            let with_bucket = self
                .endpoint
                .replacen("://", &format!("://{}.", self.bucket), 1);
            format!("{}/{}", with_bucket, encoded_key)
        };
        if query.is_empty() {
            base
        } else {
            let qs = query
                .iter()
                .map(|(k, v)| format!("{}={}", k, utf8_percent_encode(v, S3_KEY_ENCODE)))
                .collect::<Vec<_>>()
                .join("&");
            format!("{}?{}", base, qs)
        }
    }

    async fn send(
        &self,
        method: Method,
        key: &str,
        query: &[(&str, String)],
        body: Vec<u8>,
        extra_headers: &[(&'static str, String)],
    ) -> AppResult<reqwest::Response> {
        let url = self.build_url(key, query);

        // Identity for signing.
        let creds = Credentials::new(
            self.access_key_id.clone(),
            self.secret_access_key.clone(),
            None,
            None,
            "linkvault",
        );
        let identity = creds.into();

        let mut settings = SigningSettings::default();
        // S3 requires the SHA256 of the payload in the `x-amz-content-sha256`
        // header — without it, requests are rejected.
        settings.payload_checksum_kind = PayloadChecksumKind::XAmzSha256;
        let signing_params = v4::SigningParams::builder()
            .identity(&identity)
            .region(&self.region)
            .name("s3")
            .time(SystemTime::now())
            .settings(settings)
            .build()
            .map_err(|e| AppError::Msg(format!("sigv4 params: {e}")))?
            .into();

        // Headers to include in the signature.
        let mut sign_headers: Vec<(String, String)> = Vec::new();
        for (name, value) in extra_headers {
            sign_headers.push(((*name).to_string(), value.clone()));
        }
        let header_refs: Vec<(&str, &str)> = sign_headers
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();

        let signable = SignableRequest::new(
            method.as_str(),
            &url,
            header_refs.into_iter(),
            SignableBody::Bytes(&body),
        )
        .map_err(|e| AppError::Msg(format!("sigv4 build: {e}")))?;

        let signed = sign(signable, &signing_params)
            .map_err(|e| AppError::Msg(format!("sigv4 sign: {e}")))?;
        let (instructions, _) = signed.into_parts();

        // Reqwest request, then apply headers from both extra_headers and SigV4 instructions.
        let mut request = self.client.request(method, &url);
        for (name, value) in extra_headers {
            request = request.header(*name, value);
        }
        // Append the SigV4 headers (Authorization, x-amz-date, x-amz-content-sha256, etc).
        let (headers, _query_params) = instructions.into_parts();
        for header in &headers {
            request = request.header(header.name(), header.value());
        }
        if !body.is_empty() {
            request = request.body(body);
        }

        let res = request
            .send()
            .await
            .map_err(|e| AppError::Msg(format!("http: {e}")))?;
        Ok(res)
    }
}

#[async_trait]
impl StorageBackend for S3Storage {
    async fn read(&self, path: &str) -> AppResult<Vec<u8>> {
        let res = self.send(Method::GET, path, &[], Vec::new(), &[]).await?;
        if !res.status().is_success() {
            let s = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(AppError::Msg(format!("s3 get {path}: {s} {body}")));
        }
        let bytes = res
            .bytes()
            .await
            .map_err(|e| AppError::Msg(format!("s3 read body: {e}")))?;
        Ok(bytes.to_vec())
    }

    async fn write(&self, path: &str, data: &[u8]) -> AppResult<()> {
        let content_type = guess_content_type(path);
        let res = self
            .send(
                Method::PUT,
                path,
                &[],
                data.to_vec(),
                &[("content-type", content_type.to_string())],
            )
            .await?;
        if !res.status().is_success() {
            let s = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(AppError::Msg(format!("s3 put {path}: {s} {body}")));
        }
        Ok(())
    }

    async fn delete(&self, path: &str) -> AppResult<()> {
        let res = self.send(Method::DELETE, path, &[], Vec::new(), &[]).await?;
        if !res.status().is_success() && res.status() != StatusCode::NOT_FOUND {
            let s = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(AppError::Msg(format!("s3 delete {path}: {s} {body}")));
        }
        Ok(())
    }

    async fn list(&self, prefix: &str) -> AppResult<Vec<String>> {
        let mut keys = Vec::new();
        let mut continuation: Option<String> = None;
        loop {
            let mut query: Vec<(&str, String)> = vec![
                ("list-type", "2".to_string()),
                ("prefix", prefix.trim_start_matches('/').to_string()),
            ];
            if let Some(c) = &continuation {
                query.push(("continuation-token", c.clone()));
            }

            // ListObjectsV2 uses the bucket URL with no key.
            let res = self.send(Method::GET, "", &query, Vec::new(), &[]).await?;
            if !res.status().is_success() {
                let s = res.status();
                let body = res.text().await.unwrap_or_default();
                return Err(AppError::Msg(format!("s3 list: {s} {body}")));
            }
            let xml = res
                .text()
                .await
                .map_err(|e| AppError::Msg(format!("s3 list body: {e}")))?;
            let (more_keys, next_token) = parse_list_objects(&xml);
            keys.extend(more_keys);
            if let Some(tok) = next_token {
                continuation = Some(tok);
            } else {
                break;
            }
        }
        Ok(keys)
    }

    async fn exists(&self, path: &str) -> AppResult<bool> {
        let res = self.send(Method::HEAD, path, &[], Vec::new(), &[]).await?;
        Ok(res.status().is_success())
    }

    async fn test_connection(&self) -> AppResult<()> {
        // ListObjectsV2 with max-keys=1: cheap and validates auth + bucket.
        let query: Vec<(&str, String)> = vec![
            ("list-type", "2".to_string()),
            ("max-keys", "1".to_string()),
        ];
        let res = self.send(Method::GET, "", &query, Vec::new(), &[]).await?;
        if res.status().is_success() {
            Ok(())
        } else {
            let s = res.status();
            let body = res.text().await.unwrap_or_default();
            Err(AppError::Msg(format!("test failed: {s} {body}")))
        }
    }
}

fn guess_content_type(path: &str) -> &'static str {
    if path.ends_with(".json") {
        "application/json"
    } else if path.ends_with(".md") {
        "text/markdown; charset=utf-8"
    } else {
        "application/octet-stream"
    }
}

/// Parses an S3 ListObjectsV2 response. Returns (keys, next-continuation-token).
fn parse_list_objects(xml: &str) -> (Vec<String>, Option<String>) {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut keys = Vec::new();
    let mut next_token: Option<String> = None;
    let mut path_stack: Vec<String> = Vec::new();
    let mut text_buf = String::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                path_stack.push(local_name(e.name().as_ref()));
                text_buf.clear();
            }
            Ok(Event::Text(t)) => {
                if let Ok(s) = t.unescape() {
                    text_buf.push_str(&s);
                }
            }
            Ok(Event::End(e)) => {
                let name = local_name(e.name().as_ref());
                let parent = path_stack
                    .get(path_stack.len().saturating_sub(2))
                    .cloned()
                    .unwrap_or_default();
                if name == "key" && parent == "contents" {
                    keys.push(text_buf.trim().to_string());
                }
                if name == "nextcontinuationtoken" {
                    let v = text_buf.trim();
                    if !v.is_empty() {
                        next_token = Some(v.to_string());
                    }
                }
                path_stack.pop();
                text_buf.clear();
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    (keys, next_token)
}

fn local_name(name: &[u8]) -> String {
    let s = std::str::from_utf8(name).unwrap_or("");
    s.rsplit(':').next().unwrap_or(s).to_lowercase()
}
