"use client";
/** Camera preview with face-box overlay and status line (Ishan Phase 1a; Bhavya 2026-10-10). */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { FaceTag, faceRect, type FaceOverlay } from "@/components/FaceTag";
import type { CameraState } from "@/hooks/useCamera";
import type { RecognitionStatus } from "@/hooks/useRecognitionLoop";
import { placeTags } from "@/lib/face-tag-layout";

/** Below this displayed video width (px), tags use the compact style (phones). */
const COMPACT_WIDTH = 480;

export type { FaceOverlay };

function statusText(status: RecognitionStatus): string {
  if (status.kind === "waiting") return "Waiting for first frame…";
  if (status.kind === "error") return `Error: ${status.text}`;
  const { result, latencyMs } = status;
  const matched = result.faces.filter((face) => face.status === "matched").length;
  const faces = result.faces.length;
  if (faces === 0) return `No face · ${latencyMs} ms`;
  return `${faces} face${faces === 1 ? "" : "s"} · ${matched} matched · ${latencyMs} ms`;
}

export function CameraPanel({
  videoRef,
  camera,
  onStart,
  onStop,
  status,
  overlays,
  paused,
  mirrored,
  canSwitch,
  onSwitch,
  children,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  camera: CameraState;
  onStart: () => void;
  onStop: () => void;
  status: RecognitionStatus;
  overlays: FaceOverlay[];
  paused: boolean;
  mirrored: boolean;
  canSwitch: boolean;
  onSwitch: () => void;
  children?: ReactNode;
}) {
  const running = camera.kind === "live" || camera.kind === "starting";
  const stageRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < COMPACT_WIDTH));
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  const rects = overlays.map((overlay) => faceRect(overlay, mirrored));
  const placements = placeTags(rects, { compact });

  return (
    <section aria-labelledby="camera-heading" className="flex flex-col gap-3 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
      <div className="flex items-center justify-between gap-2">
        <h2 id="camera-heading" className="text-lg font-semibold">
          Camera
        </h2>
        <div className="flex gap-2">
          {camera.kind === "live" && canSwitch && (
            <button type="button" onClick={onSwitch} className="rounded-md border border-zinc-400 px-3 py-1.5 text-sm font-medium">
              Switch camera
            </button>
          )}
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
      </div>
      <div className="relative w-full">
        {/* Tags may extend past the video edge rather than being clipped. */}
        <div ref={stageRef} className="relative">
          {/* Front-camera preview is mirrored like a selfie; captured frames never are. */}
          <video
            ref={videoRef}
            muted
            playsInline
            className={`block h-auto w-full rounded-md bg-zinc-900 ${camera.kind === "live" ? "" : "hidden"}`}
            style={mirrored ? { transform: "scaleX(-1)" } : undefined}
          />
          {camera.kind === "live" &&
            overlays.map((overlay, index) => (
              <FaceTag
                key={overlay.key}
                overlay={overlay}
                rect={rects[index]}
                placement={placements.get(overlay.key)!}
                compact={compact}
              />
            ))}
        </div>
        {camera.kind !== "live" && (
          <p className="flex aspect-video items-center justify-center rounded-md bg-zinc-900 p-4 text-center text-sm text-zinc-300">
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
