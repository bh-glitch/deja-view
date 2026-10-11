"""Canonical wire schema for forget-not (owner: Bhavya).

This module is the single source of truth for every JSON request/response.
It is exported to ``contracts/openapi.json`` and generated into
``frontend/src/generated/api-types.ts``. Change it only through Bhavya.

Rules:
- Public JSON is camelCase; Python attributes are snake_case with explicit aliases.
- IDs are UUIDs; timestamps are timezone-aware and serialized as UTC ISO strings.
- This module imports no database, model engine, provider client, or FastAPI code.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated, Any, Generic, Literal, TypeVar
from uuid import UUID

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    PlainSerializer,
    StringConstraints,
    model_validator,
)
from pydantic.alias_generators import to_camel

# ---------------------------------------------------------------------------
# Limits shared by backend and frontend
# ---------------------------------------------------------------------------

EXPECTED_EMBEDDING_DIMENSION = 512
EMBEDDING_NORM_TOLERANCE = 1e-3
MIN_ENROLLMENT_SAMPLES = 3
MAX_ENROLLMENT_SAMPLES = 5
MAX_FRAME_BYTES = 1_000_000
MAX_FRAME_LONGEST_EDGE = 1280
MAX_FACES_PER_FRAME = 8
MAX_AUDIO_BYTES = 2_000_000
MAX_AUDIO_SECONDS = 60
MAX_TRANSCRIPT_CHARS = 20_000
MAX_SPEECH_CHARS = 400
MAX_DISPLAY_NAME_CHARS = 80
MAX_RELATIONSHIP_CHARS = 120
MAX_SUMMARY_CHARS = 500
MAX_CUE_CHARS = 240
MAX_FACTS = 3
MAX_FACT_CHARS = 240
MAX_EVIDENCE_CHARS = 300
REQUEST_ID_HEADER = "X-Request-ID"


# ---------------------------------------------------------------------------
# Field types
# ---------------------------------------------------------------------------


def _to_utc(value: datetime) -> datetime:
    return value.astimezone(UTC)


def _serialize_utc(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


UtcDateTime = Annotated[
    AwareDatetime,
    AfterValidator(_to_utc),
    PlainSerializer(_serialize_utc, return_type=str, when_used="json"),
]


def _blank_to_none(value: Any) -> Any:
    if isinstance(value, str) and not value.strip():
        return None
    return value


DisplayName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_DISPLAY_NAME_CHARS),
]
Relationship = Annotated[
    Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_RELATIONSHIP_CHARS),
    ]
    | None,
    BeforeValidator(_blank_to_none),
]
Transcript = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_TRANSCRIPT_CHARS)
]


def _finite(value: float) -> float:
    if not math.isfinite(value):
        raise ValueError("must be a finite number")
    return value


FiniteFloat = Annotated[float, AfterValidator(_finite)]
Embedding = Annotated[
    list[FiniteFloat],
    Field(min_length=1, max_length=4096, description="L2-normalized face embedding"),
]


# ---------------------------------------------------------------------------
# Base classes
# ---------------------------------------------------------------------------


class WireModel(BaseModel):
    """Base for all wire models: camelCase aliases, unknown fields rejected."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        extra="forbid",
        frozen=True,
        # Responses always include nullable fields, so mark them required in
        # output schemas (request schemas keep them optional).
        json_schema_serialization_defaults_required=True,
    )


# ---------------------------------------------------------------------------
# Errors and envelopes
# ---------------------------------------------------------------------------


