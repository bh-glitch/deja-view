/** Saved people (owner: Ishan). Phase 1a: fixture people only; live list comes later. */
import type { Person } from "@/lib/api-client";

export function PeopleList({
  people,
  selectedId,
  onSelect,
}: {
  people: Person[];
  selectedId: string | null;
  onSelect: (personId: string) => void;
}) {
  return (
    <section aria-labelledby="people-heading" className="flex flex-col gap-2 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
      <h2 id="people-heading" className="text-lg font-semibold">
        People
      </h2>
      {people.length === 0 ? (
        <p className="text-sm text-zinc-500">No people yet (coming soon).</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {people.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => onSelect(person.id)}
                aria-pressed={person.id === selectedId}
                className="w-full rounded-md px-2 py-1 text-left text-sm hover:bg-zinc-100 aria-pressed:bg-zinc-200 dark:hover:bg-zinc-900 dark:aria-pressed:bg-zinc-800"
              >
                <span className="font-medium">{person.displayName}</span>
                {person.relationship && <span className="text-zinc-500"> — {person.relationship}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
