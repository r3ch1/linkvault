import { fetch } from "@tauri-apps/plugin-http";
import * as cheerio from "cheerio";

export interface ArticleData {
  title: string;
  text: string;
  byline?: string;
  siteName?: string;
}

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function fetchArticle(url: string): Promise<ArticleData> {
  const res = await fetch(url, {
    method: "GET",
    headers: { "user-agent": UA, accept: "text/html,*/*" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`fetch article ${res.status}`);
  const html = await res.text();

  const $ = cheerio.load(html);
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $('meta[name="twitter:title"]').attr("content") ||
    $("title").first().text().trim() ||
    "";
  const siteName =
    $('meta[property="og:site_name"]').attr("content") || undefined;
  const byline =
    $('meta[name="author"]').attr("content") ||
    $('meta[property="article:author"]').attr("content") ||
    undefined;

  // Strip noisy tags before extracting text
  $("script, style, noscript, nav, footer, header, aside, iframe, form").remove();

  // Heuristics: prefer <article>, then <main>, then largest <div> with paragraphs.
  const candidates = [
    $("article").first(),
    $("main").first(),
    $('div[itemprop="articleBody"]').first(),
    $("[role=main]").first(),
    $("body").first(),
  ];

  let textBlock = "";
  for (const node of candidates) {
    if (!node || node.length === 0) continue;
    const t = node
      .find("p, h1, h2, h3, h4, li, blockquote")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((s) => s.length > 0)
      .join("\n\n");
    if (t.length > 400) {
      textBlock = t;
      break;
    }
  }
  if (!textBlock) {
    textBlock = $("body").text().replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  return {
    title,
    text: textBlock.slice(0, 80_000),
    byline,
    siteName,
  };
}
