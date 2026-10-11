"use client";
/**
 * Shared drawer behaviour (Arnav, human-requested redesign): Escape and outside-click close,
 * focus moves in on open and back to the trigger on close, and touch swipes open/close.
 * Gestures are always optional: every drawer also has a visible button.
 */
import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

const SWIPE_COMMIT_PX = 60;
const EDGE_ZONE_PX = 28;

export function useDrawerDismiss({
  open,
  onClose,
  panelRef,
  ignoreRefs = [],
}: {
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
  /** Elements whose clicks must not count as "outside" (e.g. the toggle button). */
  ignoreRefs?: RefObject<HTMLElement | null>[];
}) {
  const restoreRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const ignoreRef = useRef(ignoreRefs);
  useEffect(() => {
    onCloseRef.current = onClose;
    ignoreRef.current = ignoreRefs;
  });

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Focus the first control without scrolling the page.
    const first = panel?.querySelector<HTMLElement>("[data-autofocus], button, [href], input, textarea");
    first?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (ignoreRef.current.some((ref) => ref.current?.contains(target))) return;
      // Clicks inside other dialogs/drawers or toasts manage themselves.
      if ((target as Element).closest?.("[data-overlay]")) return;
      onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      const restore = restoreRef.current;
      if (restore && panel?.contains(document.activeElement)) restore.focus({ preventScroll: true });
    };
  }, [open, panelRef]);
}

/**
 * Horizontal swipe on a drawer panel. `direction` is the way the drawer closes
 * ("right" for a right-side drawer). Returns pointer handlers for the panel.
 */
export function useSwipeToClose(
  panelRef: RefObject<HTMLElement | null>,
  direction: "left" | "right",
  onClose: () => void,
) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const sign = direction === "right" ? 1 : -1;

  const reset = useCallback(() => {
    const panel = panelRef.current;
    start.current = null;
    if (!panel) return;
    panel.dataset.dragging = "false";
    panel.style.removeProperty("transform");
  }, [panelRef]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse") return;
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      const panel = panelRef.current;
      if (!s || !panel || s.id !== event.pointerId) return;
      const dx = (event.clientX - s.x) * sign;
      const dy = Math.abs(event.clientY - s.y);
      if (dx <= 0 || dy > Math.abs(dx)) return; // vertical scroll wins
      panel.dataset.dragging = "true";
      panel.style.transform = `translateX(${dx * sign}px)`;
    },
    [panelRef, sign],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || s.id !== event.pointerId) return;
      const dx = (event.clientX - s.x) * sign;
      reset();
      if (dx > SWIPE_COMMIT_PX) onClose();
    },
    [onClose, reset, sign],
  );

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: reset };
}

/** Touch swipe from a screen edge toward the centre opens a drawer. */
export function useEdgeSwipeOpen(edge: "left" | "right", onOpen: () => void, enabled = true) {
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  });
  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number; id: number } | null = null;
    const down = (event: PointerEvent) => {
      if (event.pointerType === "mouse") return;
      const fromEdge = edge === "right" ? window.innerWidth - event.clientX : event.clientX;
      start = fromEdge <= EDGE_ZONE_PX ? { x: event.clientX, y: event.clientY, id: event.pointerId } : null;
    };
    const up = (event: PointerEvent) => {
      if (!start || start.id !== event.pointerId) return;
      const dx = (event.clientX - start.x) * (edge === "right" ? -1 : 1);
      const dy = Math.abs(event.clientY - start.y);
      start = null;
      if (dx > SWIPE_COMMIT_PX && dx > dy) onOpenRef.current();
    };
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
    };
  }, [edge, enabled]);
}
