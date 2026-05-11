use crate::commands::index::{rebuild_index_at, update_index_on_delete, update_index_on_save};
use crate::error::AppResult;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BookmarkMeta {
    pub id: String,
    pub version: u32,
    pub url: String,
    pub title: String,
    pub slug: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub tags: Vec<String>,
    pub lang: String,
    pub created_at: String,
    pub updated_at: String,
    pub source: String,
    pub ai: BookmarkAi,
    pub content_file: String,
    pub summary_preview: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BookmarkAi {
    pub provider: String,
    pub model: String,
    pub processed_at: String,
}

fn md_path(id: &str) -> String {
    format!("bookmarks/{id}.md")
}
fn meta_path(id: &str) -> String {
    format!("bookmarks/{id}.meta.json")
}

#[tauri::command]
pub async fn bookmark_save(
    state: State<'_, AppState>,
    meta: BookmarkMeta,
    markdown: String,
) -> AppResult<()> {
    let backend = state.backend().await?;
    backend.write(&md_path(&meta.id), markdown.as_bytes()).await?;
    let meta_str = serde_json::to_string_pretty(&meta)?;
    backend
        .write(&meta_path(&meta.id), meta_str.as_bytes())
        .await?;
    update_index_on_save(&*backend, &meta).await?;
    Ok(())
}

#[tauri::command]
pub async fn bookmark_read(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<(BookmarkMeta, String)> {
    let backend = state.backend().await?;
    let meta_bytes = backend.read(&meta_path(&id)).await?;
    let meta: BookmarkMeta = serde_json::from_slice(&meta_bytes)?;
    let md_bytes = backend.read(&md_path(&id)).await?;
    let md = String::from_utf8(md_bytes).unwrap_or_default();
    Ok((meta, md))
}

#[tauri::command]
pub async fn bookmark_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let backend = state.backend().await?;
    backend.delete(&md_path(&id)).await?;
    backend.delete(&meta_path(&id)).await?;
    update_index_on_delete(&*backend, &id).await?;
    Ok(())
}

#[tauri::command]
pub async fn bookmark_list_all(state: State<'_, AppState>) -> AppResult<Vec<BookmarkMeta>> {
    let backend = state.backend().await?;
    let keys = backend.list("bookmarks").await?;
    let meta_keys: Vec<String> = keys
        .into_iter()
        .filter(|k| k.ends_with(".meta.json"))
        .collect();

    let mut out = Vec::new();
    for key in meta_keys {
        let path = if key.starts_with("bookmarks/") {
            key
        } else {
            format!("bookmarks/{key}")
        };
        match backend.read(&path).await {
            Ok(bytes) => match serde_json::from_slice::<BookmarkMeta>(&bytes) {
                Ok(m) => out.push(m),
                Err(e) => log::warn!("skipping {}: {}", path, e),
            },
            Err(e) => log::warn!("read {}: {}", path, e),
        }
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

#[tauri::command]
pub async fn rebuild_index(state: State<'_, AppState>) -> AppResult<u32> {
    let backend = state.backend().await?;
    rebuild_index_at(&*backend).await
}

#[tauri::command]
pub async fn open_path_external(app: AppHandle, path: String) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| crate::error::AppError::Msg(format!("opener: {e}")))?;
    Ok(())
}
