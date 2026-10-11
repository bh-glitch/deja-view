"""Claude API structured generation (Bhavya, human decision 2026-10-10).

The local model was slow (~12 s per draft) and missed relationships, so AI drafts can run
on the Claude API (default ``claude-haiku-5-5``, the team's choice: fastest and cheapest).
Same contract as the Gemini/Ollama providers: untrusted-transcript fencing, output
validated against the Pydantic schema, sanitized errors. Only transcript text is sent;
face images never are.
"""

from __future__ import annotations

import logging
from typing import TypeVar

import anthropic
from pydantic import BaseModel

from app.config import Settings
from app.contracts import ApiError, ErrorCode
from app.providers.prompting import system_prompt, wrap_transcript

logger = logging.getLogger(__name__)

ModelT = TypeVar("ModelT", bound=BaseModel)

TIMEOUT_SECONDS = 30.0
MAX_OUTPUT_TOKENS = 1024  # our largest draft (memory) is a few hundred tokens
MAX_RETRIES = 1  # the SDK retries 429/5xx/connection errors once, then the UI offers Try again


def _client(settings: Settings) -> anthropic.AsyncAnthropic:
    # Explicit key: backend/.env is read by Settings, not exported to os.environ.
    return anthropic.AsyncAnthropic(
        api_key=settings.anthropic_api_key, timeout=TIMEOUT_SECONDS, max_retries=MAX_RETRIES
    )


async def generate_structured(
    settings: Settings, system_instruction: str, transcript: str, schema: type[ModelT]
) -> ModelT:
    """Return output validated as ``schema``. Raises AI_OUTPUT_INVALID or a PROVIDER_* error."""
    if not settings.anthropic_api_key:
        raise ApiError(ErrorCode.PROVIDER_NOT_CONFIGURED, "Claude API key is not configured.")
    try:
        async with _client(settings) as client:
            response = await client.messages.parse(
                model=settings.anthropic_model,
                max_tokens=MAX_OUTPUT_TOKENS,
                # Short extraction tasks: thinking off keeps answers fast.
                thinking={"type": "disabled"},
                system=system_prompt(system_instruction),
                messages=[{"role": "user", "content": wrap_transcript(transcript)}],
                output_format=schema,
            )
    except anthropic.RateLimitError as exc:
        raise ApiError(
            ErrorCode.PROVIDER_RATE_LIMITED, "Claude is busy right now; press Try again."
        ) from exc
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as exc:
        raise ApiError(
            ErrorCode.PROVIDER_ERROR,
            "Claude rejected the API key. Check ANTHROPIC_API_KEY and its credit balance.",
            retryable=False,
        ) from exc
    except anthropic.BadRequestError as exc:
        logger.warning("Claude rejected the request: %s", exc.message[:200])
        raise ApiError(
            ErrorCode.PROVIDER_ERROR, "Claude rejected the request.", retryable=False
        ) from exc
    except anthropic.APITimeoutError as exc:
        raise ApiError(ErrorCode.PROVIDER_TIMEOUT, "Claude took too long; try again.") from exc
    except anthropic.APIConnectionError as exc:
        raise ApiError(
            ErrorCode.PROVIDER_ERROR, "Could not reach Claude; check the internet."
        ) from exc
    except anthropic.APIStatusError as exc:
        logger.warning("Claude call failed: HTTP %s", exc.status_code)
        raise ApiError(ErrorCode.PROVIDER_ERROR, "Claude failed; try again.") from exc

    if response.stop_reason == "refusal" or response.parsed_output is None:
        logger.warning("Claude returned no usable output (stop_reason=%s)", response.stop_reason)
        raise ApiError(
            ErrorCode.AI_OUTPUT_INVALID,
            "The AI returned an unusable draft; try again or type it in.",
        )
    return response.parsed_output
