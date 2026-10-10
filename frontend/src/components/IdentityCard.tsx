/** Who the camera sees (Ishan Phase 1a; Bhavya 2026-10-10; conversation button Vansh, human-approved). */
import type { Person } from "@/lib/api-client";
import { ComingSoonButton } from "@/components/ComingSoonButton";

export function IdentityCard({
  person,
  latestCue,
  emptyText = "No one recognized yet.",
  onRecordConversation,
  recordDisabled = false,
}: {
  person: Person | null;
  latestCue: string | null;
  emptyText?: string;
  /** Explicitly start recording a conversation with this person. */
  onRecordConversation?: () => void;
  recordDisabled?: boolean;
}) {
  return (
    <section aria-labelledby="identity-heading" className="flex flex-col gap-2 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
      <h2 id="identity-heading" className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Identity
      </h2>
      {person ? (
        <>
          <p className="text-2xl font-bold">{person.displayName}</p>
          <p className="text-zinc-600 dark:text-zinc-400">{person.relationship ?? "Relationship not set"}</p>
          <p className="rounded-md bg-zinc-100 p-2 text-sm dark:bg-zinc-900">
            {latestCue ? `Latest cue: ${latestCue}` : "No saved conversation yet"}
          </p>
        </>
      ) : (
        <>
          <p className="text-2xl font-bold">Unknown</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{emptyText}</p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <ComingSoonButton label="Who is this?" />
        {person && onRecordConversation && (
          <button
            type="button"
            onClick={onRecordConversation}
            disabled={recordDisabled}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            🎙 Record conversation
          </button>
        )}
      </div>
    </section>
  );
}
