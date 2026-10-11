"use client";
/**
 * L1 / R1 shoulder buttons (Arnav, human-requested): decorative bumpers sitting on the top
 * corners of the camera frame, like a controller's shoulder buttons. They have no job yet;
 * pass `onL1` / `onR1` (and labels) once their roles are decided. Until then they press but
 * do nothing, and say so to assistive tech.
 */

function Shoulder({ side, name, label, onPress }: { side: "left" | "right"; name: string; label?: string; onPress?: () => void }) {
  return (
    <button
      type="button"
      className={`shoulder shoulder--${side}`}
      aria-label={label ?? `${name} (coming soon)`}
      aria-disabled={!onPress}
      onClick={onPress}
    >
      <span aria-hidden className="shoulder-mark">
        {name}
      </span>
    </button>
  );
}

export function ShoulderButtons({
  onL1,
  onR1,
  l1Label,
  r1Label,
}: {
  onL1?: () => void;
  onR1?: () => void;
  l1Label?: string;
  r1Label?: string;
}) {
  return (
    <>
      <Shoulder side="left" name="L1" label={l1Label} onPress={onL1} />
      <Shoulder side="right" name="R1" label={r1Label} onPress={onR1} />
    </>
  );
}
