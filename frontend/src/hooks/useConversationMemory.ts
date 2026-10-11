"use client";
/**
 * Conversation memory (Vansh, human-approved 2026-10-10).
 *
 * An explicit button press records one conversation (at most 60 s) for a person who is
 * locked when recording starts: camera changes never reassign it. The audio goes to
 * ElevenLabs, the transcript to the configured AI (local Qwen or Gemini) for a grounded draft, and the user reviews and
 * edits the draft. Only "Save" stores it (createConversation, idempotent by conversationId).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { describeVoiceError } from "@/hooks/useVoiceIntroduction";
import {
  ApiClientError,
  createConversation,
  type MemoryDraft,
  type Person,
} from "@/lib/api-client";
import { type AiProvider, draftMemoryWithProvider } from "@/lib/audio/ai-drafts";
import { MAX_RECORDING_MS } from "@/lib/audio/recorder";
import { transcribeAudio } from "@/lib/audio/speech-client";

export const MAX_CUE_CHARS = 240;
export const MAX_SUMMARY_CHARS = 500;

export type ConversationState =
  | { kind: "idle" }
  | { kind: "recording"; person: Person; elapsedMs: number; limitMs: number }
  | { kind: "transcribing"; person: Person }
  | { kind: "drafting"; person: Person; transcript: string }
  | {
      kind: "review";
      person: Person;
      transcript: string;
      draft: MemoryDraft;
      provider: AiProvider;
      saving: boolean;
      error: string | null;
    }
  | { kind: "failed"; person: Person; transcript: string | null; message: string; canRetryDraft: boolean }
  | { kind: "saved"; person: Person; cue: string };

export interface ConversationMemory {
  state: ConversationState;
  /** True while recording, processing or reviewing: the person stays locked. */
  active: boolean;
  start: (person: Person) => Promise<void>;
  /** Stop recording early and draft the memory. */
  stop: () => void;
  retryDraft: () => void;
  save: (edited: { summary: string; cue: string }) => Promise<void>;
  /** Discard the recording/draft. Nothing is stored. */
  discard: () => void;
}

interface Session {
  conversationId: string;
  person: Person;
  startedAt: string;
  endedAt: string | null;
}

type Phase = "idle" | "recording" | "processing";

