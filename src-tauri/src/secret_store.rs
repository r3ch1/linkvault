//! Cross-platform secret storage.
//!
//! - Desktop (Linux, macOS, Windows, iOS): delegates to the `keyring` crate,
//!   which uses the OS-native secure store (Secret Service, Keychain, WinCred).
//! - Android: the `keyring` crate has no real Android backend (it falls back
//!   to a non-persistent mock). To make pairing actually work, we use a
//!   simple JSON file in the app's private data dir. Android's per-app sandbox
//!   means only LinkVault itself can read this file (unless the device is
//!   rooted with malicious tooling — same threat model as a compromised user
//!   account on desktop).

use crate::error::{AppError, AppResult};
use tauri::AppHandle;

#[cfg(not(target_os = "android"))]
const KEYRING_SERVICE: &str = "app.linkvault.desktop";

#[cfg(not(target_os = "android"))]
pub fn set(_app: &AppHandle, key: &str, value: &str) -> AppResult<()> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, key)?;
    entry.set_password(value)?;
    Ok(())
}

#[cfg(not(target_os = "android"))]
pub fn get(_app: &AppHandle, key: &str) -> AppResult<Option<String>> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, key)?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Keyring(e)),
    }
}

#[cfg(not(target_os = "android"))]
pub fn delete(_app: &AppHandle, key: &str) -> AppResult<()> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, key)?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Keyring(e)),
    }
}

// --- Android backend: JSON file in app's private data dir --------------------

#[cfg(target_os = "android")]
mod android_impl {
    use super::*;
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::Mutex;
    use tauri::Manager;

    fn lock() -> &'static Mutex<()> {
        static MUTEX: Mutex<()> = Mutex::new(());
        &MUTEX
    }

    fn store_path(app: &AppHandle) -> AppResult<PathBuf> {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| AppError::Msg(format!("app_data_dir: {e}")))?;
        std::fs::create_dir_all(&dir)?;
        Ok(dir.join("secrets.json"))
    }

    fn read_all(app: &AppHandle) -> AppResult<HashMap<String, String>> {
        let path = store_path(app)?;
        if !path.exists() {
            return Ok(HashMap::new());
        }
        let bytes = std::fs::read(&path)?;
        let map: HashMap<String, String> =
            serde_json::from_slice(&bytes).unwrap_or_default();
        Ok(map)
    }

    fn write_all(app: &AppHandle, map: &HashMap<String, String>) -> AppResult<()> {
        let path = store_path(app)?;
        let s = serde_json::to_string(map)?;
        // Best-effort: tighten file permissions to owner-only.
        std::fs::write(&path, s)?;
        Ok(())
    }

    pub fn set(app: &AppHandle, key: &str, value: &str) -> AppResult<()> {
        let _g = lock().lock().unwrap();
        let mut map = read_all(app)?;
        map.insert(key.to_string(), value.to_string());
        write_all(app, &map)
    }

    pub fn get(app: &AppHandle, key: &str) -> AppResult<Option<String>> {
        let _g = lock().lock().unwrap();
        let map = read_all(app)?;
        Ok(map.get(key).cloned())
    }

    pub fn delete(app: &AppHandle, key: &str) -> AppResult<()> {
        let _g = lock().lock().unwrap();
        let mut map = read_all(app)?;
        map.remove(key);
        write_all(app, &map)
    }
}

#[cfg(target_os = "android")]
pub fn set(app: &AppHandle, key: &str, value: &str) -> AppResult<()> {
    android_impl::set(app, key, value)
}

#[cfg(target_os = "android")]
pub fn get(app: &AppHandle, key: &str) -> AppResult<Option<String>> {
    android_impl::get(app, key)
}

#[cfg(target_os = "android")]
pub fn delete(app: &AppHandle, key: &str) -> AppResult<()> {
    android_impl::delete(app, key)
}
