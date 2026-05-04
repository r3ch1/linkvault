import type { AiProcessResult, AiProviderId, ContentKind } from "../types";
import { processWithGemini } from "./gemini";
import { processWithClaude } from "./claude";
import { processWithOpenAI } from "./openai";
import { processWithOpenRouter } from "./openrouter";

export interface AiCallInput {
  url: string;
  kind: ContentKind;
  /** Plain extracted text (article body, transcript, etc). */
  text: string;
  /** Optional original page title (for hint only). */
  pageTitle?: string;
  /** Output language: "auto" (same as source) or ISO 639-1 (pt, en, es, ...). */
  outputLanguage?: string;
}

export interface AiCallParams {
  provider: AiProviderId;
  apiKey: string;
  model: string;
  input: AiCallInput;
}

export async function callAi({
  provider,
  apiKey,
  model,
  input,
}: AiCallParams): Promise<AiProcessResult> {
  switch (provider) {
    case "gemini":
      return processWithGemini({ apiKey, model, input });
    case "claude":
      return processWithClaude({ apiKey, model, input });
    case "openai":
      return processWithOpenAI({ apiKey, model, input });
    case "openrouter":
      return processWithOpenRouter({ apiKey, model, input });
  }
}

export const PROVIDER_DEFAULT_MODELS: Record<AiProviderId, string> = {
  gemini: "gemini-2.5-flash",
  claude: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
  openrouter: "openrouter/auto",
};

export const PROVIDER_LABELS: Record<AiProviderId, string> = {
  gemini: "Google Gemini",
  claude: "Anthropic Claude",
  openai: "OpenAI",
  openrouter: "OpenRouter",
};
