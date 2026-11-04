"""Application configuration using Pydantic Settings."""
from __future__ import annotations

import sys
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent

# The ML pipeline lives at the repository root (``ml_pipeline/``). Make it
# importable no matter which directory the server is started from — this
# was the reason the app silently fell back to a fake "stub" pipeline.
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env file."""

    # Database (absolute by default so the CWD doesn't matter)
    DATABASE_URL: str = f"sqlite:///{BACKEND_DIR / 'music_transcription.db'}"

    # Storage paths
    STORAGE_BASE_PATH: str = str(BACKEND_DIR / "storage")

    # File constraints
    MAX_FILE_SIZE_MB: int = 100
    MAX_DURATION_SECONDS: int = 600
    ALLOWED_EXTENSIONS: list[str] = [".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".aiff", ".aif"]

    # Processing
    MAX_CONCURRENT_JOBS: int = 1  # ML models are memory hungry — queue jobs
    SEPARATOR_BACKEND: str = "auto"  # auto | demucs | hpss
    SEPARATOR_MODEL: str = "htdemucs"
    USE_GPU: bool = True
    TRANSCRIBE_LYRICS: bool = True

    # CORS (only needed when the frontend is not served through the Vite proxy)
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:3000",
    ]

    CORS_ALLOW_METHODS: list[str] = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
    CORS_ALLOW_HEADERS: list[str] = ["Content-Type", "Accept", "Origin", "Range", "X-Requested-With", "Cache-Control"]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Derived storage directories
    @property
    def STORAGE_DIR(self) -> Path:
        return Path(self.STORAGE_BASE_PATH).resolve()

    @property
    def UPLOAD_DIR(self) -> Path:
        return self.STORAGE_DIR / "uploads"

    @property
    def STEMS_DIR(self) -> Path:
        return self.STORAGE_DIR / "stems"

    @property
    def SCORES_DIR(self) -> Path:
        return self.STORAGE_DIR / "scores"

    @property
    def EXPORTS_DIR(self) -> Path:
        return self.STORAGE_DIR / "exports"

    @property
    def MAX_FILE_SIZE_BYTES(self) -> int:
        return self.MAX_FILE_SIZE_MB * 1024 * 1024


settings = Settings()
