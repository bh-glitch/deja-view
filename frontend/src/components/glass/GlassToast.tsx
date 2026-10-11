"use client";
/**
 * Compact glass notifications (Arnav, human-requested redesign). Toasts are derived from
 * real app state by the caller; this component only renders, de-duplicates and expires them.
 * A toast is identified by `id` + `text`, so the same message on every frame never re-flashes.
 */
import { useEffect, useState } from "react";

import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "@/components/glass/Icons";

export type ToastTone = "info" | "success" | "warning" | "critical";

export interface ToastItem {
  id: string;
  tone: ToastTone;
  text: string;
  /** Auto-dismiss after this many ms; omit for persistent issues (they clear when resolved). */
  ttlMs?: number;
}

const TONE: Record<ToastTone, { icon: typeof InfoIcon; color: string; role: "status" | "alert" }> = {
  info: { icon: InfoIcon, color: "var(--tone-info)", role: "status" },
  success: { icon: CheckIcon, color: "var(--tone-ok)", role: "status" },
  warning: { icon: AlertIcon, color: "var(--tone-warn)", role: "status" },
  critical: { icon: AlertIcon, color: "var(--tone-crit)", role: "alert" },
};

const keyOf = (toast: ToastItem) => `${toast.id}\u0000${toast.text}`;

export function GlassToasts({ toasts }: { toasts: ToastItem[] }) {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const visible = toasts.filter((toast) => !dismissed.has(keyOf(toast)));

  // Expire transient toasts. Keys stay dismissed until that exact message goes away.
  const timedKey = visible
    .filter((toast) => toast.ttlMs)
    .map((toast) => `${keyOf(toast)}\u0001${toast.ttlMs}`)
    .join("\u0002");
  useEffect(() => {
    if (!timedKey) return;
    const timers = timedKey.split("\u0002").map((entry) => {
      const [key, ttl] = entry.split("\u0001");
      return window.setTimeout(() => setDismissed((current) => new Set(current).add(key)), Number(ttl));
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [timedKey]);

  // Forget dismissals for messages that are no longer active, so a later recurrence shows again.
  // (Adjusted during render when the active set changes, per React's guidance.)
  const activeKey = toasts.map(keyOf).join("\u0002");
  const [seenActiveKey, setSeenActiveKey] = useState(activeKey);
  if (seenActiveKey !== activeKey) {
    setSeenActiveKey(activeKey);
    const active = new Set(toasts.map(keyOf));
    const pruned = new Set([...dismissed].filter((key) => active.has(key)));
    if (pruned.size !== dismissed.size) setDismissed(pruned);
  }

  return (
    <div
      data-overlay
      className="pointer-events-none flex w-full max-w-md flex-col items-center gap-2"
      aria-live="polite"
    >
      {visible.map((toast) => {
        const tone = TONE[toast.tone];
        const Icon = tone.icon;
        return (
          <div
            key={keyOf(toast)}
            role={tone.role}
            className="glass glass-strong animate-pop-in pointer-events-auto relative flex max-w-full items-start gap-2.5 rounded-[18px] py-2 pl-3 pr-1.5 text-[13px] leading-snug"
            style={{ boxShadow: `inset 3px 0 0 rgb(${tone.color} / 0.9), var(--glass-shadow)` }}
          >
            <Icon size={17} className="mt-0.5 shrink-0" style={{ color: `rgb(${tone.color})` }} />
            <span className="min-w-0 flex-1 py-0.5 font-medium">{toast.text}</span>
            <button
              type="button"
              onClick={() => setDismissed((current) => new Set(current).add(keyOf(toast)))}
              aria-label="Dismiss notification"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
