"use client";

import { ExternalLink, Trash2, FileText, Music, Film, MessageCircle, PlaySquare } from "lucide-react";
import type { BookmarkMeta } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  youtube: PlaySquare,
  vimeo: Film,
  twitter: MessageCircle,
  spotify: Music,
};

export function BookmarkCard({
  meta,
  onOpen,
  onDelete,
}: {
  meta: BookmarkMeta;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const Icon = TYPE_ICON[meta.type] ?? FileText;
  let host = "";
  try {
    host = new URL(meta.url).host.replace(/^www\./, "");
  } catch {
    host = meta.url;
  }

  return (
    <article
      onClick={onOpen}
      className="group cursor-pointer rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 transition hover:border-neutral-700 hover:bg-neutral-900"
    >
      <div className="flex items-start gap-3">
        <div className="mt-1 rounded-md bg-neutral-800/70 p-2 text-indigo-300">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-neutral-100">{meta.title}</h3>
          <p className="text-xs text-neutral-500">
            {host} · {formatDate(meta.created_at)}
          </p>
          {meta.summary_preview && (
            <p className="mt-2 line-clamp-2 text-sm text-neutral-400">
              {meta.summary_preview}
            </p>
          )}
          {meta.tags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {meta.tags.slice(0, 6).map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-300"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.open(meta.url, "_blank");
            }}
            className="rounded p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
            title="Abrir link original"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded p-1.5 text-neutral-400 hover:bg-red-500/10 hover:text-red-400"
            title="Deletar bookmark"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}
