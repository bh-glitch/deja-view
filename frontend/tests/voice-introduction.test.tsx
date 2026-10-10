import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EnrollmentCard, type EnrollmentVoiceProps } from "@/components/EnrollmentCard";
import { INTRODUCTION_WINDOW_MS, useVoiceIntroduction, type VoiceIntroductionState } from "@/hooks/useVoiceIntroduction";
import { ApiClientError, type IntroductionDraft } from "@/lib/api-client";

const mocks = vi.hoisted(() => ({
  transcribeAudio: vi.fn(),
  draftIntroduction: vi.fn(),
}));

vi.mock("@/lib/audio/speech-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/audio/speech-client")>()),
  transcribeAudio: mocks.transcribeAudio,
}));
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  draftIntroduction: mocks.draftIntroduction,
}));

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = (type: string) => type === "audio/webm;codecs=opus";
  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_stream: unknown, options: { mimeType: string }) {
    this.mimeType = options.mimeType;
    FakeMediaRecorder.instances.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array(400)], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const introduction: IntroductionDraft = {
  intent: "introduction",
  displayName: "Demo Alex",
  relationship: "Sam's cousin",
  nameEvidence: "I'm Demo Alex",
  relationshipEvidence: "Sam's cousin",
};

beforeEach(() => {
  vi.useFakeTimers();
  FakeMediaRecorder.instances = [];
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) },
    configurable: true,
  });
  mocks.transcribeAudio.mockReset();
  mocks.draftIntroduction.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function flush() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("useVoiceIntroduction", () => {
  it("listens 8 s, auto-stops, transcribes and drafts the introduction", async () => {
    mocks.transcribeAudio.mockResolvedValue("Hi, I'm Demo Alex, Sam's cousin.");
    mocks.draftIntroduction.mockResolvedValue(introduction);
    const { result } = renderHook(() => useVoiceIntroduction());

    await act(() => result.current.listen());
    expect(result.current.state.kind).toBe("listening");

    await act(async () => {
      vi.advanceTimersByTime(INTRODUCTION_WINDOW_MS);
    });
    await flush();

    expect(mocks.transcribeAudio).toHaveBeenCalledTimes(1);
    const [blob, filename] = mocks.transcribeAudio.mock.calls[0];
    expect((blob as Blob).size).toBe(400);
    expect(filename).toBe("recording.webm");
    expect(mocks.draftIntroduction).toHaveBeenCalledWith("Hi, I'm Demo Alex, Sam's cousin.", expect.any(AbortSignal));
    expect(result.current.state).toMatchObject({ kind: "heard", draft: { displayName: "Demo Alex" } });
  });

  it("Done stops early and processes once", async () => {
    mocks.transcribeAudio.mockResolvedValue("Call me Demo Alex.");
    mocks.draftIntroduction.mockResolvedValue({ ...introduction, relationship: null, relationshipEvidence: null });
    const { result } = renderHook(() => useVoiceIntroduction());
    await act(() => result.current.listen());
    await act(async () => {
      vi.advanceTimersByTime(2000);
      result.current.finish();
    });
    await flush();
    expect(mocks.transcribeAudio).toHaveBeenCalledTimes(1);
    expect(result.current.state.kind).toBe("heard");
  });

  it("reports no name when Gemini finds no self-introduction", async () => {
    mocks.transcribeAudio.mockResolvedValue("This is my friend Sam.");
    mocks.draftIntroduction.mockResolvedValue({
      intent: "other",
      displayName: null,
      relationship: null,
      nameEvidence: null,
      relationshipEvidence: null,
    });
    const { result } = renderHook(() => useVoiceIntroduction());
    await act(() => result.current.listen());
    await act(async () => {
      result.current.finish();
    });
    await flush();
    expect(result.current.state).toMatchObject({ kind: "no-name", transcript: "This is my friend Sam." });
  });

  it("treats an empty transcript as nothing heard, without calling Gemini", async () => {
    mocks.transcribeAudio.mockRejectedValue(new ApiClientError("EMPTY_TRANSCRIPT", "No speech", 422, true, null));
    const { result } = renderHook(() => useVoiceIntroduction());
    await act(() => result.current.listen());
    await act(async () => {
      result.current.finish();
    });
    await flush();
    expect(result.current.state).toMatchObject({ kind: "no-name", transcript: null });
    expect(mocks.draftIntroduction).not.toHaveBeenCalled();
  });

  it("explains a rate limit", async () => {
    mocks.transcribeAudio.mockResolvedValue("Hi, I'm Demo Alex.");
    mocks.draftIntroduction.mockRejectedValue(new ApiClientError("PROVIDER_RATE_LIMITED", "busy", 429, true, null));
    const { result } = renderHook(() => useVoiceIntroduction());
    await act(() => result.current.listen());
    await act(async () => {
      result.current.finish();
    });
    await flush();
    expect(result.current.state).toMatchObject({ kind: "error" });
    expect((result.current.state as { message: string }).message).toMatch(/busy/);
  });

  it("cancel discards the recording without any requests", async () => {
    const { result } = renderHook(() => useVoiceIntroduction());
    await act(() => result.current.listen());
    act(() => result.current.cancel());
    await act(async () => {
      vi.advanceTimersByTime(INTRODUCTION_WINDOW_MS);
    });
    await flush();
    expect(result.current.state.kind).toBe("idle");
    expect(mocks.transcribeAudio).not.toHaveBeenCalled();
  });
});

