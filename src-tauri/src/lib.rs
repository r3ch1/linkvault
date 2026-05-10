mod commands;
mod error;
mod state;
mod storage;

use commands::config::{
    config_load, config_save, keyring_delete, keyring_get, keyring_set, storage_secret_delete,
    storage_secret_set,
};
use commands::file_system::{
    bookmark_delete, bookmark_list_all, bookmark_read, bookmark_save, open_path_external,
    rebuild_index,
};
use commands::storage_cmd::storage_test_connection;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            use tauri::Manager;
            let handle = app.handle().clone();
            app.manage(AppState::new(handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config_load,
            config_save,
            keyring_set,
            keyring_get,
            keyring_delete,
            storage_secret_set,
            storage_secret_delete,
            storage_test_connection,
            bookmark_save,
            bookmark_read,
            bookmark_delete,
            bookmark_list_all,
            rebuild_index,
            open_path_external,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
