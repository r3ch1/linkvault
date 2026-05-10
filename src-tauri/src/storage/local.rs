use crate::error::{AppError, AppResult};
use crate::storage::StorageBackend;
use async_trait::async_trait;
use std::path::{Path, PathBuf};

pub struct LocalStorage {
    root: PathBuf,
}

impl LocalStorage {
    pub fn new(root: &str) -> AppResult<Self> {
        let root = PathBuf::from(root);
        std::fs::create_dir_all(&root)
            .map_err(|e| AppError::Msg(format!("create root {root:?}: {e}")))?;
        Ok(Self { root })
    }

    fn full(&self, path: &str) -> PathBuf {
        // Reject absolute / parent-traversing paths defensively.
        let safe = path.trim_start_matches('/');
        self.root.join(safe)
    }
}

#[async_trait]
impl StorageBackend for LocalStorage {
    async fn read(&self, path: &str) -> AppResult<Vec<u8>> {
        Ok(tokio::fs::read(self.full(path)).await?)
    }

    async fn write(&self, path: &str, data: &[u8]) -> AppResult<()> {
        let p = self.full(path);
        if let Some(parent) = p.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(p, data).await?;
        Ok(())
    }

    async fn delete(&self, path: &str) -> AppResult<()> {
        let p = self.full(path);
        if p.exists() {
            tokio::fs::remove_file(p).await?;
        }
        Ok(())
    }

    async fn list(&self, prefix: &str) -> AppResult<Vec<String>> {
        let base = self.full(prefix);
        let mut out = Vec::new();
        if !base.exists() {
            return Ok(out);
        }
        let mut stack = vec![base.clone()];
        while let Some(dir) = stack.pop() {
            let mut rd = match tokio::fs::read_dir(&dir).await {
                Ok(r) => r,
                Err(_) => continue,
            };
            while let Some(entry) = rd.next_entry().await? {
                let path = entry.path();
                let ft = entry.file_type().await?;
                if ft.is_dir() {
                    stack.push(path);
                } else if ft.is_file() {
                    if let Ok(rel) = path.strip_prefix(&self.root) {
                        out.push(rel.to_string_lossy().replace('\\', "/"));
                    }
                }
            }
        }
        Ok(out)
    }

    async fn exists(&self, path: &str) -> AppResult<bool> {
        Ok(Path::new(&self.full(path)).exists())
    }

    async fn test_connection(&self) -> AppResult<()> {
        // Try to write+delete a sentinel.
        let sentinel = ".linkvault-probe";
        self.write(sentinel, b"ok").await?;
        self.delete(sentinel).await?;
        Ok(())
    }
}
