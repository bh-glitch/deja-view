"use client";
/**
 * On-video face tag (Bhavya 2026-10-10). Plain HTML positioned over the <video>; nothing
 * is drawn into the camera stream. Known faces get corner brackets and a frosted name card
 * with the last conversation; unknown faces get a light dashed outline and a "New face" pill.
 * Placement (beside / below / above, max width) comes from `placeTags` so tags never cover
 * other faces.
 */
import type { CSSProperties } from "react";

import type { Box } from "@/lib/api-client";
import type { FaceRect, TagPlacement } from "@/lib/face-tag-layout";
import { badgeGradient, initials, timeAgo } from "@/lib/face-tag";

export interface FaceOverlay {
  key: number;
  box: Box;
  frameWidth: number;
  frameHeight: number;
  kind: "known" | "pending" | "unknown";
  personId?: string;
  name?: string;
  relationship?: string | null;
  cue?: string | null;
  cueAt?: string | null;
}

const pct = (value: number) => `${value}%`;
const GLIDE = "transition-[left,top,right,bottom,width,height] duration-300 ease-out";
const GLASS = "bg-black/50 text-white shadow-xl ring-1 ring-white/20 backdrop-blur-md";

/** Face box as percentages of the displayed video; a mirrored preview flips x. */
export function faceRect(overlay: FaceOverlay, mirrored: boolean): FaceRect {
  const { box, frameWidth, frameHeight } = overlay;
  return {
    key: overlay.key,
    left: ((mirrored ? frameWidth - box.x - box.width : box.x) / frameWidth) * 100,
    top: (box.y / frameHeight) * 100,
    width: (box.width / frameWidth) * 100,
    height: (box.height / frameHeight) * 100,
  };
}

function Brackets({ dim }: { dim: boolean }) {
  const corner = `absolute h-[22%] w-[22%] ${dim ? "border-white/60" : "border-white"} drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]`;
  return (
    <>
      <span className={`${corner} left-0 top-0 rounded-tl-xl border-l-[3px] border-t-[3px]`} />
      <span className={`${corner} right-0 top-0 rounded-tr-xl border-r-[3px] border-t-[3px]`} />
      <span className={`${corner} bottom-0 left-0 rounded-bl-xl border-b-[3px] border-l-[3px]`} />
      <span className={`${corner} bottom-0 right-0 rounded-br-xl border-b-[3px] border-r-[3px]`} />
    </>
  );
}

function cardPosition(rect: FaceRect, placement: TagPlacement): CSSProperties {
  if (placement.mode === "side") {
    return placement.side === "right"
      ? { left: pct(rect.left + rect.width + 2), top: pct(placement.top), maxWidth: pct(placement.maxWidth) }
      : { right: pct(100 - rect.left + 2), top: pct(placement.top), maxWidth: pct(placement.maxWidth) };
  }
  const vertical = placement.mode === "below" ? { top: pct(placement.edge) } : { bottom: pct(placement.edge) };
  return { left: pct(placement.centerX), ...vertical, maxWidth: pct(placement.maxWidth) };
}

export function FaceTag({
  overlay,
  rect,
  placement,
  compact,
}: {
  overlay: FaceOverlay;
  rect: FaceRect;
  placement: TagPlacement;
  compact: boolean;
}) {
  const faceStyle = { left: pct(rect.left), top: pct(rect.top), width: pct(rect.width), height: pct(rect.height) };
  const centered = placement.mode !== "side";

  if (overlay.kind === "unknown") {
    return (
      <div aria-hidden className={`absolute ${GLIDE}`} style={faceStyle}>
        <div className="h-full w-full rounded-2xl border-2 border-dashed border-white/50" />
        <span className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2">
          <span className={`animate-tag-in block whitespace-nowrap rounded-full px-2 py-0.5 font-medium ${GLASS} ${compact ? "text-[10px]" : "text-xs"}`}>
            New face 👋
          </span>
        </span>
      </div>
    );
  }

  const name = overlay.kind === "known" ? overlay.name : undefined;
  const showCue = placement.showCue && !!name;
  const badge = compact ? "h-6 w-6 text-[10px]" : "h-9 w-9 text-sm";

  return (
    <>
      <div aria-hidden className={`absolute ${GLIDE}`} style={faceStyle}>
        <Brackets dim={!name} />
      </div>
      <div
        aria-hidden
        data-face-tag={name ?? "pending"}
        className={`absolute z-10 w-max ${GLIDE} ${centered ? "-translate-x-1/2" : ""}`}
        style={cardPosition(rect, placement)}
      >
        <div className={`animate-tag-in flex flex-col gap-1.5 rounded-2xl ${GLASS} ${compact ? "p-1.5" : "p-2.5"}`}>
          <div className="flex min-w-0 items-center gap-2">
            {name ? (
              <span
                className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shadow ${badge} ${badgeGradient(overlay.personId ?? name)}`}
              >
                {initials(name)}
              </span>
            ) : (
              <span className={`shrink-0 animate-pulse rounded-full bg-white/30 ${badge}`} />
            )}
            {name ? (
              <span className="min-w-0">
                <span className={`block truncate font-semibold leading-tight ${compact ? "text-xs" : "text-base"}`}>{name}</span>
                {overlay.relationship && (
                  <span className={`block truncate leading-tight text-white/75 ${compact ? "text-[10px]" : "text-xs"}`}>
                    {overlay.relationship}
                  </span>
                )}
              </span>
            ) : (
              <span className="h-3 w-16 animate-pulse rounded bg-white/30" />
            )}
          </div>
          {showCue && (
            <div
              className={`relative rounded-xl bg-white/90 text-zinc-800 shadow ${compact ? "px-1.5 py-1 text-[10px]" : "px-2 py-1.5 text-xs"} leading-snug`}
            >
              <span className={`absolute -top-1 h-2.5 w-2.5 rotate-45 bg-white/90 ${placement.mode === "side" && placement.side === "left" ? "right-3" : "left-3"}`} />
              {overlay.cue ? (
                <>
                  <span className="font-semibold">💬 Last time{overlay.cueAt ? ` · ${timeAgo(overlay.cueAt)}` : ""}</span>
                  <span className={`mt-0.5 block ${compact || centered ? "line-clamp-1" : "line-clamp-2"}`}>{overlay.cue}</span>
                </>
              ) : (
                <span>No chats yet. Say hi! ✨</span>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
