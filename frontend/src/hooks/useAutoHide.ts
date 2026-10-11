"use client";
/**
 * Auto-hiding panel (Bhavya, human request 2026-10-10: the last-talk summary slides away
 * after 12 s so the camera is not crowded; a button brings it back). `show()` restarts the
 * timer; the timer only runs while there is something to show.
 */
import { useCallback, useEffect, useState } from "react";

export const SUMMARY_VISIBLE_MS = 12_000;

export function useAutoHide(active: boolean, visibleMs = SUMMARY_VISIBLE_MS) {
  const [hidden, setHidden] = useState(true);
  const [shownAt, setShownAt] = useState(0);

  const show = useCallback(() => {
    setHidden(false);
    setShownAt(Date.now());
  }, []);

  useEffect(() => {
    if (hidden || !active) return;
    const timer = window.setTimeout(() => setHidden(true), visibleMs);
    return () => window.clearTimeout(timer);
  }, [active, hidden, shownAt, visibleMs]);

  return { hidden, show };
}
