from __future__ import annotations
"""API routes for managing transcription jobs."""

import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.schemas import JobListResponse, JobResponse
from app.services import job_service
from app.tasks.pipeline import run_pipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/jobs", tags=["Jobs"])


@router.post(
    "",
    response_model=JobResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload audio and create a transcription job",
)
async def create_job(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Audio file to transcribe"),
    title: str | None = Form(default=None, description="Song title (optional)"),
    transcribe_vocals: bool = Form(default=True, description="Whether to transcribe the vocal stem"),
    indian_percussion_mode: bool = Form(default=False, description="Map drums to Indian Percussion"),
    db: Session = Depends(get_db),
) -> JobResponse:
    """
    Upload an audio file and start a transcription pipeline.

    Validates file type and size, saves the file to storage,
    creates a job record, and launches the background processing pipeline.
    """
    # Validate file extension
    if file.filename:
        ext = Path(file.filename).suffix.lower()
        if ext not in settings.ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unsupported file type '{ext}'. Allowed: {settings.ALLOWED_EXTENSIONS}",
            )

    # Validate file size by reading content-length header or checking after read
    if file.size is not None and file.size > settings.MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File too large. Maximum size: {settings.MAX_FILE_SIZE_MB} MB",
        )

    # Create the job (saves file and DB record)
    job = await job_service.create_job(
        db, file, title, transcribe_vocals=transcribe_vocals, indian_percussion_mode=indian_percussion_mode
    )

    # Double-check file size after save (in case size header was absent)
    if job.file_size_bytes > settings.MAX_FILE_SIZE_BYTES:
        job_service.delete_job(db, job.id)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File too large. Maximum size: {settings.MAX_FILE_SIZE_MB} MB",
        )

    # Launch the background processing pipeline
    background_tasks.add_task(run_pipeline, job.id, job.audio_path)

    logger.info("Job %s created and pipeline launched", job.id)
    return JobResponse.from_job(job)


@router.get(
    "",
    response_model=list[JobListResponse],
    summary="List all transcription jobs",
)
def list_jobs(db: Session = Depends(get_db)) -> list[JobListResponse]:
    """Retrieve all jobs, ordered by creation date (newest first)."""
    jobs = job_service.list_jobs(db)
    return [JobListResponse.from_job(j) for j in jobs]


@router.get(
    "/{job_id}",
    response_model=JobResponse,
    summary="Get job details",
)
def get_job(job_id: str, db: Session = Depends(get_db)) -> JobResponse:
    """Retrieve full details of a specific job including stems and scores."""
    job = job_service.get_job(db, job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found",
        )
    return JobResponse.from_job(job)


@router.delete(
    "/{job_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a job",
)
def delete_job(job_id: str, db: Session = Depends(get_db)) -> None:
    """Delete a job and all associated files, stems, and scores."""
    deleted = job_service.delete_job(db, job_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found",
        )
