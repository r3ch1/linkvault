"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Header } from "@/components/Header";
import { BookmarkCard } from "@/components/BookmarkCard";
import { BookmarkDetail } from "@/components/BookmarkDetail";
import { AddBookmarkDialog } from "@/components/AddBookmarkDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAppStore } from "@/lib/store";
import { tauri } from "@/lib/tauri-bridge";
import type { BookmarkMeta } from "@/lib/types";

export default function Home() {
  const { config, loading, error, load } = useAppStore();
  const [items, setItems] = useState<BookmarkMeta[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [openDetail, setOpenDetail] = useState<{
    meta: BookmarkMeta;
    md: string;
  } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BookmarkMeta | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!config) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.storage.type, config?.storage.local.path]);

  async function refresh() {
    if (!config) return;
    try {
      const list = await tauri.bookmarkListAll();
      setItems(list);
      setListError(null);
    } catch (e: unknown) {
      setListError(e instanceof Error ? e.message : String(e));
    }
  }

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const b of items) for (const t of b.tags) s.add(t);
    return [...s].sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((b) => {
      if (tagFilter && !b.tags.includes(tagFilter)) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        b.summary_preview.toLowerCase().includes(q) ||
        b.tags.some((t) => t.includes(q))
      );
    });
  }, [items, query, tagFilter]);

  async function openBookmark(meta: BookmarkMeta) {
    const [m, md] = await tauri.bookmarkRead(meta.id);
    setOpenDetail({ meta: m, md });
  }

  function requestDelete(meta: BookmarkMeta) {
    setPendingDelete(meta);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    await tauri.bookmarkDelete(id);
    setOpenDetail(null);
    refresh();
  }

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center text-neutral-500">
        Carregando…
      </main>
    );
  }

  if (error || !config) {
    return (
      <main className="flex flex-1 items-center justify-center text-red-400">
        {error ?? "Falha ao carregar configuração"}
      </main>
    );
  }

  if (openDetail) {
    return (
      <main className="flex-1">
        <Header />
        <BookmarkDetail
          meta={openDetail.meta}
          markdown={openDetail.md}
          onBack={() => setOpenDetail(null)}
          onDelete={() => requestDelete(openDetail.meta)}
        />
        {pendingDelete && (
          <ConfirmDialog
            title="Deletar bookmark"
            message={
              <>
                Tem certeza que quer deletar <strong>{pendingDelete.title}</strong>
                ? Essa ação remove os arquivos <code>.md</code> e{" "}
                <code>.meta.json</code> do storage e não pode ser desfeita.
              </>
            }
            confirmLabel="Deletar"
            destructive
            onConfirm={confirmDelete}
            onCancel={() => setPendingDelete(null)}
          />
        )}
      </main>
    );
  }

  const provider = config.ai.default_provider;
  const hasKey = config.ai.providers[provider]?.has_key;

  return (
    <main className="flex-1">
      <Header onAdd={() => setShowAdd(true)} />
      <div className="mx-auto max-w-5xl px-4 py-6">
        {!hasKey && (
          <div className="mb-4 rounded-md border border-amber-700/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            Você ainda não configurou a chave de API para{" "}
            <strong>{provider}</strong>.{" "}
            <a href="/settings" className="underline">
              Configurar agora
            </a>
            .
          </div>
        )}
        {listError && (
          <div className="mb-4 rounded-md border border-red-700/40 bg-red-500/10 p-3 text-sm text-red-300">
            {listError}
          </div>
        )}

        <div className="mb-4 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2">
            <Search className="h-4 w-4 text-neutral-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título, tag, conteúdo..."
              className="flex-1 bg-transparent text-sm placeholder:text-neutral-500 focus:outline-none"
            />
          </div>
        </div>

        {allTags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1">
            <button
              onClick={() => setTagFilter(null)}
              className={`rounded-full px-2.5 py-0.5 text-xs ${
                tagFilter === null
                  ? "bg-indigo-600 text-white"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }`}
            >
              todos
            </button>
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setTagFilter(t)}
                className={`rounded-full px-2.5 py-0.5 text-xs ${
                  tagFilter === t
                    ? "bg-indigo-600 text-white"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-800 p-8 text-center text-neutral-500">
            {items.length === 0
              ? "Nenhum bookmark ainda. Clique em \"Novo\" para salvar o primeiro."
              : "Nenhum resultado para esses filtros."}
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((b) => (
              <BookmarkCard
                key={b.id}
                meta={b}
                onOpen={() => openBookmark(b)}
                onDelete={() => requestDelete(b)}
              />
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <AddBookmarkDialog
          config={config}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            refresh();
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Deletar bookmark"
          message={
            <>
              Tem certeza que quer deletar <strong>{pendingDelete.title}</strong>
              ? Essa ação remove os arquivos <code>.md</code> e{" "}
              <code>.meta.json</code> do storage e não pode ser desfeita.
            </>
          }
          confirmLabel="Deletar"
          destructive
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </main>
  );
}
