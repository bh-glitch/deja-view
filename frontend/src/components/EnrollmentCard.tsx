"use client";
/**
 * "Save as ___?" card for auto-enrollment (Bhavya, 2026-10-10). One tap saves; Not now discards.
 * Voice introduction (Vansh, human-approved 2026-10-10): the heard name/relationship prefill the
 * fields, which stay editable; typed text always wins. Nothing is saved without the Save tap.
 */
import { useState } from "react";

import { MIN_SAMPLES, TARGET_SAMPLES, type EnrollmentState } from "@/hooks/useAutoEnrollment";
import type { VoiceIntroductionState } from "@/hooks/useVoiceIntroduction";

export interface EnrollmentVoiceProps {
  state: VoiceIntroductionState;
  autoListen: boolean;
  onAutoListenChange: (enabled: boolean) => void;
  onListen: () => void;
  onFinish: () => void;
  onCancel: () => void;
  /** Re-send the already transcribed words to Gemini after a failed draft. */
  onRetryDraft?: () => void;
}

const VOICE_DISCLOSURE =
  "Introduction audio is sent to ElevenLabs for transcription. The name is found by the AI shown with each draft (local AI keeps the text on this laptop). Face images are never sent.";

function VoicePanel({ voice }: { voice: EnrollmentVoiceProps }) {
  const { state } = voice;
  const busy = state.kind === "transcribing" || state.kind === "understanding";
  return (
    <div className="flex flex-col gap-2 rounded-md bg-zinc-100 p-3 text-sm dark:bg-zinc-900" aria-live="polite">
      {state.kind === "listening" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 font-medium text-red-700 dark:text-red-400">
            <span aria-hidden className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
            Listening for an introduction… {Math.min(Math.floor(state.elapsedMs / 1000), state.limitMs / 1000)}s /{" "}
            {state.limitMs / 1000}s
          </span>
          <button type="button" onClick={voice.onFinish} className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-white">
            Done
          </button>
          <button type="button" onClick={voice.onCancel} className="rounded-md border border-zinc-400 px-2 py-1 text-xs">
            Cancel
          </button>
        </div>
      )}
      {state.kind === "transcribing" && <p>Transcribing…</p>}
      {state.kind === "understanding" && (
        <p>
          Heard “{state.transcript}”. Finding the name…
        </p>
      )}
      {state.kind === "heard" && (
        <p className="text-emerald-800 dark:text-emerald-300">
          Heard “{state.draft.nameEvidence ?? state.transcript}”. Check the name below, then save.{" "}
          <span className="text-xs text-zinc-500">Found by {state.provider.label}.</span>
        </p>
      )}
      {state.kind === "no-name" && (
        <p className="text-amber-800 dark:text-amber-300">
          {state.transcript ? `Heard “${state.transcript}”. ` : ""}
          {state.message}
        </p>
      )}
      {state.kind === "error" && (
        <p role="alert" className="text-red-700 dark:text-red-400">
          {state.transcript ? `Heard “${state.transcript}”. ` : ""}
          {state.message}
        </p>
      )}
      {(state.kind === "idle" || state.kind === "heard" || state.kind === "no-name" || state.kind === "error") && (
        <div className="flex gap-2">
          {state.kind === "error" && state.transcript && voice.onRetryDraft && (
            <button
              type="button"
              onClick={voice.onRetryDraft}
              className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-white"
            >
              Try again
            </button>
          )}
          <button
            type="button"
            onClick={voice.onListen}
            disabled={busy}
            className="rounded-md border border-zinc-400 px-2 py-1 text-xs"
          >
            🎤 {state.kind === "idle" ? "Listen for name" : "Listen again"}
          </button>
        </div>
      )}
      <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <input
          type="checkbox"
          checked={voice.autoListen}
          onChange={(event) => voice.onAutoListenChange(event.target.checked)}
        />
        Auto-listen for introductions
      </label>
      <p className="text-xs text-zinc-500">{VOICE_DISCLOSURE}</p>
    </div>
  );
}

export function EnrollmentCard({
  state,
  onSave,
  onDismiss,
  mirrored = true,
  voice,
}: {
  state: EnrollmentState;
  mirrored?: boolean;
  onSave: (name: string, relationship: string) => void;
  onDismiss: () => void;
  voice?: EnrollmentVoiceProps;
}) {
  // null = not typed yet, so a heard introduction can fill the field.
  const [typedName, setTypedName] = useState<string | null>(null);
  const [typedRelationship, setTypedRelationship] = useState<string | null>(null);

  if (state.kind === "idle") {
    return state.notice ? (
      <p role="status" className="rounded-md bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        {state.notice}
      </p>
    ) : null;
  }
  if (state.kind === "saved") {
    return (
      <p role="status" className="rounded-md bg-emerald-100 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        Saved {state.person.displayName}. Recognizing…
      </p>
    );
  }
  if (state.kind === "capturing") {
    return (
      <p role="status" className="rounded-md bg-blue-100 p-3 text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-200">
        New face. Hold still… capturing {state.captured}/{TARGET_SAMPLES} (needs at least {MIN_SAMPLES})
      </p>
    );
  }

  const heard = voice?.state.kind === "heard" ? voice.state.draft : null;
  const name = typedName ?? heard?.displayName ?? "";
  const relationship = typedRelationship ?? heard?.relationship ?? "";
  const listening = voice?.state.kind === "listening";

  return (
    <form
      aria-labelledby="enroll-heading"
      className="flex flex-col gap-3 rounded-lg border border-blue-400 bg-white p-4 dark:bg-zinc-950"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(name, relationship);
      }}
    >
      <h2 id="enroll-heading" className="text-lg font-semibold">
        {name.trim() ? `Save ${name.trim()}?` : "New face. Save this person?"}
      </h2>
      <div className="flex gap-3">
        {state.previewUrl && (
          // Ephemeral in-memory preview (object URL); never uploaded or stored.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={state.previewUrl}
            alt="Captured face preview"
            className="h-24 w-32 rounded-md object-cover"
            style={mirrored ? { transform: "scaleX(-1)" } : undefined}
          />
        )}
        <div className="flex flex-1 flex-col gap-2">
          <label className="flex flex-col text-sm">
            Name
            <input
              autoFocus={!voice}
              required
              maxLength={80}
              value={name}
              onChange={(event) => setTypedName(event.target.value)}
              className="rounded-md border border-zinc-400 px-2 py-1 dark:bg-zinc-900"
              placeholder="e.g. Bhavya"
            />
          </label>
          <label className="flex flex-col text-sm">
            Relationship (optional)
            <input
              maxLength={120}
              value={relationship}
              onChange={(event) => setTypedRelationship(event.target.value)}
              className="rounded-md border border-zinc-400 px-2 py-1 dark:bg-zinc-900"
              placeholder="e.g. teammate"
            />
          </label>
        </div>
      </div>
      {voice ? (
        <VoicePanel voice={voice} />
      ) : (
        <p className="text-xs text-zinc-500">Type the name to save this person.</p>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={state.saving || listening || !name.trim()}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {state.saving ? "Saving…" : name.trim() ? `Save ${name.trim()}` : "Save"}
        </button>
        <button type="button" onClick={onDismiss} disabled={state.saving} className="rounded-md border border-zinc-400 px-3 py-1.5 text-sm">
          Not now
        </button>
      </div>
    </form>
  );
}