class ErrorCode(StrEnum):
    BAD_REQUEST = "BAD_REQUEST"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    NOT_FOUND = "NOT_FOUND"
    METHOD_NOT_ALLOWED = "METHOD_NOT_ALLOWED"
    CONFLICT = "CONFLICT"
    PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE"
    UNSUPPORTED_MEDIA_TYPE = "UNSUPPORTED_MEDIA_TYPE"
    INVALID_IMAGE = "INVALID_IMAGE"
    NO_FACE = "NO_FACE"
    MULTIPLE_FACES = "MULTIPLE_FACES"
    FACE_INADEQUATE = "FACE_INADEQUATE"
    EMBEDDING_INVALID = "EMBEDDING_INVALID"
    MODEL_MISMATCH = "MODEL_MISMATCH"
    ENROLLMENT_INCOHERENT = "ENROLLMENT_INCOHERENT"
    EMPTY_AUDIO = "EMPTY_AUDIO"
    EMPTY_TRANSCRIPT = "EMPTY_TRANSCRIPT"
    AI_OUTPUT_INVALID = "AI_OUTPUT_INVALID"
    PROVIDER_NOT_CONFIGURED = "PROVIDER_NOT_CONFIGURED"
    PROVIDER_RATE_LIMITED = "PROVIDER_RATE_LIMITED"
    PROVIDER_TIMEOUT = "PROVIDER_TIMEOUT"
    PROVIDER_ERROR = "PROVIDER_ERROR"
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"
    STORAGE_ERROR = "STORAGE_ERROR"
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED"
    INTERNAL_ERROR = "INTERNAL_ERROR"


# Frozen HTTP status and retryability for every error code.
ERROR_STATUS: dict[ErrorCode, tuple[int, bool]] = {
    ErrorCode.BAD_REQUEST: (400, False),
    ErrorCode.VALIDATION_ERROR: (422, False),
    ErrorCode.NOT_FOUND: (404, False),
    ErrorCode.METHOD_NOT_ALLOWED: (405, False),
    ErrorCode.CONFLICT: (409, False),
    ErrorCode.PAYLOAD_TOO_LARGE: (413, False),
    ErrorCode.UNSUPPORTED_MEDIA_TYPE: (415, False),
    ErrorCode.INVALID_IMAGE: (422, False),
    ErrorCode.NO_FACE: (422, True),
    ErrorCode.MULTIPLE_FACES: (422, True),
    ErrorCode.FACE_INADEQUATE: (422, True),
    ErrorCode.EMBEDDING_INVALID: (422, False),
    ErrorCode.MODEL_MISMATCH: (409, False),
    ErrorCode.ENROLLMENT_INCOHERENT: (422, True),
    ErrorCode.EMPTY_AUDIO: (422, True),
    ErrorCode.EMPTY_TRANSCRIPT: (422, True),
    ErrorCode.AI_OUTPUT_INVALID: (502, True),
    ErrorCode.PROVIDER_NOT_CONFIGURED: (503, False),
    ErrorCode.PROVIDER_RATE_LIMITED: (429, True),
    ErrorCode.PROVIDER_TIMEOUT: (504, True),
    ErrorCode.PROVIDER_ERROR: (502, True),
    ErrorCode.MODEL_UNAVAILABLE: (503, False),
    ErrorCode.STORAGE_ERROR: (503, True),
    ErrorCode.NOT_IMPLEMENTED: (501, False),
    ErrorCode.INTERNAL_ERROR: (500, True),
}


