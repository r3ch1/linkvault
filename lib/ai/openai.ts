import { fetch } from "@tauri-apps/plugin-http";
import type { AiCallInput } from "./index";
import type { AiProcessResult } from "../types";
import { buildUserPrompt, SYSTEM_PROMPT, safeParseJson } from "./prompt";

export async function processWithOpenAI(args: {
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

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI ${res.status}: ${t}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("OpenAI returned empty response");
  return safeParseJson(text) as AiProcessResult;
}
