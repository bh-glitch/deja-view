/** Visibly disabled placeholder control (owner: Ishan). Replace when the feature lands. */
export function ComingSoonButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      className="cursor-not-allowed rounded-md border border-dashed border-zinc-400 px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400"
    >
      {label} <span className="text-xs">(coming soon)</span>
    </button>
  );
}