describe("EnrollmentCard with voice", () => {
  const naming = { kind: "naming" as const, previewUrl: null, saving: false, error: null };
  const voiceProps = (state: VoiceIntroductionState): EnrollmentVoiceProps => ({
    state,
    autoListen: true,
    onAutoListenChange: vi.fn(),
    onListen: vi.fn(),
    onFinish: vi.fn(),
    onCancel: vi.fn(),
  });

  it("prefills the heard name and relationship, and saves only on tap", () => {
    const onSave = vi.fn();
    render(
      <EnrollmentCard
        state={naming}
        onSave={onSave}
        onDismiss={vi.fn()}
        voice={voiceProps({ kind: "heard", transcript: "Hi, I'm Demo Alex, Sam's cousin.", draft: introduction })}
      />,
    );
    expect(screen.getByRole("heading").textContent).toBe("Save Demo Alex?");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Demo Alex");
    expect((screen.getByLabelText("Relationship (optional)") as HTMLInputElement).value).toBe("Sam's cousin");
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save Demo Alex" }));
    expect(onSave).toHaveBeenCalledWith("Demo Alex", "Sam's cousin");
  });

  it("lets the user correct the heard name", () => {
    const onSave = vi.fn();
    render(
      <EnrollmentCard
        state={naming}
        onSave={onSave}
        onDismiss={vi.fn()}
        voice={voiceProps({ kind: "heard", transcript: "I'm Demo Alex", draft: introduction })}
      />,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Demo Alexa" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Demo Alexa" }));
    expect(onSave).toHaveBeenCalledWith("Demo Alexa", "Sam's cousin");
  });

  it("shows the listening indicator with Done/Cancel and blocks Save", () => {
    const voice = voiceProps({ kind: "listening", elapsedMs: 3200, limitMs: 8000 });
    render(<EnrollmentCard state={naming} onSave={vi.fn()} onDismiss={vi.fn()} voice={voice} />);
    expect(screen.getByText(/Listening for an introduction… 3s \/ 8s/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(voice.onFinish).toHaveBeenCalled();
    expect(voice.onCancel).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
  });

  it("offers Listen again when no name was heard, and discloses the providers", () => {
    const voice = voiceProps({ kind: "no-name", transcript: "Hello there", message: "Didn't catch a name. Listen again or type it." });
    render(<EnrollmentCard state={naming} onSave={vi.fn()} onDismiss={vi.fn()} voice={voice} />);
    expect(screen.getByText(/Didn't catch a name/)).toBeTruthy();
    expect(screen.getByText(/sent to ElevenLabs/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Listen again/ }));
    expect(voice.onListen).toHaveBeenCalled();
  });

  it("toggles auto-listen", () => {
    const voice = voiceProps({ kind: "idle" });
    render(<EnrollmentCard state={naming} onSave={vi.fn()} onDismiss={vi.fn()} voice={voice} />);
    fireEvent.click(screen.getByLabelText("Auto-listen for introductions"));
    expect(voice.onAutoListenChange).toHaveBeenCalledWith(false);
  });
});
