mod commands;
mod error;
mod secret_store;
mod state;
mod storage;

use commands::debug_cmd::debug_info;
use commands::config::{
    config_load, config_save, keyring_delete, keyring_get, keyring_set, storage_secret_delete,
    storage_secret_set,
};
use commands::file_system::{
    bookmark_delete, bookmark_list_all, bookmark_read, bookmark_save, open_path_external,
    rebuild_index,
};
use commands::migrate::{storage_count_bookmarks, storage_migrate};
use commands::pairing::{pairing_export, pairing_import};
use commands::share::consume_pending_share;
use commands::storage_cmd::storage_test_connection;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        builder = builder.plugin(tauri_plugin_barcode_scanner::init());
    }

    builder
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
            storage_migrate,
            storage_count_bookmarks,
            pairing_export,
            pairing_import,
            consume_pending_share,
            bookmark_save,
            bookmark_read,
            bookmark_delete,
            bookmark_list_all,
            rebuild_index,
            open_path_external,
            debug_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
