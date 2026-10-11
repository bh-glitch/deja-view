import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationPanel } from "@/components/ConversationPanel";
import { IdentityCard } from "@/components/IdentityCard";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useConversationMemory } from "@/hooks/useConversationMemory";
import { ApiClientError, type MemoryDraft, type Person } from "@/lib/api-client";

const mocks = vi.hoisted(() => ({
  transcribeAudio: vi.fn(),
  draftMemory: vi.fn(),
  createConversation: vi.fn(),
}));

vi.mock("@/lib/audio/speech-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/audio/speech-client")>()),
  transcribeAudio: mocks.transcribeAudio,
}));
const LOCAL = { kind: "local" as const, model: "qwen3.5:4b-q4_K_M", label: "local AI (qwen3.5:4b, on this laptop)" };
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  createConversation: mocks.createConversation,
}));
vi.mock("@/lib/audio/ai-drafts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/audio/ai-drafts")>()),
  draftMemoryWithProvider: async (transcript: string, personName: string | null, signal?: AbortSignal) => ({
    draft: await mocks.draftMemory(transcript, personName, signal),
    provider: LOCAL,
  }),
}));

class FakeMediaRecorder {
  static isTypeSupported = (type: string) => type === "audio/webm;codecs=opus";
  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_stream: unknown, options: { mimeType: string }) {
    this.mimeType = options.mimeType;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array(900)], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const person: Person = {
  id: "7d6c2a8e-5a8b-4d2c-9c8e-1f0a2b3c4d5e",
  displayName: "Demo Alex",
  relationship: "neighbor",
  createdAt: "2026-10-10T10:00:00Z",
  updatedAt: "2026-10-10T10:00:00Z",
};

const draft: MemoryDraft = {
  summary: "You talked about hiking and guitar.",
  cue: "Last time you talked about the Demo Ridge hike. You both play guitar.",
  facts: [{ text: "Hiked Demo Ridge", evidenceQuote: "we did the Demo Ridge trail" }],
};

const TRANSCRIPT = "It was great, we did the Demo Ridge trail. I play guitar too.";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) },
    configurable: true,
  });
  mocks.transcribeAudio.mockReset().mockResolvedValue(TRANSCRIPT);
  mocks.draftMemory.mockReset().mockResolvedValue(draft);
  mocks.createConversation.mockReset().mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function recordAndStop(result: { current: ReturnType<typeof useConversationMemory> }) {
  await act(() => result.current.start(person));
  await act(async () => {
    vi.advanceTimersByTime(5000);
    result.current.stop();
  });
  await flush();
}

describe("useConversationMemory", () => {
  it("records, transcribes, drafts and waits for review before saving", async () => {
    const onSaved = vi.fn();
    const { result } = renderHook(() => useConversationMemory(onSaved));
    await recordAndStop(result);

    expect(mocks.transcribeAudio).toHaveBeenCalledTimes(1);
    // The draft is told who the conversation was with, so it can use their name.
    expect(mocks.draftMemory).toHaveBeenCalledWith(TRANSCRIPT, expect.any(String), expect.any(AbortSignal));
    expect(result.current.state).toMatchObject({ kind: "review", person: { id: person.id } });
    expect(mocks.createConversation).not.toHaveBeenCalled();

    await act(() => result.current.save({ summary: draft.summary, cue: draft.cue }));
    expect(mocks.createConversation).toHaveBeenCalledTimes(1);
    const request = mocks.createConversation.mock.calls[0][0];
    expect(request).toMatchObject({
      personId: person.id,
      transcript: TRANSCRIPT,
      source: "speech",
      memory: { summary: draft.summary, cue: draft.cue, facts: draft.facts },
      reviewedByUser: true,
      editedByUser: false,
    });
    expect(Date.parse(request.endedAt)).toBeGreaterThanOrEqual(Date.parse(request.startedAt));
    expect(result.current.state).toMatchObject({ kind: "saved", cue: draft.cue });
    expect(onSaved).toHaveBeenCalledWith(person.id);
  });

  it("auto-stops at 60 s", async () => {
    const { result } = renderHook(() => useConversationMemory(vi.fn()));
    await act(() => result.current.start(person));
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flush();
    expect(result.current.state.kind).toBe("review");
  });

  it("marks edits and keeps the same conversationId when a save is retried", async () => {
    mocks.createConversation
      .mockRejectedValueOnce(new ApiClientError("STORAGE_ERROR", "Database busy.", 503, true, null))
      .mockResolvedValueOnce({});
    const { result } = renderHook(() => useConversationMemory(vi.fn()));
    await recordAndStop(result);

    const edited = { summary: draft.summary, cue: "She hiked Demo Ridge; ask about guitar." };
    await act(() => result.current.save(edited));
    expect(result.current.state).toMatchObject({ kind: "review", error: "Database busy." });
    await act(() => result.current.save(edited));

    const [first, second] = mocks.createConversation.mock.calls.map((call) => call[0]);
    expect(first.conversationId).toBe(second.conversationId);
    expect(second.editedByUser).toBe(true);
    expect(second.memory.cue).toBe(edited.cue);
    expect(second.memory.facts).toEqual(draft.facts);
  });

  it("does not invent a memory when nothing memorable was said", async () => {
    mocks.draftMemory.mockRejectedValue(
      new ApiClientError("EMPTY_TRANSCRIPT", "Nothing memorable was heard. Record again or type a note.", 422, true, null),
    );
    const { result } = renderHook(() => useConversationMemory(vi.fn()));
    await recordAndStop(result);
    expect(result.current.state).toMatchObject({ kind: "failed", canRetryDraft: false });
    expect((result.current.state as { message: string }).message).toMatch(/Nothing memorable/);
  });

  it("retries only the draft after a provider failure", async () => {
    mocks.draftMemory
      .mockRejectedValueOnce(new ApiClientError("PROVIDER_ERROR", "overloaded", 502, true, null))
      .mockResolvedValueOnce(draft);
    const { result } = renderHook(() => useConversationMemory(vi.fn()));
    await recordAndStop(result);
    expect(result.current.state).toMatchObject({ kind: "failed", canRetryDraft: true });
    await act(async () => {
      result.current.retryDraft();
    });
    await flush();
    expect(result.current.state.kind).toBe("review");
    expect(mocks.transcribeAudio).toHaveBeenCalledTimes(1);
  });

  it("discard stores nothing", async () => {
    const { result } = renderHook(() => useConversationMemory(vi.fn()));
    await recordAndStop(result);
    act(() => result.current.discard());
    expect(result.current.state.kind).toBe("idle");
    expect(mocks.createConversation).not.toHaveBeenCalled();
  });

  it("refuses a second recording while one is running", async () => {
    const conversation = renderHook(() => useConversationMemory(vi.fn()));
    const other = renderHook(() => useAudioRecorder());
    await act(() => conversation.result.current.start(person));
    await act(() => other.result.current.start());
    expect(other.result.current.state).toBe("error");
    expect(other.result.current.error).toMatch(/already in progress/);
  });
});

