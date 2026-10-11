"use client";
/**
 * Top-right "accessory" key (Arnav, human-requested): a decorative hardware-style control
 * that balances the header shell. It has no job yet; pass `onPress` (and a real `label`)
 * once its role is decided. Until then it presses and glows but does nothing, and tells
 * assistive tech that it is not available yet.
 */

/** Forget-me-not: five rounded petals around a small centre. */
function ForgetMeNot({ size = 22 }: { size?: number }) {
  const petals = [0, 72, 144, 216, 288];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <defs>
        <radialGradient id="fmn-petal" cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor="rgb(150 205 255)" />
          <stop offset="100%" stopColor="rgb(10 132 255)" />
        </radialGradient>
      </defs>
      {petals.map((angle) => (
        <ellipse
          key={angle}
          cx="12"
          cy="6.6"
          rx="3.6"
          ry="4.3"
          fill="url(#fmn-petal)"
          transform={`rotate(${angle} 12 12)`}
        />
      ))}
      <circle cx="12" cy="12" r="2.6" fill="#fff" />
      <circle cx="12" cy="12" r="1.5" fill="rgb(250 204 21)" />
    </svg>
  );
}

export function CornerAccessory({
  onPress,
  label = "Coming soon",
}: {
  onPress?: () => void;
  label?: string;
}) {
  const ready = !!onPress;
  return (
    <div data-overlay className="hw-shell rounded-full p-[5px]">
      <button
        type="button"
        className="hw-key hw-jewel"
        aria-label={label}
        aria-disabled={!ready}
        onClick={ready ? onPress : undefined}
      >
        <ForgetMeNot />
        <span aria-hidden className="glass-tip" data-side="bottom">
          {label}
        </span>
      </button>
    </div>
  );
}
