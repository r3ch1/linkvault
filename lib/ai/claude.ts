import { fetch } from "@tauri-apps/plugin-http";
import type { AiCallInput } from "./index";
import type { AiProcessResult } from "../types";
import { buildUserPrompt, SYSTEM_PROMPT, safeParseJson } from "./prompt";

export async function processWithClaude(args: {
  apiKey: string;
  model: string;
  input: AiCallInput;
}): Promise<AiProcessResult> {
  const { apiKey, model, input } = args;

  const body = {
    model,
    max_tokens: 2048,
    temperature: 0.3,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(input) }],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Claude ${res.status}: ${t}`);
  }
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text =
    data.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("") ?? "";
  if (!text) throw new Error("Claude returned empty response");
  return safeParseJson(text) as AiProcessResult;
}
