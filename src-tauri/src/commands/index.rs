use crate::commands::file_system::BookmarkMeta;
use crate::error::AppResult;
use crate::storage::StorageBackend;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

const INDEX_PATH: &str = ".index.json";
const BOOKMARKS_PREFIX: &str = "bookmarks";

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct IndexFile {
    pub version: u32,
    pub generated_at: String,
    pub bookmarks_count: u32,
    pub by_tag: BTreeMap<String, Vec<String>>,
    pub by_type: BTreeMap<String, Vec<String>>,
    pub recent: Vec<String>,
}

async fn read_index(backend: &dyn StorageBackend) -> Option<IndexFile> {
    let bytes = backend.read(INDEX_PATH).await.ok()?;
    serde_json::from_slice(&bytes).ok()
}

async fn write_index(backend: &dyn StorageBackend, idx: &IndexFile) -> AppResult<()> {
    let s = serde_json::to_string_pretty(idx)?;
    backend.write(INDEX_PATH, s.as_bytes()).await
}

pub async fn rebuild_index_at(backend: &dyn StorageBackend) -> AppResult<u32> {
    let mut idx = IndexFile {
        version: 1,
        generated_at: Utc::now().to_rfc3339(),
        ..Default::default()
    };

    let keys = backend.list(BOOKMARKS_PREFIX).await.unwrap_or_default();
    let meta_keys: Vec<String> = keys
        .into_iter()
        .filter(|k| k.ends_with(".meta.json"))
        .collect();

    let mut metas: Vec<BookmarkMeta> = Vec::new();
    for key in meta_keys {
        // Convert backend list result (which may include the bookmarks/ prefix)
        // to a backend-relative path.
        let path = if key.starts_with(&format!("{BOOKMARKS_PREFIX}/")) {
            key
        } else {
            format!("{BOOKMARKS_PREFIX}/{key}")
        };
        if let Ok(bytes) = backend.read(&path).await {
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

    write_index(backend, &idx).await?;
    Ok(idx.bookmarks_count)
}

pub async fn update_index_on_save(
    backend: &dyn StorageBackend,
    meta: &BookmarkMeta,
) -> AppResult<()> {
    let mut idx = read_index(backend).await.unwrap_or(IndexFile {
        version: 1,
        generated_at: Utc::now().to_rfc3339(),
        ..Default::default()
    });

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
    idx.bookmarks_count = idx.recent.len() as u32; // approximation; rebuild for exact
    idx.generated_at = Utc::now().to_rfc3339();
    write_index(backend, &idx).await
}

pub async fn update_index_on_delete(backend: &dyn StorageBackend, id: &str) -> AppResult<()> {
    let mut idx = match read_index(backend).await {
        Some(i) => i,
        None => return rebuild_index_at(backend).await.map(|_| ()),
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
    idx.bookmarks_count = idx.recent.len() as u32;
    idx.generated_at = Utc::now().to_rfc3339();
    write_index(backend, &idx).await
}
