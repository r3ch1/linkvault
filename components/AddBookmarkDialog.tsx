"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { processUrl } from "@/lib/processor";
import { tauri } from "@/lib/tauri-bridge";
import type { AppConfig, BookmarkMeta } from "@/lib/types";

export function AddBookmarkDialog({
  config,
  onClose,
  onSaved,
}: {
  config: AppConfig;
  onClose: () => void;
  onSaved: (meta: BookmarkMeta) => void;
}) {
  const [url, setUrl] = useState("");
  const [phase, setPhase] =
    useState<"input" | "processing" | "preview" | "saving" | "error">("input");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    meta: BookmarkMeta;
    markdown: string;
  } | null>(null);
  const [editTags, setEditTags] = useState("");

  async function handleProcess() {
    setError(null);
    setPhase("processing");
    try {
      const result = await processUrl(url.trim(), config, "manual");
      setPreview(result);
      setEditTags(result.meta.tags.join(", "));
      setPhase("preview");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  async function handleSave() {
    if (!preview) return;
    setPhase("saving");
    try {
      const tags = editTags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      const meta = { ...preview.meta, tags };
      await tauri.bookmarkSave(
        config.storage.local.path,
        meta,
        preview.markdown
      );
      onSaved(meta);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="relative w-full max-w-xl rounded-lg border border-neutral-800 bg-neutral-950 p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 className="mb-4 text-lg font-semibold">Salvar novo bookmark</h2>

        {phase === "input" && (
          <div className="space-y-3">
            <label className="block text-sm text-neutral-400">URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              autoFocus
              className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <p className="text-xs text-neutral-500">
              Provider: <strong>{config.ai.default_provider}</strong> ·{" "}
              {config.ai.providers[config.ai.default_provider]?.model}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-900"
              >
                Cancelar
              </button>
              <button
                onClick={handleProcess}
                disabled={!url.trim()}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
              >
                Processar
              </button>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
            <p className="text-sm text-neutral-400">
              Buscando conteúdo e chamando IA...
            </p>
          </div>
        )}

        {phase === "preview" && preview && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-neutral-500">Título</label>
              <p className="font-medium">{preview.meta.title}</p>
            </div>
            <div>
              <label className="block text-xs text-neutral-500">
                Resumo (preview)
              </label>
              <p className="text-sm text-neutral-300">
                {preview.meta.summary_preview}
              </p>
            </div>
            <div>
              <label className="block text-xs text-neutral-500">
                Tags (separadas por vírgula)
              </label>
              <input
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-900"
              >
                Descartar
              </button>
              <button
                onClick={handleSave}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium hover:bg-indigo-500"
              >
                Salvar
              </button>
            </div>
          </div>
        )}

        {phase === "saving" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
            <p className="text-sm text-neutral-400">Salvando...</p>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-3">
            <p className="text-sm text-red-400 whitespace-pre-wrap">{error}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPhase("input")}
                className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-900"
              >
                Tentar novamente
              </button>
              <button
                onClick={onClose}
                className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-900"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
