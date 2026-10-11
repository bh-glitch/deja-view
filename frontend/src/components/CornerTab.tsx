"use client";
/**
 * Smart-glasses corner tab (Arnav, human-requested): a quiet translucent right-angle
 * triangle flush with the top-right corner of the screen, like a HUD control at the edge of
 * a glasses lens. No job yet: pass `onPress` and a real `label` once its role is decided.
 * Until then it presses but does nothing, and says so to assistive tech.
 */
export function CornerTab({ onPress, label = "Coming soon" }: { onPress?: () => void; label?: string }) {
  return (
    <div className="corner-tab-wrap" data-overlay>
      <button
        type="button"
        className="corner-tab"
        aria-label={label}
        aria-disabled={!onPress}
        onClick={onPress}
      >
        <span aria-hidden className="corner-tab-dot" />
      </button>
      <span aria-hidden className="corner-tab-tip">
        {label}
      </span>
    </div>
  );
}
