"""SQLAlchemy ORM models for the music transcription application."""

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _generate_uuid() -> str:
    return str(uuid.uuid4())


class Job(Base):
    """Represents a music transcription job."""

    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_generate_uuid
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending", index=True
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    audio_path: Mapped[str] = mapped_column(String(512), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    progress: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    progress_message: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    stems: Mapped[List["Stem"]] = relationship(
        "Stem", back_populates="job", cascade="all, delete-orphan", lazy="selectin"
    )
    scores: Mapped[List["Score"]] = relationship(
        "Score", back_populates="job", cascade="all, delete-orphan", lazy="selectin"
    )

    # Valid status values
    VALID_STATUSES = (
        "pending",
        "uploading",
        "processing",
        "separating",
        "transcribing",
        "generating",
        "complete",
        "failed",
    )

    def __repr__(self) -> str:
        return f"<Job(id={self.id!r}, title={self.title!r}, status={self.status!r})>"


class Stem(Base):
    """Represents an extracted instrument stem from a job."""

    __tablename__ = "stems"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_generate_uuid
    )
    job_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    instrument_name: Mapped[str] = mapped_column(String(100), nullable=False)
    instrument_family: Mapped[str] = mapped_column(String(100), nullable=False)
    clef: Mapped[str] = mapped_column(String(20), nullable=False, default="treble")
    is_percussion: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    audio_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    # Relationships
    job: Mapped["Job"] = relationship("Job", back_populates="stems")
    scores: Mapped[List["Score"]] = relationship(
        "Score", back_populates="stem", cascade="all, delete-orphan", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Stem(id={self.id!r}, instrument={self.instrument_name!r})>"


class Score(Base):
    """Represents a generated score file (MusicXML, MIDI, or PDF)."""

    __tablename__ = "scores"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_generate_uuid
    )
    job_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stem_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("stems.id", ondelete="SET NULL"), nullable=True
    )
    format: Mapped[str] = mapped_column(String(20), nullable=False)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    is_ensemble: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    # Relationships
    job: Mapped["Job"] = relationship("Job", back_populates="scores")
    stem: Mapped[Optional["Stem"]] = relationship("Stem", back_populates="scores")

    def __repr__(self) -> str:
        return f"<Score(id={self.id!r}, format={self.format!r}, ensemble={self.is_ensemble})>"
