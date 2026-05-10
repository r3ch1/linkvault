//! Storage backend abstraction.
//!
//! Each bookmark is a pair of files (`<id>.md` + `<id>.meta.json`).
//! The active backend is configured by the user and rebuilt whenever
//! the config changes. All backends operate on logical paths relative
//! to a "vault root" — paths look like `bookmarks/<id>.md` or `.index.json`.

pub mod local;
pub mod s3;
pub mod webdav;

use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[async_trait]
pub trait StorageBackend: Send + Sync {
    /// Read raw bytes at a logical path.
    async fn read(&self, path: &str) -> AppResult<Vec<u8>>;
    /// Write raw bytes (creates or overwrites).
    async fn write(&self, path: &str, data: &[u8]) -> AppResult<()>;
    /// Delete a single object. No-op if absent.
    async fn delete(&self, path: &str) -> AppResult<()>;
    /// List object keys under a prefix (recursive).
    async fn list(&self, prefix: &str) -> AppResult<Vec<String>>;
    /// Whether the path exists.
    async fn exists(&self, path: &str) -> AppResult<bool>;
    /// Sanity check — used by the "Test connection" button.
    async fn test_connection(&self) -> AppResult<()>;
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum StorageKind {
    Local,
    S3,
    R2,
    Minio,
    Webdav,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageInit {
    pub kind: StorageKind,
    pub local_path: Option<String>,
    pub s3: Option<S3Init>,
    pub webdav: Option<WebDavInit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3Init {
    pub endpoint: Option<String>, // None for AWS S3 (uses region default)
    pub region: String,
    pub bucket: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    /// For Cloudflare R2 we typically use path-style URLs against the account
    /// endpoint. For real S3 this should be `false`.
    #[serde(default)]
    pub force_path_style: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebDavInit {
    pub base_url: String, // e.g. https://nc.example.com/remote.php/dav/files/me/LinkVault
    pub username: String,
    pub password: String,
}

pub async fn build_backend(init: StorageInit) -> AppResult<Box<dyn StorageBackend>> {
    match init.kind {
        StorageKind::Local => {
            let path = init
                .local_path
                .ok_or_else(|| AppError::Msg("local_path missing".into()))?;
            Ok(Box::new(local::LocalStorage::new(&path)?))
        }
        StorageKind::S3 | StorageKind::R2 | StorageKind::Minio => {
            let cfg = init
                .s3
                .ok_or_else(|| AppError::Msg("s3 config missing".into()))?;
            Ok(Box::new(s3::S3Storage::new(cfg).await?))
        }
        StorageKind::Webdav => {
            let cfg = init
                .webdav
                .ok_or_else(|| AppError::Msg("webdav config missing".into()))?;
            Ok(Box::new(webdav::WebDavStorage::new(cfg)?))
        }
    }
}
