"use client";
/**
 * Arrivals (Bhavya 2026-10-10): reports people who come into view for the first time, or
 * again after being away for at least `awayMs`. A one-frame recognition flicker is not a
 * new arrival, so the summary and the automatic conversation do not restart on it.
 */
import { useEffect, useRef } from "react";

export const AWAY_MS = 30_000;

export function useArrivals(ids: string[], onArrive: (arrived: string[]) => void, awayMs = AWAY_MS): void {
  const present = useRef(new Set<string>());
  const leftAt = useRef(new Map<string, number>());
  const onArriveRef = useRef(onArrive);
  useEffect(() => {
    onArriveRef.current = onArrive;
  });

  const key = [...new Set(ids)].sort().join(",");
  useEffect(() => {
    const now = Date.now();
    const current = new Set(key ? key.split(",") : []);
    for (const id of present.current) if (!current.has(id)) leftAt.current.set(id, now);
    const arrived = [...current].filter((id) => {
      if (present.current.has(id)) return false;
      const left = leftAt.current.get(id);
      return left === undefined || now - left >= awayMs;
    });
    present.current = current;
    if (arrived.length > 0) onArriveRef.current(arrived);
  }, [key, awayMs]);
}
