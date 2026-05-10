use crate::error::AppResult;
use crate::storage::{build_backend, StorageInit};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct StorageTestInput {
    pub init: StorageInit,
}

#[tauri::command]
pub async fn storage_test_connection(input: StorageTestInput) -> AppResult<()> {
    let backend = build_backend(input.init).await?;
    backend.test_connection().await
}
