mod commands;
mod error;

use commands::config::{config_load, config_save, keyring_delete, keyring_get, keyring_set};
use commands::file_system::{
    bookmark_delete, bookmark_list_all, bookmark_read, bookmark_save, ensure_storage_dir,
    open_path_external, rebuild_index,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            config_load,
            config_save,
            keyring_set,
            keyring_get,
            keyring_delete,
            bookmark_save,
            bookmark_read,
            bookmark_delete,
            bookmark_list_all,
            rebuild_index,
            ensure_storage_dir,
            open_path_external,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
