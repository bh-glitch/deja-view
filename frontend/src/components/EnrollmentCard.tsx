"use client";
/**
 * "Save as ___?" card for auto-enrollment (Bhavya, 2026-10-10). One tap saves; Not now discards.
 * Voice introduction (Vansh, human-approved 2026-10-10): the heard name/relationship prefill the
 * fields, which stay editable; typed text always wins. Nothing is saved without the Save tap.
 * Liquid Glass restyle (Arnav, human-requested): a floating sheet over the camera.
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

/** Full privacy details, shown on hover/long-press; the card itself keeps one short line. */
const VOICE_DISCLOSURE_DETAIL =
  "Introduction audio is sent to ElevenLabs for transcription. The name is found by the configured AI (local AI keeps the text on this laptop; Gemini sends it to Google; Claude sends it to Anthropic). Face images are never sent.";

/** What was heard, as a fallback the user can read and copy from when the AI misses something. */
function YouSaid({ transcript }: { transcript: string | null | undefined }) {
  if (!transcript) return null;
  return (
    <p className="select-text text-[13px] leading-snug text-ink/70">
      You said: <span className="text-ink/90">“{transcript}”</span>
    </p>
  );
}

/** Compact voice status: no model names; the heard words stay visible as a fallback. */
function VoicePanel({ voice }: { voice: EnrollmentVoiceProps }) {
  const { state } = voice;
  const busy = state.kind === "transcribing" || state.kind === "understanding";
  const cloudAi =
    state.kind === "heard" && state.provider.kind === "gemini"
      ? "Gemini"
      : state.kind === "heard" && state.provider.kind === "claude"
        ? "Claude"
        : null;
  return (
    <div className="glass-well flex flex-col gap-2 p-3 text-sm" aria-live="polite">
      {state.kind === "listening" && (
        <div className="flex items-center gap-2">
          <span className="inline-flex flex-1 items-center gap-2 font-medium text-red-600">
            <span aria-hidden className="breathe h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgb(239_68_68/0.6)]" />
            Listening… {Math.min(Math.floor(state.elapsedMs / 1000), state.limitMs / 1000)}s
          </span>
          <button type="button" onClick={voice.onFinish} className="glass-btn glass-btn--sm glass-btn--primary">
            Done
          </button>
          <button type="button" onClick={voice.onCancel} className="glass-btn glass-btn--sm">
            Cancel
          </button>
        </div>
      )}
      {busy && <p className="text-ink/80">Getting the name…</p>}
      {state.kind === "heard" && (
        <>
          <p className="text-emerald-700">
            ✓ Got it. Check the name and save.
            {!state.draft.relationship && (
              <span className="block text-amber-700">No relationship heard. Type it or listen again.</span>
            )}
          </p>
          <YouSaid transcript={state.transcript} />
        </>
      )}
      {state.kind === "no-name" && (
        <>
          <p className="text-amber-700">{state.message}</p>
          <YouSaid transcript={state.transcript} />
        </>
      )}
      {state.kind === "error" && (
        <>
          <p role="alert" className="text-red-600">
            {state.message}
          </p>
          <YouSaid transcript={state.transcript} />
        </>
      )}
      {(state.kind === "idle" || state.kind === "heard" || state.kind === "no-name" || state.kind === "error") && (
        <div className="flex flex-wrap items-center gap-2">
          {state.kind === "error" && state.transcript && voice.onRetryDraft && (
            <button type="button" onClick={voice.onRetryDraft} className="glass-btn glass-btn--sm glass-btn--primary">
              Try again
            </button>
          )}
          <button type="button" onClick={voice.onListen} disabled={busy} className="glass-btn glass-btn--sm">
            🎤 {state.kind === "idle" ? "Listen for name" : "Listen again"}
          </button>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-ink/60">
            <input
              type="checkbox"
              checked={voice.autoListen}
              onChange={(event) => voice.onAutoListenChange(event.target.checked)}
            />
            Auto-listen
          </label>
        </div>
      )}
      <p className="text-[11px] leading-snug text-ink/45" title={VOICE_DISCLOSURE_DETAIL}>
        🔒 Voice is transcribed by ElevenLabs{cloudAi ? ` and read by ${cloudAi}` : ""}. Faces stay on this laptop.
      </p>
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
      <p role="status" className="glass relative rounded-2xl px-3 py-2 text-sm text-amber-700">
        {state.notice}
      </p>
    ) : null;
  }
  if (state.kind === "saved") {
    return (
      <p role="status" className="glass relative rounded-2xl px-3 py-2 text-sm text-emerald-700">
        Saved {state.person.displayName}. Recognizing…
      </p>
    );
  }
  if (state.kind === "capturing") {
    return (
      <p
        role="status"
        className="glass glass-strong animate-pop-in relative flex items-center gap-2.5 rounded-full py-2 pl-3 pr-4 text-[13px] font-medium"
      >
        <span aria-hidden className="breathe h-2 w-2 rounded-full bg-sky-500" />
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
      className="glass glass-strong animate-pop-in scroll-soft relative flex max-h-full flex-col gap-3 overflow-y-auto overflow-x-hidden rounded-[var(--radius-panel)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(name, relationship);
      }}
    >
      <h2 id="enroll-heading" className="text-lg font-semibold tracking-tight">
        {name.trim() ? `Save ${name.trim()}?` : "New face. Save this person?"}
      </h2>
      <div className="flex gap-3">
        {state.previewUrl && (
          // Ephemeral in-memory preview (object URL); never uploaded or stored.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={state.previewUrl}
            alt="Captured face preview"
            className="h-24 w-24 rounded-2xl object-cover ring-2 ring-white shadow-md"
            style={mirrored ? { transform: "scaleX(-1)" } : undefined}
          />
        )}
        <div className="flex flex-1 flex-col gap-2">
          <label className="flex flex-col gap-1 text-[13px] font-medium text-ink/80">
            Name
            <input
              autoFocus={!voice}
              required
              maxLength={80}
              value={name}
              onChange={(event) => setTypedName(event.target.value)}
              className="glass-input"
              placeholder="e.g. Bhavya"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium text-ink/80">
            Relationship (optional)
            <input
              maxLength={120}
              value={relationship}
              onChange={(event) => setTypedRelationship(event.target.value)}
              className="glass-input"
              placeholder="e.g. teammate"
            />
          </label>
        </div>
      </div>
      {voice ? (
        <VoicePanel voice={voice} />
      ) : (
        <p className="text-xs text-ink/55">Type the name to save this person.</p>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={state.saving || listening || !name.trim()}
          className="glass-btn glass-btn--primary flex-1"
        >
          {state.saving ? "Saving…" : name.trim() ? `Save ${name.trim()}` : "Save"}
        </button>
        <button type="button" onClick={onDismiss} disabled={state.saving} className="glass-btn">
          Not now
        </button>
      </div>
    </form>
  );
}
