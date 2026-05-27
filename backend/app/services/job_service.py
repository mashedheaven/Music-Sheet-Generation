from __future__ import annotations
"""Business logic for managing transcription jobs."""

import logging
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Job
from app.services.file_service import delete_job_files, save_upload

logger = logging.getLogger(__name__)


async def create_job(
    db: Session, 
    file: UploadFile, 
    title: str | None = None,
    transcribe_vocals: bool = True,
    indian_percussion_mode: bool = False
) -> Job:
    """
    Create a new transcription job from an uploaded audio file.

    Args:
        db: Database session.
        file: Uploaded audio file.
        title: Optional song title; defaults to the filename without extension.
        transcribe_vocals: Whether to transcribe vocals.
        indian_percussion_mode: Whether to enable indian percussion mode.

    Returns:
        The created Job ORM instance.
    """
    # Derive title from filename if not provided
    original_filename = file.filename or "unknown"
    if not title:
        title = Path(original_filename).stem

    # Create the job record first to get an ID
    job = Job(
        title=title,
        status="pending",
        original_filename=original_filename,
        audio_path="",  # Will be updated after saving
        file_size_bytes=0,  # Will be updated after saving
        transcribe_vocals=transcribe_vocals,
        indian_percussion_mode=indian_percussion_mode,
    )
    db.add(job)
    db.flush()  # Generate the ID without committing

    # Save the uploaded file
    relative_path = await save_upload(file, job.id)
    absolute_path = (Path(settings.STORAGE_BASE_PATH) / relative_path).resolve()

    # Update job with file info
    job.audio_path = relative_path
    job.file_size_bytes = absolute_path.stat().st_size

    db.commit()
    db.refresh(job)

    logger.info("Created job %s for file %s", job.id, original_filename)
    return job


def get_job(db: Session, job_id: str) -> Job | None:
    """
    Retrieve a job by ID with eager-loaded stems and scores.

    Args:
        db: Database session.
        job_id: UUID string of the job.

    Returns:
        Job instance or None if not found.
    """
    return db.query(Job).filter(Job.id == job_id).first()


def list_jobs(db: Session) -> list[Job]:
    """
    List all jobs ordered by creation date (newest first).

    Args:
        db: Database session.

    Returns:
        List of Job instances.
    """
    return db.query(Job).order_by(Job.created_at.desc()).all()


def delete_job(db: Session, job_id: str) -> bool:
    """
    Delete a job and all associated files.

    Args:
        db: Database session.
        job_id: UUID string of the job to delete.

    Returns:
        True if the job was found and deleted, False otherwise.
    """
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        return False

    # Clean up files from disk
    delete_job_files(job_id)

    # Delete the database record (cascades to stems and scores)
    db.delete(job)
    db.commit()

    logger.info("Deleted job %s", job_id)
    return True


def update_job_progress(
    db: Session,
    job_id: str,
    status: str,
    progress: float,
    message: str | None = None,
) -> Job | None:
    """
    Update the progress of a running job.

    Args:
        db: Database session.
        job_id: UUID string of the job.
        status: New status string.
        progress: Progress value between 0.0 and 1.0.
        message: Optional human-readable progress message.

    Returns:
        Updated Job instance or None if not found.
    """
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        return None

    job.status = status
    job.progress = max(0.0, min(1.0, progress))
    job.progress_message = message

    db.commit()
    db.refresh(job)
    return job
