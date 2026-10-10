"use client";
/**
 * Record → review → save a conversation memory (Vansh, human-approved 2026-10-10).
 * The draft is editable; nothing is stored until Save. Facts keep their transcript quotes.
 */
import { useState } from "react";

import { MAX_CUE_CHARS, MAX_SUMMARY_CHARS, type ConversationState } from "@/hooks/useConversationMemory";
import type { MemoryDraft } from "@/lib/api-client";

const DISCLOSURE =
  "Conversation audio is sent to ElevenLabs for transcription, and the text to Gemini to draft the reminder.";

function ReviewForm({
  draft,
  transcript,
  saving,
  error,
  onSave,
  onDiscard,
}: {
  draft: MemoryDraft;
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
      <label className="flex flex-col text-sm">
        Reminder for next time
        <textarea
          required
          rows={2}
          maxLength={MAX_CUE_CHARS}
          value={cue}
          onChange={(event) => setCue(event.target.value)}
          className="rounded-md border border-zinc-400 px-2 py-1 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col text-sm">
        Summary
        <textarea
          required
          rows={3}
          maxLength={MAX_SUMMARY_CHARS}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          className="rounded-md border border-zinc-400 px-2 py-1 text-xs dark:bg-zinc-900"
        />
      </label>
      {draft.facts.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          {draft.facts.map((fact) => (
            <li key={fact.evidenceQuote}>
              • {fact.text} <span className="italic">(“{fact.evidenceQuote}”)</span>
            </li>
          ))}
        </ul>
      )}
      <details className="text-xs text-zinc-500">
        <summary>Transcript</summary>
        <p className="mt-1 whitespace-pre-wrap">{transcript}</p>
      </details>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !cue.trim() || !summary.trim()}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save memory"}
        </button>
        <button type="button" onClick={onDiscard} disabled={saving} className="rounded-md border border-zinc-400 px-3 py-1.5 text-sm">
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
      <p role="status" className="rounded-md bg-emerald-100 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        Saved. Next time you see {state.person.displayName}: “{state.cue}”
      </p>
    );
  }
  return (
    <section
      aria-labelledby="conversation-heading"
      aria-live="polite"
      className="flex flex-col gap-2 rounded-lg border border-violet-400 bg-white p-4 dark:bg-zinc-950"
    >
      <h2 id="conversation-heading" className="text-lg font-semibold">
        Conversation with {state.person.displayName}
      </h2>
      {state.kind === "recording" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
              <span aria-hidden className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
              Recording… {Math.floor(state.elapsedMs / 1000)}s / {state.limitMs / 1000}s
            </span>
            <button type="button" onClick={onStop} className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-white">
              Stop &amp; summarize
            </button>
            <button type="button" onClick={onDiscard} className="rounded-md border border-zinc-400 px-2 py-1 text-xs">
              Cancel
            </button>
          </div>
          <p className="text-xs text-zinc-500">Recording stops automatically after 60 seconds.</p>
        </>
      )}
      {state.kind === "transcribing" && <p className="text-sm">Transcribing…</p>}
      {state.kind === "drafting" && <p className="text-sm">Writing a reminder…</p>}
      {state.kind === "review" && (
        <ReviewForm
          draft={state.draft}
          transcript={state.transcript}
          saving={state.saving}
          error={state.error}
          onSave={onSave}
          onDiscard={onDiscard}
        />
      )}
      {state.kind === "failed" && (
        <>
          <p role="alert" className="text-sm text-amber-800 dark:text-amber-300">
            {state.message}
          </p>
          <div className="flex gap-2">
            {state.canRetryDraft && (
              <button type="button" onClick={onRetryDraft} className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-white">
                Try again
              </button>
            )}
            <button type="button" onClick={onDiscard} className="rounded-md border border-zinc-400 px-2 py-1 text-xs">
              Close
            </button>
          </div>
        </>
      )}
      <p className="text-xs text-zinc-500">{DISCLOSURE}</p>
    </section>
  );
}
