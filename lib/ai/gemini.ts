import { fetch } from "@tauri-apps/plugin-http";
import type { AiCallInput } from "./index";
import type { AiProcessResult } from "../types";
import { buildUserPrompt, SYSTEM_PROMPT, safeParseJson } from "./prompt";

export async function processWithGemini(args: {
  apiKey: string;
  model: string;
  input: AiCallInput;
}): Promise<AiProcessResult> {
  const { apiKey, model, input } = args;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      { role: "user", parts: [{ text: buildUserPrompt(input) }] },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.3,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini ${res.status}: ${t}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  if (!text) throw new Error("Gemini returned empty response");
  return safeParseJson(text) as AiProcessResult;
}
