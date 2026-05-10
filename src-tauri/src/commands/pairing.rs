//! QR pairing — export the device config (including secrets from keychain)
//! into a portable JSON payload, and import it on another device.
//!
//! Security model: the payload is plaintext. It must only be transferred
//! through a channel the user trusts (a QR scanned by a camera within view,
//! or a paste they did themselves). The desktop UI is responsible for showing
//! the warnings, hiding the QR until the user opts in, and applying TTLs.

use crate::commands::config::{keychain, load_config_from_disk, AppConfig};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

const PAYLOAD_VERSION: u32 = 1;

/// All keychain keys the app uses today. Keep in sync with anything that
/// writes via `keychain::set` so a pairing export carries everything.
const KEYCHAIN_KEYS: &[&str] = &[
    "ai:gemini",
    "ai:claude",
    "ai:openai",
    "ai:openrouter",
    "storage:s3:secret_access_key",
    "storage:webdav:password",
];

#[derive(Debug, Serialize, Deserialize)]
pub struct PairingPayload {
    pub v: u32,
    pub config: AppConfig,
    pub secrets: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PairingImportSummary {
    pub config_applied: bool,
    pub secrets_imported: u32,
    pub storage_kind: String,
    pub ai_providers_with_keys: Vec<String>,
}

#[tauri::command]
pub async fn pairing_export(app: AppHandle) -> AppResult<String> {
    let config = load_config_from_disk(&app).await?;
    let mut secrets = std::collections::BTreeMap::new();
    for key in KEYCHAIN_KEYS {
        if let Ok(Some(v)) = keychain::get(&app, key) {
            secrets.insert(key.to_string(), v);
        }
    }
    let payload = PairingPayload {
        v: PAYLOAD_VERSION,
        config,
        secrets,
    };
    Ok(serde_json::to_string(&payload)?)
}

#[tauri::command]
pub async fn pairing_import(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: String,
) -> AppResult<PairingImportSummary> {
    let parsed: PairingPayload = serde_json::from_str(&payload)
        .map_err(|e| AppError::Msg(format!("payload inválido: {e}")))?;
    if parsed.v != PAYLOAD_VERSION {
        return Err(AppError::Msg(format!(
            "versão do payload incompatível: esperada {}, recebida {}",
            PAYLOAD_VERSION, parsed.v
        )));
    }

    write_config_to_disk(&app, &parsed.config).await?;

    let mut imported = 0u32;
    for (key, value) in &parsed.secrets {
        keychain::set(&app, key, value)?;
        imported += 1;
    }

    state.rebuild_backend().await?;

    let ai_with_keys: Vec<String> = parsed
        .secrets
        .keys()
        .filter_map(|k| k.strip_prefix("ai:").map(|s| s.to_string()))
        .collect();

    Ok(PairingImportSummary {
        config_applied: true,
        secrets_imported: imported,
        storage_kind: parsed.config.storage.kind,
        ai_providers_with_keys: ai_with_keys,
    })
}

async fn write_config_to_disk(app: &AppHandle, config: &AppConfig) -> AppResult<()> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::Msg(format!("app_config_dir: {e}")))?;
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("config.json");
    let s = serde_json::to_string_pretty(config)?;
    tokio::fs::write(&path, s).await?;
    Ok(())
}
