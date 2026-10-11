"use client";
/**
 * Top-right accessory cluster (Arnav, human-requested console-inspired styling): four small
 * keys in a diamond with fine △ ○ ✕ □ marks around a forget-me-not emblem, on a white shell
 * over a graphite core. Decorative for now: pass `actions` (and labels) once each key has a
 * role. Keys without an action press and glow but do nothing, and say so to assistive tech.
 */

export type AccessoryKey = "triangle" | "circle" | "cross" | "square";

export interface AccessoryAction {
  label: string;
  onPress: () => void;
}

const KEYS: { key: AccessoryKey; position: string; glyph: React.ReactNode }[] = [
  {
    key: "triangle",
    position: "left-1/2 top-0 -translate-x-1/2",
    glyph: <path d="M6 2.6 9.6 8.8H2.4z" />,
  },
  {
    key: "circle",
    position: "right-0 top-1/2 -translate-y-1/2",
    glyph: <circle cx="6" cy="6" r="3.4" />,
  },
  {
    key: "cross",
    position: "bottom-0 left-1/2 -translate-x-1/2",
    glyph: <path d="M3 3l6 6M9 3 3 9" />,
  },
  {
    key: "square",
    position: "left-0 top-1/2 -translate-y-1/2",
    glyph: <rect x="2.9" y="2.9" width="6.2" height="6.2" rx="0.6" />,
  },
];

/** Forget-me-not: five rounded petals around a small centre. */
function ForgetMeNot({ size = 18 }: { size?: number }) {
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

export function CornerAccessory({ actions = {} }: { actions?: Partial<Record<AccessoryKey, AccessoryAction>> }) {
  return (
    <div data-overlay className="hw-core rounded-[34px]">
      <div role="group" aria-label="Accessory keys" className="hw-shell rounded-[31px] p-2">
        <div className="relative h-[78px] w-[78px]">
          {KEYS.map(({ key, position, glyph }) => {
            const action = actions[key];
            const label = action?.label ?? "Coming soon";
            return (
              <button
                key={key}
                type="button"
                className={`hw-key hw-face ${position}`}
                aria-label={label}
                aria-disabled={!action}
                onClick={action?.onPress}
              >
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  focusable="false"
                >
                  {glyph}
                </svg>
                <span aria-hidden className="glass-tip" data-side="bottom">
                  {label}
                </span>
              </button>
            );
          })}
          {/* Emblem in the middle of the diamond, with the breathing light ring. */}
          <span
            aria-hidden
            className="hw-key hw-jewel pointer-events-none absolute left-1/2 top-1/2 h-[24px] w-[24px] -translate-x-1/2 -translate-y-1/2"
          >
            <ForgetMeNot size={16} />
          </span>
        </div>
      </div>
    </div>
  );
}
