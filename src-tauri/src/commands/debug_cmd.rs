//! Diagnostic info for the in-app debug overlay (no logcat on the user's
//! Moto E7, so we surface paths + file state through an IPC command).

use crate::error::{AppError, AppResult};
use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
pub struct FileInfo {
    pub name: String,
    pub size: u64,
}

#[derive(Debug, Serialize)]
pub struct DebugInfo {
    pub app_data_dir: String,
    pub app_config_dir: String,
    pub app_local_data_dir: String,
    pub data_dir_files: Vec<FileInfo>,
    pub files_subdir_files: Vec<FileInfo>,
    pub config_dir_files: Vec<FileInfo>,
    pub pending_share_path: String,
    pub pending_share_exists: bool,
    pub pending_share_content: Option<String>,
    pub config_path: String,
    pub config_exists: bool,
    pub config_size: Option<u64>,
}

fn list_dir(p: &std::path::Path) -> Vec<FileInfo> {
    let Ok(rd) = std::fs::read_dir(p) else {
        return vec![];
    };
    rd.flatten()
        .map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let size = e.metadata().map(|m| m.len()).unwrap_or(0);
            FileInfo { name, size }
        })
        .collect()
}

#[tauri::command]
pub async fn debug_info(app: AppHandle) -> AppResult<DebugInfo> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Msg(format!("app_data_dir: {e}")))?;
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::Msg(format!("app_config_dir: {e}")))?;
    let local_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::Msg(format!("app_local_data_dir: {e}")))?;

    let pending_share_path = data_dir.join("files").join("pending_share.json");
    let pending_share_exists = pending_share_path.exists();
    let pending_share_content = if pending_share_exists {
        std::fs::read_to_string(&pending_share_path).ok()
    } else {
        None
    };

    let config_path = config_dir.join("config.json");
    let config_exists = config_path.exists();
    let config_size = std::fs::metadata(&config_path).ok().map(|m| m.len());

    Ok(DebugInfo {
        app_data_dir: data_dir.to_string_lossy().into_owned(),
        app_config_dir: config_dir.to_string_lossy().into_owned(),
        app_local_data_dir: local_data_dir.to_string_lossy().into_owned(),
        data_dir_files: list_dir(&data_dir),
        files_subdir_files: list_dir(&data_dir.join("files")),
        config_dir_files: list_dir(&config_dir),
        pending_share_path: pending_share_path.to_string_lossy().into_owned(),
        pending_share_exists,
        pending_share_content,
        config_path: config_path.to_string_lossy().into_owned(),
        config_exists,
        config_size,
    })
}
