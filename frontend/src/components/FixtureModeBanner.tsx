/**
 * Persistent fixture-mode marker (owner: Ishan; compact header badge in the Liquid Glass
 * redesign by Arnav, human-requested). Smaller, but always visible while data is synthetic.
 */
export function FixtureModeBanner() {
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-400/50 bg-amber-100/70 px-2 py-1 text-[10px] sm:px-2.5 sm:text-[11px] font-semibold text-amber-800"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Fixture mode — synthetic data
    </span>
  );
}
