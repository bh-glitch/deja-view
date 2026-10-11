"use client";
/**
 * Record → review → save a conversation memory (Vansh, human-approved 2026-10-10).
 * The draft is editable; nothing is stored until Save. Facts keep their transcript quotes.
 * Liquid Glass restyle (Arnav, human-requested): rendered inside the conversation drawer.
 */
import { useState } from "react";

import { MAX_CUE_CHARS, MAX_SUMMARY_CHARS, type ConversationState } from "@/hooks/useConversationMemory";
import type { MemoryDraft } from "@/lib/api-client";
import type { AiProvider } from "@/lib/audio/ai-drafts";

const DISCLOSURE =
  "Conversation audio is sent to ElevenLabs for transcription. The reminder is drafted by the AI shown with each draft (local AI keeps the text on this laptop).";

function ReviewForm({
  draft,
  provider,
  transcript,
  saving,
  error,
  onSave,
  onDiscard,
}: {
  draft: MemoryDraft;
  provider: AiProvider;
  transcript: string;
  saving: boolean;
  error: string | null;
  onSave: (edited: { summary: string; cue: string }) => void;
  onDiscard: () => void;
}) {
  const [cue, setCue] = useState(draft.cue);
  const [summary, setSummary] = useState(draft.summary);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ summary, cue });
      }}
    >
      <label className="flex flex-col text-[13px] font-medium text-white/80">
        Reminder for next time
        <textarea
          required
          rows={2}
          maxLength={MAX_CUE_CHARS}
          value={cue}
          onChange={(event) => setCue(event.target.value)}
          className="glass-input mt-1 resize-none text-[15px]"
        />
      </label>
      <label className="flex flex-col text-[13px] font-medium text-white/80">
        Summary
        <textarea
          required
          rows={3}
          maxLength={MAX_SUMMARY_CHARS}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          className="glass-input mt-1 resize-none text-[13px]"
        />
      </label>
      {draft.facts.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-white/70">
          {draft.facts.map((fact) => (
            <li key={fact.evidenceQuote}>
              • {fact.text} <span className="italic">(“{fact.evidenceQuote}”)</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-white/55">Drafted by {provider.label}. Edit anything before saving.</p>
      <details className="text-xs text-white/55">
        <summary>Transcript</summary>
        <p className="mt-1 whitespace-pre-wrap">{transcript}</p>
      </details>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !cue.trim() || !summary.trim()}
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
          provider={state.provider}
          transcript={state.transcript}
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
      <p className="text-[11px] leading-snug text-white/45">{DISCLOSURE}</p>
    </section>
  );
}
