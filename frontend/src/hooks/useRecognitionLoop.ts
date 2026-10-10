"use client";
/**
 * Minimal recognition loop (owner: Ishan, Phase 1a). About 2 fps, at most one request in
 * flight; ticks that arrive while busy are skipped. Reports the raw per-frame result only;
 * stable-identity logic comes in Phase 2. Mount only while the camera is live.
 */
import { useEffect, useState, type RefObject } from "react";

import { ApiClientError, type FrameResult } from "@/lib/api-client";
import { captureJpegFrame } from "@/lib/frame-capture";
import { recognizeFrame } from "@/lib/vision-client";

export const FRAME_INTERVAL_MS = 500;

export type RecognitionStatus =
  | { kind: "waiting" }
  | { kind: "frame"; result: FrameResult; latencyMs: number }
  | { kind: "error"; text: string };

export function describeRecognitionError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.status ?? "no status"} ${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : "Recognition failed.";
}

export function useRecognitionLoop(videoRef: RefObject<HTMLVideoElement | null>) {
  const [status, setStatus] = useState<RecognitionStatus>({ kind: "waiting" });
  const [skipped, setSkipped] = useState(0);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    let inFlight: AbortController | null = null;
    let cancelled = false;

    const tick = async () => {
      if (inFlight) {
        setSkipped((count) => count + 1);
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      const controller = new AbortController();
      inFlight = controller;
      const startedAt = performance.now();
      try {
        const frame = await captureJpegFrame(video, canvas);
        if (!frame || cancelled) return;
        const result = await recognizeFrame(frame, controller.signal);
        if (cancelled) return;
        setStatus({ kind: "frame", result, latencyMs: Math.round(performance.now() - startedAt) });
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setStatus({ kind: "error", text: describeRecognitionError(error) });
      } finally {
        if (inFlight === controller) inFlight = null;
      }
    };

    const timer = window.setInterval(() => void tick(), FRAME_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      inFlight?.abort();
    };
  }, [videoRef]);

  return { status, skipped };
}
