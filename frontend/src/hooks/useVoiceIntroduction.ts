"use client";
/**
 * Voice introduction for enrollment (Vansh, wired into the UI by human decision 2026-10-10;
 * see docs/decisions.md "Auto-listen enrollment").
 *
 * listen() opens ONE bounded window (8 s by default) -> ElevenLabs transcription ->
 * Gemini introduction draft. It never saves anything: the draft only prefills the
 * confirmation card, and the user still taps Save.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { ApiClientError, draftIntroduction, type IntroductionDraft } from "@/lib/api-client";
import { transcribeAudio } from "@/lib/audio/speech-client";

export const INTRODUCTION_WINDOW_MS = 8000;

export type VoiceIntroductionState =
  | { kind: "idle" }
  | { kind: "listening"; elapsedMs: number; limitMs: number }
  | { kind: "transcribing" }
  | { kind: "understanding"; transcript: string }
  | { kind: "heard"; transcript: string; draft: IntroductionDraft }
  | { kind: "no-name"; transcript: string | null; message: string }
  | { kind: "error"; message: string };

export interface VoiceIntroduction {
  state: VoiceIntroductionState;
  /** Open one listening window. Ignored while a window or request is in progress. */
  listen: () => Promise<void>;
  /** Stop listening early and process what was said. */
  finish: () => void;
  /** Discard the recording/requests and return to idle. */
  cancel: () => void;
}

type Phase = "idle" | "listening" | "processing";

export function describeVoiceError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "PROVIDER_RATE_LIMITED") return "The speech service is busy. Wait a minute, then listen again.";
    if (error.code === "PROVIDER_NOT_CONFIGURED") return "Speech is not configured on the backend.";
    if (error.code === "PROVIDER_TIMEOUT") return "The speech service took too long. Listen again.";
    if (error.code === "NETWORK_ERROR") return "The backend is unreachable.";
    return error.message;
  }
  return "Something went wrong while listening.";
}

export function useVoiceIntroduction(): VoiceIntroduction {
  const recorder = useAudioRecorder();
  const [state, setState] = useState<VoiceIntroductionState>({ kind: "idle" });
  const phaseRef = useRef<Phase>("idle");
  const sawRecordingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const process = useCallback(async () => {
    if (phaseRef.current !== "listening") return;
    phaseRef.current = "processing";
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ kind: "transcribing" });

    const audio = await recorder.stop();
    if (controller.signal.aborted) return;
    if (!audio) {
      phaseRef.current = "idle";
      setState({ kind: "no-name", transcript: null, message: "Nothing was recorded. Listen again or type the name." });
      return;
    }

    let transcript: string;
    try {
      transcript = await transcribeAudio(audio.blob, audio.filename, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      phaseRef.current = "idle";
      if (error instanceof ApiClientError && (error.code === "EMPTY_TRANSCRIPT" || error.code === "EMPTY_AUDIO")) {
        setState({ kind: "no-name", transcript: null, message: "Didn't hear anything. Listen again or type the name." });
      } else {
        setState({ kind: "error", message: describeVoiceError(error) });
      }
      return;
    }

    setState({ kind: "understanding", transcript });
    try {
      const draft = await draftIntroduction(transcript, controller.signal);
      if (controller.signal.aborted) return;
      phaseRef.current = "idle";
      if (draft.intent === "introduction" && draft.displayName) {
        setState({ kind: "heard", transcript, draft });
      } else {
        setState({ kind: "no-name", transcript, message: "Didn't catch a name. Listen again or type it." });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      phaseRef.current = "idle";
      setState({ kind: "error", message: describeVoiceError(error) });
    }
  }, [recorder]);

  const listen = useCallback(async () => {
    if (phaseRef.current !== "idle") return;
    abortRef.current?.abort();
    phaseRef.current = "listening";
    sawRecordingRef.current = false;
    setState({ kind: "listening", elapsedMs: 0, limitMs: INTRODUCTION_WINDOW_MS });
    await recorder.start({ maxDurationMs: INTRODUCTION_WINDOW_MS });
  }, [recorder]);

  const finish = useCallback(() => {
    void process();
  }, [process]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    phaseRef.current = "idle";
    recorder.cancel();
    setState({ kind: "idle" });
  }, [recorder]);

  // Follow the recorder: react to auto-stop and microphone errors.
  const recorderState = recorder.state;
  const recorderError = recorder.error;
  useEffect(() => {
    if (phaseRef.current !== "listening") return;
    if (recorderState === "recording") {
      sawRecordingRef.current = true;
    } else if (recorderState === "error") {
      phaseRef.current = "idle";
      queueMicrotask(() =>
        setState({ kind: "error", message: recorderError ?? "The microphone could not start." }),
      );
    } else if (recorderState === "idle" && sawRecordingRef.current) {
      queueMicrotask(() => void process()); // the window ended on its own (auto-stop)
    }
  }, [process, recorderError, recorderState]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const view: VoiceIntroductionState =
    state.kind === "listening" ? { ...state, elapsedMs: recorder.elapsedMs } : state;
  return { state: view, listen, finish, cancel };
}
