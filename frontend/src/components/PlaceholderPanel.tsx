/** Phase 0 placeholder section (owner: Ishan). Replace with real features. */
export function PlaceholderPanel({ title, owner }: { title: string; owner: string }) {
  return (
    <section className="rounded-lg border border-dashed border-zinc-400 p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Not implemented yet (Phase 0 placeholder, owner: {owner}).
      </p>
    </section>
  );
}
