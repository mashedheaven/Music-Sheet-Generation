"""Pydantic v2 schemas for request/response serialization."""
from __future__ import annotations

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
    stem_name: str | None = None
    note_count: int = 0
    audio_url: str | None = None
    peaks_url: str | None = None
    preview_url: str | None = None

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_orm_with_url(cls, stem) -> "StemResponse":
        """Create a response from a Stem ORM object, building the file URLs."""
        base = f"/api/files/stems/{stem.id}"
        return cls(
            id=stem.id,
            instrument_name=stem.instrument_name,
            instrument_family=stem.instrument_family,
            clef=stem.clef,
            is_percussion=stem.is_percussion,
            confidence=stem.confidence,
            stem_name=stem.stem_name,
            note_count=stem.note_count or 0,
            audio_url=f"{base}/audio" if stem.audio_path else None,
            peaks_url=f"{base}/peaks" if stem.peaks_path else None,
            preview_url=f"{base}/preview" if stem.synth_path else None,
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
        return cls(
            id=score.id,
            stem_id=score.stem_id,
            format=score.format,
            download_url=f"/api/files/scores/{score.id}/download",
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
    transcribe_vocals: bool
    indian_percussion_mode: bool
    quantization: str = "sixteenth"
    bpm_override: float | None = None
    time_signature: str = "4/4"
    tempo_bpm: float | None = None
    key_signature: str | None = None
    separator_used: str | None = None
    transcriber_used: str | None = None
    processing_seconds: float | None = None
    original_url: str
    peaks_url: str | None = None
    beat_times: list[float] = []
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
            transcribe_vocals=job.transcribe_vocals,
            indian_percussion_mode=job.indian_percussion_mode,
            quantization=job.quantization or "sixteenth",
            bpm_override=job.bpm_override,
            time_signature=job.time_signature or "4/4",
            tempo_bpm=job.tempo_bpm,
            key_signature=job.key_signature,
            separator_used=job.separator_used,
            transcriber_used=job.transcriber_used,
            processing_seconds=job.processing_seconds,
            original_url=f"/api/files/jobs/{job.id}/original",
            peaks_url=f"/api/files/jobs/{job.id}/peaks" if job.peaks_path else None,
            beat_times=job.beat_times,
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
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime
    duration_seconds: float | None = None
    tempo_bpm: float | None = None
    key_signature: str | None = None
    time_signature: str = "4/4"
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
            error_message=job.error_message,
            created_at=job.created_at,
            updated_at=job.updated_at,
            duration_seconds=job.duration_seconds,
            tempo_bpm=job.tempo_bpm,
            key_signature=job.key_signature,
            time_signature=job.time_signature or "4/4",
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
