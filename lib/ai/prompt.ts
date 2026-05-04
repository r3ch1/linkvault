import type { AiCallInput } from "./index";

export const SYSTEM_PROMPT = `Você é um assistente de curadoria de conteúdo para um gerenciador de bookmarks.
Sempre responda APENAS com JSON válido, sem markdown, sem comentários, sem explicações fora do JSON.
O JSON deve ter exatamente as chaves pedidas e nada mais.`;

const LANG_NAMES: Record<string, string> = {
  pt: "português (Brasil)",
  en: "English",
  es: "español",
  fr: "français",
  de: "Deutsch",
  it: "italiano",
  ja: "日本語",
  zh: "中文",
};

function languageInstruction(lang: string | undefined): string {
  if (!lang || lang === "auto") {
    return "- IDIOMA DA SAÍDA: use o MESMO idioma do conteúdo de origem para title, summary, key_points e tags.";
  }
  const name = LANG_NAMES[lang] ?? lang;
  return `- IDIOMA DA SAÍDA: TRADUZA title, summary, key_points e tags para ${name} (${lang}), independentemente do idioma do conteúdo de origem.`;
}

export function buildUserPrompt(input: AiCallInput): string {
  const isVideo = input.kind === "youtube" || input.kind === "vimeo";
  const schema = isVideo
    ? `{
  "title": "título otimizado (máx 80 chars)",
  "summary": "resumo detalhado do vídeo em 3-5 parágrafos",
  "key_points": ["ponto 1", "ponto 2", "ponto 3"],
  "tags": ["tag1", "tag2", "tag3"],
  "lang": "pt",
  "content_type": "video",
  "timestamps": [{ "time": "00:01:30", "topic": "intro" }]
}`
    : `{
  "title": "título otimizado (máx 80 chars)",
  "summary": "resumo em 3-5 parágrafos",
  "key_points": ["ponto 1", "ponto 2", "ponto 3"],
  "tags": ["tag1", "tag2", "tag3"],
  "lang": "pt",
  "content_type": "article"
}`;

  const guidance = `
${languageInstruction(input.outputLanguage)}
- tags: 3 a 8, em lowercase, sem espaços (use hífen). Tags seguem o idioma de saída.
- lang: ISO 639-1 do idioma ORIGINAL do conteúdo (não o idioma da saída).
- content_type: ${
    isVideo
      ? '"video"'
      : 'um de: "article" | "tutorial" | "news" | "reference" | "opinion"'
  }.
- key_points: 3 a 6 bullets curtos.`;

  return `Analise o seguinte conteúdo e retorne JSON com este formato:

${schema}
${guidance}

URL: ${input.url}
${input.pageTitle ? `Título da página: ${input.pageTitle}\n` : ""}
CONTEÚDO:
${input.text.slice(0, 60_000)}`;
}

export function safeParseJson(raw: string): unknown {
  // Strip markdown code fences if any model still wraps.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  // Try direct parse, else find first {...} block.
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`AI response was not JSON:\n${raw.slice(0, 500)}`);
    return JSON.parse(m[0]);
  }
}
