"use client";
/**
 * Start screen (Bhavya, human design 2026-10-10; restyled 2026-10-11 to the human's mockup:
 * charcoal with a blue glow behind the logo, off-white title with a blue hyphen, blue logo
 * with an outlined echo, spaced capitals for the caption; Plus Jakarta Sans). The product name
 * "déjà-view" with the logo to its right. Tapping the logo starts the camera (inside the tap, so
 * the browser's permission prompt counts it as a user gesture) and plays the intro:
 *   sweep  – the logo slides left over the title, erasing each letter as it covers it;
 *   back   – it glides back to the middle of the screen at the same steady speed;
 *   hold   – it waits a second at the centre;
 *   expand – its head (the dot) shrinks away while the V grows quickly and the background
 *            turns black, all at once (human request 2026-10-11: no pause between them);
 *   reveal – the black screen fades out, revealing the camera.
 * Reduced-motion users get a short fade instead.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { FixtureModeBanner } from "@/components/FixtureModeBanner";
import { BRAND, Logo } from "@/components/Logo";
import { brandFont } from "@/app/fonts";

export const PRODUCT_NAME = "déjà-view";

export const SWEEP_MS = 500;
export const HOLD_MS = 1000;
export const EXPAND_MS = 520;
export const REVEAL_MS = 300;
/** Shared by the logo's growth and the background's fade to black. */
const EXPAND_EASE = "cubic-bezier(0.55, 0, 1, 0.45)";

type Phase = "idle" | "sweep" | "back" | "hold" | "expand" | "reveal";

/** The return trip moves at the sweep's speed (human request: same speed both ways). */
export function backDuration(sweepPx: number, backPx: number): number {
  if (sweepPx < 1) return SWEEP_MS;
  return Math.round((Math.abs(backPx) / sweepPx) * SWEEP_MS);
}


