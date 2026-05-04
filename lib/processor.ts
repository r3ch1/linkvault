import { ulid } from "ulid";
import { callAi } from "./ai";
import { fetchArticle } from "./parsers/article";
import { fetchYouTube } from "./parsers/youtube";
import { tauri } from "./tauri-bridge";
import { detectKind, slugify } from "./utils";
import { buildMarkdown, summaryPreview } from "./markdown";
import type { AppConfig, BookmarkMeta, ContentKind } from "./types";

export interface ProcessResult {
  meta: BookmarkMeta;
  markdown: string;
}

/** Fetches content + calls AI. Does not save — caller decides. */
export async function processUrl(
  url: string,
  config: AppConfig,
  source: string = "manual"
): Promise<ProcessResult> {
  const provider = config.ai.default_provider;
  const apiKey = await tauri.keyringGet(provider);
  if (!apiKey) {
    throw new Error(
      `No API key for ${provider}. Set it in Settings.`
    );
  }
  const model =
    config.ai.providers[provider]?.model ||
    (provider === "gemini" ? "gemini-2.5-flash" : "");

  const kind = detectKind(url);

  let pageTitle = "";
  let text = "";
  let transcript: string | undefined;

  if (kind === "youtube") {
    const yt = await fetchYouTube(url);
    pageTitle = yt.title;
    transcript = yt.transcript || undefined;
    text =
      yt.transcript && yt.transcript.length > 100
        ? yt.transcript
        : `Título: ${yt.title}\nAutor: ${yt.author ?? "desconhecido"}\n(transcrição indisponível — gere resumo a partir do título e contexto)`;
  } else {
    const art = await fetchArticle(url);
    pageTitle = art.title;
    text = art.text;
  }

  const ai = await callAi({
    provider,
    apiKey,
    model,
    input: {
      url,
      kind,
      text,
      pageTitle,
      outputLanguage: config.ai.summary_language || "auto",
    },
  });

  const finalKind: ContentKind =
    kind === "youtube" || kind === "vimeo"
      ? kind
      : (ai.content_type as ContentKind) || "article";

  const id = `bkm_${ulid()}`;
  const now = new Date().toISOString();
  const meta: BookmarkMeta = {
    id,
    version: 1,
    url,
    title: ai.title || pageTitle || url,
    slug: slugify(ai.title || pageTitle || url),
    type: finalKind,
    tags: (ai.tags || []).map((t) => t.toLowerCase().trim()).filter(Boolean),
    lang: ai.lang || "und",
    created_at: now,
    updated_at: now,
    source,
    ai: {
      provider,
      model,
      processed_at: now,
    },
    content_file: `${id}.md`,
    summary_preview: summaryPreview(ai.summary || ""),
  };

  const markdown = buildMarkdown({
    ai,
    url,
    transcript: kind === "youtube" ? transcript : undefined,
  });

  return { meta, markdown };
}
