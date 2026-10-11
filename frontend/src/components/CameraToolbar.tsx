"use client";
/**
 * Floating camera toolbar (Arnav, human-requested Liquid Glass redesign). Only controls the
 * app already supports. "Who is this?" speaks the recognized person's name and latest cue
 * (Bhavya 2026-10-10); it is disabled until someone is recognized. A red dot on the
 * conversation button marks an automatic recording (Bhavya, human request 2026-10-10).
 */
import type { RefObject } from "react";

import { GlassButton } from "@/components/glass/GlassButton";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { CameraOffIcon, MessageIcon, PeopleIcon, SpeakerIcon, SwitchCameraIcon } from "@/components/glass/Icons";

export function CameraToolbar({
  running,
  onStop,
  canSwitch,
  onSwitch,
  peopleOpen,
  onTogglePeople,
  peopleCount,
  peopleRef,
  conversationOpen,
  onToggleConversation,
  conversationAvailable,
  conversationRef,
  conversationActive = false,
  whoIsThis,
}: {
  running: boolean;
  onStop: () => void;
  canSwitch: boolean;
  onSwitch: () => void;
  peopleOpen: boolean;
  onTogglePeople: () => void;
  peopleCount: number;
  peopleRef: RefObject<HTMLButtonElement | null>;
  conversationOpen: boolean;
  onToggleConversation: () => void;
  conversationAvailable: boolean;
  conversationRef: RefObject<HTMLButtonElement | null>;
  /** A conversation is being recorded or summarized; the button shows a red dot. */
  conversationActive?: boolean;
  whoIsThis: { available: boolean; busy: boolean; onClick: () => void };
}) {
  return (
    <GlassSurface
      elevation="strong"
      refract
      role="toolbar"
      aria-label="Camera controls"
      data-overlay
      className="flex items-center gap-1.5 rounded-full p-1.5"
    >
      <span className="relative">
        <GlassButton
          ref={peopleRef}
          variant="quiet"
          label="People"
          icon={<PeopleIcon size={21} />}
          aria-expanded={peopleOpen}
          aria-controls="people-drawer"
          active={peopleOpen}
          onClick={onTogglePeople}
        />
        {peopleCount > 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-black"
          >
            {peopleCount}
          </span>
        )}
      </span>
      {running && canSwitch && (
        <GlassButton variant="quiet" label="Switch camera" icon={<SwitchCameraIcon size={21} />} onClick={onSwitch} />
      )}
      {/* Starting happens from the camera-off card; here the camera can only be stopped. */}
      {running && (
        <GlassButton icon={<CameraOffIcon size={18} />} onClick={onStop} className="px-5">
          Stop camera
        </GlassButton>
      )}
      <GlassButton
        variant="quiet"
        label={whoIsThis.busy ? "Stop speaking" : "Who is this?"}
        icon={<SpeakerIcon size={21} />}
        active={whoIsThis.busy}
        disabled={!whoIsThis.available && !whoIsThis.busy}
        onClick={whoIsThis.onClick}
      />
      <span className="relative">
        <GlassButton
          ref={conversationRef}
          variant="quiet"
          label={
            conversationOpen
              ? "Hide last conversation"
              : conversationActive
                ? "Recording conversation"
                : "Last conversation"
          }
          icon={<MessageIcon size={21} />}
          aria-expanded={conversationOpen}
          aria-controls="conversation-drawer"
          active={conversationOpen}
          disabled={!conversationAvailable && !conversationOpen}
          onClick={onToggleConversation}
        />
        {conversationActive && (
          <span
            aria-hidden
            className="breathe pointer-events-none absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-400 shadow-[0_0_8px_rgb(248_113_113)]"
          />
        )}
      </span>
    </GlassSurface>
  );
}
