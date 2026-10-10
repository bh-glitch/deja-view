/**
 * Browser recorder helpers (owner: Vansh): supported MIME detection and limits.
 */
import { MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS } from "@/lib/audio/speech-client";

export interface RecordedAudio {
  blob: Blob;
  filename: string;
  mimeType: string;
  durationMs: number;
}

export const MAX_RECORDING_MS = MAX_AUDIO_SECONDS * 1000;
/** Stop a little before the server's 2 MB limit so the final chunk still fits. */
export const RECORDING_BYTES_GUARD = MAX_AUDIO_BYTES - 100_000;
export const RECORDING_LIMITS_TEXT =
  "Recording stops automatically after 60 seconds (or about 2 MB of audio).";

/** In preference order; Scribe accepts all of these containers. */
const CANDIDATE_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export function pickRecordingMimeType(): string | null {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return null;
  }
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export function extensionForMimeType(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (base === "audio/mp4") return "m4a";
  if (base === "audio/ogg") return "ogg";
  return "webm";
}

/** Clamp a requested window to (0, 60 s]; anything invalid means the full 60 s. */
export function clampRecordingMs(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested) || requested <= 0) return MAX_RECORDING_MS;
  return Math.min(Math.round(requested), MAX_RECORDING_MS);
}

export function microphoneErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone permission was denied. Allow microphone access in the browser to record.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found.";
  }
  if (name === "NotReadableError") {
    return "The microphone is in use by another app.";
  }
  return "Could not start the microphone.";
}
