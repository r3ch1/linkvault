import { fetch } from "@tauri-apps/plugin-http";
import type { AiCallInput } from "./index";
import type { AiProcessResult } from "../types";
import { buildUserPrompt, SYSTEM_PROMPT, safeParseJson } from "./prompt";

export async function processWithOpenRouter(args: {
  apiKey: string;
  model: string;
  input: AiCallInput;
}): Promise<AiProcessResult> {
  const { apiKey, model, input } = args;

  const body = {
    model,
    temperature: 0.3,
    response_format: { type: "json_object" as const },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(input) },
    ],
  };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://linkvault.app",
      "X-Title": "LinkVault",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${t}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("OpenRouter returned empty response");
  return safeParseJson(text) as AiProcessResult;
}
