/**
 * Typed client for the FastAPI backend (owner: Ishan; shared helpers frozen by Bhavya).
 *
 * All requests use relative /api URLs; next.config.ts rewrites them to FastAPI.
 * Types come only from the generated contract — never redeclare wire shapes.
 */
import type { components } from "@/generated/api-types";

export type Schemas = components["schemas"];
export type Person = Schemas["Person"];
export type PersonDetail = Schemas["PersonDetail"];
export type Conversation = Schemas["Conversation"];
export type FaceModel = Schemas["FaceModel"];
export type Box = Schemas["Box"];
export type FrameResult = Schemas["FrameResult"];
export type FrameStatus = Schemas["FrameStatus"];
export type EnrollmentSample = Schemas["EnrollmentSample"];
export type IntroductionDraft = Schemas["IntroductionDraft"];
export type MemoryDraft = Schemas["MemoryDraft-Output"];
export type MemoryDraftInput = Schemas["MemoryDraft-Input"];
export type MemoryFact = Schemas["MemoryFact"];
export type Health = Schemas["Health"];
export type CreatePersonRequest = Schemas["CreatePersonRequest"];
export type CreateConversationRequest = Schemas["CreateConversationRequest"];
export type ServerErrorCode = Schemas["ErrorCode"];

/** Client-side failures that never reach the server's error envelope. */
export type ClientErrorCode = "NETWORK_ERROR" | "INVALID_RESPONSE";

export class ApiClientError extends Error {
  constructor(
    readonly code: ServerErrorCode | ClientErrorCode,
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export const REQUEST_ID_HEADER = "X-Request-ID";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Turn a non-success Response into an ApiClientError (parses the error envelope). */
export async function errorFromResponse(response: Response): Promise<ApiClientError> {
  const headerId = response.headers.get(REQUEST_ID_HEADER);
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // fall through to INVALID_RESPONSE
  }
  if (isRecord(body) && body.ok === false && isRecord(body.error)) {
    const error = body.error;
    return new ApiClientError(
      String(error.code) as ServerErrorCode,
      String(error.message),
      response.status,
      Boolean(error.retryable),
      typeof body.requestId === "string" ? body.requestId : headerId,
    );
  }
  return new ApiClientError(
    "INVALID_RESPONSE",
    `Unexpected ${response.status} response from backend.`,
    response.status,
    response.status >= 500,
    headerId,
  );
}

/** Low-level fetch that resolves a raw Response or throws ApiClientError.
 * AbortError from a cancelled signal is re-thrown unchanged so callers can ignore it. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiClientError("NETWORK_ERROR", "Backend is unreachable.", null, true, null);
  }
  if (!response.ok) throw await errorFromResponse(response);
  return response;
}

/** Fetch a JSON success envelope and return its `data`. */
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiClientError("INVALID_RESPONSE", "Backend returned non-JSON.", response.status, false, null);
  }
  if (!isRecord(body) || body.ok !== true || !("data" in body)) {
    throw new ApiClientError("INVALID_RESPONSE", "Backend returned an unexpected envelope.", response.status, false, null);
  }
  return body.data as T;
}

function jsonInit(method: string, payload: unknown, signal?: AbortSignal): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  };
}

export function getHealth(signal?: AbortSignal): Promise<Health> {
  return apiJson<Health>("/health", { signal });
}

export async function listPeople(signal?: AbortSignal): Promise<Person[]> {
  return (await apiJson<Schemas["PeopleList"]>("/people", { signal })).people;
}

export async function createPerson(request: CreatePersonRequest, signal?: AbortSignal): Promise<Person> {
  return (await apiJson<Schemas["PersonPayload"]>("/people", jsonInit("POST", request, signal))).person;
}

export function getPerson(personId: string, signal?: AbortSignal): Promise<PersonDetail> {
  return apiJson<PersonDetail>(`/people/${encodeURIComponent(personId)}`, { signal });
}

export async function deletePerson(personId: string, signal?: AbortSignal): Promise<string> {
  const data = await apiJson<Schemas["DeletedPerson"]>(`/people/${encodeURIComponent(personId)}`, {
    method: "DELETE",
    signal,
  });
  return data.deletedPersonId;
}

export async function createConversation(
  request: CreateConversationRequest,
  signal?: AbortSignal,
): Promise<Conversation> {
  return (await apiJson<Schemas["ConversationPayload"]>("/conversations", jsonInit("POST", request, signal)))
    .conversation;
}

export function draftIntroduction(transcript: string, signal?: AbortSignal): Promise<IntroductionDraft> {
  return apiJson<IntroductionDraft>("/ai/introduction", jsonInit("POST", { transcript }, signal));
}

export function draftMemory(transcript: string, signal?: AbortSignal): Promise<MemoryDraft> {
  return apiJson<MemoryDraft>("/ai/memory", jsonInit("POST", { transcript }, signal));
}
