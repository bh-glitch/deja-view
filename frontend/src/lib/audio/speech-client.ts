/**
 * Speech HTTP client (owner: Vansh). Upload field is `audio`; speech returns MP3 bytes.
 */
import { ApiClientError, apiFetch, apiJson } from "@/lib/api-client";

export const MAX_AUDIO_BYTES = 2_000_000;
export const MAX_AUDIO_SECONDS = 60;
export const MAX_SPEECH_CHARS = 400;

export async function transcribeAudio(audio: Blob, filename: string, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append("audio", audio, filename);
  const data = await apiJson<{ transcript: string }>("/audio/transcribe", { method: "POST", body: form, signal });
  return data.transcript;
}

/** Returns verified MP3 audio. Caller owns the object URL lifecycle. */
export async function speakText(text: string, signal?: AbortSignal): Promise<Blob> {
  const response = await apiFetch("/audio/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!response.headers.get("Content-Type")?.startsWith("audio/mpeg")) {
    throw new ApiClientError("INVALID_RESPONSE", "Speech response was not MP3 audio.", response.status, false, null);
  }
  return response.blob();
}
