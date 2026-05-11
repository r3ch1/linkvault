import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, BookmarkMeta, StorageInit } from "./types";

export const tauri = {
  configLoad: () => invoke<AppConfig>("config_load"),
  configSave: (config: AppConfig) => invoke<void>("config_save", { config }),

  // AI provider keys (in OS keychain)
  keyringSet: (provider: string, value: string) =>
    invoke<void>("keyring_set", { provider, value }),
  keyringGet: (provider: string) =>
    invoke<string | null>("keyring_get", { provider }),
  keyringDelete: (provider: string) =>
    invoke<void>("keyring_delete", { provider }),

  // Storage credentials (in OS keychain). key examples:
  //   "s3:secret_access_key", "webdav:password"
  storageSecretSet: (key: string, value: string) =>
    invoke<void>("storage_secret_set", { key, value }),
  storageSecretDelete: (key: string) =>
    invoke<void>("storage_secret_delete", { key }),
  storageTestConnection: (init: StorageInit) =>
    invoke<void>("storage_test_connection", { input: { init } }),
  storageCountBookmarks: (init: StorageInit) =>
    invoke<number>("storage_count_bookmarks", { input: init }),
  storageMigrate: (source: StorageInit, overwrite = false) =>
    invoke<{
      copied: number;
      skipped_existing: number;
      failed: number;
      errors: string[];
    }>("storage_migrate", { input: { source, overwrite } }),

  bookmarkSave: (meta: BookmarkMeta, markdown: string) =>
    invoke<void>("bookmark_save", { meta, markdown }),
  bookmarkRead: (id: string) =>
    invoke<[BookmarkMeta, string]>("bookmark_read", { id }),
  bookmarkDelete: (id: string) =>
    invoke<void>("bookmark_delete", { id }),
  bookmarkListAll: () =>
    invoke<BookmarkMeta[]>("bookmark_list_all"),

  rebuildIndex: () => invoke<number>("rebuild_index"),
  openPathExternal: (path: string) =>
    invoke<void>("open_path_external", { path }),

  pairingExport: () => invoke<string>("pairing_export"),
  pairingImport: (payload: string) =>
    invoke<{
      config_applied: boolean;
      secrets_imported: number;
      storage_kind: string;
      ai_providers_with_keys: string[];
    }>("pairing_import", { payload }),

  consumePendingShare: () =>
    invoke<{ kind: "text" | "audio"; data: string } | null>(
      "consume_pending_share"
    ),
};
