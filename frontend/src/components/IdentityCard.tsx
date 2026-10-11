"use client";
/**
 * Floating identity overlay (Ishan Phase 1a; Bhavya 2026-10-10; conversation button Vansh;
 * Liquid Glass redesign by Arnav, human-requested). Name first, relationship directly
 * beneath it. Conversation details belong to the side panel, not this card.
 * Every state comes from the real recognition loop/tracker: a name is shown only after the
 * tracker confirmed a stable match and the person's record has loaded.
 */
import { GlassSurface } from "@/components/glass/GlassSurface";
import { ChevronRightIcon, MicIcon, ScanFaceIcon } from "@/components/glass/Icons";
import type { Person } from "@/lib/api-client";
import { badgeGradient, initials } from "@/lib/face-tag";

export type IdentityView =
  | { kind: "off" }
  | { kind: "looking" }
  | { kind: "none" }
  | { kind: "pending"; faces: number }
  | { kind: "unknown"; faces: number }
  | { kind: "recognized"; people: Person[]; otherFaces: number }
  | { kind: "paused"; text: string };

function Pill({ tone, text }: { tone: "idle" | "busy"; text: string }) {
  return (
    <GlassSurface
      elevation="thin"
      role="status"
      className="animate-pop-in flex items-center gap-2 rounded-full py-2 pl-3 pr-4 text-[13px] font-medium"
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${tone === "busy" ? "breathe bg-sky-500" : "bg-ink/30"}`}
      />
      {text}
    </GlassSurface>
  );
}

function PersonRow({
  person,
  primary,
  onRecordConversation,
  recordDisabled,
  onOpenConversation,
  conversationOpen,
}: {
  person: Person;
  primary: boolean;
  onRecordConversation?: (person: Person) => void;
  recordDisabled: boolean;
  onOpenConversation?: (person: Person) => void;
  conversationOpen: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden
        className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shadow-lg ${primary ? "h-12 w-12 text-base" : "h-9 w-9 text-xs"} ${badgeGradient(person.id)}`}
      >
        {initials(person.displayName)}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold leading-tight tracking-tight ${primary ? "text-[22px]" : "text-base"}`}>
          {person.displayName}
        </p>
        <p className={`line-clamp-2 leading-snug text-ink/72 ${primary ? "text-[15px]" : "text-[13px]"}`}>
          {person.relationship ?? "Relationship not set"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onRecordConversation && (
          <button
            type="button"
            onClick={() => onRecordConversation(person)}
            disabled={recordDisabled}
            aria-label={`Record conversation with ${person.displayName}`}
            title="Record conversation"
            className="glass-btn glass-btn--sm glass-btn--icon"
          >
            <MicIcon size={17} />
          </button>
        )}
        {onOpenConversation && (
          <button
            type="button"
            onClick={() => onOpenConversation(person)}
            aria-label={`Last conversation with ${person.displayName}`}
            aria-expanded={conversationOpen}
            title="Last conversation"
            className="glass-btn glass-btn--sm glass-btn--icon glass-btn--quiet"
          >
            <ChevronRightIcon size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

export function IdentityCard({
  view,
  onRecordConversation,
  recordDisabled = false,
  onOpenConversation,
  focusedPersonId = null,
  conversationOpen = false,
}: {
  view: IdentityView;
  /** Explicitly start recording a conversation with this person. */
  onRecordConversation?: (person: Person) => void;
  recordDisabled?: boolean;
  onOpenConversation?: (person: Person) => void;
  focusedPersonId?: string | null;
  conversationOpen?: boolean;
}) {
  switch (view.kind) {
    case "off":
      return null;
    case "looking":
      return <Pill tone="busy" text="Looking for someone…" />;
    case "none":
      return <Pill tone="idle" text="No person detected" />;
    case "paused":
      return <Pill tone="busy" text={view.text} />;
    case "pending":
      return (
        <GlassSurface
          elevation="base"
          role="status"
          className="animate-pop-in flex items-center gap-3 rounded-[var(--radius-card)] p-3 pr-5"
        >
          <span aria-hidden className="shimmer h-12 w-12 shrink-0 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <p className="text-[15px] font-semibold">Recognizing…</p>
            <span aria-hidden className="shimmer h-2.5 w-24 rounded-full" />
          </div>
        </GlassSurface>
      );
    case "unknown":
      return (
        <GlassSurface
          elevation="base"
          role="status"
          className="animate-pop-in flex max-w-[300px] items-center gap-3 rounded-[var(--radius-card)] p-3 pr-5"
        >
          <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/75 shadow-sm text-ink/85">
            <ScanFaceIcon size={24} />
          </span>
          <div className="min-w-0">
            <p className="text-[19px] font-semibold leading-tight tracking-tight">
              {view.faces > 1 ? `${view.faces} unknown people` : "Unknown person"}
            </p>
            <p className="text-[13px] leading-snug text-ink/70">
              {view.faces > 1 ? "To add someone, have them face the camera alone." : "Not saved yet."}
            </p>
          </div>
        </GlassSurface>
      );
    case "recognized": {
      const [first, ...rest] = view.people;
      return (
        <GlassSurface
          elevation="strong"
          lit
          refract
          role="status"
          aria-label={`Recognized ${view.people.map((person) => person.displayName).join(", ")}`}
          className="flex w-[min(340px,calc(100vw-32px))] flex-col gap-3 rounded-[var(--radius-card)] p-3.5"
        >
          <div className="flex items-center gap-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgb(16_185_129/0.6)]" />
            Recognized
          </div>
          {/* Re-keyed per person so a new identity animates in; the same one never restarts. */}
          <div key={first.id} className="animate-pop-in">
            <PersonRow
              person={first}
              primary
              onRecordConversation={onRecordConversation}
              recordDisabled={recordDisabled}
              onOpenConversation={onOpenConversation}
              conversationOpen={conversationOpen && focusedPersonId === first.id}
            />
          </div>
          {rest.length > 0 && (
            <div className="flex flex-col gap-2.5 border-t border-ink/10 pt-3">
              {rest.map((person) => (
                <div key={person.id} className="animate-pop-in">
                  <PersonRow
                    person={person}
                    primary={false}
                    onRecordConversation={onRecordConversation}
                    recordDisabled={recordDisabled}
                    onOpenConversation={onOpenConversation}
                    conversationOpen={conversationOpen && focusedPersonId === person.id}
                  />
                </div>
              ))}
            </div>
          )}
          {view.otherFaces > 0 && (
            <p className="px-0.5 text-xs text-ink/60">
              +{view.otherFaces} {view.otherFaces === 1 ? "other face" : "other faces"} not recognized
            </p>
          )}
        </GlassSurface>
      );
    }
  }
}
