"use client";
/** Camera preview with face-box overlay and status line (Ishan Phase 1a; Bhavya 2026-10-10). */
import type { ReactNode, RefObject } from "react";

import type { CameraState } from "@/hooks/useCamera";
import type { RecognitionStatus } from "@/hooks/useRecognitionLoop";
import type { Box } from "@/lib/api-client";

export interface FaceOverlay {
  box: Box;
  frameWidth: number;
  frameHeight: number;
  label: string;
  tone: "known" | "unknown";
}

function statusText(status: RecognitionStatus): string {
  if (status.kind === "waiting") return "Waiting for first frame…";
  if (status.kind === "error") return `Error: ${status.text}`;
  const { result, latencyMs } = status;
  const parts = [`Frame: ${result.status}`];
  if (result.similarity !== null) parts.push(`similarity ${result.similarity.toFixed(3)}`);
  parts.push(`${latencyMs} ms`);
  return parts.join(" · ");
}

export function CameraPanel({
  videoRef,
  camera,
  onStart,
  onStop,
  status,
  overlay,
  paused,
  children,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  camera: CameraState;
  onStart: () => void;
  onStop: () => void;
  status: RecognitionStatus;
  overlay: FaceOverlay | null;
  paused: boolean;
  children?: ReactNode;
}) {
  const running = camera.kind === "live" || camera.kind === "starting";
  // Boxes are in unmirrored frame pixels; the preview is mirrored, so flip x.
  const boxStyle = overlay && {
    left: `${((overlay.frameWidth - overlay.box.x - overlay.box.width) / overlay.frameWidth) * 100}%`,
    top: `${(overlay.box.y / overlay.frameHeight) * 100}%`,
    width: `${(overlay.box.width / overlay.frameWidth) * 100}%`,
    height: `${(overlay.box.height / overlay.frameHeight) * 100}%`,
  };

  return (
    <section aria-labelledby="camera-heading" className="flex flex-col gap-3 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
      <div className="flex items-center justify-between gap-2">
        <h2 id="camera-heading" className="text-lg font-semibold">
          Camera
        </h2>
        <button
          type="button"
          onClick={running ? onStop : onStart}
          className={
            running
              ? "rounded-md border border-zinc-400 px-3 py-1.5 text-sm font-medium"
              : "rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
          }
        >
          {running ? "Stop camera" : "Start camera"}
        </button>
      </div>
      <div className="relative w-full overflow-hidden rounded-md bg-zinc-900">
        <div className="relative">
          {/* Preview is mirrored for the user; captured frames are not. */}
          <video ref={videoRef} muted playsInline className="block h-auto w-full" style={{ transform: "scaleX(-1)" }} />
          {camera.kind === "live" && overlay && boxStyle && (
            <div
              aria-hidden
              className={`absolute rounded-md border-2 ${overlay.tone === "known" ? "border-emerald-400" : "border-amber-400"}`}
              style={boxStyle}
            >
              <span
                className={`absolute -top-6 left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold ${
                  overlay.tone === "known" ? "bg-emerald-400 text-emerald-950" : "bg-amber-400 text-amber-950"
                }`}
              >
                {overlay.label}
              </span>
            </div>
          )}
        </div>
        {camera.kind !== "live" && (
          <p className="flex aspect-video items-center justify-center p-4 text-center text-sm text-zinc-300">
            {camera.kind === "starting" ? "Starting camera…" : "Camera is off"}
          </p>
        )}
        {children}
      </div>
      <div aria-live="polite" className="text-xs text-zinc-500">
        {camera.kind === "error" && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {camera.message}
          </p>
        )}
        {camera.kind === "live" && (
          <p className={status.kind === "error" ? "text-red-700 dark:text-red-400" : undefined}>
            {paused ? "Recognition paused while capturing a new face…" : statusText(status)}
          </p>
        )}
      </div>
    </section>
  );
}
