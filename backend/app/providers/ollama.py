"""Local structured generation through Ollama's REST API (owner: Vansh).

Human decision 2026-10-10 (Vansh): the free Gemini key kept hitting its quota, so AI
drafts run on a local model (default qwen3.5:4b-q4_K_M) with no rate limit, and the
transcript never leaves the laptop. Same contract as gemini.generate_structured:
JSON-schema output, untrusted-transcript fencing, at most one repair, sanitized errors.

The model must be a GGUF build (e.g. ``*-q4_K_M``): Ollama's MLX builds (nvfp4/mlx tags)
answer "structured output is unavailable".
"""

from __future__ import annotations

import json
import logging
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.config import Settings
from app.contracts import ApiError, ErrorCode
from app.providers.prompting import REPAIR_REQUEST, system_prompt, wrap_transcript

logger = logging.getLogger(__name__)

ModelT = TypeVar("ModelT", bound=BaseModel)

# First call loads the model into memory (several seconds); later calls take ~3-12 s
# on an M3 (measured 2026-10-10, see docs/provider-validation.md).
TIMEOUT = httpx.Timeout(90.0, connect=5.0)
KEEP_ALIVE = "30m"

# Tests replace this with httpx.MockTransport; None means the real local server.
_transport: httpx.AsyncBaseTransport | None = None


def _error_for(response: httpx.Response, model: str) -> ApiError:
    try:
        detail = str(response.json().get("error", ""))
    except ValueError:
        detail = ""
    logger.warning("Ollama call failed: HTTP %s %s", response.status_code, detail[:120])
    if response.status_code == 404:
        return ApiError(
            ErrorCode.PROVIDER_ERROR,
            f"The local AI model is not downloaded. Run: ollama pull {model}",
            retryable=False,
        )
    if "structured output" in detail:
        return ApiError(
            ErrorCode.PROVIDER_ERROR,
            f"The local model {model} cannot produce structured output; use a *-q4_K_M build.",
            retryable=False,
        )
    return ApiError(ErrorCode.PROVIDER_ERROR, "The local AI failed; try again.")


async def generate_structured(
    settings: Settings, system_instruction: str, transcript: str, schema: type[ModelT]
) -> ModelT:
    """Return output validated as ``schema``; at most one bounded repair attempt.

    Raises ApiError(AI_OUTPUT_INVALID) or a PROVIDER_* error.
    """
    model = settings.ollama_model
    messages = [
        {"role": "system", "content": system_prompt(system_instruction)},
        {"role": "user", "content": wrap_transcript(transcript)},
    ]
    async with httpx.AsyncClient(
        base_url=settings.ollama_url, timeout=TIMEOUT, transport=_transport
    ) as client:
        for attempt in range(2):  # first try + at most one repair
            body = {
                "model": model,
                "messages": messages,
                "format": schema.model_json_schema(),
                "stream": False,
                "think": False,
                "keep_alive": KEEP_ALIVE,
                "options": {"temperature": 0},
            }
            try:
                response = await client.post("/api/chat", json=body)
            except httpx.TimeoutException as exc:
                raise ApiError(
                    ErrorCode.PROVIDER_TIMEOUT, "The local AI took too long; try again."
                ) from exc
            except httpx.ConnectError as exc:
                raise ApiError(
                    ErrorCode.PROVIDER_ERROR,
                    "The local AI (Ollama) is not running. Start it with: ollama serve",
                ) from exc
            except httpx.HTTPError as exc:
                raise ApiError(ErrorCode.PROVIDER_ERROR, "Could not reach the local AI.") from exc
            if response.status_code != 200:
                raise _error_for(response, model)

            try:
                content = response.json()["message"]["content"]
                return schema.model_validate(json.loads(content))
            except (ValueError, KeyError, TypeError, ValidationError) as exc:
                logger.warning(
                    "Ollama output invalid (attempt %d): %s", attempt + 1, type(exc).__name__
                )
                previous = ""
                try:
                    previous = str(response.json()["message"]["content"])
                except (ValueError, KeyError, TypeError):
                    pass
                messages = [
                    *messages,
                    {"role": "assistant", "content": previous},
                    {"role": "user", "content": REPAIR_REQUEST},
                ]
    raise ApiError(
        ErrorCode.AI_OUTPUT_INVALID,
        "The AI returned an unusable draft; try again or type it in.",
    )
