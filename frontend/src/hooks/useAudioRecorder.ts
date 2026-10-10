"use client";
/**
 * Explicit, bounded microphone recording (owner: Vansh). Placeholder signature.
 */
import type { RecordedAudio } from "@/lib/audio/recorder";

export type RecorderState = "idle" | "requesting" | "recording" | "stopping" | "error";

export interface AudioRecorder {
  state: RecorderState;
  error: string | null;
  elapsedMs: number;
  start: () => Promise<void>;
  stop: () => Promise<RecordedAudio | null>;
  cancel: () => void;
}

export function useAudioRecorder(): AudioRecorder {
  return {
    state: "error",
    error: "Recording is not implemented yet (Phase 0 placeholder).",
    elapsedMs: 0,
    start: async () => {
      throw new Error("Not implemented: useAudioRecorder.start");
    },
    stop: async () => null,
    cancel: () => {},
  };
}