class ApiError(Exception):
    """Raise anywhere in the backend; main.py converts it to an ErrorEnvelope."""

    def __init__(self, code: ErrorCode, message: str, *, retryable: bool | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code, default_retryable = ERROR_STATUS[code]
        self.retryable = default_retryable if retryable is None else retryable


def not_implemented(feature: str) -> ApiError:
    return ApiError(ErrorCode.NOT_IMPLEMENTED, f"{feature} is not implemented yet.")


class ErrorDetail(WireModel):
    code: ErrorCode
    message: str
    retryable: bool


class ErrorEnvelope(WireModel):
    ok: Literal[False] = False
    error: ErrorDetail
    request_id: str


T = TypeVar("T")


class SuccessEnvelope(WireModel, Generic[T]):
    ok: Literal[True] = True
    data: T
    request_id: str


# ---------------------------------------------------------------------------
# Domain records
# ---------------------------------------------------------------------------


class Person(WireModel):
    id: UUID
    display_name: DisplayName
    relationship: Relationship = None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class FaceModel(WireModel):
    """Exact identity of the embedding model. Vectors are comparable only when equal."""

    pack_name: Literal["buffalo_l"]
    recognition_file: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    recognition_sha256: Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
    dimension: Annotated[int, Field(ge=1, le=4096)]
    normalization: Literal["l2"]


class Box(WireModel):
    """Face box in submitted-image (unmirrored) pixels."""

    x: Annotated[float, Field(ge=0)]
    y: Annotated[float, Field(ge=0)]
    width: Annotated[float, Field(gt=0)]
    height: Annotated[float, Field(gt=0)]


class FaceStatus(StrEnum):
    UNKNOWN = "unknown"
    MATCHED = "matched"


class FaceResult(WireModel):
    """One detected face. ``matched`` means it passed the acceptance rules in this frame
    only; the UI must still require stable consecutive matches before showing a name."""

    status: FaceStatus
    person_id: UUID | None = None
    similarity: Annotated[float, Field(ge=-1, le=1)] | None = Field(
        default=None, description="Cosine similarity; not a probability."
    )
    box: Box

    @model_validator(mode="after")
    def _identity_rules(self) -> FaceResult:
        if self.status == FaceStatus.MATCHED:
            if self.person_id is None or self.similarity is None:
                raise ValueError("matched faces require personId and similarity")
        elif self.person_id is not None or self.similarity is not None:
            raise ValueError("unknown faces must not carry identity")
        return self


class FrameResult(WireModel):
    """All faces in one frame (largest first, at most MAX_FACES_PER_FRAME). An empty
    list means no face. A person is matched to at most one face per frame."""

    faces: Annotated[list[FaceResult], Field(max_length=MAX_FACES_PER_FRAME)]
    frame_width: Annotated[int, Field(gt=0)]
    frame_height: Annotated[int, Field(gt=0)]

    @model_validator(mode="after")
    def _unique_people(self) -> FrameResult:
        ids = [face.person_id for face in self.faces if face.person_id is not None]
        if len(ids) != len(set(ids)):
            raise ValueError("a person can be matched to at most one face per frame")
        return self


class EnrollmentSample(WireModel):
    """Transient sample returned to the browser; persisted only on confirmation."""

    embedding: Embedding
    model: FaceModel
    box: Box
    frame_width: Annotated[int, Field(gt=0)]
    frame_height: Annotated[int, Field(gt=0)]

    @model_validator(mode="after")
    def _dimension_matches(self) -> EnrollmentSample:
        if len(self.embedding) != self.model.dimension:
            raise ValueError("embedding length does not match model dimension")
        return self


class IntroductionIntent(StrEnum):
    INTRODUCTION = "introduction"
    OTHER = "other"


class IntroductionDraft(WireModel):
    intent: IntroductionIntent
    display_name: DisplayName | None = None
    relationship: Relationship = None
    name_evidence: Annotated[str, StringConstraints(max_length=MAX_EVIDENCE_CHARS)] | None = None
    relationship_evidence: (
        Annotated[str, StringConstraints(max_length=MAX_EVIDENCE_CHARS)] | None
    ) = None


class MemoryFact(WireModel):
    text: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_FACT_CHARS)
    ]
    evidence_quote: Annotated[
        str, StringConstraints(min_length=1, max_length=MAX_EVIDENCE_CHARS)
    ] = Field(description="Literal substring of the original transcript.")


class MemoryDraft(WireModel):
    summary: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_SUMMARY_CHARS)
    ]
    cue: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_CUE_CHARS)
    ]
    facts: Annotated[list[MemoryFact], Field(max_length=MAX_FACTS)] = Field(default_factory=list)


class ConversationSource(StrEnum):
    SPEECH = "speech"
    TYPED = "typed"


class Conversation(WireModel):
    id: UUID
    person_id: UUID
    started_at: UtcDateTime
    ended_at: UtcDateTime
    transcript: Transcript
    source: ConversationSource
    memory: MemoryDraft
    reviewed_by_user: Literal[True]
    edited_by_user: bool
    created_at: UtcDateTime


