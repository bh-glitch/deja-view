/**
 * déjà-view logo (Bhavya; human-supplied designs 2026-10-10 and 2026-10-11): a "V" that is
 * also a person with raised arms — a white stroke, a blue stroke crossing over it at the
 * base, and a blue dot for the head. Placeholder; may change.
 */
import { useId, type SVGProps } from "react";

export const BRAND = {
  background: "#141519",
  text: "#eef0f5",
  /** Signal blue (human-chosen 2026-10-11): #7fb2ff → #3d6bff. */
  accent: "#7fb2ff",
  accentDeep: "#3d6bff",
  accentGradient: "linear-gradient(90deg, #7fb2ff, #3d6bff)",
  muted: "#9a9aa3",
} as const;

/** How long the head takes to disappear (start-screen intro, human request 2026-10-11). */
export const HEAD_EXIT_MS = 350;

export function Logo({
  size = 120,
  headHidden = false,
  ...rest
}: SVGProps<SVGSVGElement> & { size?: number; headHidden?: boolean }) {
  // Unique gradient ids: the start screen and the header can both show the logo at once.
  const id = useId().replace(/:/g, "");
  const white = `dv-v-white-${id}`;
  const blue = `dv-v-blue-${id}`;
  const head = `dv-v-head-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden focusable="false" {...rest}>
      <defs>
        <linearGradient id={white} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f5f9" />
          <stop offset="1" stopColor="#d3d7e2" />
        </linearGradient>
        <linearGradient id={blue} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={BRAND.accent} />
          <stop offset="1" stopColor={BRAND.accentDeep} />
        </linearGradient>
        <radialGradient id={head} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor={BRAND.accent} />
          <stop offset="1" stopColor={BRAND.accentDeep} />
        </radialGradient>
      </defs>
      {/* Left arm (white), then the right arm (blue) crossing over it at the base. */}
      <line x1="22" y1="44" x2="60" y2="104" stroke={`url(#${white})`} strokeWidth="18" strokeLinecap="round" />
      <line x1="98" y1="44" x2="60" y2="104" stroke={`url(#${blue})`} strokeWidth="18" strokeLinecap="round" />
      {/* The head shrinks and fades away when `headHidden` (the intro hides it before the zoom). */}
      <circle
        cx="60"
        cy="22"
        r="13"
        fill={`url(#${head})`}
        style={{
          transformBox: "fill-box",
          transformOrigin: "center",
          transform: headHidden ? "scale(0)" : "scale(1)",
          opacity: headHidden ? 0 : 1,
          transition: `transform ${HEAD_EXIT_MS}ms cubic-bezier(0.55, 0, 1, 0.45), opacity ${HEAD_EXIT_MS}ms ease-in`,
        }}
      />
    </svg>
  );
}