export function useConversationMemory(onSaved: (personId: string) => void): ConversationMemory {
  const recorder = useAudioRecorder();
  const [state, setState] = useState<ConversationState>({ kind: "idle" });
  const sessionRef = useRef<Session | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const sawRecordingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const draftFrom = useCallback(async (session: Session, transcript: string, controller: AbortController) => {
    setState({ kind: "drafting", person: session.person, transcript });
    try {
      const { draft, provider } = await draftMemoryWithProvider(
        transcript,
        session.person.displayName,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      phaseRef.current = "idle";
      setState({ kind: "review", person: session.person, transcript, draft, provider, saving: false, error: null });
    } catch (error) {
      if (controller.signal.aborted) return;
      phaseRef.current = "idle";
      const nothing = error instanceof ApiClientError && error.code === "EMPTY_TRANSCRIPT";
      setState({
        kind: "failed",
        person: session.person,
        transcript,
        message: nothing ? (error as ApiClientError).message : describeVoiceError(error),
        canRetryDraft: !nothing,
      });
    }
  }, []);

  const process = useCallback(async () => {
    const session = sessionRef.current;
    if (phaseRef.current !== "recording" || !session) return;
    phaseRef.current = "processing";
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ kind: "transcribing", person: session.person });

    const audio = await recorder.stop();
    session.endedAt = new Date().toISOString();
    if (controller.signal.aborted) return;
    if (!audio) {
      phaseRef.current = "idle";
      setState({
        kind: "failed",
        person: session.person,
        transcript: null,
        message: "Nothing was recorded. Check the microphone and record again.",
        canRetryDraft: false,
      });
      return;
    }

    let transcript: string;
    try {
      transcript = await transcribeAudio(audio.blob, audio.filename, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      phaseRef.current = "idle";
      const empty =
        error instanceof ApiClientError && (error.code === "EMPTY_TRANSCRIPT" || error.code === "EMPTY_AUDIO");
      setState({
        kind: "failed",
        person: session.person,
        transcript: null,
        message: empty ? "Didn't hear any speech. Record again." : describeVoiceError(error),
        canRetryDraft: false,
      });
      return;
    }
    await draftFrom(session, transcript, controller);
  }, [draftFrom, recorder]);

  const start = useCallback(
    async (person: Person) => {
      if (phaseRef.current !== "idle") return;
      abortRef.current?.abort();
      sessionRef.current = {
        conversationId: crypto.randomUUID(),
        person,
        startedAt: new Date().toISOString(),
        endedAt: null,
      };
      phaseRef.current = "recording";
      sawRecordingRef.current = false;
      setState({ kind: "recording", person, elapsedMs: 0, limitMs: MAX_RECORDING_MS });
      await recorder.start({ maxDurationMs: MAX_RECORDING_MS });
    },
    [recorder],
  );

  const stop = useCallback(() => {
    void process();
  }, [process]);

  const retryDraft = useCallback(() => {
    const session = sessionRef.current;
    if (phaseRef.current !== "idle" || state.kind !== "failed" || !state.canRetryDraft || !state.transcript || !session) {
      return;
    }
    phaseRef.current = "processing";
    const controller = new AbortController();
    abortRef.current = controller;
    void draftFrom(session, state.transcript, controller);
  }, [draftFrom, state]);

  const save = useCallback(
    async (edited: { summary: string; cue: string }) => {
      const session = sessionRef.current;
      if (state.kind !== "review" || !session || state.saving) return;
      const summary = edited.summary.trim();
      const cue = edited.cue.trim();
      if (!summary || !cue || summary.length > MAX_SUMMARY_CHARS || cue.length > MAX_CUE_CHARS) {
        setState({ ...state, error: "The reminder and summary must not be empty." });
        return;
      }
      const review = state;
      setState({ ...review, saving: true, error: null });
      try {
        await createConversation({
          conversationId: session.conversationId, // reused on retry for idempotency
          personId: session.person.id,
          startedAt: session.startedAt,
          endedAt: session.endedAt ?? new Date().toISOString(),
          transcript: review.transcript,
          source: "speech",
          memory: { summary, cue, facts: review.draft.facts },
          reviewedByUser: true,
          editedByUser: summary !== review.draft.summary || cue !== review.draft.cue,
        });
        sessionRef.current = null;
        setState({ kind: "saved", person: session.person, cue });
        onSaved(session.person.id);
      } catch (error) {
        setState({
          ...review,
          saving: false,
          error: error instanceof ApiClientError ? error.message : "Could not save the conversation.",
        });
      }
    },
    [onSaved, state],
  );

  const discard = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    phaseRef.current = "idle";
    sessionRef.current = null;
    recorder.cancel();
    setState({ kind: "idle" });
  }, [recorder]);

  // Follow the recorder: react to the 60 s auto-stop and microphone errors.
  const recorderState = recorder.state;
  const recorderError = recorder.error;
  useEffect(() => {
    if (phaseRef.current !== "recording") return;
    const session = sessionRef.current;
    if (recorderState === "recording") {
      sawRecordingRef.current = true;
    } else if (recorderState === "error" && session) {
      phaseRef.current = "idle";
      queueMicrotask(() =>
        setState({
          kind: "failed",
          person: session.person,
          transcript: null,
          message: recorderError ?? "The microphone could not start.",
          canRetryDraft: false,
        }),
      );
    } else if (recorderState === "idle" && sawRecordingRef.current) {
      queueMicrotask(() => void process());
    }
  }, [process, recorderError, recorderState]);

  // The "saved" confirmation clears itself.
  useEffect(() => {
    if (state.kind !== "saved") return;
    const timer = window.setTimeout(() => setState({ kind: "idle" }), 6000);
    return () => window.clearTimeout(timer);
  }, [state.kind]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const view: ConversationState =
    state.kind === "recording" ? { ...state, elapsedMs: recorder.elapsedMs } : state;
  const active = state.kind !== "idle" && state.kind !== "saved";
  return { state: view, active, start, stop, retryDraft, save, discard };
}
