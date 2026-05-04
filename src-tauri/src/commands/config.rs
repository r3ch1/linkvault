use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const KEYRING_SERVICE: &str = "app.linkvault.desktop";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StorageConfig {
    #[serde(rename = "type")]
    pub kind: String, // "local" for now
    pub local: LocalStorageConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LocalStorageConfig {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AiConfig {
    pub default_provider: String, // "gemini" | "claude" | "openai" | "openrouter"
    pub providers: AiProviders,
    /// Output language for summary, key_points and tags.
    /// "auto" = same as source content. ISO 639-1 otherwise (pt, en, es, ...).
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
    /// Model id. The actual API key never lives in this struct — kept in OS keychain.
    pub model: String,
    /// Whether a key is registered in the keychain.
    #[serde(default)]
    pub has_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UiConfig {
    pub theme: String, // "dark" | "light"
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
        let default_path = dirs::document_dir()
            .map(|p| p.join("LinkVault"))
            .unwrap_or_else(|| PathBuf::from("./LinkVault"))
            .to_string_lossy()
            .to_string();

        AppConfig {
            storage: StorageConfig {
                kind: "local".into(),
                local: LocalStorageConfig { path: default_path },
            },
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

#[tauri::command]
pub async fn config_load(app: AppHandle) -> AppResult<AppConfig> {
    let path = config_path(&app)?;
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
pub async fn config_save(app: AppHandle, config: AppConfig) -> AppResult<()> {
    let path = config_path(&app)?;
    let s = serde_json::to_string_pretty(&config)?;
    tokio::fs::write(&path, s).await?;
    Ok(())
}

#[tauri::command]
pub async fn keyring_set(provider: String, value: String) -> AppResult<()> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &format!("ai:{}", provider))?;
    entry.set_password(&value)?;
    Ok(())
}

#[tauri::command]
pub async fn keyring_get(provider: String) -> AppResult<Option<String>> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &format!("ai:{}", provider))?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Keyring(e)),
    }
}

#[tauri::command]
pub async fn keyring_delete(provider: String) -> AppResult<()> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &format!("ai:{}", provider))?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Keyring(e)),
    }
}