describe("ConversationPanel and IdentityCard", () => {
  it("lets the user edit the reminder before saving", () => {
    const onSave = vi.fn();
    render(
      <ConversationPanel
        state={{ kind: "review", person, transcript: TRANSCRIPT, draft, provider: LOCAL, saving: false, error: null }}
        onStop={vi.fn()}
        onRetryDraft={vi.fn()}
        onSave={onSave}
        onDiscard={vi.fn()}
      />,
    );
    // Shows the bullets to be saved, without raw transcript quotes or model names.
    const highlights = screen.getByRole("list", { name: "Highlights" });
    expect(highlights.textContent).toContain(draft.facts[0].text);
    expect(document.body.textContent).not.toContain(draft.facts[0].evidenceQuote);
    expect(document.body.textContent).not.toMatch(/qwen|Drafted by/);
    fireEvent.change(screen.getByLabelText("Reminder"), { target: { value: "Ask about guitar." } });
    fireEvent.click(screen.getByRole("button", { name: "Save memory" }));
    expect(onSave).toHaveBeenCalledWith({ summary: draft.summary, cue: "Ask about guitar." });
  });

  it("shows the recording timer with Stop", () => {
    const onStop = vi.fn();
    render(
      <ConversationPanel
        state={{ kind: "recording", person, elapsedMs: 12_400, limitMs: 60_000 }}
        onStop={onStop}
        onRetryDraft={vi.fn()}
        onSave={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText(/Recording… 12s \/ 60s/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop & summarize" }));
    expect(onStop).toHaveBeenCalled();
  });

  it("offers Record conversation only for a recognized person", () => {
    const onRecord = vi.fn();
    const { rerender } = render(
      <IdentityCard view={{ kind: "recognized", people: [person], otherFaces: 0 }} onRecordConversation={onRecord} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Record conversation/ }));
    expect(onRecord).toHaveBeenCalledWith(person);
    rerender(<IdentityCard view={{ kind: "unknown", faces: 1 }} onRecordConversation={onRecord} />);
    expect(screen.queryByRole("button", { name: /Record conversation/ })).toBeNull();
  });
});

describe("memoryBullets", () => {
  it("shows at most three facts, or the reminder when there are none", async () => {
    const { memoryBullets } = await import("@/components/ConversationDrawer");
    const fact = (text: string) => ({ text, evidenceQuote: text });
    expect(memoryBullets({ summary: "s", cue: "c", facts: [fact("a"), fact("b"), fact("c"), fact("d")] })).toEqual(["a", "b", "c"]);
    expect(memoryBullets({ summary: "s", cue: "Ask Maya about pottery.", facts: [] })).toEqual(["Ask Maya about pottery."]);
  });
});