class PersonDetail(WireModel):
    person: Person
    conversations: list[Conversation] = Field(
        description="Newest endedAt first; ties broken by createdAt desc, then id desc."
    )
    latest_cue: Annotated[str, StringConstraints(max_length=MAX_CUE_CHARS)] | None = None


class FaceModelHealth(WireModel):
    ready: bool
    model: FaceModel | None = None
    detail: str | None = None


class DatabaseHealth(WireModel):
    ready: bool
    detail: str | None = None


class CredentialPresence(WireModel):
    """Presence of configured values only; NOT proof the provider accepts them."""

    gemini_api_key: bool
    elevenlabs_api_key: bool
    elevenlabs_voice_id: bool


class Health(WireModel):
    mode: Literal["fixture", "live"]
    database: DatabaseHealth
    vision: FaceModelHealth
    credentials: CredentialPresence


# ---------------------------------------------------------------------------
# Requests and response payloads
# ---------------------------------------------------------------------------


class PeopleList(WireModel):
    people: list[Person]


class CreatePersonRequest(WireModel):
    person_id: UUID = Field(description="Client-allocated; reused on retry for idempotency.")
    display_name: DisplayName
    relationship: Relationship = None
    model: FaceModel
    embeddings: Annotated[
        list[Embedding], Field(min_length=MIN_ENROLLMENT_SAMPLES, max_length=MAX_ENROLLMENT_SAMPLES)
    ]

    @model_validator(mode="after")
    def _dimensions_match(self) -> CreatePersonRequest:
        if any(len(vector) != self.model.dimension for vector in self.embeddings):
            raise ValueError("every embedding must match model.dimension")
        return self


class PersonPayload(WireModel):
    person: Person


class DeletedPerson(WireModel):
    deleted_person_id: UUID


class CreateConversationRequest(WireModel):
    conversation_id: UUID = Field(description="Client-allocated; reused on retry for idempotency.")
    person_id: UUID
    started_at: UtcDateTime
    ended_at: UtcDateTime
    transcript: Transcript
    source: ConversationSource
    memory: MemoryDraft
    reviewed_by_user: Literal[True]
    edited_by_user: bool

    @model_validator(mode="after")
    def _end_after_start(self) -> CreateConversationRequest:
        if self.ended_at < self.started_at:
            raise ValueError("endedAt must be at or after startedAt")
        return self


class ConversationPayload(WireModel):
    conversation: Conversation


class TranscriptPayload(WireModel):
    transcript: Annotated[str, StringConstraints(max_length=MAX_TRANSCRIPT_CHARS)]


class TranscriptRequest(WireModel):
    transcript: Transcript


class MemoryRequest(WireModel):
    """Conversation transcript plus the confirmed name of the person it was with, so the
    draft can say "Bhavya …" instead of "the speaker"."""

    transcript: Transcript
    person_name: DisplayName | None = None


class SpeakRequest(WireModel):
    text: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_SPEECH_CHARS)
    ]


# Concrete envelopes (named for readable OpenAPI/TypeScript output).
class HealthResponse(SuccessEnvelope[Health]): ...


class PeopleListResponse(SuccessEnvelope[PeopleList]): ...


class PersonResponse(SuccessEnvelope[PersonPayload]): ...


class PersonDetailResponse(SuccessEnvelope[PersonDetail]): ...


class DeletedPersonResponse(SuccessEnvelope[DeletedPerson]): ...


class ConversationResponse(SuccessEnvelope[ConversationPayload]): ...


class FrameResultResponse(SuccessEnvelope[FrameResult]): ...


class EnrollmentSampleResponse(SuccessEnvelope[EnrollmentSample]): ...


class TranscriptResponse(SuccessEnvelope[TranscriptPayload]): ...


class IntroductionDraftResponse(SuccessEnvelope[IntroductionDraft]): ...


class MemoryDraftResponse(SuccessEnvelope[MemoryDraft]): ...
