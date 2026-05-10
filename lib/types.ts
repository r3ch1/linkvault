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

export type StorageKind = "local" | "s3" | "r2" | "minio" | "webdav";

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

export interface S3StorageConfig {
  endpoint: string | null;
  region: string;
  bucket: string;
  access_key_id: string;
  has_secret: boolean;
  force_path_style: boolean;
}

export interface WebDavStorageConfig {
  base_url: string;
  username: string;
  has_password: boolean;
}

export interface AppConfig {
  storage: {
    type: StorageKind;
    local: { path: string };
    s3: S3StorageConfig | null;
    webdav: WebDavStorageConfig | null;
  };
  ai: {
    default_provider: AiProviderId;
    providers: Record<
      AiProviderId,
      { model: string; has_key: boolean }
    >;
    summary_language: string;
  };
  ui: { theme: "dark" | "light"; default_view: string; items_per_page: number };
}

/** Mirror of Rust StorageInit — used for `storage_test_connection`. */
export interface StorageInit {
  kind: StorageKind;
  local_path: string | null;
  s3:
    | {
        endpoint: string | null;
        region: string;
        bucket: string;
        access_key_id: string;
        secret_access_key: string;
        force_path_style: boolean;
      }
    | null;
  webdav:
    | {
        base_url: string;
        username: string;
        password: string;
      }
    | null;
}
