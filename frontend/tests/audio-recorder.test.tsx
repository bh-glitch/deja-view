import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { isRecording, setSpeechPlaying } from "@/lib/audio/audio-lock";
import {
  MAX_RECORDING_MS,
  clampRecordingMs,
  extensionForMimeType,
  microphoneErrorMessage,
  pickRecordingMimeType,
} from "@/lib/audio/recorder";

class FakeTrack {
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

class FakeMediaRecorder {
  static supported = new Set(["audio/webm;codecs=opus", "audio/webm"]);
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported(type: string) {
    return FakeMediaRecorder.supported.has(type);
  }

  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(
    readonly stream: { getTracks: () => FakeTrack[] },
    options: { mimeType: string },
  ) {
    this.mimeType = options.mimeType;
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }

  emit(bytes: number) {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)], { type: this.mimeType }) });
  }

  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.emit(10);
    this.onstop?.();
  }
}

let tracks: FakeTrack[];
let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  FakeMediaRecorder.instances = [];
  FakeMediaRecorder.supported = new Set(["audio/webm;codecs=opus", "audio/webm"]);
  tracks = [];
  getUserMedia = vi.fn(async () => {
    const track = new FakeTrack();
    tracks.push(track);
    return { getTracks: () => [track] };
  });
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  setSpeechPlaying(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setSpeechPlaying(false);
});

const recorder = () => FakeMediaRecorder.instances.at(-1)!;

describe("recorder helpers", () => {
  it("picks the first supported MIME type", () => {
    expect(pickRecordingMimeType()).toBe("audio/webm;codecs=opus");
    FakeMediaRecorder.supported = new Set(["audio/mp4"]);
    expect(pickRecordingMimeType()).toBe("audio/mp4");
    FakeMediaRecorder.supported = new Set();
    expect(pickRecordingMimeType()).toBeNull();
  });

  it("returns null without MediaRecorder", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    expect(pickRecordingMimeType()).toBeNull();
  });

  it("maps MIME types to file extensions", () => {
    expect(extensionForMimeType("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionForMimeType("audio/mp4")).toBe("m4a");
    expect(extensionForMimeType("audio/ogg;codecs=opus")).toBe("ogg");
  });

  it("clamps the recording window to 60 s", () => {
    expect(clampRecordingMs(8000)).toBe(8000);
    expect(clampRecordingMs(undefined)).toBe(MAX_RECORDING_MS);
    expect(clampRecordingMs(120_000)).toBe(MAX_RECORDING_MS);
    expect(clampRecordingMs(-5)).toBe(MAX_RECORDING_MS);
    expect(clampRecordingMs(Number.NaN)).toBe(MAX_RECORDING_MS);
  });

  it("explains microphone errors", () => {
    expect(microphoneErrorMessage(new DOMException("x", "NotAllowedError"))).toMatch(/permission was denied/);
    expect(microphoneErrorMessage(new DOMException("x", "NotFoundError"))).toMatch(/No microphone/);
  });
});

describe("useAudioRecorder", () => {
  it("records, stops and releases the microphone", async () => {
    const { result } = renderHook(() => useAudioRecorder());
    await act(() => result.current.start());
    expect(result.current.state).toBe("recording");
    expect(isRecording()).toBe(true);

    act(() => recorder().emit(500));
    let audio: Awaited<ReturnType<typeof result.current.stop>> = null;
    await act(async () => {
      audio = await result.current.stop();
    });
    expect(audio).not.toBeNull();
    expect(audio!.filename).toBe("recording.webm");
    expect(audio!.mimeType).toBe("audio/webm;codecs=opus");
    expect(audio!.blob.size).toBe(510);
    expect(result.current.state).toBe("idle");
    expect(tracks.every((track) => track.stopped)).toBe(true);
    expect(isRecording()).toBe(false);
  });

  it("auto-stops at maxDurationMs and hands the clip to the next stop()", async () => {
    const { result } = renderHook(() => useAudioRecorder());
    await act(() => result.current.start({ maxDurationMs: 8000 }));
    act(() => recorder().emit(300));

    await act(async () => {
      vi.advanceTimersByTime(7999);
    });
    expect(result.current.state).toBe("recording");
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.state).toBe("idle");
    expect(tracks[0].stopped).toBe(true);

    let audio: Awaited<ReturnType<typeof result.current.stop>> = null;
    await act(async () => {
      audio = await result.current.stop();
    });
    expect(audio!.blob.size).toBe(310);
    await act(async () => {
      audio = await result.current.stop();
    });
    expect(audio).toBeNull();
  });

  it("auto-stops before the 2 MB limit", async () => {
    const { result } = renderHook(() => useAudioRecorder());
    await act(() => result.current.start());
    await act(async () => recorder().emit(1_950_000));
    expect(result.current.state).toBe("idle");
    expect(tracks[0].stopped).toBe(true);
  });

  it("cancel discards the clip and releases the microphone", async () => {
    const { result } = renderHook(() => useAudioRecorder());
    await act(() => result.current.start());
    act(() => recorder().emit(500));
    act(() => result.current.cancel());
    expect(result.current.state).toBe("idle");
    expect(tracks[0].stopped).toBe(true);
    expect(isRecording()).toBe(false);
    await act(async () => {
      expect(await result.current.stop()).toBeNull();
    });
  });

  it("reports permission denial without throwing", async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    const { result } = renderHook(() => useAudioRecorder());
    await act(() => result.current.start());
    expect(result.current.state).toBe("error");
    expect(result.current.error).toMatch(/permission was denied/);
  });

  it("refuses to record while speech is playing", async () => {
    setSpeechPlaying(true);
    const { result } = renderHook(() => useAudioRecorder());
    await act(() => result.current.start());
    expect(result.current.state).toBe("error");
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("reports an unsupported browser", async () => {
    FakeMediaRecorder.supported = new Set();
    const { result } = renderHook(() => useAudioRecorder());
    await act(() => result.current.start());
    expect(result.current.error).toMatch(/cannot record audio/);
  });

  it("releases the microphone on unmount", async () => {
    const { result, unmount } = renderHook(() => useAudioRecorder());
    await act(() => result.current.start());
    unmount();
    expect(tracks[0].stopped).toBe(true);
    expect(isRecording()).toBe(false);
  });

  it("tracks elapsed time while recording", async () => {
    const { result } = renderHook(() => useAudioRecorder());
    await act(() => result.current.start());
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.elapsedMs).toBeGreaterThan(0);
  });
});
