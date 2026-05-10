use crate::error::{AppError, AppResult};
use crate::storage::{StorageBackend, WebDavInit};
use async_trait::async_trait;
use percent_encoding::{utf8_percent_encode, AsciiSet, CONTROLS};
use reqwest::{Client, Method, StatusCode};

const PATH_ESCAPE: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'#')
    .add(b'<')
    .add(b'>')
    .add(b'?')
    .add(b'`')
    .add(b'{')
    .add(b'}');

pub struct WebDavStorage {
    client: Client,
    base_url: String, // no trailing slash
    username: String,
    password: String,
}

impl WebDavStorage {
    pub fn new(init: WebDavInit) -> AppResult<Self> {
        let client = Client::builder()
            .build()
            .map_err(|e| AppError::Msg(format!("reqwest build: {e}")))?;
        let base = init.base_url.trim_end_matches('/').to_string();
        Ok(Self {
            client,
            base_url: base,
            username: init.username,
            password: init.password,
        })
    }

    fn url(&self, path: &str) -> String {
        let p = path.trim_start_matches('/');
        let encoded = p
            .split('/')
            .map(|seg| utf8_percent_encode(seg, PATH_ESCAPE).to_string())
            .collect::<Vec<_>>()
            .join("/");
        format!("{}/{}", self.base_url, encoded)
    }

    async fn ensure_dir(&self, path: &str) -> AppResult<()> {
        if path.is_empty() {
            return Ok(());
        }
        // MKCOL each segment, ignore "already exists"
        let parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        let mut acc = String::new();
        for part in parts {
            if !acc.is_empty() {
                acc.push('/');
            }
            acc.push_str(part);
            let res = self
                .client
                .request(Method::from_bytes(b"MKCOL").unwrap(), self.url(&acc))
                .basic_auth(&self.username, Some(&self.password))
                .send()
                .await
                .map_err(|e| AppError::Msg(format!("webdav mkcol: {e}")))?;
            // 201 Created, 405 Method Not Allowed (exists), 200 OK — all fine.
            // 409 Conflict means parent missing — surface as error.
            let s = res.status();
            if s == StatusCode::CONFLICT {
                return Err(AppError::Msg(format!(
                    "webdav mkcol {acc}: conflict (parent missing?)"
                )));
            }
            if !s.is_success() && s != StatusCode::METHOD_NOT_ALLOWED {
                let body = res.text().await.unwrap_or_default();
                return Err(AppError::Msg(format!("webdav mkcol {acc}: {s} {body}")));
            }
        }
        Ok(())
    }
}

#[async_trait]
impl StorageBackend for WebDavStorage {
    async fn read(&self, path: &str) -> AppResult<Vec<u8>> {
        let res = self
            .client
            .get(self.url(path))
            .basic_auth(&self.username, Some(&self.password))
            .send()
            .await
            .map_err(|e| AppError::Msg(format!("webdav get: {e}")))?;
        if !res.status().is_success() {
            return Err(AppError::Msg(format!("webdav get {path}: {}", res.status())));
        }
        Ok(res
            .bytes()
            .await
            .map_err(|e| AppError::Msg(format!("webdav body: {e}")))?
            .to_vec())
    }

    async fn write(&self, path: &str, data: &[u8]) -> AppResult<()> {
        // Ensure parent dir exists (WebDAV PUT does not autocreate).
        if let Some(idx) = path.rfind('/') {
            let parent = &path[..idx];
            self.ensure_dir(parent).await?;
        }

        let res = self
            .client
            .put(self.url(path))
            .basic_auth(&self.username, Some(&self.password))
            .body(data.to_vec())
            .send()
            .await
            .map_err(|e| AppError::Msg(format!("webdav put: {e}")))?;
        if !res.status().is_success() {
            let s = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(AppError::Msg(format!("webdav put {path}: {s} {body}")));
        }
        Ok(())
    }

    async fn delete(&self, path: &str) -> AppResult<()> {
        let res = self
            .client
            .delete(self.url(path))
            .basic_auth(&self.username, Some(&self.password))
            .send()
            .await
            .map_err(|e| AppError::Msg(format!("webdav del: {e}")))?;
        if res.status() == StatusCode::NOT_FOUND || res.status().is_success() {
            Ok(())
        } else {
            Err(AppError::Msg(format!(
                "webdav del {path}: {}",
                res.status()
            )))
        }
    }

    async fn list(&self, prefix: &str) -> AppResult<Vec<String>> {
        let body = r#"<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>"#;

        let res = self
            .client
            .request(
                Method::from_bytes(b"PROPFIND").unwrap(),
                self.url(prefix),
            )
            .basic_auth(&self.username, Some(&self.password))
            .header("Depth", "infinity")
            .header("Content-Type", "application/xml; charset=utf-8")
            .body(body)
            .send()
            .await
            .map_err(|e| AppError::Msg(format!("webdav propfind: {e}")))?;

        if res.status() == StatusCode::NOT_FOUND {
            return Ok(Vec::new());
        }
        if !res.status().is_success() && res.status().as_u16() != 207 {
            let s = res.status();
            let b = res.text().await.unwrap_or_default();
            return Err(AppError::Msg(format!("webdav propfind: {s} {b}")));
        }
        let xml = res
            .text()
            .await
            .map_err(|e| AppError::Msg(format!("webdav body: {e}")))?;

        let base_path = url_path(&self.base_url);
        Ok(parse_propfind(&xml, &base_path))
    }

