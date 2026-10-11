"use client";
/**
 * YouTube-style ambient light (Arnav, human-requested): the page behind the camera glows
 * with the live video's colours. A tiny copy of the frame (48×27 px) is sampled a few times
 * a second, eased toward smoothly every animation frame, and stretched + blurred by CSS.
 * Nothing leaves the browser; the canvas is never read back or uploaded.
 */
import { useEffect, useRef, type RefObject } from "react";

const W = 48;
const H = 27;
const SAMPLE_MS = 220;
/** Fraction of the remaining colour difference closed per animation frame. */
const EASE = 0.08;

export function AmbientBackdrop({
  videoRef,
  active,
  mirrored,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  active: boolean;
  mirrored: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) return;
    const sampler = document.createElement("canvas");
    sampler.width = W;
    sampler.height = H;
    const sctx = sampler.getContext("2d", { willReadFrequently: true });
    if (!sctx) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const current = new Float32Array(W * H * 4);
    let target: Uint8ClampedArray | null = null;
    let primed = false;
    let lastSample = 0;
    let frame = 0;
    const out = ctx.createImageData(W, H);

    const sample = () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return;
      sctx.drawImage(video, 0, 0, W, H);
      target = sctx.getImageData(0, 0, W, H).data;
      if (!primed) {
        current.set(target);
        primed = true;
      }
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden) return;
      if (now - lastSample > SAMPLE_MS) {
        lastSample = now;
        sample();
      }
      if (!target) return;
      const k = reduced ? 1 : EASE;
      for (let i = 0; i < current.length; i++) {
        current[i] += (target[i] - current[i]) * k;
        out.data[i] = current[i];
      }
      ctx.putImageData(out, 0, 0);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, videoRef]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="absolute inset-0 h-full w-full transition-opacity duration-1000 ease-out"
        style={{
          opacity: active ? 1 : 0,
          // Oversized so the blurred edges never show; mirrored like the preview.
          transform: `scale(1.25)${mirrored ? " scaleX(-1)" : ""}`,
          filter: "blur(56px) saturate(1.5) brightness(1.05)",
        }}
      />
      {/* A soft frost over the glow keeps the page airy and the colours gentle. */}
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          opacity: active ? 1 : 0,
          background: "linear-gradient(180deg, rgb(255 255 255 / 0.18), rgb(230 240 255 / 0.12))",
        }}
      />
    </div>
  );
}
