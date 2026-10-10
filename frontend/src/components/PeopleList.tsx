/** Saved people with delete (Ishan Phase 1a; Bhavya 2026-10-10). */
import type { Person } from "@/lib/api-client";

export function PeopleList({
  people,
  error,
  onDelete,
}: {
  people: Person[];
  error: string | null;
  onDelete: (person: Person) => void;
}) {
  return (
    <section aria-labelledby="people-heading" className="flex flex-col gap-2 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
      <h2 id="people-heading" className="text-lg font-semibold">
        People
      </h2>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      {people.length === 0 ? (
        <p className="text-sm text-zinc-500">No one saved yet. Look at the camera to add someone.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {people.map((person) => (
            <li key={person.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm">
              <span>
                <span className="font-medium">{person.displayName}</span>
                {person.relationship && <span className="text-zinc-500"> — {person.relationship}</span>}
              </span>
              <button
                type="button"
                onClick={() => onDelete(person)}
                aria-label={`Delete ${person.displayName}`}
                className="rounded px-2 text-zinc-500 hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
