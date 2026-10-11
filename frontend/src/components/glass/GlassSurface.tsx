"use client";
/**
 * Liquid Glass surface (Arnav, human-requested redesign). One material with three
 * elevations; `lit` adds pointer-responsive lighting (use on a few major surfaces only),
 * `refract` adds the Chromium-only SVG refraction defined in GlassFilters.
 */
import { forwardRef, useCallback, useRef, type HTMLAttributes, type PointerEvent } from "react";

export type GlassElevation = "thin" | "base" | "strong";

export interface GlassSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: GlassElevation;
  lit?: boolean;
  refract?: boolean;
}

export function glassClass(elevation: GlassElevation = "base", refract = false): string {
  return [
    "glass",
    elevation === "strong" ? "glass-strong" : elevation === "thin" ? "glass-thin" : "",
    refract ? "glass-refract" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export const GlassSurface = forwardRef<HTMLDivElement, GlassSurfaceProps>(function GlassSurface(
  { elevation = "base", lit = false, refract = false, className = "", onPointerMove, onPointerLeave, ...rest },
  ref,
) {
  const frame = useRef(0);

  const move = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      onPointerMove?.(event);
      if (!lit || event.pointerType !== "mouse") return;
      const target = event.currentTarget;
      const { clientX, clientY } = event;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        target.style.setProperty("--gx", `${clientX - rect.left}px`);
        target.style.setProperty("--gy", `${clientY - rect.top}px`);
        target.style.setProperty("--glow", "0.75");
      });
    },
    [lit, onPointerMove],
  );

  const leave = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      onPointerLeave?.(event);
      if (!lit) return;
      cancelAnimationFrame(frame.current);
      const target = event.currentTarget;
      target.style.removeProperty("--gx");
      target.style.removeProperty("--gy");
      target.style.removeProperty("--glow");
    },
    [lit, onPointerLeave],
  );

  return (
    <div
      ref={ref}
      className={`${glassClass(elevation, refract)} ${className}`}
      onPointerMove={move}
      onPointerLeave={leave}
      {...rest}
    />
  );
});
