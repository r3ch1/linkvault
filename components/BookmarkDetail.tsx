"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import type { BookmarkMeta } from "@/lib/types";
import { formatDate, vimeoEmbedUrl, youtubeEmbedUrl } from "@/lib/utils";

export function BookmarkDetail({
  meta,
  markdown,
  onBack,
  onDelete,
}: {
  meta: BookmarkMeta;
  markdown: string;
  onBack: () => void;
  onDelete: () => void;
}) {
  const ytEmbed = meta.type === "youtube" ? youtubeEmbedUrl(meta.url) : null;
  const vmEmbed = meta.type === "vimeo" ? vimeoEmbedUrl(meta.url) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open(meta.url, "_blank")}
            className="flex items-center gap-1.5 rounded-md border border-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-900"
          >
            <ExternalLink className="h-4 w-4" />
            Abrir original
          </button>
          <button
            onClick={() => {
              if (confirm(`Deletar "${meta.title}"?`)) onDelete();
            }}
            className="flex items-center gap-1.5 rounded-md border border-red-900/40 bg-red-500/10 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/20"
          >
            <Trash2 className="h-4 w-4" />
            Deletar
          </button>
        </div>
      </div>

      <header className="mb-4">
        <h1 className="text-2xl font-bold">{meta.title}</h1>
        <p className="mt-1 text-xs text-neutral-500">
          {meta.type} · {formatDate(meta.created_at)} ·{" "}
          {meta.ai.provider} ({meta.ai.model})
        </p>
        {meta.tags?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {meta.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-300"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </header>

      {ytEmbed && (
        <div className="mb-6 aspect-video overflow-hidden rounded-lg border border-neutral-800">
          <iframe
            src={ytEmbed}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      )}
      {vmEmbed && (
        <div className="mb-6 aspect-video overflow-hidden rounded-lg border border-neutral-800">
          <iframe
            src={vmEmbed}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      )}

      <div className="prose-lv">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </div>
    </div>
  );
}
