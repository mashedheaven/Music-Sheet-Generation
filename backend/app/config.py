from __future__ import annotations
"""Application configuration using Pydantic Settings."""

from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env file."""

    # Database
    DATABASE_URL: str = "sqlite:///./music_transcription.db"

    # Storage paths
    STORAGE_BASE_PATH: str = "./storage"

    # File constraints
    MAX_FILE_SIZE_MB: int = 50
    MAX_DURATION_SECONDS: int = 360
    ALLOWED_EXTENSIONS: list[str] = [".mp3", ".wav", ".flac", ".ogg", ".m4a"]

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Derived storage directories
    @property
    def UPLOAD_DIR(self) -> Path:
        return Path(self.STORAGE_BASE_PATH) / "uploads"

    @property
    def STEMS_DIR(self) -> Path:
        return Path(self.STORAGE_BASE_PATH) / "stems"

    @property
    def SCORES_DIR(self) -> Path:
        return Path(self.STORAGE_BASE_PATH) / "scores"

    @property
    def EXPORTS_DIR(self) -> Path:
        return Path(self.STORAGE_BASE_PATH) / "exports"

    @property
    def MAX_FILE_SIZE_BYTES(self) -> int:
        return self.MAX_FILE_SIZE_MB * 1024 * 1024

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
