use crate::commands::index::rebuild_index_at;
use crate::error::AppResult;
use crate::state::AppState;
use crate::storage::{build_backend, StorageInit};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct MigrationReport {
    pub copied: u32,
    pub skipped_existing: u32,
    pub failed: u32,
    pub errors: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct MigrateInput {
    pub source: StorageInit,
    /// If false (default), bookmarks already present at the destination
    /// (same id) are skipped. Set true to overwrite.
    #[serde(default)]
    pub overwrite: bool,
}

#[tauri::command]
pub async fn storage_migrate(
    state: State<'_, AppState>,
    input: MigrateInput,
) -> AppResult<MigrationReport> {
    let source = build_backend(input.source).await?;
    let dest = state.backend().await?;

    let mut report = MigrationReport::default();

    let keys = source.list("bookmarks").await.unwrap_or_default();
    let meta_keys: Vec<String> = keys
        .into_iter()
        .filter(|k| k.ends_with(".meta.json"))
        .collect();

    for key in meta_keys {
        let path = if key.starts_with("bookmarks/") {
            key
        } else {
            format!("bookmarks/{key}")
        };
        let id = match path
            .strip_prefix("bookmarks/")
            .and_then(|s| s.strip_suffix(".meta.json"))
        {
            Some(id) => id.to_string(),
            None => {
                report.failed += 1;
                report
                    .errors
                    .push(format!("could not parse id from path: {path}"));
                continue;
            }
        };

        let meta_dest_path = format!("bookmarks/{id}.meta.json");
        let md_dest_path = format!("bookmarks/{id}.md");
        let md_src_path = format!("bookmarks/{id}.md");

        if !input.overwrite {
            if dest.exists(&meta_dest_path).await.unwrap_or(false) {
                report.skipped_existing += 1;
                continue;
            }
        }

        let copy_result: AppResult<()> = async {
            let meta_bytes = source.read(&path).await?;
            dest.write(&meta_dest_path, &meta_bytes).await?;
            // Markdown is best-effort: if missing, log but still count as copied.
            match source.read(&md_src_path).await {
                Ok(md) => dest.write(&md_dest_path, &md).await?,
                Err(e) => {
                    log::warn!("missing .md for {id}: {e}");
                }
            }
            Ok(())
        }
        .await;

        match copy_result {
            Ok(_) => report.copied += 1,
            Err(e) => {
                report.failed += 1;
                report.errors.push(format!("{id}: {e}"));
            }
        }
    }

    // Rebuild destination index from scratch so it reflects the merged state.
    let _ = rebuild_index_at(&*dest).await;
    Ok(report)
}

/// How many bookmarks live at the given storage definition? Used to drive
/// the "you have N bookmarks at your old storage — migrate?" prompt.
#[tauri::command]
pub async fn storage_count_bookmarks(input: StorageInit) -> AppResult<u32> {
    let backend = build_backend(input).await?;
    let keys = backend.list("bookmarks").await.unwrap_or_default();
    let n = keys.iter().filter(|k| k.ends_with(".meta.json")).count();
    Ok(n as u32)
}
