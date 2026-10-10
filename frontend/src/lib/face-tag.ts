/** Small helpers for the on-video face tags (Bhavya 2026-10-10). */

const GRADIENTS = [
  "from-rose-400 to-orange-300",
  "from-violet-500 to-fuchsia-400",
  "from-sky-500 to-cyan-300",
  "from-emerald-500 to-lime-300",
  "from-amber-500 to-yellow-300",
  "from-indigo-500 to-blue-300",
];

/** Stable colour per person, so the same person always gets the same badge. */
export function badgeGradient(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/** "just now", "5m ago", "3h ago", "2d ago", "3w ago", or a date for older. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
