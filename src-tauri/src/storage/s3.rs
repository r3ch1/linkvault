use crate::error::{AppError, AppResult};
use crate::storage::{S3Init, StorageBackend};
use async_trait::async_trait;
use aws_credential_types::Credentials;
use aws_sdk_s3::config::{BehaviorVersion, Region};
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::Client;
use aws_smithy_async::rt::sleep::default_async_sleep;

pub struct S3Storage {
    client: Client,
    bucket: String,
}

impl S3Storage {
    pub async fn new(init: S3Init) -> AppResult<Self> {
        let creds = Credentials::new(
            init.access_key_id,
            init.secret_access_key,
            None,
            None,
            "linkvault-config",
        );

        let mut builder = aws_sdk_s3::config::Builder::new()
            .behavior_version(BehaviorVersion::latest())
            .region(Region::new(init.region))
            .credentials_provider(creds)
            .force_path_style(init.force_path_style);

        if let Some(sleep) = default_async_sleep() {
            builder = builder.sleep_impl(sleep);
        }

        if let Some(ep) = init.endpoint {
            builder = builder.endpoint_url(ep);
        }

        let client = Client::from_conf(builder.build());
        Ok(Self {
            client,
            bucket: init.bucket,
        })
    }

    fn key(path: &str) -> String {
        path.trim_start_matches('/').to_string()
    }
}

#[async_trait]
impl StorageBackend for S3Storage {
    async fn read(&self, path: &str) -> AppResult<Vec<u8>> {
        let resp = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(Self::key(path))
            .send()
            .await
            .map_err(|e| AppError::Msg(format!("s3 get: {e}")))?;
        let body = resp
            .body
            .collect()
            .await
            .map_err(|e| AppError::Msg(format!("s3 body: {e}")))?;
        Ok(body.into_bytes().to_vec())
    }

    async fn write(&self, path: &str, data: &[u8]) -> AppResult<()> {
        let content_type = guess_content_type(path);
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(Self::key(path))
            .content_type(content_type)
            .body(ByteStream::from(data.to_vec()))
            .send()
            .await
            .map_err(|e| AppError::Msg(format!("s3 put: {e}")))?;
        Ok(())
    }

    async fn delete(&self, path: &str) -> AppResult<()> {
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(Self::key(path))
            .send()
            .await
            .map_err(|e| AppError::Msg(format!("s3 del: {e}")))?;
        Ok(())
    }

    async fn list(&self, prefix: &str) -> AppResult<Vec<String>> {
        let mut out = Vec::new();
        let mut cont: Option<String> = None;
        loop {
            let mut req = self
                .client
                .list_objects_v2()
                .bucket(&self.bucket)
                .prefix(Self::key(prefix));
            if let Some(c) = cont.as_deref() {
                req = req.continuation_token(c);
            }
            let resp = req
                .send()
                .await
                .map_err(|e| AppError::Msg(format!("s3 list: {e}")))?;
            for obj in resp.contents() {
                if let Some(k) = obj.key() {
                    out.push(k.to_string());
                }
            }
            if resp.is_truncated().unwrap_or(false) {
                cont = resp.next_continuation_token().map(|s| s.to_string());
            } else {
                break;
            }
        }
        Ok(out)
    }

    async fn exists(&self, path: &str) -> AppResult<bool> {
        match self
            .client
            .head_object()
            .bucket(&self.bucket)
            .key(Self::key(path))
            .send()
            .await
        {
            Ok(_) => Ok(true),
            Err(e) => {
                let msg = format!("{e}");
                if msg.contains("NotFound") || msg.contains("404") {
                    Ok(false)
                } else {
                    Err(AppError::Msg(format!("s3 head: {e}")))
                }
            }
        }
    }

    async fn test_connection(&self) -> AppResult<()> {
        // ListObjectsV2 with max-keys=1 — cheap and validates auth + bucket.
        self.client
            .list_objects_v2()
            .bucket(&self.bucket)
            .max_keys(1)
            .send()
            .await
            .map_err(|e| AppError::Msg(format!("s3 test: {e}")))?;
        Ok(())
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
