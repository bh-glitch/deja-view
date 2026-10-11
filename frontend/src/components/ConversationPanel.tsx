"use client";
/**
 * Record → review → save a conversation memory (Vansh, human-approved 2026-10-10).
 * The draft is editable; nothing is stored until Save. Facts keep their transcript quotes.
 * Liquid Glass restyle (Arnav, human-requested): rendered inside the conversation drawer.
 */
import { useState } from "react";

import { MAX_CUE_CHARS, type ConversationState } from "@/hooks/useConversationMemory";
import type { MemoryDraft } from "@/lib/api-client";

/** Full privacy details on hover/long-press; the panel keeps one short line. */
const DISCLOSURE_DETAIL =
  "Conversation audio is sent to ElevenLabs for transcription. The reminder is drafted by the configured AI (local AI keeps the text on this laptop; Gemini sends it to Google). The original transcript is saved with the memory.";

function ReviewForm({
  draft,
  saving,
  error,
  onSave,
  onDiscard,
}: {
  draft: MemoryDraft;
  saving: boolean;
  error: string | null;
  onSave: (edited: { summary: string; cue: string }) => void;
  onDiscard: () => void;
}) {
  // Compact review (human request 2026-10-10): the bullets that will be shown, plus one
  // editable reminder. The summary and transcript are still saved, just not printed here.
  const [cue, setCue] = useState(draft.cue);
  const summary = draft.summary;
  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ summary, cue });
      }}
    >
      {draft.facts.length > 0 && (
        <ul aria-label="Highlights" className="flex flex-col gap-1.5 text-sm text-white/85">
          {draft.facts.slice(0, 3).map((fact) => (
            <li key={fact.evidenceQuote} className="flex gap-2">
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" />
              <span>{fact.text}</span>
            </li>
          ))}
        </ul>
      )}
      <label className="flex flex-col text-[13px] font-medium text-white/80">
        Reminder
        <textarea
          required
          rows={2}
          maxLength={MAX_CUE_CHARS}
          value={cue}
          onChange={(event) => setCue(event.target.value)}
          className="glass-input mt-1 resize-none text-[15px]"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !cue.trim()}
          className="glass-btn glass-btn--primary flex-1"
        >
          {saving ? "Saving…" : "Save memory"}
        </button>
        <button type="button" onClick={onDiscard} disabled={saving} className="glass-btn">
          Discard
        </button>
      </div>
    </form>
  );
}

export function ConversationPanel({
  state,
  onStop,
  onRetryDraft,
  onSave,
  onDiscard,
}: {
  state: ConversationState;
  onStop: () => void;
  onRetryDraft: () => void;
  onSave: (edited: { summary: string; cue: string }) => void;
  onDiscard: () => void;
}) {
  if (state.kind === "idle") return null;
  if (state.kind === "saved") {
    return (
      <p role="status" className="glass-well p-3 text-sm text-emerald-200">
        Saved. Next time you see {state.person.displayName}: “{state.cue}”
      </p>
    );
  }
  return (
    <section
      aria-labelledby="conversation-heading"
      aria-live="polite"
      className="glass-well flex flex-col gap-3 p-3.5"
    >
      <h2 id="conversation-heading" className="text-[15px] font-semibold">
        Conversation with {state.person.displayName}
      </h2>
      {state.kind === "recording" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-red-300">
              <span aria-hidden className="breathe h-2.5 w-2.5 rounded-full bg-red-400 shadow-[0_0_10px_rgb(248_113_113)]" />
              Recording… {Math.floor(state.elapsedMs / 1000)}s / {state.limitMs / 1000}s
            </span>
            <button type="button" onClick={onStop} className="glass-btn glass-btn--sm glass-btn--primary">
              Stop &amp; summarize
            </button>
            <button type="button" onClick={onDiscard} className="glass-btn glass-btn--sm">
              Cancel
            </button>
          </div>
          <p className="text-xs text-white/55">Recording stops automatically after 60 seconds.</p>
        </>
      )}
      {state.kind === "transcribing" && <p className="text-sm text-white/80">Transcribing…</p>}
      {state.kind === "drafting" && <p className="text-sm text-white/80">Writing a reminder…</p>}
      {state.kind === "review" && (
        <ReviewForm
          draft={state.draft}
          saving={state.saving}
          error={state.error}
          onSave={onSave}
          onDiscard={onDiscard}
        />
      )}
      {state.kind === "failed" && (
        <>
          <p role="alert" className="text-sm text-amber-200">
            {state.message}
          </p>
          <div className="flex gap-2">
            {state.canRetryDraft && (
              <button type="button" onClick={onRetryDraft} className="glass-btn glass-btn--sm glass-btn--primary">
                Try again
              </button>
            )}
            <button type="button" onClick={onDiscard} className="glass-btn glass-btn--sm">
              Close
            </button>
          </div>
        </>
      )}
      <p className="text-[11px] leading-snug text-white/45" title={DISCLOSURE_DETAIL}>
        🔒 Voice is transcribed by ElevenLabs. Faces stay on this laptop.
      </p>
    </section>
  );
}
