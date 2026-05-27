from __future__ import annotations
"""Pydantic v2 schemas for request/response serialization."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ── Request Schemas ──────────────────────────────────────────────────────────


class JobCreate(BaseModel):
    """Schema for creating a new transcription job."""

    title: str | None = Field(
        default=None,
        description="Song title. Defaults to the uploaded filename if not provided.",
    )


# ── Response Schemas ─────────────────────────────────────────────────────────


class StemResponse(BaseModel):
    """Individual instrument stem response."""

    id: str
    instrument_name: str
    instrument_family: str
    clef: str
    is_percussion: bool
    confidence: float
    audio_url: str | None = None

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_orm_with_url(cls, stem) -> "StemResponse":
        """Create a response from a Stem ORM object, building the audio URL."""
        audio_url = f"/api/files/stems/{stem.id}/audio" if stem.audio_path else None
        return cls(
            id=stem.id,
            instrument_name=stem.instrument_name,
            instrument_family=stem.instrument_family,
            clef=stem.clef,
            is_percussion=stem.is_percussion,
            confidence=stem.confidence,
            audio_url=audio_url,
        )


class ScoreResponse(BaseModel):
    """Score file response."""

    id: str
    stem_id: str | None = None
    format: str
    download_url: str
    is_ensemble: bool

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_orm_with_url(cls, score) -> "ScoreResponse":
        """Create a response from a Score ORM object, building the download URL."""
        download_url = f"/api/files/scores/{score.id}/download"
        return cls(
            id=score.id,
            stem_id=score.stem_id,
            format=score.format,
            download_url=download_url,
            is_ensemble=score.is_ensemble,
        )


class JobResponse(BaseModel):
    """Full job detail response."""

    id: str
    title: str
    status: str
    original_filename: str
    file_size_bytes: int
    duration_seconds: float | None = None
    progress: float
    progress_message: str | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime
    stems: list[StemResponse] = []
    scores: list[ScoreResponse] = []

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_job(cls, job) -> "JobResponse":
        """Create a full response from a Job ORM object."""
        return cls(
            id=job.id,
            title=job.title,
            status=job.status,
            original_filename=job.original_filename,
            file_size_bytes=job.file_size_bytes,
            duration_seconds=job.duration_seconds,
            progress=job.progress,
            progress_message=job.progress_message,
            error_message=job.error_message,
            created_at=job.created_at,
            updated_at=job.updated_at,
            stems=[StemResponse.from_orm_with_url(s) for s in job.stems],
            scores=[ScoreResponse.from_orm_with_url(s) for s in job.scores],
        )


class JobListResponse(BaseModel):
    """Summary job response for listing."""

    id: str
    title: str
    status: str
    original_filename: str
    progress: float
    progress_message: str | None = None
    created_at: datetime
    updated_at: datetime
    instrument_count: int = 0
    stems: list[StemResponse] = []

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_job(cls, job) -> "JobListResponse":
        """Create a list-summary response from a Job ORM object."""
        stems = [StemResponse.from_orm_with_url(s) for s in job.stems]
        return cls(
            id=job.id,
            title=job.title,
            status=job.status,
            original_filename=job.original_filename,
            progress=job.progress,
            progress_message=job.progress_message,
            created_at=job.created_at,
            updated_at=job.updated_at,
            instrument_count=len(job.stems),
            stems=stems,
        )


class JobProgressEvent(BaseModel):
    """SSE progress event payload."""

    job_id: str
    status: str
    progress: float
    message: str | None = None
    stage: str | None = None