    async fn exists(&self, path: &str) -> AppResult<bool> {
        let res = self
            .client
            .request(Method::from_bytes(b"HEAD").unwrap(), self.url(path))
            .basic_auth(&self.username, Some(&self.password))
            .send()
            .await
            .map_err(|e| AppError::Msg(format!("webdav head: {e}")))?;
        Ok(res.status().is_success())
    }

    async fn test_connection(&self) -> AppResult<()> {
        // PROPFIND depth=0 on root — validates auth + URL.
        let body = r#"<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>"#;
        let res = self
            .client
            .request(
                Method::from_bytes(b"PROPFIND").unwrap(),
                format!("{}/", self.base_url),
            )
            .basic_auth(&self.username, Some(&self.password))
            .header("Depth", "0")
            .header("Content-Type", "application/xml; charset=utf-8")
            .body(body)
            .send()
            .await
            .map_err(|e| AppError::Msg(format!("webdav test: {e}")))?;
        if res.status().is_success() || res.status().as_u16() == 207 {
            Ok(())
        } else {
            // If 404, try MKCOL the base — many users point at a non-existent folder.
            if res.status() == StatusCode::NOT_FOUND {
                let mk = self
                    .client
                    .request(
                        Method::from_bytes(b"MKCOL").unwrap(),
                        format!("{}/", self.base_url),
                    )
                    .basic_auth(&self.username, Some(&self.password))
                    .send()
                    .await
                    .map_err(|e| AppError::Msg(format!("webdav mkcol: {e}")))?;
                if mk.status().is_success() {
                    return Ok(());
                }
            }
            Err(AppError::Msg(format!(
                "webdav test failed: {}",
                res.status()
            )))
        }
    }
}

fn url_path(url: &str) -> String {
    // Extract path component from URL; default "/".
    if let Some(idx) = url.find("://") {
        let after = &url[idx + 3..];
        if let Some(slash) = after.find('/') {
            return after[slash..].trim_end_matches('/').to_string();
        }
    }
    String::new()
}

/// Parse a PROPFIND multistatus response and return file href paths
/// relative to base_path, excluding collections (directories).
fn parse_propfind(xml: &str, base_path: &str) -> Vec<String> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut out = Vec::new();
    let mut current_href: Option<String> = None;
    let mut is_collection = false;
    let mut text_buf = String::new();
    let mut path_stack: Vec<String> = Vec::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = local_name(&e);
                path_stack.push(name.clone());
                if name == "response" {
                    current_href = None;
                    is_collection = false;
                }
                if name == "collection" && path_stack.iter().any(|n| n == "resourcetype") {
                    is_collection = true;
                }
                text_buf.clear();
            }
            Ok(Event::Empty(e)) => {
                let name = local_name(&e);
                if name == "collection" {
                    is_collection = true;
                }
            }
            Ok(Event::Text(t)) => {
                if let Ok(s) = t.unescape() {
                    text_buf.push_str(&s);
                }
            }
            Ok(Event::End(e)) => {
                let name = local_name_end(&e);
                if name == "href" {
                    current_href = Some(text_buf.trim().to_string());
                }
                if name == "response" {
                    if let Some(href) = current_href.take() {
                        if !is_collection {
                            // Decode and strip base_path prefix, leaving keys relative to vault.
                            let decoded = percent_encoding::percent_decode_str(&href)
                                .decode_utf8_lossy()
                                .to_string();
                            let path_only = match decoded.find("://") {
                                Some(i) => {
                                    let after = &decoded[i + 3..];
                                    after
                                        .find('/')
                                        .map(|s| after[s..].to_string())
                                        .unwrap_or_default()
                                }
                                None => decoded,
                            };
                            let stripped = path_only
                                .strip_prefix(base_path)
                                .unwrap_or(&path_only)
                                .trim_start_matches('/')
                                .to_string();
                            if !stripped.is_empty() {
                                out.push(stripped);
                            }
                        }
                    }
                    is_collection = false;
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
    out
}

fn local_name(e: &quick_xml::events::BytesStart) -> String {
    let raw = e.name();
    let bytes = raw.as_ref();
    let s = std::str::from_utf8(bytes).unwrap_or("");
    s.rsplit(':').next().unwrap_or(s).to_lowercase()
}

fn local_name_end(e: &quick_xml::events::BytesEnd) -> String {
    let raw = e.name();
    let bytes = raw.as_ref();
    let s = std::str::from_utf8(bytes).unwrap_or("");
    s.rsplit(':').next().unwrap_or(s).to_lowercase()
}
