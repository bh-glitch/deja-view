/** Who the camera sees (owner: Ishan). Phase 1a: fixture data or the Unknown state. */
import type { Person } from "@/lib/api-client";
import { ComingSoonButton } from "@/components/ComingSoonButton";

export function IdentityCard({ person, latestCue }: { person: Person | null; latestCue: string | null }) {
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
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No one recognized yet.</p>
        </>
      )}
      <div>
        <ComingSoonButton label="Who is this?" />
      </div>
    </section>
  );
}
