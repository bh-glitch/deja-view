"use client";
/**
 * Camera-first stage (Arnav, human-requested Liquid Glass redesign; replaces CameraPanel by
 * Ishan/Bhavya). The <video> sits in a box with the stream's own aspect ratio, fitted inside
 * the stage, so face-box percentages map exactly onto the picture (no cropping/stretching).
 * Floating UI is passed as `children` and is positioned against the whole stage.
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
  if (camera.kind === "live") return null;
  const starting = camera.kind === "starting";
  const failed = camera.kind === "error";
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      {/* Outer wrapper floats gently; the card itself keeps its entrance animation. */}
      <div className="float-idle w-full max-w-sm">
        <GlassSurface
          elevation="strong"
          lit
          refract
          className="animate-pop-in flex w-full flex-col items-center gap-4 rounded-[var(--radius-panel)] px-8 py-9 text-center"
        >
          <span
            className={`flex h-16 w-16 items-center justify-center rounded-full ${failed ? "bg-red-500/10 text-red-600" : "bg-white/80 text-accent shadow-[0_6px_18px_-8px_rgb(30_80_160/0.45)]"}`}
          >
            {failed ? <AlertIcon size={30} /> : starting ? <ScanFaceIcon size={30} className="breathe" /> : <CameraIcon size={30} />}
          </span>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[22px] font-semibold tracking-tight text-ink">
              {failed ? "Camera unavailable" : starting ? "Starting camera…" : "Camera is off"}
            </h2>
            <p role={failed ? "alert" : undefined} className="text-[15px] leading-relaxed text-ink/60">
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
    </div>
  );
}

export function CameraViewport({
  videoRef,
  camera,
  onStart,
  overlays,
  mirrored,
  children,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  camera: CameraState;
  onStart: () => void;
  overlays: FaceOverlay[];
  mirrored: boolean;
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
    <section aria-label="Camera" className="stage relative h-full w-full overflow-hidden stage-card rounded-[34px]">
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
            className="block h-full w-full rounded-[28px] bg-slate-900 object-contain shadow-[0_20px_50px_-24px_rgb(30_60_110/0.55)]"
            style={mirrored ? { transform: "scaleX(-1)" } : undefined}
          />
          {/* Light edge haze so the frosted overlays blend into the frame. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[28px]"
            style={{
              background:
                "linear-gradient(180deg, rgb(10 30 60 / 0.16), transparent 20%, transparent 74%, rgb(10 30 60 / 0.22))",
            }}
          />
          {live &&
            overlays.map((overlay, index) => (
              <FaceTag key={overlay.key} overlay={overlay} rect={rects[index]} compact={compact} />
            ))}
        </div>
      </div>
      <CameraPlaceholder camera={camera} onStart={onStart} />
      {children}
    </section>
  );
}
