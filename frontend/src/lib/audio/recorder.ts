/**
 * Browser recorder helpers (owner: Vansh). Placeholder: implement supported
 * MIME detection, bounded recording and track cleanup in Phase 2.
 */
export interface RecordedAudio {
  blob: Blob;
  filename: string;
  mimeType: string;
  durationMs: number;
}

export function pickRecordingMimeType(): string | null {
  throw new Error("Not implemented: recording MIME detection (Phase 0 placeholder)");
}
