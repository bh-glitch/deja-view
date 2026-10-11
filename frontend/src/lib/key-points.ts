/**
 * What to show when someone returns (Bhavya, human decision 2026-10-10): at most three
 * saved points the user most needs to remember, chosen from every saved conversation.
 * The backend AI picks among these notes; newestPoints is the no-AI fallback.
 */
import { memoryBullets } from "@/components/ConversationDrawer";
import type { KeyPointNote, PersonDetail } from "@/lib/api-client";

export const MAX_KEY_POINTS = 3;
export const MAX_KEY_POINT_NOTES = 30;

/** Every saved point, newest conversation first: its facts, or its reminder when it has none. */
export function keyPointNotes(detail: PersonDetail): KeyPointNote[] {
  return detail.conversations
    .flatMap((conversation) => memoryBullets(conversation.memory).map((text) => ({ text, endedAt: conversation.endedAt })))
    .slice(0, MAX_KEY_POINT_NOTES);
}

/** Notes without repeats (ignoring case and spacing), keeping the newest copy. */
export function uniqueNotes(notes: KeyPointNote[]): KeyPointNote[] {
  const seen = new Set<string>();
  return notes.filter((note) => {
    const key = note.text.toLowerCase().split(/\s+/).filter(Boolean).join(" ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function newestPoints(notes: KeyPointNote[]): string[] {
  return uniqueNotes(notes)
    .slice(0, MAX_KEY_POINTS)
    .map((note) => note.text);
}

/** Changes whenever a conversation is added, so the chosen points are picked again. */
export function keyPointsVersion(detail: PersonDetail): string {
  return `${detail.conversations.length}:${detail.conversations[0]?.id ?? ""}`;
}
