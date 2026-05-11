use crate::error::{AppError, AppResult};
use crate::storage::{build_backend, StorageInit};
use serde::Deserialize;
use std::time::Duration;

#[derive(Debug, Deserialize)]
pub struct StorageTestInput {
    pub init: StorageInit,
}

#[tauri::command]
pub async fn storage_test_connection(input: StorageTestInput) -> AppResult<()> {
    let backend = build_backend(input.init).await?;
    tokio::time::timeout(Duration::from_secs(15), backend.test_connection())
        .await
        .map_err(|_| {
            AppError::Msg(
                "Tempo esgotado (15s) tentando falar com o storage. \
                 Verifique endpoint/region/bucket e a conexão de rede."
                    .into(),
            )
        })?
}