export function Splash({
  onStart,
  onDone,
  fixtureMode = false,
}: {
  /** Called on the tap itself: start the camera here. */
  onStart: () => void;
  /** The intro has finished; the start screen can be removed. */
  onDone: () => void;
  fixtureMode?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [hidden, setHidden] = useState(0); // letters erased, from the right
  const [sweepX, setSweepX] = useState(0);
  const [centerX, setCenterX] = useState(0);
  const [backMs, setBackMs] = useState(SWEEP_MS);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const logoRef = useRef<HTMLButtonElement>(null);
  const timers = useRef<number[]>([]);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const later = (ms: number, run: () => void) => {
    timers.current.push(window.setTimeout(run, ms));
  };

  const start = () => {
    if (phase !== "idle") return;
    // The OS/browser focus highlight (e.g. macOS Full Keyboard Access, Chrome's focused-object
    // highlight) is drawn outside CSS and stays where the logo started; never keep focus here.
    logoRef.current?.blur();
    onStart();
    const logo = logoRef.current?.getBoundingClientRect();
    const title = titleRef.current?.getBoundingClientRect();
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (!logo || !title || reduced) {
      setPhase("expand");
      later(EXPAND_MS, () => setPhase("reveal"));
      later(EXPAND_MS + REVEAL_MS, () => onDoneRef.current());
      return;
    }

    // Linear sweep from the logo's place to the title's left edge; a letter disappears when
    // the logo's left edge reaches the letter's middle.
    const startLeft = logo.left;
    const travel = logo.left - title.left;
    const letters = Array.from(titleRef.current?.querySelectorAll<HTMLElement>("[data-letter]") ?? []);
    letters.forEach((letter, index) => {
      const box = letter.getBoundingClientRect();
      const reach = (startLeft - (box.left + box.width / 2)) / Math.max(travel, 1);
      const erased = letters.length - index; // letters still showing when this one goes
      later(Math.max(0, Math.min(1, reach)) * SWEEP_MS, () => setHidden((count) => Math.max(count, erased)));
    });

    const center = window.innerWidth / 2 - (logo.left + logo.width / 2);
    const back = backDuration(travel, center + travel);
    setSweepX(-travel);
    setCenterX(center);
    setBackMs(back);
    setPhase("sweep");
    later(SWEEP_MS, () => {
      setHidden(letters.length);
      setPhase("back");
    });
    later(SWEEP_MS + back, () => setPhase("hold"));
    later(SWEEP_MS + back + HOLD_MS, () => setPhase("expand"));
    later(SWEEP_MS + back + HOLD_MS + EXPAND_MS, () => setPhase("reveal"));
    later(SWEEP_MS + back + HOLD_MS + EXPAND_MS + REVEAL_MS, () => onDoneRef.current());
  };

  const logoStyle: CSSProperties =
    phase === "idle"
      ? { transform: "translateX(0)" }
      : phase === "sweep"
        ? { transform: `translateX(${sweepX}px)`, transition: `transform ${SWEEP_MS}ms linear` }
        : phase === "expand" || phase === "reveal"
          ? {
              transform: `translateX(${centerX}px) scale(16)`,
              transition: `transform ${EXPAND_MS}ms ${EXPAND_EASE}`,
            }
          : {
              transform: `translateX(${centerX}px)`,
              transition: `transform ${backMs}ms linear`,
            };

  const letters = Array.from(PRODUCT_NAME);
  const leaving = phase === "expand" || phase === "reveal";
  return (
    <div
      className={`${brandFont.className} fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-black px-4`}
      style={{
        color: BRAND.text,
        opacity: phase === "reveal" ? 0 : 1,
        transition: phase === "reveal" ? `opacity ${REVEAL_MS}ms ease-out` : undefined,
      }}
    >
      {/* The soft background over a black base: it fades out while the logo grows. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            `radial-gradient(1200px 700px at 50% 50%, #1b1c22 0%, transparent 75%), ${BRAND.background}`,
          opacity: leaving ? 0 : 1,
          transition: leaving ? `opacity ${EXPAND_MS}ms ${EXPAND_EASE}` : undefined,
        }}
      />
      {fixtureMode && (
        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2">
          <FixtureModeBanner />
        </div>
      )}
      <div className="relative flex items-center gap-[clamp(12px,3vw,32px)]">
        <h1
          ref={titleRef}
          aria-label={PRODUCT_NAME}
          className="relative z-10 whitespace-nowrap text-[clamp(44px,11vw,112px)] font-bold leading-none tracking-[-0.025em]"
        >
          {letters.map((letter, index) => (
            <span
              key={index}
              data-letter
              aria-hidden
              className="inline-block transition-opacity duration-100"
              style={{
                opacity: index < letters.length - hidden ? 1 : 0,
                ...(letter === "-"
                  ? {
                      backgroundImage: BRAND.accentGradient,
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                    }
                  : {}),
              }}
            >
              {letter}
            </span>
          ))}
        </h1>
        <span className="relative shrink-0">
          {/* Blue glow behind the logo (human request 2026-10-11): moves with the logo (same
              transform), sits under the title so the letters are never tinted, and fades out
              with the background on expand. */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[260%] w-[330%] -translate-x-1/2 -translate-y-1/2"
            style={{
              ...logoStyle,
              background: "radial-gradient(closest-side, rgb(61 107 255 / 0.34), rgb(61 107 255 / 0.12) 55%, transparent)",
              opacity: leaving ? 0 : 1,
              transition: [logoStyle.transition, leaving ? `opacity ${EXPAND_MS}ms ${EXPAND_EASE}` : null]
                .filter(Boolean)
                .join(", "),
            }}
          />
          <button
            ref={logoRef}
            type="button"
            onClick={start}
            // A mouse/touch press must not focus the logo at all (see start()).
            onPointerDown={(event) => event.preventDefault()}
            onMouseDown={(event) => event.preventDefault()}
            disabled={phase !== "idle"}
            aria-label="Start camera"
            title="Start camera"
            className="splash-logo relative z-20 shrink-0 transition-[scale] duration-200 enabled:hover:scale-[1.04] disabled:cursor-default"
            style={logoStyle}
          >
            <Logo
              className="block h-[clamp(84px,17vw,168px)] w-[clamp(84px,17vw,168px)]"
              headHidden={leaving}
            />
          </button>
        </span>
      </div>
      <p
        className="relative mt-12 text-[clamp(12px,1.5vw,14px)] font-medium uppercase tracking-[0.22em] transition-opacity duration-300"
        style={{ color: BRAND.muted, opacity: phase === "idle" ? 1 : 0 }}
      >
        {/* Slow "press start" blink, like a game title screen (human request 2026-10-11). */}
        <span className="splash-blink">Tap the logo to start</span>
      </p>
    </div>
  );
}
