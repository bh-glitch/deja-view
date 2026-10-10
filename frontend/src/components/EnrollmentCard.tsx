"use client";
/** "Save as ___?" card for auto-enrollment (Bhavya, 2026-10-10). One tap saves; Not now discards. */
import { useState } from "react";

import { MIN_SAMPLES, TARGET_SAMPLES, type EnrollmentState } from "@/hooks/useAutoEnrollment";

export function EnrollmentCard({
  state,
  onSave,
  onDismiss,
}: {
  state: EnrollmentState;
  onSave: (name: string, relationship: string) => void;
  onDismiss: () => void;
}) {
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");

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
        New face. Save this person?
      </h2>
      <div className="flex gap-3">
        {state.previewUrl && (
          // Ephemeral in-memory preview (object URL); never uploaded or stored.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={state.previewUrl}
            alt="Captured face preview"
            className="h-24 w-32 rounded-md object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
        )}
        <div className="flex flex-1 flex-col gap-2">
          <label className="flex flex-col text-sm">
            Name
            <input
              autoFocus
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-md border border-zinc-400 px-2 py-1 dark:bg-zinc-900"
              placeholder="e.g. Bhavya"
            />
          </label>
          <label className="flex flex-col text-sm">
            Relationship (optional)
            <input
              maxLength={120}
              value={relationship}
              onChange={(event) => setRelationship(event.target.value)}
              className="rounded-md border border-zinc-400 px-2 py-1 dark:bg-zinc-900"
              placeholder="e.g. teammate"
            />
          </label>
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        Voice introductions (“Hey, I’m …”) will fill this in once speech is connected. Type the name for now.
      </p>
      {state.error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={state.saving || !name.trim()}
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
