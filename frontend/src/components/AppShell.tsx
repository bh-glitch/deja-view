"use client";
/**
 * Single-page controller (Ishan Phase 1a; Bhavya 2026-10-10 by human decision):
 * camera -> recognition loop -> stable identity, auto-enrollment of a steady unknown
 * face, live people list with delete, and the recognized person's latest cue.
 * Voice introduction (Vansh, human-approved 2026-10-10): after capture, one 8 s listening
 * window prefills the name via ElevenLabs STT + Gemini; the user still taps Save.
 * Conversation memory (Vansh, human-approved): "Record conversation" on a recognized person
 * records up to 25 s, drafts a reviewed reminder, and saves it as that person's latest cue.
 * Liquid Glass layout (Arnav, human-requested 2026-10-10): camera-first stage with floating
 * header, identity card, conversation and people drawers, toolbar and toasts. Recognition,
 * enrollment and API logic are unchanged; only presentation and drawer state are new.
 * Who is this? (Bhavya 2026-10-10): speaks the focused recognized person's name, relationship
 * and latest cue on request; stops when that person leaves the frame or the mic is needed.
 * Automatic conversations (Bhavya, human requests 2026-10-10): right after someone is enrolled,
 * their first conversation starts recording without a tap; a returning person is recorded only
 * after a tap on the summary card's mic (privacy). Both stop at 25 s, on Stop, or when the
 * person leaves, and are saved without asking (marked as not reviewed). The last-talk summary shows the 3 points most worth remembering and slides
 * away after 12 s; a button at the top right brings it back.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { AppHeader, type HealthState } from "@/components/AppHeader";
import { CameraToolbar } from "@/components/CameraToolbar";
import { CameraViewport, type FaceOverlay } from "@/components/CameraViewport";
import { ConversationDrawer } from "@/components/ConversationDrawer";
import { ConversationPanel } from "@/components/ConversationPanel";
import { EnrollmentCard } from "@/components/EnrollmentCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassFilters } from "@/components/glass/GlassFilters";
import { MessageIcon, MicIcon } from "@/components/glass/Icons";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { GlassToasts, type ToastItem } from "@/components/glass/GlassToast";
import { useEdgeSwipeOpen } from "@/components/glass/useDrawer";
import { ConversationSummary, type SummaryItem } from "@/components/ConversationSummary";
import { PeopleDrawer } from "@/components/PeopleDrawer";
import { Splash } from "@/components/Splash";
import { RecordingPill } from "@/components/RecordingPill";
import { useArrivals } from "@/hooks/useArrivals";
import { useAutoEnrollment } from "@/hooks/useAutoEnrollment";
import { useAutoHide } from "@/hooks/useAutoHide";
import { useCamera } from "@/hooks/useCamera";
import { useConversationMemory } from "@/hooks/useConversationMemory";
import { useRecognitionLoop } from "@/hooks/useRecognitionLoop";
import { useVoiceIntroduction } from "@/hooks/useVoiceIntroduction";
import { useWhoIsThis } from "@/hooks/useWhoIsThis";
import { cleanCue } from "@/lib/cue";
import {
  ApiClientError,
  deletePerson,
  getHealth,
  getPerson,
  listPeople,
  pickKeyPoints,
  type FrameResult,
  type Person,
  type PersonDetail,
} from "@/lib/api-client";
import {
  initialTracker,
  shouldStartEnrollment,
  stablePersonIds,
  trackFrame,
  type TrackerState,
} from "@/lib/identity-tracker";
import { MAX_KEY_POINTS, keyPointNotes, keyPointsVersion, newestPoints, uniqueNotes } from "@/lib/key-points";

/** Below this width only one drawer is open at a time. */
const NARROW_QUERY = "(max-width: 767px)";
/** A recording ends on its own once its person has been out of view this long. */
export const LEFT_STOP_MS = 8000;
/** A just-enrolled person's automatic first conversation must start within this time. */
export const AUTO_RECORD_ARM_MS = 60_000;
/** Early in a recording, Who is this? restarts it after speaking instead of being disabled. */
export const WHO_IS_THIS_RESTART_MS = 15_000;

