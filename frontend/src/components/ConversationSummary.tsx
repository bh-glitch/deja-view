"use client";
/**
 * Top-right conversation summary (Bhavya 2026-10-10, human request: "the name is already
 * on the face tag; show just the last conversation in 2-3 small points so the camera keeps
 * the screen"). Replaces the large identity card. Shows nothing until someone is recognized.
 */
import { memoryBullets } from "@/components/ConversationDrawer";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { MicIcon } from "@/components/glass/Icons";
import type { Person, PersonDetail } from "@/lib/api-client";
import { timeAgo } from "@/lib/face-tag";

export interface SummaryItem {
  person: Person;
  detail: PersonDetail | null;
}

export function ConversationSummary({
  items,
  onRecord,
  recordDisabled,
  onOpen,
}: {
  items: SummaryItem[];
  onRecord: (person: Person) => void;
  recordDisabled: boolean;
  onOpen: (person: Person) => void;
}) {
  if (items.length === 0) return null;
  return (
    <GlassSurface
      elevation="thin"
      role="status"
      aria-label="Last conversations"
      className="animate-pop-in flex w-[min(260px,calc(100vw-32px))] flex-col gap-2.5 rounded-2xl p-2.5"
    >
      {items.map(({ person, detail }) => {
        const latest = detail?.conversations[0];
        return (
          <section key={person.id} aria-label={`Last conversation with ${person.displayName}`} className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpen(person)}
                className="min-w-0 flex-1 truncate text-left text-[11px] font-medium uppercase tracking-[0.06em] text-white/55 hover:text-white/80"
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
                className="glass-btn glass-btn--sm glass-btn--icon glass-btn--quiet h-7 w-7"
              >
                <MicIcon size={14} />
              </button>
            </div>
            {latest && (
              <ul className="flex flex-col gap-1 text-[12px] leading-snug text-white/80">
                {memoryBullets(latest.memory).map((point, index) => (
                  <li key={index} className="flex gap-1.5">
                    <span aria-hidden className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-white/55" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </GlassSurface>
  );
}
