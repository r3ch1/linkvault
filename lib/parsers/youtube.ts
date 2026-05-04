import { fetch } from "@tauri-apps/plugin-http";
import { extractYouTubeId } from "../utils";

export interface YouTubeData {
  videoId: string;
  title: string;
  author?: string;
  transcript: string;
}

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchOembed(url: string): Promise<{ title?: string; author_name?: string }> {
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { method: "GET", headers: { "user-agent": UA } }
    );
    if (!r.ok) return {};
    return (await r.json()) as { title?: string; author_name?: string };
  } catch {
    return {};
  }
}

interface CaptionTrack {
  baseUrl: string;
  languageCode?: string;
  kind?: string;
}

function findCaptionTracks(html: string): CaptionTrack[] {
  // ytInitialPlayerResponse contains captionTracks
  const m = html.match(/"captionTracks":(\[[^\]]+\])/);
  if (!m) return [];
  try {
    const tracks = JSON.parse(m[1]) as CaptionTrack[];
    return tracks;
  } catch {
    return [];
  }
}

function pickBestTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;
  // Prefer manually-uploaded over ASR, then English/Portuguese, else first.
  const manual = tracks.filter((t) => t.kind !== "asr");
  const pool = manual.length > 0 ? manual : tracks;
  const en = pool.find((t) => t.languageCode?.startsWith("en"));
  if (en) return en;
  const pt = pool.find((t) => t.languageCode?.startsWith("pt"));
  if (pt) return pt;
  return pool[0];
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function parseTranscriptXml(xml: string): string {
  // <text start="..." dur="...">...</text>
  const out: string[] = [];
  const re = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const raw = m[1].replace(/<[^>]+>/g, "");
    const txt = decodeHtmlEntities(raw).trim();
    if (txt) out.push(txt);
  }
  return out.join(" ");
}

export async function fetchYouTube(url: string): Promise<YouTubeData> {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new Error("Invalid YouTube URL");

  const oembed = await fetchOembed(`https://www.youtube.com/watch?v=${videoId}`);
  const title = oembed.title || `YouTube Video ${videoId}`;
  const author = oembed.author_name;

  // Fetch the watch page to discover caption tracks.
  let transcript = "";
  try {
    const watch = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      method: "GET",
      headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" },
    });
    if (watch.ok) {
      const html = await watch.text();
      const tracks = findCaptionTracks(html);
      const best = pickBestTrack(tracks);
      if (best?.baseUrl) {
        // baseUrl is JSON-encoded with escaped slashes/unicode.
        const decodedUrl = JSON.parse(`"${best.baseUrl.replace(/^"|"$/g, "")}"`);
        const tx = await fetch(decodedUrl, {
          method: "GET",
          headers: { "user-agent": UA },
        });
        if (tx.ok) {
          const xml = await tx.text();
          transcript = parseTranscriptXml(xml);
        }
      }
    }
  } catch (e) {
    console.warn("youtube transcript fetch failed:", e);
  }

  return { videoId, title, author, transcript };
}
