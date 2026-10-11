"use client";
/**
 * Recording indicator (Bhavya, human request 2026-10-10: "I want an indicator" for the
 * automatic conversation). Sits above the toolbar while a conversation is being recorded or
 * summarized: who it is with, the elapsed time, and Stop. Tapping the text opens the panel.
 */
import { GlassSurface } from "@/components/glass/GlassSurface";
import type { ConversationState } from "@/hooks/useConversationMemory";

function clock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function RecordingPill({
  state,
  onStop,
  onOpen,
}: {
  state: ConversationState;
  onStop: () => void;
  onOpen: () => void;
}) {
  if (state.kind !== "recording" && state.kind !== "transcribing" && state.kind !== "drafting") return null;
  const recording = state.kind === "recording";
  return (
    <GlassSurface
      elevation="strong"
      role="status"
      aria-live="polite"
      data-overlay
      className="animate-pop-in flex max-w-[calc(100vw-24px)] items-center gap-2 rounded-full py-1.5 pl-3.5 pr-1.5"
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-2 text-left text-sm" title="Open the conversation">
        <span
          aria-hidden
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            recording ? "breathe bg-red-400 shadow-[0_0_10px_rgb(248_113_113)]" : "bg-white/60"
          }`}
        />
        <span className="truncate font-medium">
          {recording ? `Recording with ${state.person.displayName}` : `Summarizing talk with ${state.person.displayName}…`}
        </span>
        {recording && (
          <span className="shrink-0 tabular-nums text-white/60">
            {clock(state.elapsedMs)} / {clock(state.limitMs)}
          </span>
        )}
      </button>
      {recording && (
        <button type="button" onClick={onStop} className="glass-btn glass-btn--sm glass-btn--primary shrink-0">
          Stop
        </button>
      )}
    </GlassSurface>
  );
}
