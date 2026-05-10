use crate::commands::config::{load_config_from_disk, AppConfig};
use crate::error::{AppError, AppResult};
use crate::storage::{build_backend, StorageBackend, StorageInit};
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::RwLock;

pub struct AppState {
    inner: Arc<RwLock<Inner>>,
    app: AppHandle,
}

struct Inner {
    backend: Option<Arc<dyn StorageBackend>>,
    config: Option<AppConfig>,
}

impl AppState {
    pub fn new(app: AppHandle) -> Self {
        Self {
            inner: Arc::new(RwLock::new(Inner {
                backend: None,
                config: None,
            })),
            app,
        }
    }

    /// Returns the currently active backend, building it on demand from the
    /// persisted config if needed.
    pub async fn backend(&self) -> AppResult<Arc<dyn StorageBackend>> {
        {
            let g = self.inner.read().await;
            if let Some(b) = &g.backend {
                return Ok(b.clone());
            }
        }
        // Lazy init from config on disk.
        let cfg = load_config_from_disk(&self.app).await?;
        let init = config_to_storage_init(&self.app, &cfg).await?;
        let backend: Arc<dyn StorageBackend> = Arc::from(build_backend(init).await?);
        let mut g = self.inner.write().await;
        g.backend = Some(backend.clone());
        g.config = Some(cfg);
        Ok(backend)
    }

    /// Force rebuild of the backend (e.g. after config change).
    pub async fn rebuild_backend(&self) -> AppResult<()> {
        let cfg = load_config_from_disk(&self.app).await?;
        let init = config_to_storage_init(&self.app, &cfg).await?;
        let backend: Arc<dyn StorageBackend> = Arc::from(build_backend(init).await?);
        let mut g = self.inner.write().await;
        g.backend = Some(backend);
        g.config = Some(cfg);
        Ok(())
    }
}

pub async fn config_to_storage_init(
    app: &AppHandle,
    cfg: &AppConfig,
) -> AppResult<StorageInit> {
    use crate::commands::config::keychain;
    use crate::storage::{S3Init, StorageKind, WebDavInit};

    let kind = match cfg.storage.kind.as_str() {
        "local" => StorageKind::Local,
        "s3" => StorageKind::S3,
        "r2" => StorageKind::R2,
        "minio" => StorageKind::Minio,
        "webdav" => StorageKind::Webdav,
        other => {
            return Err(AppError::Msg(format!("unknown storage kind: {other}")));
        }
    };

    let mut init = StorageInit {
        kind,
        local_path: None,
        s3: None,
        webdav: None,
    };

    match kind {
        StorageKind::Local => {
            init.local_path = Some(cfg.storage.local.path.clone());
        }
        StorageKind::S3 | StorageKind::R2 | StorageKind::Minio => {
            let s3 = cfg
                .storage
                .s3
                .clone()
                .ok_or_else(|| AppError::Msg("missing s3 config".into()))?;
            let secret = keychain::get(app, "storage:s3:secret_access_key")?
                .ok_or_else(|| AppError::Msg("S3 secret_access_key not set".into()))?;
            init.s3 = Some(S3Init {
                endpoint: s3.endpoint,
                region: s3.region,
                bucket: s3.bucket,
                access_key_id: s3.access_key_id,
                secret_access_key: secret,
                force_path_style: matches!(kind, StorageKind::Minio | StorageKind::R2)
                    || s3.force_path_style,
            });
        }
        StorageKind::Webdav => {
            let w = cfg
                .storage
                .webdav
                .clone()
                .ok_or_else(|| AppError::Msg("missing webdav config".into()))?;
            let pass = keychain::get(app, "storage:webdav:password")?
                .ok_or_else(|| AppError::Msg("WebDAV password not set".into()))?;
            init.webdav = Some(WebDavInit {
                base_url: w.base_url,
                username: w.username,
                password: pass,
            });
        }
    }
    Ok(init)
}
