/**
 * SYNTHETIC fixtures for UI development and tests (owner: Ishan).
 * Copies of the shared contracts/examples files validated by the backend, kept inside
 * the Turbopack root so app code can import them; tests/fixtures-sync.test.ts checks they match.
 * Fixture data never counts as live validation.
 */
import type { Schemas } from "@/lib/api-client";
import healthFixture from "./examples/HealthResponse.fixture.json";
import peopleList from "./examples/PeopleListResponse.two-people.json";
import detailWithHistory from "./examples/PersonDetailResponse.with-history.json";
import detailNoHistory from "./examples/PersonDetailResponse.no-history.json";
import frameMatched from "./examples/FrameResultResponse.matched.json";
import frameUnknown from "./examples/FrameResultResponse.unknown.json";
import frameNoFace from "./examples/FrameResultResponse.no-face.json";
import frameMultiple from "./examples/FrameResultResponse.multiple-faces.json";
import introduction from "./examples/IntroductionDraftResponse.introduction.json";
import memoryDraft from "./examples/MemoryDraftResponse.draft.json";
import notImplemented from "./examples/ErrorEnvelope.not-implemented.json";

export const fixtures = {
  health: healthFixture as Schemas["HealthResponse"],
  peopleList: peopleList as Schemas["PeopleListResponse"],
  personDetailWithHistory: detailWithHistory as Schemas["PersonDetailResponse"],
  personDetailNoHistory: detailNoHistory as Schemas["PersonDetailResponse"],
  frameMatched: frameMatched as Schemas["FrameResultResponse"],
  frameUnknown: frameUnknown as Schemas["FrameResultResponse"],
  frameNoFace: frameNoFace as Schemas["FrameResultResponse"],
  frameMultipleFaces: frameMultiple as Schemas["FrameResultResponse"],
  introductionDraft: introduction as Schemas["IntroductionDraftResponse"],
  memoryDraft: memoryDraft as Schemas["MemoryDraftResponse"],
  errorNotImplemented: notImplemented as Schemas["ErrorEnvelope"],
} as const;
