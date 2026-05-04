import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function detectKind(url: string): import("./types").ContentKind {
  if (/youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\//.test(url)) return "youtube";
  if (/vimeo\.com\/\d+/.test(url)) return "vimeo";
  if (/(?:twitter\.com|x\.com)\//.test(url)) return "twitter";
  if (/spotify\.com\/(track|episode|playlist|show)/.test(url)) return "spotify";
  return "article";
}

export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([^&?/]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function youtubeEmbedUrl(url: string): string | null {
  const id = extractYouTubeId(url);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}

export function vimeoEmbedUrl(url: string): string | null {
  const m = url.match(/vimeo\.com\/(\d+)/);
  return m ? `https://player.vimeo.com/video/${m[1]}` : null;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
