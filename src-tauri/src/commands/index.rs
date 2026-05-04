use crate::commands::file_system::BookmarkMeta;
use crate::error::AppResult;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct IndexFile {
    pub version: u32,
    pub generated_at: String,
    pub bookmarks_count: u32,
    pub by_tag: BTreeMap<String, Vec<String>>,
    pub by_type: BTreeMap<String, Vec<String>>,
    pub recent: Vec<String>,
}

fn index_path(root: &str) -> PathBuf {
    Path::new(root).join(".index.json")
}

fn bookmarks_dir(root: &str) -> PathBuf {
    Path::new(root).join("bookmarks")
}

async fn read_index(root: &str) -> Option<IndexFile> {
    let path = index_path(root);
    let bytes = tokio::fs::read(&path).await.ok()?;
    serde_json::from_slice(&bytes).ok()
}

async fn write_index(root: &str, idx: &IndexFile) -> AppResult<()> {
    let path = index_path(root);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let s = serde_json::to_string_pretty(idx)?;
    tokio::fs::write(&path, s).await?;
    Ok(())
}

pub async fn rebuild_index_at(root: &str) -> AppResult<u32> {
    let dir = bookmarks_dir(root);
    let mut idx = IndexFile {
        version: 1,
        generated_at: Utc::now().to_rfc3339(),
        ..Default::default()
    };

    if !dir.exists() {
        write_index(root, &idx).await?;
        return Ok(0);
    }

    let mut metas: Vec<BookmarkMeta> = Vec::new();
    let mut rd = tokio::fs::read_dir(&dir).await?;
    while let Some(entry) = rd.next_entry().await? {
        let path = entry.path();
        let is_meta = path
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.ends_with(".meta.json"))
            .unwrap_or(false);
        if !is_meta {
            continue;
        }
        if let Ok(bytes) = tokio::fs::read(&path).await {
            if let Ok(m) = serde_json::from_slice::<BookmarkMeta>(&bytes) {
                metas.push(m);
            }
        }
    }

    metas.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    for m in &metas {
        for tag in &m.tags {
            idx.by_tag
                .entry(tag.clone())
                .or_default()
                .push(m.id.clone());
        }
        idx.by_type
            .entry(m.kind.clone())
            .or_default()
            .push(m.id.clone());
    }
    idx.recent = metas.iter().take(50).map(|m| m.id.clone()).collect();
    idx.bookmarks_count = metas.len() as u32;

    write_index(root, &idx).await?;
    Ok(idx.bookmarks_count)
}

pub async fn update_index_on_save(root: &str, meta: &BookmarkMeta) -> AppResult<()> {
    let mut idx = read_index(root).await.unwrap_or(IndexFile {
        version: 1,
        generated_at: Utc::now().to_rfc3339(),
        ..Default::default()
    });

    // Remove existing references to this id (in case of update).
    for v in idx.by_tag.values_mut() {
        v.retain(|id| id != &meta.id);
    }
    for v in idx.by_type.values_mut() {
        v.retain(|id| id != &meta.id);
    }
    idx.by_tag.retain(|_, v| !v.is_empty());
    idx.by_type.retain(|_, v| !v.is_empty());
    idx.recent.retain(|id| id != &meta.id);

    for tag in &meta.tags {
        idx.by_tag
            .entry(tag.clone())
            .or_default()
            .push(meta.id.clone());
    }
    idx.by_type
        .entry(meta.kind.clone())
        .or_default()
        .push(meta.id.clone());

    idx.recent.insert(0, meta.id.clone());
    idx.recent.truncate(50);
    idx.bookmarks_count = count_bookmarks(root).await;
    idx.generated_at = Utc::now().to_rfc3339();
    write_index(root, &idx).await
}

pub async fn update_index_on_delete(root: &str, id: &str) -> AppResult<()> {
    let mut idx = match read_index(root).await {
        Some(i) => i,
        None => return rebuild_index_at(root).await.map(|_| ()),
    };
    for v in idx.by_tag.values_mut() {
        v.retain(|i| i != id);
    }
    for v in idx.by_type.values_mut() {
        v.retain(|i| i != id);
    }
    idx.by_tag.retain(|_, v| !v.is_empty());
    idx.by_type.retain(|_, v| !v.is_empty());
    idx.recent.retain(|i| i != id);
    idx.bookmarks_count = count_bookmarks(root).await;
    idx.generated_at = Utc::now().to_rfc3339();
    write_index(root, &idx).await
}

async fn count_bookmarks(root: &str) -> u32 {
    let dir = bookmarks_dir(root);
    let mut count = 0u32;
    if let Ok(mut rd) = tokio::fs::read_dir(&dir).await {
        while let Ok(Some(entry)) = rd.next_entry().await {
            let path = entry.path();
            if path
                .file_name()
                .and_then(|s| s.to_str())
                .map(|s| s.ends_with(".meta.json"))
                .unwrap_or(false)
            {
                count += 1;
            }
        }
    }
    count
}
