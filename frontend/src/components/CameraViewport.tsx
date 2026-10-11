"use client";
/**
 * Camera-first stage (Arnav, human-requested Liquid Glass redesign; replaces CameraPanel by
 * Ishan/Bhavya). The <video> sits in a box with the stream's own aspect ratio, fitted inside
 * the stage, so face-box percentages map exactly onto the picture (no cropping/stretching).
 * Floating UI is passed as `children` and is positioned against the whole stage; `videoCorner`
 * is pinned to the video picture's own top-left corner (human request 2026-10-11).
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { FaceTag, faceRect, type FaceOverlay } from "@/components/FaceTag";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { AlertIcon, CameraIcon, ScanFaceIcon } from "@/components/glass/Icons";
import type { CameraState } from "@/hooks/useCamera";

/** Below this displayed video width (px), tags use the compact style (phones). */
const COMPACT_WIDTH = 480;

export type { FaceOverlay };

function CameraPlaceholder({ camera, onStart }: { camera: CameraState; onStart: () => void }) {
  // "off" is the déjà-view start screen (Splash); this card covers starting and errors.
  if (camera.kind === "live" || camera.kind === "off") return null;
  const starting = camera.kind === "starting";
  const failed = camera.kind === "error";
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <GlassSurface
        elevation="strong"
        lit
        refract
        className="animate-pop-in flex w-full max-w-sm flex-col items-center gap-4 rounded-[var(--radius-panel)] px-7 py-8 text-center"
      >
        <span
          className={`flex h-16 w-16 items-center justify-center rounded-full ${failed ? "bg-red-400/15 text-red-300" : "bg-white/10 text-white"}`}
        >
          {failed ? <AlertIcon size={30} /> : starting ? <ScanFaceIcon size={30} className="breathe" /> : <CameraIcon size={30} />}
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl font-semibold tracking-tight">
            {failed ? "Camera unavailable" : starting ? "Starting camera…" : "Camera is off"}
          </h2>
          <p role={failed ? "alert" : undefined} className="text-sm leading-relaxed text-white/70">
            {failed
              ? camera.message
              : starting
                ? "If your browser asks, allow camera access."
                : "Turn on the camera to recognize familiar people. Video stays on this device."}
          </p>
        </div>
        {!starting && (
          <GlassButton variant="primary" icon={<CameraIcon size={18} />} onClick={onStart} className="px-6">
            {failed ? "Try again" : "Start camera"}
          </GlassButton>
        )}
      </GlassSurface>
    </div>
  );
}

export function CameraViewport({
  videoRef,
  camera,
  onStart,
  overlays,
  mirrored,
  videoCorner,
  children,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  camera: CameraState;
  onStart: () => void;
  overlays: FaceOverlay[];
  mirrored: boolean;
  /** Shown at the top-left of the video itself, not of the surrounding stage. */
  videoCorner?: ReactNode;
  children?: ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [aspect, setAspect] = useState("16 / 9");
  const live = camera.kind === "live";

  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < COMPACT_WIDTH));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Match the box to the real stream shape (phones often give portrait video).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const update = () => {
      if (video.videoWidth && video.videoHeight) setAspect(`${video.videoWidth} / ${video.videoHeight}`);
    };
    update();
    video.addEventListener("loadedmetadata", update);
    video.addEventListener("resize", update);
    return () => {
      video.removeEventListener("loadedmetadata", update);
      video.removeEventListener("resize", update);
    };
  }, [videoRef]);

  const rects = overlays.map((overlay) => faceRect(overlay, mirrored));

  return (
    <section aria-label="Camera" className="stage relative h-full w-full overflow-hidden rounded-[34px] bg-black/60 ring-1 ring-white/10">
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          ref={boxRef}
          className={`video-box relative ${live ? "" : "invisible"}`}
          style={{ ["--ar" as string]: aspect }}
        >
          {/* Front-camera preview is mirrored like a selfie; captured frames never are. */}
          <video
            ref={videoRef}
            muted
            playsInline
            className="block h-full w-full rounded-[28px] bg-black object-contain"
            style={mirrored ? { transform: "scaleX(-1)" } : undefined}
          />
          {/* Soft vignette so glass text stays readable over bright frames. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[28px]"
            style={{
              background:
                "linear-gradient(180deg, rgb(0 0 0 / 0.28), transparent 22%, transparent 70%, rgb(0 0 0 / 0.38))",
            }}
          />
          {live &&
            overlays.map((overlay, index) => (
              <FaceTag key={overlay.key} overlay={overlay} rect={rects[index]} compact={compact} />
            ))}
          {videoCorner && (
            <div data-overlay className="pointer-events-none absolute left-4 top-4 z-30 sm:left-5 sm:top-5">
              {videoCorner}
            </div>
          )}
        </div>
      </div>
      <CameraPlaceholder camera={camera} onStart={onStart} />
      {children}
    </section>
  );
}
