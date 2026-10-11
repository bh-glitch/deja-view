"use client";
/**
 * "Last conversation" side panel (Arnav, human-requested Liquid Glass redesign).
 * Shows the focused person's stored conversations (newest first, from GET /api/people/{id})
 * and hosts the record → review → save flow. Opening/closing is owned by the caller so the
 * user's choice survives new recognition frames.
 */
import { useRef, type ReactNode, type RefObject } from "react";

import { GlassButton } from "@/components/glass/GlassButton";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { CloseIcon, MessageIcon, MicIcon } from "@/components/glass/Icons";
import { useDrawerDismiss, useSwipeToClose } from "@/components/glass/useDrawer";
import type { Conversation, Person, PersonDetail } from "@/lib/api-client";
import { cleanCue } from "@/lib/cue";
import { badgeGradient, initials, timeAgo } from "@/lib/face-tag";

/** At most three short points: the saved facts, or the reminder when there are none
 * (human decision 2026-10-10: short bullets, no repeated summary/reminder text). */
export function memoryBullets(memory: Conversation["memory"]): string[] {
  const facts = memory.facts.map((fact) => fact.text.trim()).filter(Boolean);
  return (facts.length > 0 ? facts : [cleanCue(memory.cue)]).slice(0, 3);
}

function LatestConversation({ conversation }: { conversation: Conversation }) {
  return (
    <article className="flex flex-col gap-3">
      <ul aria-label="Last conversation highlights" className="glass-well flex flex-col gap-2.5 px-4 py-3.5">
        {memoryBullets(conversation.memory).map((point, index) => (
          <li key={index} className="flex gap-2.5 text-[15px] leading-snug text-white/90">
            <span aria-hidden className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-white/50">
        {timeAgo(conversation.endedAt)} · {conversation.source === "speech" ? "recorded" : "typed"}
        {conversation.editedByUser ? " · edited" : ""}
      </p>
    </article>
  );
}

export function ConversationDrawer({
  open,
  onClose,
  detail,
  loading,
  recognized,
  focusedId,
  onFocus,
  onRecord,
  recordDisabled,
  flow,
  toggleRef,
}: {
  open: boolean;
  onClose: () => void;
  detail: PersonDetail | null;
  loading: boolean;
  /** People currently recognized, for switching the panel between them. */
  recognized: Person[];
  focusedId: string | null;
  onFocus: (person: Person) => void;
  onRecord?: (person: Person) => void;
  recordDisabled: boolean;
  /** The active record/review flow, if any. */
  flow: ReactNode;
  toggleRef: RefObject<HTMLElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDrawerDismiss({ open, onClose, panelRef, ignoreRefs: [toggleRef] });
  const swipe = useSwipeToClose(panelRef, "right", onClose);

  const person = detail?.person ?? null;
  const [latest, ...earlier] = detail?.conversations ?? [];

  return (
    <GlassSurface
      ref={panelRef}
      elevation="strong"
      lit
      id="conversation-drawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby="conversation-drawer-title"
      data-overlay
      data-open={open}
      data-from="right"
      inert={!open}
      {...swipe}
      className="float-in flex max-h-full w-[min(380px,calc(100vw-24px))] touch-pan-y flex-col overflow-hidden rounded-[var(--radius-panel)]"
    >
      <header className="flex items-start gap-3 p-4 pb-3">
        {person ? (
          <span
            aria-hidden
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow ${badgeGradient(person.id)}`}
          >
            {initials(person.displayName)}
          </span>
        ) : (
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
            <MessageIcon size={19} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">Last conversation</p>
          <h2 id="conversation-drawer-title" className="truncate text-lg font-semibold leading-tight tracking-tight">
            {person ? person.displayName : "No one selected"}
          </h2>
        </div>
        <GlassButton size="sm" variant="quiet" label="Close" tooltipSide="bottom" icon={<CloseIcon size={17} />} onClick={onClose} />
      </header>

      {recognized.length > 1 && (
        <div role="tablist" aria-label="Recognized people" className="flex gap-1.5 overflow-x-auto px-4 pb-3">
          {recognized.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === focusedId}
              onClick={() => onFocus(item)}
              className="glass-btn glass-btn--sm shrink-0"
              data-active={item.id === focusedId ? "true" : undefined}
            >
              {item.displayName}
            </button>
          ))}
        </div>
      )}

      <div className="scroll-soft flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        {flow}
        {!person && !flow && (
          <p className="py-6 text-center text-sm leading-relaxed text-white/65">
            When someone you know is recognized, your last conversation with them appears here.
          </p>
        )}
        {person && loading && !detail?.conversations.length && (
          <div aria-hidden className="flex flex-col gap-2 py-2">
            <span className="shimmer h-16 w-full rounded-2xl" />
            <span className="shimmer h-3 w-4/5 rounded-full" />
            <span className="shimmer h-3 w-3/5 rounded-full" />
          </div>
        )}
        {person && !latest && !loading && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-[15px] font-medium">No saved conversation yet</p>
            <p className="text-sm text-white/60">Record one so you have a reminder next time.</p>
          </div>
        )}
        {latest && <LatestConversation conversation={latest} />}
        {earlier.length > 0 && (
          <section aria-label="Earlier conversations" className="flex flex-col gap-2 border-t border-white/10 pt-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">Earlier</h3>
            <ul className="flex flex-col gap-2">
              {earlier.map((item) => (
                <li key={item.id} className="glass-well px-3 py-2.5">
                  <p className="text-sm leading-snug text-white/85">{cleanCue(item.memory.cue)}</p>
                  <p className="mt-1 text-[11px] text-white/45">{timeAgo(item.endedAt)}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {person && onRecord && !flow && (
        <footer className="border-t border-white/10 p-3">
          <GlassButton
            className="w-full"
            icon={<MicIcon size={17} />}
            onClick={() => onRecord(person)}
            disabled={recordDisabled}
          >
            Record conversation
          </GlassButton>
        </footer>
      )}
    </GlassSurface>
  );
}
