"use client";
/**
 * Header over the live camera (Bhavya, human requests 2026-10-11): the V logo and the product
 * name as frosted "glass" text; no box, tagline or diagnostics (the start screen already
 * introduces the product; backend problems still appear as toasts). The fixture-data badge
 * stays whenever data is synthetic, as the spec requires.
 */
import { brandFont } from "@/app/fonts";
import { FixtureModeBanner } from "@/components/FixtureModeBanner";
import { BRAND, Logo } from "@/components/Logo";
import type { Health } from "@/lib/api-client";

export type HealthState =
  | { kind: "loading" }
  | { kind: "ready"; health: Health }
  | { kind: "error"; message: string };

export function AppHeader({ fixtureMode }: { fixtureMode: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Logo
          className="h-7 w-7 shrink-0 sm:h-8 sm:w-8"
          style={{ filter: "drop-shadow(0 2px 6px rgb(0 0 0 / 0.4))" }}
        />
        <h1
          className={`${brandFont.className} select-none text-[22px] font-bold leading-none tracking-[-0.03em] sm:text-[24px]`}
          style={{
            // Frosted glass lettering: bright at the top, fading into the video below.
            backgroundImage: "linear-gradient(180deg, rgb(255 255 255 / 0.95), rgb(255 255 255 / 0.5))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter: "drop-shadow(0 1px 1px rgb(0 0 0 / 0.35)) drop-shadow(0 4px 14px rgb(0 0 0 / 0.35))",
          }}
        >
          déjà
          <span
            style={{
              backgroundImage: BRAND.accentGradient,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            -
          </span>
          view
        </h1>
      </div>
      {fixtureMode && <FixtureModeBanner />}
    </div>
  );
}
