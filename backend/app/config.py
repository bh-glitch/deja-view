"""Backend configuration (owner: Bhavya).

Relative paths are resolved against the backend directory, never the invoking
shell's working directory. Loading settings has no side effects: it does not
create the database, download weights, or contact providers.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent
ENV_FILE = BACKEND_DIR / ".env"

FIXTURE_DATABASE_MARKER = "fixture"


def resolve_backend_path(value: str | Path) -> Path:
    """Resolve a configured path relative to the backend directory."""
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = BACKEND_DIR / path
    return path.resolve()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    prototype_mode: Literal["fixture", "live"] = "fixture"
    database_path: Path = Field(default=Path("../data/prototype-fixture.db"))
    insightface_model: Literal["buffalo_l"] = "buffalo_l"
    insightface_root: Path = Field(default=Path("../models/weights"))

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    elevenlabs_api_key: str = ""
    elevenlabs_stt_model: str = "scribe_v2"
    elevenlabs_tts_model: str = "eleven_flash_v2_5"
    elevenlabs_voice_id: str = ""

    @field_validator("database_path", "insightface_root", mode="after")
    @classmethod
    def _resolve(cls, value: Path) -> Path:
        return resolve_backend_path(value)

    @field_validator(
        "gemini_api_key", "elevenlabs_api_key", "elevenlabs_voice_id", mode="after"
    )
    @classmethod
    def _strip_secret(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def _live_mode_rejects_fixture_database(self) -> Settings:
        if (
            self.prototype_mode == "live"
            and FIXTURE_DATABASE_MARKER in self.database_path.name.lower()
        ):
            raise ValueError(
                "PROTOTYPE_MODE=live cannot use a fixture database "
                f"({self.database_path.name}); set DATABASE_PATH=../data/app.db"
            )
        return self

    @property
    def model_dir(self) -> Path:
        """Directory holding the verified local model pack, e.g. models/weights/buffalo_l."""
        return self.insightface_root / self.insightface_model


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
