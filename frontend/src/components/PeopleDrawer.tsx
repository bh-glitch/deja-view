"use client";
/**
 * Saved people as a hidden glass drawer (Arnav, human-requested Liquid Glass redesign;
 * replaces PeopleList by Ishan/Bhavya). Delete keeps the existing backend call but asks
 * for an inline confirmation first.
 */
import { useRef, useState, type RefObject } from "react";

import { GlassButton } from "@/components/glass/GlassButton";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { CloseIcon, PeopleIcon, TrashIcon } from "@/components/glass/Icons";
import { useDrawerDismiss, useSwipeToClose } from "@/components/glass/useDrawer";
import type { Person } from "@/lib/api-client";
import { badgeGradient, initials } from "@/lib/face-tag";

function PersonItem({ person, onDelete }: { person: Person; onDelete: (person: Person) => Promise<void> | void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <li className="glass-well flex items-center gap-3 px-3 py-2.5">
      <span
        aria-hidden
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow ${badgeGradient(person.id)}`}
      >
        {initials(person.displayName)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-tight">{person.displayName}</p>
        <p className="truncate text-[13px] leading-snug text-ink/65">{person.relationship ?? "Relationship not set"}</p>
      </div>
      {confirming ? (
        <div className="animate-pop-in flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            className="glass-btn glass-btn--sm glass-btn--danger"
            disabled={deleting}
            aria-label={`Confirm delete ${person.displayName}`}
            onClick={async () => {
              setDeleting(true);
              try {
                await onDelete(person);
              } finally {
                setDeleting(false);
                setConfirming(false);
              }
            }}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <button type="button" className="glass-btn glass-btn--sm glass-btn--quiet" onClick={() => setConfirming(false)}>
            Keep
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${person.displayName}`}
          title="Delete and remove all their saved data"
          className="glass-btn glass-btn--sm glass-btn--icon glass-btn--quiet text-ink/60 hover:text-red-600"
        >
          <TrashIcon size={17} />
        </button>
      )}
    </li>
  );
}

export function PeopleDrawer({
  open,
  onClose,
  people,
  loading,
  error,
  onDelete,
  toggleRef,
}: {
  open: boolean;
  onClose: () => void;
  people: Person[];
  loading: boolean;
  error: string | null;
  onDelete: (person: Person) => Promise<void> | void;
  toggleRef: RefObject<HTMLElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDrawerDismiss({ open, onClose, panelRef, ignoreRefs: [toggleRef] });
  const swipe = useSwipeToClose(panelRef, "left", onClose);

  return (
    <GlassSurface
      ref={panelRef}
      elevation="strong"
      id="people-drawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby="people-heading"
      data-overlay
      data-open={open}
      data-from="left"
      inert={!open}
      {...swipe}
      className="float-in flex max-h-full w-[min(360px,calc(100vw-24px))] touch-pan-y flex-col overflow-hidden rounded-[var(--radius-panel)]"
    >
      <header className="flex items-center gap-3 p-4 pb-3">
        <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-white/75 shadow-sm">
          <PeopleIcon size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="people-heading" className="text-lg font-semibold leading-tight tracking-tight">
            People
          </h2>
          <p className="text-xs text-ink/55">
            {loading ? "Loading…" : `${people.length} saved ${people.length === 1 ? "person" : "people"}`}
          </p>
        </div>
        <GlassButton size="sm" variant="quiet" label="Close" tooltipSide="bottom" icon={<CloseIcon size={17} />} onClick={onClose} />
      </header>
      <div className="scroll-soft flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
        {error && (
          <p role="alert" className="glass-well px-3 py-2 text-sm text-amber-700">
            {error}
          </p>
        )}
        {loading ? (
          <div aria-hidden className="flex flex-col gap-2">
            {[0, 1, 2].map((index) => (
              <span key={index} className="shimmer h-[60px] w-full rounded-2xl" />
            ))}
          </div>
        ) : people.length === 0 ? (
          <p className="py-8 text-center text-sm leading-relaxed text-ink/65">
            No one saved yet. Look at the camera to add someone.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {people.map((person) => (
              <PersonItem key={person.id} person={person} onDelete={onDelete} />
            ))}
          </ul>
        )}
      </div>
    </GlassSurface>
  );
}
