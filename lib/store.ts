import { create } from "zustand";
import type { AppConfig } from "./types";
import { tauri } from "./tauri-bridge";

interface AppState {
  config: AppConfig | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  save: (cfg: AppConfig) => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  config: null,
  loading: false,
  error: null,
  async load() {
    set({ loading: true, error: null });
    try {
      const cfg = await tauri.configLoad();
      set({ config: cfg, loading: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ error: msg, loading: false });
    }
  },
  async save(cfg) {
    await tauri.configSave(cfg);
    set({ config: cfg });
  },
}));
