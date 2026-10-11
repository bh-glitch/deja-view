/**
 * AI draft calls that also report which AI produced the draft (owner: Vansh).
 *
 * Same endpoints and envelopes as api-client's draftIntroduction/draftMemory; the backend
 * adds an `X-AI-Provider` header ("ollama:<model>" or "gemini:<model>") so the UI can say
 * which AI wrote the draft. No model is ever swapped silently.
 */
import { ApiClientError, apiFetch, type IntroductionDraft, type MemoryDraft } from "@/lib/api-client";

export const AI_PROVIDER_HEADER = "X-AI-Provider";

export interface AiProvider {
  kind: "local" | "gemini" | "claude" | "unknown";
  model: string | null;
  /** Short text for the UI, e.g. "local AI (qwen3.5:4b)". */
  label: string;
}

export function parseAiProvider(header: string | null): AiProvider {
  if (!header) return { kind: "unknown", model: null, label: "the backend's AI" };
  const [name, ...rest] = header.split(":");
  const model = rest.join(":") || null;
  if (name === "ollama") {
    const short = model?.replace(/-q\d.*$/i, "") ?? "local model";
    return { kind: "local", model, label: `local AI (${short}, on this laptop)` };
  }
  if (name === "gemini") return { kind: "gemini", model, label: `Gemini (${model ?? "Google"})` };
  if (name === "anthropic") return { kind: "claude", model, label: `Claude (${model ?? "Anthropic"})` };
  return { kind: "unknown", model, label: header };
}

async function draft<T>(
  path: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ draft: T; provider: AiProvider }> {
  const response = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiClientError("INVALID_RESPONSE", "Backend returned non-JSON.", response.status, false, null);
  }
  if (typeof body !== "object" || body === null || (body as { ok?: unknown }).ok !== true || !("data" in body)) {
    throw new ApiClientError("INVALID_RESPONSE", "Backend returned an unexpected envelope.", response.status, false, null);
  }
  return { draft: (body as { data: T }).data, provider: parseAiProvider(response.headers.get(AI_PROVIDER_HEADER)) };
}

export function draftIntroductionWithProvider(transcript: string, signal?: AbortSignal) {
  return draft<IntroductionDraft>("/ai/introduction", { transcript }, signal);
}

/** `personName` lets the draft say "Bhavya …" instead of "the speaker". */
export function draftMemoryWithProvider(transcript: string, personName: string | null, signal?: AbortSignal) {
  return draft<MemoryDraft>("/ai/memory", personName ? { transcript, personName } : { transcript }, signal);
}
