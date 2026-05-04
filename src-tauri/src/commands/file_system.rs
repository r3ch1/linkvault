use crate::commands::index::{rebuild_index_at, update_index_on_save, update_index_on_delete};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

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

fn bookmarks_dir(root: &str) -> PathBuf {
    Path::new(root).join("bookmarks")
}

async fn ensure_dir(p: &Path) -> AppResult<()> {
    tokio::fs::create_dir_all(p).await?;
    Ok(())
}

#[tauri::command]
pub async fn bookmark_save(
    _app: AppHandle,
    storage_root: String,
    meta: BookmarkMeta,
    markdown: String,
) -> AppResult<()> {
    let dir = bookmarks_dir(&storage_root);
    ensure_dir(&dir).await?;

    let md_path = dir.join(format!("{}.md", meta.id));
    let meta_path = dir.join(format!("{}.meta.json", meta.id));

    tokio::fs::write(&md_path, markdown).await?;
    let meta_str = serde_json::to_string_pretty(&meta)?;
    tokio::fs::write(&meta_path, meta_str).await?;

    update_index_on_save(&storage_root, &meta).await?;
    Ok(())
}

#[tauri::command]
pub async fn bookmark_read(storage_root: String, id: String) -> AppResult<(BookmarkMeta, String)> {
    let dir = bookmarks_dir(&storage_root);
    let md_path = dir.join(format!("{}.md", id));
    let meta_path = dir.join(format!("{}.meta.json", id));

    let meta_bytes = tokio::fs::read(&meta_path).await?;
    let meta: BookmarkMeta = serde_json::from_slice(&meta_bytes)?;
    let md = tokio::fs::read_to_string(&md_path).await?;
    Ok((meta, md))
}

#[tauri::command]
pub async fn bookmark_delete(storage_root: String, id: String) -> AppResult<()> {
    let dir = bookmarks_dir(&storage_root);
    let md_path = dir.join(format!("{}.md", id));
    let meta_path = dir.join(format!("{}.meta.json", id));

    if md_path.exists() {
        tokio::fs::remove_file(&md_path).await?;
    }
    if meta_path.exists() {
        tokio::fs::remove_file(&meta_path).await?;
    }
    update_index_on_delete(&storage_root, &id).await?;
    Ok(())
}

#[tauri::command]
pub async fn bookmark_list_all(storage_root: String) -> AppResult<Vec<BookmarkMeta>> {
    let dir = bookmarks_dir(&storage_root);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    let mut rd = tokio::fs::read_dir(&dir).await?;
    while let Some(entry) = rd.next_entry().await? {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json")
            && path
                .file_name()
                .and_then(|s| s.to_str())
                .map(|s| s.ends_with(".meta.json"))
                .unwrap_or(false)
        {
            match tokio::fs::read(&path).await {
                Ok(bytes) => match serde_json::from_slice::<BookmarkMeta>(&bytes) {
                    Ok(m) => out.push(m),
                    Err(e) => log::warn!("skipping {:?}: {}", path, e),
                },
                Err(e) => log::warn!("read {:?}: {}", path, e),
            }
        }
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

#[tauri::command]
pub async fn rebuild_index(storage_root: String) -> AppResult<u32> {
    rebuild_index_at(&storage_root).await
}

#[tauri::command]
pub async fn ensure_storage_dir(path: String) -> AppResult<()> {
    let p = PathBuf::from(&path);
    ensure_dir(&p).await?;
    ensure_dir(&p.join("bookmarks")).await?;
    Ok(())
}

#[tauri::command]
pub async fn open_path_external(app: AppHandle, path: String) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| AppError::Msg(format!("opener: {e}")))?;
    Ok(())
}
