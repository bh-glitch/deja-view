"use client";
/**
 * "Who is this?" spoken reminder (Bhavya 2026-10-10, completing the speak flow).
 *
 * Speaks the confirmed stored name, relationship and latest saved cue, only when pressed.
 * Kept within MAX_SPEECH_CHARS by shortening the reminder at a sentence boundary, then by
 * dropping the optional relationship; the name is never altered. Never plays while the mic
 * is recording (shared audio lock), stops when asked or when the person changes, and
 * releases the audio URL afterwards. The text stays visible if speech fails.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiClientError, type PersonDetail } from "@/lib/api-client";
import { isRecording, setSpeechPlaying } from "@/lib/audio/audio-lock";
import { MAX_SPEECH_CHARS, speakText } from "@/lib/audio/speech-client";

export type WhoIsThisState =
  | { kind: "idle" }
  | { kind: "loading"; personId: string; text: string }
  | { kind: "playing"; personId: string; text: string }
  | { kind: "error"; personId: string; text: string; message: string };

function shortenAtSentence(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (end > 0) return cut.slice(0, end + 1);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 0 ? space : limit - 1).trimEnd()}…`;
}

/** The sentence spoken for a person; at most MAX_SPEECH_CHARS, name always intact. */
export function composeWhoIsThis(name: string, relationship: string | null, cue: string | null): string {
  const reminder = cue ? `Last time: ${cue}` : "You haven't saved a conversation with them yet.";
  // "your brother", but "Ishan's twin brother" / "same hackathon team" stand on their own.
  const own = relationship && /^(?:[A-Za-z]+(?:'s|’s)\s|same\s|my\s|our\s)/i.test(relationship);
  const described = relationship ? (own ? relationship : `your ${relationship}`) : null;
  for (const intro of [described ? `This is ${name}, ${described}.` : null, `This is ${name}.`]) {
    if (!intro) continue;
    const room = MAX_SPEECH_CHARS - intro.length - 1;
    if (room >= 20) return `${intro} ${shortenAtSentence(reminder, room)}`;
  }
  return `This is ${name}.`;
}

export function useWhoIsThis() {
  const [state, setState] = useState<WhoIsThisState>({ kind: "idle" });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cleanup = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setSpeechPlaying(false);
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setState({ kind: "idle" });
  }, [cleanup]);

  useEffect(() => cleanup, [cleanup]);

  const speak = useCallback(
    async (detail: PersonDetail) => {
      cleanup();
      const { person } = detail;
      const text = composeWhoIsThis(person.displayName, person.relationship, detail.latestCue);
      if (isRecording()) {
        setState({ kind: "error", personId: person.id, text, message: "Stop the recording first." });
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setSpeechPlaying(true); // the recorder refuses to start from here on
      setState({ kind: "loading", personId: person.id, text });
      try {
        const mp3 = await speakText(text, controller.signal);
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(mp3);
        urlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => stop();
        audio.onerror = () => {
          cleanup();
          setState({ kind: "error", personId: person.id, text, message: "The audio could not be played." });
        };
        await audio.play();
        if (!controller.signal.aborted) setState({ kind: "playing", personId: person.id, text });
      } catch (error) {
        if (controller.signal.aborted) return;
        cleanup();
        const message = error instanceof ApiClientError ? error.message : "Speech is unavailable right now.";
        setState({ kind: "error", personId: person.id, text, message });
      }
    },
    [cleanup, stop],
  );

  return { state, speak, stop, busy: state.kind === "loading" || state.kind === "playing" };
}
