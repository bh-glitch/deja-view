import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientError, getHealth, listPeople } from "@/lib/api-client";
import { speakText } from "@/lib/audio/speech-client";
import { fixtures } from "@/fixtures";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("api-client", () => {
  it("returns envelope data and calls the relative proxy URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(fixtures.health));
    vi.stubGlobal("fetch", fetchMock);
    const health = await getHealth();
    expect(health.mode).toBe("fixture");
    expect(fetchMock).toHaveBeenCalledWith("/api/health", expect.anything());
  });

  it("throws ApiClientError carrying the server error code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(fixtures.errorNotImplemented, 501)));
    const error = await listPeople().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ code: "NOT_IMPLEMENTED", status: 501, retryable: false });
  });

  it("maps network failures to NETWORK_ERROR", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(getHealth()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("rejects a 200 response without a success envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ hello: "world" })));
    await expect(getHealth()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects non-MP3 speech responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: true })));
    await expect(speakText("hi")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
