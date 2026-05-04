export type ContentKind =
  | "article"
  | "tutorial"
  | "news"
  | "reference"
  | "opinion"
  | "youtube"
  | "vimeo"
  | "twitter"
  | "spotify"
  | "audio"
  | "other";

export type AiProviderId = "gemini" | "claude" | "openai" | "openrouter";

export interface AiProcessResult {
  title: string;
  summary: string;
  key_points: string[];
  tags: string[];
  lang: string;
  content_type: ContentKind;
  timestamps?: { time: string; topic: string }[];
}

export interface BookmarkMeta {
  id: string;
  version: number;
  url: string;
  title: string;
  slug: string;
  type: ContentKind;
  tags: string[];
  lang: string;
  created_at: string;
  updated_at: string;
  source: string;
  ai: { provider: string; model: string; processed_at: string };
  content_file: string;
  summary_preview: string;
}

export interface AppConfig {
  storage: {
    type: "local";
    local: { path: string };
  };
  ai: {
    default_provider: AiProviderId;
    providers: Record<
      AiProviderId,
      { model: string; has_key: boolean }
    >;
    /** "auto" = same language as source content. Otherwise ISO 639-1: "pt", "en", "es", ... */
    summary_language: string;
  };
  ui: { theme: "dark" | "light"; default_view: string; items_per_page: number };
}
