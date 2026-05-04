import type { AiProcessResult } from "./types";

export interface BuildMarkdownInput {
  ai: AiProcessResult;
  url: string;
  rawText?: string;
  /** For audio/video: full transcript to include verbatim. */
  transcript?: string;
}

export function buildMarkdown(input: BuildMarkdownInput): string {
  const { ai } = input;
  const lines: string[] = [];
  lines.push(`# ${ai.title}`);
  lines.push("");
  lines.push("## Resumo");
  lines.push("");
  lines.push(ai.summary.trim());
  lines.push("");

  if (ai.key_points && ai.key_points.length > 0) {
    lines.push("## Pontos Principais");
    lines.push("");
    for (const p of ai.key_points) lines.push(`- ${p}`);
    lines.push("");
  }

  if (ai.timestamps && ai.timestamps.length > 0) {
    lines.push("## Timestamps");
    lines.push("");
    for (const t of ai.timestamps) lines.push(`- **${t.time}** — ${t.topic}`);
    lines.push("");
  }

  if (input.transcript && input.transcript.trim().length > 0) {
    lines.push("## Transcrição");
    lines.push("");
    lines.push(input.transcript.trim());
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(`Fonte original: <${input.url}>`);
  lines.push("");
  return lines.join("\n");
}

export function summaryPreview(summary: string, max = 240): string {
  const flat = summary.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : flat.slice(0, max - 1) + "…";
}
