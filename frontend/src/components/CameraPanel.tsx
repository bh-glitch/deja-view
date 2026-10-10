"use client";
/** Camera preview + raw recognition status line (owner: Ishan). */
import type { RefObject } from "react";

import { useCamera } from "@/hooks/useCamera";
import { useRecognitionLoop, type RecognitionStatus } from "@/hooks/useRecognitionLoop";

function statusText(status: RecognitionStatus): string {
  if (status.kind === "waiting") return "Waiting for first frame result…";
  if (status.kind === "error") return `Error: ${status.text}`;
  const { result, latencyMs } = status;
  const parts = [`Frame: ${result.status}`];
  if (result.personId) parts.push(`personId ${result.personId}`);
  if (result.similarity !== null) parts.push(`similarity ${result.similarity.toFixed(3)}`);
  parts.push(`${result.frameWidth}×${result.frameHeight}`, `${latencyMs} ms`);
  return parts.join(" · ");
}

function RecognitionStatusLine({ videoRef }: { videoRef: RefObject<HTMLVideoElement | null> }) {
  const { status, skipped } = useRecognitionLoop(videoRef);
  return (
    <p className={status.kind === "error" ? "text-red-700 dark:text-red-400" : undefined}>
      {statusText(status)} <span className="text-zinc-500">(skipped while busy: {skipped})</span>
    </p>
  );
}

export function CameraPanel() {
  const { videoRef, state, start, stop } = useCamera();
  const running = state.kind === "live" || state.kind === "starting";

  return (
    <section aria-labelledby="camera-heading" className="flex flex-col gap-3 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
      <h2 id="camera-heading" className="text-lg font-semibold">
        Camera
      </h2>
      <div className="relative aspect-video w-full overflow-hidden rounded-md bg-zinc-900">
        {/* Preview is mirrored for the user; captured frames are not. */}
        <video ref={videoRef} muted playsInline className="h-full w-full object-cover" style={{ transform: "scaleX(-1)" }} />
        {state.kind !== "live" && (
          <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-zinc-300">
            {state.kind === "starting" ? "Starting camera…" : "Camera is off"}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void start()}
          disabled={running}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Start camera
        </button>
        <button
          type="button"
          onClick={stop}
          disabled={!running}
          className="rounded-md border border-zinc-400 px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          Stop camera
        </button>
      </div>
      <div aria-live="polite" className="text-sm">
        {state.kind === "error" && (
          <p role="alert" className="text-red-700 dark:text-red-400">
            {state.message}
          </p>
        )}
        {state.kind === "live" && <RecognitionStatusLine videoRef={videoRef} />}
        {state.kind === "off" && <p className="text-zinc-500">Recognition stopped.</p>}
      </div>
    </section>
  );
}
