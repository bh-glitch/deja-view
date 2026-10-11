"use client";
/**
 * SVG filter for restrained optical refraction on a few prominent glass surfaces.
 * Only Chromium renders SVG filters inside `backdrop-filter`, so the effect is switched on
 * with `html[data-refract]` there; other browsers keep the plain frosted material.
 */
import { useEffect } from "react";

export function GlassFilters() {
  useEffect(() => {
    const chromium = typeof navigator !== "undefined" && "userAgentData" in navigator;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (chromium && !reduced) document.documentElement.dataset.refract = "";
    return () => {
      delete document.documentElement.dataset.refract;
    };
  }, []);

  return (
    <svg aria-hidden width="0" height="0" style={{ position: "absolute", width: 0, height: 0 }}>
      <filter id="lg-refract" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
        <feDisplacementMap in="SourceGraphic" in2="soft" scale="14" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