function matches(query: string): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.(query).matches;
}

/** The first of `ids` still armed for an automatic conversation; expired entries are dropped. */
function firstArmed(pending: Map<string, number>, ids: string[]): string | undefined {
  const now = Date.now();
  for (const [id, expires] of pending) if (expires < now) pending.delete(id);
  return ids.find((id) => pending.has(id));
}

function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

export function AppShell() {
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });
  const [people, setPeople] = useState<Person[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [tracker, setTracker] = useState<TrackerState>(initialTracker);
  const [lastResult, setLastResult] = useState<FrameResult | null>(null);
  const [details, setDetails] = useState<Record<string, PersonDetail>>({});
  const trackerRef = useRef<TrackerState>(initialTracker);

  // Drawer state belongs to the user: recognition frames never toggle it.
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const peopleToggleRef = useRef<HTMLButtonElement>(null);
  const conversationToggleRef = useRef<HTMLButtonElement>(null);

  const camera = useCamera();
  const cameraLive = camera.state.kind === "live";
  // Start screen (human design 2026-10-10): shown on load and after Stop camera; its logo
  // starts the camera and plays the intro before revealing the video.
  const [splashOpen, setSplashOpen] = useState(true);

  const refreshPeople = useCallback(async () => {
    try {
      setPeople(await listPeople());
      setPeopleError(null);
    } catch (error) {
      setPeopleError(messageFor(error, "Could not load people."));
    } finally {
      setPeopleLoading(false);
    }
  }, []);

  const resetIdentity = useCallback(() => {
    trackerRef.current = initialTracker;
    setTracker(initialTracker);
    setDetails({});
  }, []);

  // People whose conversation should start by itself once they are recognized, with the time
  // this expires: a just-enrolled person, or a recording restarted after Who is this?.
  const autoPending = useRef(new Map<string, number>());
  const [autoTick, setAutoTick] = useState(0);
  const armAutoConversation = useCallback((ids: string[]) => {
    for (const id of ids) autoPending.current.set(id, Date.now() + AUTO_RECORD_ARM_MS);
    setAutoTick((tick) => tick + 1);
  }, []);

  const enrollment = useAutoEnrollment(camera.videoRef, (person) => {
    resetIdentity();
    void refreshPeople();
    armAutoConversation([person.id]); // the first conversation records itself
  });
  const enrolling = enrollment.state.kind === "capturing";
  const naming = enrollment.state.kind === "naming";

  // Spoken reminder; never overlaps the microphone (shared audio lock).
  const who = useWhoIsThis();

  // Auto-listen (default on): one bounded window per new face, never continuous.
  const voice = useVoiceIntroduction();
  const [autoListen, setAutoListen] = useState(true);
  const autoListenRef = useRef(autoListen);
  const changeAutoListen = useCallback((enabled: boolean) => {
    autoListenRef.current = enabled;
    setAutoListen(enabled);
  }, []);

  const startEnrollment = useCallback(async () => {
    who.stop(); // the listening window must not hear our own speech
    voice.cancel(); // never carry a previous visitor's introduction into this session
    const ready = await enrollment.begin();
    if (ready && autoListenRef.current) await voice.listen();
  }, [enrollment, voice, who]);

  // A saved conversation refreshes that person's details so the new cue shows at once.
  // A draft to review (or a failure to read) opens the conversation drawer for that person.
  const conversation = useConversationMemory(
    (personId) => {
      setDetails((current) => {
        const next = { ...current };
        delete next[personId];
        return next;
      });
    },
    (person) => {
      setChosenId(person.id);
      setConversationOpen(true);
      if (matches(NARROW_QUERY)) setPeopleOpen(false);
    },
  );
  const conversationActiveRef = useRef(false);
  useEffect(() => {
    conversationActiveRef.current = conversation.active;
  }, [conversation.active]);

  const dismissEnrollment = useCallback(() => {
    voice.cancel();
    enrollment.dismiss();
  }, [enrollment, voice]);

  const onResult = useCallback(
    (result: FrameResult) => {
      const next = trackFrame(trackerRef.current, result);
      trackerRef.current = next;
      setTracker(next);
      setLastResult(result);
      if (result.faces.length === 0) enrollment.noteFaceLeft();
      // Never open an enrollment listening window during a conversation recording.
      if (shouldStartEnrollment(next) && enrollment.canAutoStart() && !conversationActiveRef.current) {
        trackerRef.current = initialTracker;
        setTracker(initialTracker);
        void startEnrollment();
      }
    },
    [enrollment, startEnrollment],
  );

  const { status } = useRecognitionLoop(camera.videoRef, {
    enabled: cameraLive,
    paused: enrolling,
    onResult,
  });

  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal)
      .then((value) => setHealth({ kind: "ready", health: value }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setHealth({ kind: "error", message: messageFor(error, "Backend health check failed.") });
      });
    listPeople(controller.signal)
      .then((value) => {
        setPeople(value);
        setPeopleLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPeopleError(messageFor(error, "Could not load people."));
        setPeopleLoading(false);
      });
    return () => controller.abort();
  }, []);

  // Load details for newly recognized people (one request each, cached until a reset).
  const stableIds = stablePersonIds(tracker);
  const missingKey = stableIds.filter((id) => !details[id]).sort().join(",");
  useEffect(() => {
    if (!missingKey) return;
    const controller = new AbortController();
    for (const id of missingKey.split(",")) {
      getPerson(id, controller.signal)
        .then((value) => setDetails((current) => ({ ...current, [id]: value })))
        .catch(() => undefined); // the face keeps its pending label; retried on the next change
    }
    return () => controller.abort();
  }, [missingKey]);

  // Stopping the camera ends any enrollment session and clears identity.
  const stopCamera = useCallback(() => {
    camera.stop();
    setSplashOpen(true);
    if (enrollment.state.kind === "capturing" || enrollment.state.kind === "naming") dismissEnrollment();
    resetIdentity();
    setLastResult(null);
  }, [camera, dismissEnrollment, enrollment.state.kind, resetIdentity]);

  // A different camera shows a different scene: drop names and any enrollment in progress.
  const switchCamera = useCallback(async () => {
    if (enrollment.state.kind === "capturing" || enrollment.state.kind === "naming") dismissEnrollment();
    resetIdentity();
    setLastResult(null);
    await camera.switchFacing();
  }, [camera, dismissEnrollment, enrollment.state.kind, resetIdentity]);

  // Confirmation happens inline in the People drawer.
  const onDelete = useCallback(
    async (person: Person) => {
      try {
        await deletePerson(person.id);
        resetIdentity();
        await refreshPeople();
      } catch (error) {
        setPeopleError(messageFor(error, "Could not delete."));
      }
    },
    [refreshPeople, resetIdentity],
  );

  const recognized = stableIds.flatMap((id) => (details[id] ? [details[id].person] : []));

  // Which person the conversation panel shows: the recording's locked person, else the
  // user's pick if still in view, else the first recognized person.
  const lockedId = conversation.state.kind !== "idle" ? conversation.state.person.id : null;
  const focusedId =
    lockedId ?? (chosenId && recognized.some((person) => person.id === chosenId) ? chosenId : (recognized[0]?.id ?? null));
  const focusedDetail = focusedId ? (details[focusedId] ?? null) : null;

  // The conversation panel opens when the user asks or a recording is ready to review (human
  // request 2026-10-10: keep the camera on screen); the corner summary shows the last talk.

  const openConversation = useCallback((person?: Person) => {
    if (person) setChosenId(person.id);
    setConversationOpen(true);
    if (matches(NARROW_QUERY)) setPeopleOpen(false);
  }, []);
  const togglePeople = useCallback(() => {
    setPeopleOpen((open) => {
      if (!open && matches(NARROW_QUERY)) setConversationOpen(false);
      return !open;
    });
  }, []);

  const startConversation = useCallback(
    (person: Person) => {
      who.stop(); // recording must not pick up the spoken reminder
      openConversation(person);
      void conversation.start(person);
    },
    [conversation, openConversation, who],
  );

  // The summary card's mic (human request 2026-10-10): records a returning person only on a
  // tap, keeps the camera clear (the pill above the toolbar shows progress) and saves itself.
  const recordFromSummary = useCallback(
    (person: Person) => {
      who.stop();
      void conversation.start(person, { autoSave: true });
    },
    [conversation, who],
  );

  // Stop speaking about someone who is no longer recognized in the frame.
  const speakingId = who.state.kind === "idle" ? null : who.state.personId;
  const speakingStillHere = !speakingId || recognized.some((person) => person.id === speakingId);
  useEffect(() => {
    if (!speakingStillHere && who.busy) who.stop();
  }, [speakingStillHere, who]);

  // Automatic conversation: starts for an armed person once they are recognized and nothing
  // else needs the microphone or speaker. Returning people are recorded only on a tap.
  const recognizedKey = recognized.map((person) => person.id).join(",");

  const conversationStartRef = useRef(conversation.start);
  const conversationStopRef = useRef(conversation.stop);
  useEffect(() => {
    conversationStartRef.current = conversation.start;
    conversationStopRef.current = conversation.stop;
  });

  const voiceBusy = voice.state.kind === "listening" || voice.state.kind === "transcribing" || voice.state.kind === "understanding";
  const autoBlocked = !cameraLive || enrolling || naming || voiceBusy || who.busy || conversation.state.kind !== "idle";
  useEffect(() => {
    if (autoBlocked) return;
    const id = firstArmed(autoPending.current, recognizedKey.split(","));
    const person = id ? details[id]?.person : undefined;
    if (!person) return;
    autoPending.current.clear();
    void conversationStartRef.current(person, { autoSave: true });
  }, [autoBlocked, autoTick, details, recognizedKey]);

  // The recording ends (and is summarized) once its person has left the frame for a while.
  const recordingNow = conversation.state.kind === "recording";
  const lockedHere = !lockedId || recognized.some((person) => person.id === lockedId);
  useEffect(() => {
    if (!recordingNow || lockedHere) return;
    const timer = window.setTimeout(() => conversationStopRef.current(), LEFT_STOP_MS);
    return () => window.clearTimeout(timer);
  }, [lockedHere, recordingNow]);

  // Things to remember: the AI picks at most 3 saved points across all conversations,
  // again after every new one. With 3 or fewer there is nothing to choose.
  const [keyPoints, setKeyPoints] = useState<Record<string, { version: string; points: string[] }>>({});
  const keyPointRequests = useRef(new Map<string, string>());
  const pointsFor = (detail: PersonDetail | null): string[] | null => {
    if (!detail) return null;
    const notes = uniqueNotes(keyPointNotes(detail));
    if (notes.length <= MAX_KEY_POINTS) return notes.map((note) => note.text);
    const chosen = keyPoints[detail.person.id];
    return chosen?.version === keyPointsVersion(detail) ? chosen.points : null;
  };
  const pointsNeeded = recognized
    .flatMap((person) => {
      const detail = details[person.id] ?? null;
      return detail && detail.conversations.length > 0 && !pointsFor(detail) ? [person.id] : [];
    })
    .join(",");
  useEffect(() => {
    // One request per person and version, never cancelled: a late answer is still valid.
    for (const id of pointsNeeded ? pointsNeeded.split(",") : []) {
      const detail = details[id];
      if (!detail) continue;
      const version = keyPointsVersion(detail);
      if (keyPointRequests.current.get(id) === version) continue; // already asked
      keyPointRequests.current.set(id, version);
      const notes = uniqueNotes(keyPointNotes(detail));
      const done = (points: string[]) => setKeyPoints((current) => ({ ...current, [id]: { version, points } }));
      pickKeyPoints({ personName: detail.person.displayName, notes })
        .then(done)
        .catch(() => done(newestPoints(notes))); // the AI is optional: newest points instead
    }
  }, [details, pointsNeeded]);

  useEdgeSwipeOpen("right", () => openConversation());
  useEdgeSwipeOpen("left", () => {
    setPeopleOpen(true);
    if (matches(NARROW_QUERY)) setConversationOpen(false);
  });

  const overlays: FaceOverlay[] =
    lastResult && !naming
      ? tracker.tracks.map((track) => {
          const known = track.stableId ? details[track.stableId] : undefined;
          const base = {
            key: track.trackId,
            box: track.box,
            frameWidth: lastResult.frameWidth,
            frameHeight: lastResult.frameHeight,
          };
          if (!track.stableId) {
            // A face with a match candidate is still being confirmed; never name it early.
            return track.candidateId ? { ...base, kind: "pending" as const } : { ...base, kind: "unknown" as const };
          }
          if (!known) return { ...base, kind: "pending" as const, personId: track.stableId };
          return {
            ...base,
            kind: "known" as const,
            personId: known.person.id,
            name: known.person.displayName,
            relationship: known.person.relationship,
          };
        })
      : [];

  // Names live on the face tags; the corner shows only the recognized people's last talk.
  const summaryItems: SummaryItem[] =
    cameraLive && !enrolling && !naming
      ? recognized.map((person) => {
          const detail = details[person.id] ?? null;
          return { person, detail, points: pointsFor(detail) };
        })
      : [];
  // The summary shows when someone arrives (once its points are ready) and slides away after 12 s.
  const summary = useAutoHide(summaryItems.length > 0);
  useArrivals(
    summaryItems.flatMap((item) => (item.points ? [item.person.id] : [])),
    summary.show,
  );

  const recordDisabled = conversation.active || voice.state.kind === "listening";
  const flow =
    conversation.active ? (
      <ConversationPanel
        state={conversation.state}
        onStop={conversation.stop}
        onRetryDraft={conversation.retryDraft}
        onSave={(edited) => void conversation.save(edited)}
        onDiscard={conversation.discard}
      />
    ) : null;

  // Toasts mirror real state; the same message on every frame keeps one stable toast.
  const toasts: ToastItem[] = [];
  if (health.kind === "error") toasts.push({ id: "health", tone: "critical", text: `Backend: ${health.message}` });
  else if (health.kind === "ready" && !health.health.vision.ready)
    toasts.push({
      id: "vision",
      tone: "warning",
      text: `Face model not ready${health.health.vision.detail ? `: ${health.health.vision.detail}` : "."}`,
    });
  if (cameraLive && status.kind === "error") toasts.push({ id: "recognition", tone: "critical", text: status.text });
  if (peopleError) toasts.push({ id: "people", tone: "warning", text: peopleError });
  if (enrollment.state.kind === "idle" && enrollment.state.notice)
    toasts.push({ id: "enroll-notice", tone: "warning", text: enrollment.state.notice, ttlMs: 6000 });
  if (enrollment.state.kind === "saved")
    toasts.push({ id: "enroll-saved", tone: "success", text: `Saved ${enrollment.state.person.displayName}. Recognizing…` });
  if (who.state.kind === "loading" || who.state.kind === "playing")
    toasts.push({ id: "who-is-this", tone: "info", text: `🔊 ${who.state.text}` });
  if (who.state.kind === "error")
    toasts.push({ id: "who-is-this", tone: "warning", text: `${who.state.text} (Speech: ${who.state.message})`, ttlMs: 10000 });
  if (conversation.state.kind === "dropped")
    toasts.push({
      id: "conversation-dropped",
      tone: "info",
      text: `Nothing to remember from the talk with ${conversation.state.person.displayName}.`,
      ttlMs: 5000,
    });
  if (conversation.state.kind === "saved")
    toasts.push({
      id: "conversation-saved",
      tone: "success",
      text: `Saved. Next time you see ${conversation.state.person.displayName}: “${cleanCue(conversation.state.cue)}”`,
    });

  const running = camera.state.kind === "live" || camera.state.kind === "starting";
  const conversationBusy = ["recording", "transcribing", "drafting"].includes(conversation.state.kind);
  const lockedPerson = conversation.state.kind !== "idle" ? conversation.state.person : null;
  const whoCanRestart =
    conversation.state.kind === "recording" && conversation.state.elapsedMs < WHO_IS_THIS_RESTART_MS;
  const conversationAvailable = !!focusedId || !!flow;

  return (
    <div className="fixed inset-0 p-2 sm:p-3">
      <GlassFilters />
      {splashOpen && (
        <Splash
          onStart={() => void camera.start()}
          onDone={() => setSplashOpen(false)}
          fixtureMode={health.kind === "ready" && health.health.mode === "fixture"}
        />
      )}
      <div className="h-full w-full" inert={splashOpen}>
        <CameraViewport
          videoRef={camera.videoRef}
          camera={camera.state}
          onStart={() => void camera.start()}
          overlays={overlays}
          mirrored={camera.facing === "user"}
          // The name sits at the video's own top-left corner, not the stage's.
          videoCorner={<AppHeader fixtureMode={health.kind === "ready" && health.health.mode === "fixture"} />}
        >
          {/* Compact last-conversation summary: upper right, sliding aside while the panel is open
              and off to the right after 12 s; the button in its place brings it back. */}
          <div
            data-overlay
            className={`absolute right-3 top-[68px] z-20 transition-[translate,opacity] duration-[560ms] [transition-timing-function:var(--ease-spring)] sm:right-4 sm:top-4 ${
              summary.hidden
                ? "pointer-events-none translate-x-[calc(100%+24px)] opacity-0"
                : conversationOpen
                  ? "md:-translate-x-[396px]"
                  : ""
            } ${summaryItems.length === 0 ? "pointer-events-none" : ""}`}
            aria-live="polite"
            inert={summary.hidden}
          >
            <ConversationSummary
              items={summaryItems}
              onOpen={(person) => openConversation(person)}
              onRecord={recordFromSummary}
              recordDisabled={recordDisabled}
            />
          </div>
          {summary.hidden && summaryItems.length > 0 && (
            <div
              data-overlay
              className={`animate-pop-in absolute right-3 top-[68px] z-20 sm:right-4 sm:top-4 ${
                conversationOpen ? "md:-translate-x-[396px]" : ""
              }`}
            >
              <GlassSurface elevation="strong" className="flex gap-1 rounded-full p-1">
                {focusedDetail && (
                  <GlassButton
                    variant="quiet"
                    label={`Record conversation with ${focusedDetail.person.displayName}`}
                    tooltipSide="bottom"
                    icon={<MicIcon size={20} />}
                    disabled={recordDisabled}
                    onClick={() => recordFromSummary(focusedDetail.person)}
                  />
                )}
                <GlassButton
                  variant="quiet"
                  label="Show things to remember"
                  tooltipSide="bottom"
                  icon={<MessageIcon size={20} />}
                  onClick={summary.show}
                />
              </GlassSurface>
            </div>
          )}

          {/* Toasts */}
          {/* Phones: above the toolbar, clear of the identity card. Larger screens: under the header. */}
          <div
            className={`pointer-events-none absolute inset-x-3 z-40 flex justify-center sm:bottom-auto sm:top-20 ${
              conversationBusy ? "bottom-[140px]" : "bottom-[92px]"
            }`}
          >
            <GlassToasts toasts={toasts} />
          </div>

          {/* Drawers */}
          <div className="pointer-events-none absolute bottom-[88px] left-3 top-[68px] z-30 flex items-start sm:left-4 sm:top-[76px]">
            {/* Only an open drawer takes clicks; a closed one must not block the camera UI under it. */}
            <div className={`flex max-h-full ${peopleOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
              <PeopleDrawer
                open={peopleOpen}
                onClose={() => setPeopleOpen(false)}
                people={people}
                loading={peopleLoading}
                error={peopleError}
                onDelete={onDelete}
                toggleRef={peopleToggleRef}
              />
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-[88px] right-3 top-[68px] z-30 flex items-start justify-end sm:right-4 sm:top-4">
            <div className={`flex max-h-full ${conversationOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
              <ConversationDrawer
                open={conversationOpen}
                onClose={() => setConversationOpen(false)}
                detail={focusedDetail}
                loading={!!focusedId && !focusedDetail}
                recognized={recognized}
                focusedId={focusedId}
                onFocus={(person) => setChosenId(person.id)}
                onRecord={conversation.active ? undefined : startConversation}
                recordDisabled={recordDisabled}
                flow={flow}
                toggleRef={conversationToggleRef}
              />
            </div>
          </div>

          {/* Enrollment sheet above the toolbar */}
          {(enrolling || naming) && (
            <div
              data-overlay
              className="absolute inset-x-3 bottom-[88px] z-30 flex max-h-[calc(100%-180px)] justify-center"
            >
              <div className={`flex max-h-full ${naming ? "w-full max-w-[440px]" : ""}`}>
                <EnrollmentCard
                  key={enrollment.state.kind}
                  state={enrollment.state}
                  onSave={(name, relationship) => void enrollment.save(name, relationship)}
                  onDismiss={dismissEnrollment}
                  mirrored={camera.facing === "user"}
                  voice={{
                    state: voice.state,
                    autoListen,
                    onAutoListenChange: changeAutoListen,
                    onListen: () => void voice.listen(),
                    onFinish: voice.finish,
                    onCancel: voice.cancel,
                    onRetryDraft: voice.retryDraft,
                  }}
                />
              </div>
            </div>
          )}

          {/* Toolbar, with the recording indicator above it */}
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex flex-col items-center gap-2 px-3 sm:bottom-4">
            <div className="pointer-events-auto">
              <RecordingPill
                state={conversation.state}
                onStop={conversation.stop}
                onOpen={() => openConversation(lockedPerson ?? undefined)}
              />
            </div>
            <div className="pointer-events-auto">
              <CameraToolbar
                running={running}
                onStop={stopCamera}
                canSwitch={camera.canSwitch}
                onSwitch={() => void switchCamera()}
                peopleOpen={peopleOpen}
                onTogglePeople={togglePeople}
                peopleCount={people.length}
                peopleRef={peopleToggleRef}
                conversationOpen={conversationOpen}
                onToggleConversation={() => (conversationOpen ? setConversationOpen(false) : openConversation())}
                conversationAvailable={conversationAvailable}
                conversationRef={conversationToggleRef}
                conversationActive={conversation.active}
                whoIsThis={{
                  available: !!focusedDetail && (!conversation.active || whoCanRestart) && voice.state.kind !== "listening",
                  busy: who.busy,
                  onClick: () => {
                    if (who.busy) return who.stop();
                    if (!focusedDetail) return;
                    if (conversation.state.kind === "recording") {
                      // Never record our own speech: drop the few seconds so far and record
                      // again once the reminder has been spoken.
                      conversation.discard();
                      armAutoConversation([focusedDetail.person.id]);
                    }
                    void who.speak(focusedDetail);
                  },
                }}
              />
            </div>
          </div>
        </CameraViewport>
      </div>
    </div>
  );
}
