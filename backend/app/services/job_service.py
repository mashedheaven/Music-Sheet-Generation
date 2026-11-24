"""Business logic for managing transcription jobs."""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.models import Job
from app.services.file_service import delete_job_files, delete_job_outputs, get_absolute_path, save_upload

logger = logging.getLogger(__name__)


async def create_job(
    db: Session,
    file: UploadFile,
    title: str | None = None,
    transcribe_vocals: bool = True,
    indian_percussion_mode: bool = False,
    quantization: str = "sixteenth",
    bpm_override: float | None = None,
    time_signature: str = "4/4",
) -> Job:
    """Create a new transcription job from an uploaded audio file."""
    original_filename = file.filename or "unknown"
    if not title or not title.strip():
        title = Path(original_filename).stem
    title = title.strip()[:255]

    job = Job(
        title=title,
        status="pending",
        progress=0.0,
        progress_message="Queued",
        original_filename=original_filename,
        audio_path="",
        file_size_bytes=0,
        transcribe_vocals=transcribe_vocals,
        indian_percussion_mode=indian_percussion_mode,
        quantization=quantization,
        bpm_override=bpm_override,
        time_signature=time_signature,
    )
    db.add(job)
    db.flush()  # Generate the ID without committing

    try:
        relative_path = await save_upload(file, job.id)
    except Exception:
        db.rollback()
        raise

    job.audio_path = relative_path
    job.file_size_bytes = get_absolute_path(relative_path).stat().st_size

    db.commit()
    db.refresh(job)

    logger.info("Created job %s for file %s", job.id, original_filename)
    return job


def get_job(db: Session, job_id: str) -> Job | None:
    """Retrieve a job by ID with eager-loaded stems and scores."""
    return db.query(Job).filter(Job.id == job_id).first()


def list_jobs(db: Session) -> list[Job]:
    """List all jobs ordered by creation date (newest first)."""
    return db.query(Job).order_by(Job.created_at.desc()).all()


def delete_job(db: Session, job_id: str) -> bool:
    """Delete a job and all associated files."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        return False

    delete_job_files(job_id)
    db.delete(job)
    db.commit()

    logger.info("Deleted job %s", job_id)
    return True


def reset_job_for_retry(db: Session, job: Job) -> Job:
    """Clear previous results so the job can be processed again."""
    delete_job_outputs(job.id)
    for stem in list(job.stems):
        db.delete(stem)
    for score in list(job.scores):
        db.delete(score)
    job.status = "pending"
    job.progress = 0.0
    job.progress_message = "Queued"
    job.error_message = None
    job.tempo_bpm = None
    job.key_signature = None
    job.beat_times_json = None
    job.peaks_path = None
    db.commit()
    db.refresh(job)
    return job


def update_job_progress(
    db: Session,
    job_id: str,
    status: str,
    progress: float,
    message: str | None = None,
) -> Job | None:
    """Update the progress of a running job."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        return None

    job.status = status
    job.progress = max(0.0, min(1.0, progress))
    job.progress_message = message

    db.commit()
    db.refresh(job)
    return job
