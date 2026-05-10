use crate::error::{AppError, AppResult};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

const KEYRING_SERVICE: &str = "app.linkvault.desktop";

pub mod keychain {
    use super::KEYRING_SERVICE;
    use crate::error::{AppError, AppResult};
    use tauri::AppHandle;

    pub fn set(_app: &AppHandle, key: &str, value: &str) -> AppResult<()> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, key)?;
        entry.set_password(value)?;
        Ok(())
    }
    pub fn get(_app: &AppHandle, key: &str) -> AppResult<Option<String>> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, key)?;
        match entry.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::Keyring(e)),
        }
    }
    pub fn delete(_app: &AppHandle, key: &str) -> AppResult<()> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, key)?;
        match entry.delete_credential() {
            Ok(_) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::Keyring(e)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LocalStorageConfig {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct S3StorageConfig {
    pub endpoint: Option<String>,
    pub region: String,
    pub bucket: String,
    pub access_key_id: String,
    /// True if the user already saved the secret key to the keychain.
    #[serde(default)]
    pub has_secret: bool,
    #[serde(default)]
    pub force_path_style: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WebDavStorageConfig {
    pub base_url: String,
    pub username: String,
    /// True if the user already saved the password to the keychain.
    #[serde(default)]
    pub has_password: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageConfig {
    /// "local" | "s3" | "r2" | "minio" | "webdav"
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub local: LocalStorageConfig,
    #[serde(default)]
    pub s3: Option<S3StorageConfig>,
    #[serde(default)]
    pub webdav: Option<WebDavStorageConfig>,
}

impl Default for StorageConfig {
    fn default() -> Self {
        let default_path = dirs::document_dir()
            .map(|p| p.join("LinkVault"))
            .unwrap_or_else(|| PathBuf::from("./LinkVault"))
            .to_string_lossy()
            .to_string();
        Self {
            kind: "local".into(),
            local: LocalStorageConfig { path: default_path },
            s3: None,
            webdav: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AiConfig {
    pub default_provider: String,
    pub providers: AiProviders,
    #[serde(default = "default_summary_language")]
    pub summary_language: String,
}

fn default_summary_language() -> String {
    "auto".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AiProviders {
    #[serde(default)]
    pub gemini: AiProviderConfig,
    #[serde(default)]
    pub claude: AiProviderConfig,
    #[serde(default)]
    pub openai: AiProviderConfig,
    #[serde(default)]
    pub openrouter: AiProviderConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AiProviderConfig {
    pub model: String,
    #[serde(default)]
    pub has_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UiConfig {
    pub theme: String,
    pub default_view: String,
    pub items_per_page: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub storage: StorageConfig,
    pub ai: AiConfig,
    pub ui: UiConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            storage: StorageConfig::default(),
            ai: AiConfig {
                default_provider: "gemini".into(),
                providers: AiProviders::default(),
                summary_language: "auto".into(),
            },
            ui: UiConfig {
                theme: "dark".into(),
                default_view: "list".into(),
                items_per_page: 50,
            },
        }
    }
}

fn config_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::Msg(format!("app_config_dir: {e}")))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("config.json"))
}

pub async fn load_config_from_disk(app: &AppHandle) -> AppResult<AppConfig> {
    let path = config_path(app)?;
    if !path.exists() {
        let cfg = AppConfig::default();
        let s = serde_json::to_string_pretty(&cfg)?;
        tokio::fs::write(&path, s).await?;
        return Ok(cfg);
    }
    let bytes = tokio::fs::read(&path).await?;
    let cfg: AppConfig = serde_json::from_slice(&bytes)?;
    Ok(cfg)
}

#[tauri::command]
pub async fn config_load(app: AppHandle) -> AppResult<AppConfig> {
    load_config_from_disk(&app).await
}

#[tauri::command]
pub async fn config_save(
    app: AppHandle,
    state: State<'_, AppState>,
    config: AppConfig,
) -> AppResult<()> {
    let path = config_path(&app)?;
    let s = serde_json::to_string_pretty(&config)?;
    tokio::fs::write(&path, s).await?;
    // Best-effort rebuild of backend; surface the error so the UI can show it.
    state.rebuild_backend().await?;
    Ok(())
}

// --- AI provider keys -------------------------------------------------------

#[tauri::command]
pub async fn keyring_set(app: AppHandle, provider: String, value: String) -> AppResult<()> {
    keychain::set(&app, &format!("ai:{provider}"), &value)
}

#[tauri::command]
pub async fn keyring_get(app: AppHandle, provider: String) -> AppResult<Option<String>> {
    keychain::get(&app, &format!("ai:{provider}"))
}

#[tauri::command]
pub async fn keyring_delete(app: AppHandle, provider: String) -> AppResult<()> {
    keychain::delete(&app, &format!("ai:{provider}"))
}

// --- Storage credentials ----------------------------------------------------

#[tauri::command]
pub async fn storage_secret_set(app: AppHandle, key: String, value: String) -> AppResult<()> {
    // key is like "s3:secret_access_key" or "webdav:password"
    keychain::set(&app, &format!("storage:{key}"), &value)
}

#[tauri::command]
pub async fn storage_secret_delete(app: AppHandle, key: String) -> AppResult<()> {
    keychain::delete(&app, &format!("storage:{key}"))
}
