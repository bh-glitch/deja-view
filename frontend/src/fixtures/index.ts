/**
 * SYNTHETIC fixtures for UI development and tests (owner: Ishan).
 * Sourced from the shared contracts/examples files validated by the backend.
 * Fixture data never counts as live validation.
 */
import type { Schemas } from "@/lib/api-client";
import healthFixture from "../../../contracts/examples/HealthResponse.fixture.json";
import peopleList from "../../../contracts/examples/PeopleListResponse.two-people.json";
import detailWithHistory from "../../../contracts/examples/PersonDetailResponse.with-history.json";
import detailNoHistory from "../../../contracts/examples/PersonDetailResponse.no-history.json";
import frameMatched from "../../../contracts/examples/FrameResultResponse.matched.json";
import frameUnknown from "../../../contracts/examples/FrameResultResponse.unknown.json";
import frameNoFace from "../../../contracts/examples/FrameResultResponse.no-face.json";
import frameMultiple from "../../../contracts/examples/FrameResultResponse.multiple-faces.json";
import introduction from "../../../contracts/examples/IntroductionDraftResponse.introduction.json";
import memoryDraft from "../../../contracts/examples/MemoryDraftResponse.draft.json";
import notImplemented from "../../../contracts/examples/ErrorEnvelope.not-implemented.json";

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
