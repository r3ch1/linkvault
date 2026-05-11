//! Android Share Intent receiver.
//!
//! When MainActivity (Kotlin) receives an ACTION_SEND Intent, it writes the
//! payload as JSON to `pending_share.json` inside the app's private filesDir.
//! This command consumes that file (reads + deletes) so the JS side can
//! pick up a shared URL or audio path on app focus.

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize)]
pub struct PendingShare {
    /// "text" or "audio".
    pub kind: String,
    /// For "text": the shared URL/string. For "audio": the content URI.
    pub data: String,
}

#[tauri::command]
pub async fn consume_pending_share(app: AppHandle) -> AppResult<Option<PendingShare>> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Msg(format!("app_data_dir: {e}")))?;
    // Kotlin writes to Context.filesDir, which on Android lives at
    // `<app_data_dir>/files/`. Tauri's app_data_dir returns the parent, so we
    // join the subdirectory explicitly.
    let path = dir.join("files").join("pending_share.json");
    if !path.exists() {
        return Ok(None);
    }
    let bytes = match tokio::fs::read(&path).await {
        Ok(b) => b,
        Err(e) => {
            log::warn!("read pending_share: {e}");
            return Ok(None);
        }
    };
    let share: PendingShare = serde_json::from_slice(&bytes)
        .map_err(|e| AppError::Msg(format!("pending_share parse: {e}")))?;
    let _ = tokio::fs::remove_file(&path).await;
    Ok(Some(share))
}
