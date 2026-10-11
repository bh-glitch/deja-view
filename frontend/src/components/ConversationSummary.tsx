"use client";
/**
 * Top-right conversation summary (Bhavya 2026-10-10, human request: "the name is already
 * on the face tag; show just the last conversation in 2-3 small points so the camera keeps
 * the screen"). Replaces the large identity card. Shows nothing until someone is recognized.
 * Human requests 2026-10-10: the points are the (at most 3) saved points most worth
 * remembering across all conversations; a returning person is recorded only after a tap on
 * this card's mic (privacy); text is larger on a more solid surface so it reads comfortably.
 */
import type { CSSProperties } from "react";

import { GlassSurface } from "@/components/glass/GlassSurface";
import { MicIcon } from "@/components/glass/Icons";
import type { Person, PersonDetail } from "@/lib/api-client";
import { timeAgo } from "@/lib/face-tag";

export interface SummaryItem {
  person: Person;
  detail: PersonDetail | null;
  /** The points to show; null while they are still being chosen. */
  points: string[] | null;
}

export function ConversationSummary({
  items,
  onOpen,
  onRecord,
  recordDisabled,
}: {
  items: SummaryItem[];
  onOpen: (person: Person) => void;
  onRecord: (person: Person) => void;
  recordDisabled: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <GlassSurface
      elevation="strong"
      role="status"
      aria-label="Last conversations"
      className="animate-pop-in flex w-[min(300px,calc(100vw-32px))] flex-col gap-3 rounded-[22px] p-3.5"
      // A more solid tint than other glass so the points read comfortably over the video.
      style={{ "--_alpha": 0.7 } as CSSProperties}
    >
      {items.map(({ person, detail, points }) => {
        const latest = detail?.conversations[0];
        return (
          <section key={person.id} aria-label={`Last conversation with ${person.displayName}`} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpen(person)}
                className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-white/75 hover:text-white"
                title="Open the full conversation"
              >
                {items.length > 1 ? `${person.displayName} · ` : ""}
                {latest ? `Last talk · ${timeAgo(latest.endedAt)}` : detail ? "No chats yet" : "Loading…"}
              </button>
              <button
                type="button"
                onClick={() => onRecord(person)}
                disabled={recordDisabled}
                aria-label={`Record conversation with ${person.displayName}`}
                title="Record conversation"
                className="glass-btn glass-btn--sm glass-btn--icon h-9 w-9 shrink-0"
              >
                <MicIcon size={17} />
              </button>
            </div>
            {latest &&
              (points ? (
                <ul aria-label="Things to remember" className="flex flex-col gap-2 text-[15px] leading-snug text-white">
                  {points.map((point, index) => (
                    <li key={index} className="flex gap-2.5">
                      <span aria-hidden className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/80" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div aria-hidden className="flex flex-col gap-2 py-1">
                  <span className="shimmer h-3 w-11/12 rounded-full" />
                  <span className="shimmer h-3 w-3/4 rounded-full" />
                </div>
              ))}
          </section>
        );
      })}
    </GlassSurface>
  );
}
