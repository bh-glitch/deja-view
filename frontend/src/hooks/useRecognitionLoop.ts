"use client";
/**
 * Recognition loop (Ishan Phase 1a; extended by Bhavya 2026-10-10). About 2 fps, at most
 * one request in flight; ticks that arrive while busy are skipped. `paused` stops sending
 * (e.g. while enrollment samples are captured) and discards any in-flight result.
 */
import { useEffect, useRef, useState, type RefObject } from "react";

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

export function useRecognitionLoop(
  videoRef: RefObject<HTMLVideoElement | null>,
  { enabled, paused, onResult }: { enabled: boolean; paused: boolean; onResult?: (result: FrameResult) => void },
) {
  const [status, setStatus] = useState<RecognitionStatus>({ kind: "waiting" });
  const [skipped, setSkipped] = useState(0);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    if (!enabled || paused) return;
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
        onResultRef.current?.(result);
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
  }, [videoRef, enabled, paused]);

  return { status, skipped };
}
