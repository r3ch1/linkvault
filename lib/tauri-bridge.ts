import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, BookmarkMeta } from "./types";

export const tauri = {
  configLoad: () => invoke<AppConfig>("config_load"),
  configSave: (config: AppConfig) => invoke<void>("config_save", { config }),

  keyringSet: (provider: string, value: string) =>
    invoke<void>("keyring_set", { provider, value }),
  keyringGet: (provider: string) =>
    invoke<string | null>("keyring_get", { provider }),
  keyringDelete: (provider: string) =>
    invoke<void>("keyring_delete", { provider }),

  bookmarkSave: (storageRoot: string, meta: BookmarkMeta, markdown: string) =>
    invoke<void>("bookmark_save", { storageRoot, meta, markdown }),
  bookmarkRead: (storageRoot: string, id: string) =>
    invoke<[BookmarkMeta, string]>("bookmark_read", { storageRoot, id }),
  bookmarkDelete: (storageRoot: string, id: string) =>
    invoke<void>("bookmark_delete", { storageRoot, id }),
  bookmarkListAll: (storageRoot: string) =>
    invoke<BookmarkMeta[]>("bookmark_list_all", { storageRoot }),

  rebuildIndex: (storageRoot: string) =>
    invoke<number>("rebuild_index", { storageRoot }),
  ensureStorageDir: (path: string) =>
    invoke<void>("ensure_storage_dir", { path }),
  openPathExternal: (path: string) =>
    invoke<void>("open_path_external", { path }),
};
