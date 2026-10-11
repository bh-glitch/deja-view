"use client";
/**
 * On-video face tag (Bhavya 2026-10-10; Liquid Glass restyle by Arnav, human-requested).
 * Plain HTML positioned over the <video>; nothing is drawn into the camera stream.
 * Known faces get soft corner brackets and a glass name plate directly under the face:
 * name, then relationship. Conversation details live in the side panel, never here.
 * Unknown faces get a dashed outline and a "New face" pill; pending faces a shimmer.
 */
import type { Box } from "@/lib/api-client";
import type { FaceRect } from "@/lib/face-tag-layout";
import { badgeGradient, initials } from "@/lib/face-tag";

export interface FaceOverlay {
  key: number;
  box: Box;
  frameWidth: number;
  frameHeight: number;
  kind: "known" | "pending" | "unknown";
  personId?: string;
  name?: string;
  relationship?: string | null;
}

/** Faces whose bottom edge is below this (% of height) get the plate above instead. */
export const PLATE_ABOVE_IF_BOTTOM_PAST = 80;

const pct = (value: number) => `${value}%`;
const GLIDE = "transition-[left,top,width,height] duration-300 ease-out";

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
  const corner = `absolute h-[20%] w-[20%] ${dim ? "border-white/55" : "border-white/95"} drop-shadow-[0_0_8px_rgba(255,255,255,0.55)]`;
  return (
    <>
      <span className={`${corner} left-0 top-0 rounded-tl-2xl border-l-[2.5px] border-t-[2.5px]`} />
      <span className={`${corner} right-0 top-0 rounded-tr-2xl border-r-[2.5px] border-t-[2.5px]`} />
      <span className={`${corner} bottom-0 left-0 rounded-bl-2xl border-b-[2.5px] border-l-[2.5px]`} />
      <span className={`${corner} bottom-0 right-0 rounded-br-2xl border-b-[2.5px] border-r-[2.5px]`} />
    </>
  );
}

export function FaceTag({ overlay, rect, compact }: { overlay: FaceOverlay; rect: FaceRect; compact: boolean }) {
  const faceStyle = { left: pct(rect.left), top: pct(rect.top), width: pct(rect.width), height: pct(rect.height) };
  const above = rect.top + rect.height > PLATE_ABOVE_IF_BOTTOM_PAST;
  const plateStyle = {
    left: pct(rect.left + rect.width / 2),
    ...(above ? { bottom: pct(100 - rect.top + 1.5) } : { top: pct(rect.top + rect.height + 1.5) }),
  };

  if (overlay.kind === "unknown") {
    return (
      <>
        <div aria-hidden className={`absolute ${GLIDE}`} style={faceStyle}>
          <div className="h-full w-full rounded-[22%] border-2 border-dashed border-white/45" />
        </div>
        <div aria-hidden className={`absolute z-10 -translate-x-1/2 ${GLIDE}`} style={plateStyle}>
          <span
            className={`glass glass-thin animate-tag-in relative block whitespace-nowrap rounded-full font-medium ${compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs"}`}
          >
            New face
          </span>
        </div>
      </>
    );
  }

  const name = overlay.kind === "known" ? overlay.name : undefined;
  const badge = compact ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-[12px]";

  return (
    <>
      <div aria-hidden className={`absolute ${GLIDE}`} style={faceStyle}>
        <Brackets dim={!name} />
      </div>
      <div
        aria-hidden
        data-face-tag={name ?? "pending"}
        className={`absolute z-10 w-max max-w-[46%] -translate-x-1/2 ${GLIDE}`}
        style={plateStyle}
      >
        <div
          key={name ?? "pending"}
          className={`glass animate-tag-in relative flex min-w-0 items-center gap-2 rounded-full ${compact ? "py-1 pl-1 pr-2.5" : "py-1.5 pl-1.5 pr-4"}`}
        >
          {name ? (
            <span
              className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shadow ${badge} ${badgeGradient(overlay.personId ?? name)}`}
            >
              {initials(name)}
            </span>
          ) : (
            <span className={`shimmer shrink-0 rounded-full ${badge}`} />
          )}
          {name ? (
            <span className="min-w-0 text-left">
              <span className={`block truncate font-semibold leading-tight ${compact ? "text-xs" : "text-[15px]"}`}>
                {name}
              </span>
              {overlay.relationship && (
                <span className={`block truncate leading-tight text-white/75 ${compact ? "text-[10px]" : "text-xs"}`}>
                  {overlay.relationship}
                </span>
              )}
            </span>
          ) : (
            <span className="shimmer h-3 w-16 rounded" />
          )}
        </div>
      </div>
    </>
  );
}
