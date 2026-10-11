import { afterEach, describe, expect, it, vi } from "vitest";

import { draftIntroductionWithProvider, parseAiProvider } from "@/lib/audio/ai-drafts";

afterEach(() => vi.unstubAllGlobals());

describe("parseAiProvider", () => {
  it("labels the local model", () => {
    expect(parseAiProvider("ollama:qwen3.5:4b-q4_K_M")).toEqual({
      kind: "local",
      model: "qwen3.5:4b-q4_K_M",
      label: "local AI (qwen3.5:4b, on this laptop)",
    });
  });

  it("labels Gemini", () => {
    expect(parseAiProvider("gemini:gemini-3.8-flash").label).toBe("Gemini (gemini-3.8-flash)");
  });

  it("handles a missing header", () => {
    expect(parseAiProvider(null).kind).toBe("unknown");
  });
});

describe("draftIntroductionWithProvider", () => {
  it("returns the draft and the provider from the header", async () => {
    const draft = { intent: "other", displayName: null, relationship: null, nameEvidence: null, relationshipEvidence: null };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, data: draft, requestId: "r1" }), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-AI-Provider": "ollama:qwen3.5:4b-q4_K_M" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await draftIntroductionWithProvider("Hello there");
    expect(result.draft).toEqual(draft);
    expect(result.provider.kind).toBe("local");
    expect(fetchMock).toHaveBeenCalledWith("/api/ai/introduction", expect.objectContaining({ method: "POST" }));
  });

  it("raises the server's error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ ok: false, error: { code: "PROVIDER_ERROR", message: "The local AI failed; try again.", retryable: true }, requestId: "r2" }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    await expect(draftIntroductionWithProvider("Hi")).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });
});

describe("parseAiProvider (Claude)", () => {
  it("labels the Claude API", async () => {
    const { parseAiProvider } = await import("@/lib/audio/ai-drafts");
    expect(parseAiProvider("anthropic:claude-haiku-5-5")).toEqual({
      kind: "claude",
      model: "claude-haiku-5-5",
      label: "Claude (claude-haiku-5-5)",
    });
  });
});
