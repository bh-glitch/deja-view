/**
 * Reminder text helpers (Bhavya 2026-10-10). Saved cues may begin with "Last time …";
 * the UI and the spoken reminder add that label themselves, so strip it once here.
 */
export function cleanCue(cue: string): string {
  const stripped = cue.replace(/^\s*last\s+time\b[\s,:;-]*/i, "").trim();
  return stripped ? stripped[0].toUpperCase() + stripped.slice(1) : cue.trim();
}
