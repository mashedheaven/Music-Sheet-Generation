from __future__ import annotations

"""API routes for managing transcription jobs."""

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.schemas import JobListResponse, JobResponse
from app.services import job_service
from app.tasks import pipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/jobs", tags=["Jobs"])

QUANTIZATION_CHOICES = {"eighth", "sixteenth"}
TIME_SIGNATURES = {"4/4", "3/4", "2/4"}


@router.post(
    "",
    response_model=JobResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload audio and create a transcription job",
)
async def create_job(
    file: UploadFile = File(..., description="Audio file to transcribe"),
    title: str | None = Form(default=None, description="Song title (optional)"),
    transcribe_vocals: bool = Form(default=True, description="Whether to transcribe the vocal stem"),
    indian_percussion_mode: bool = Form(default=False, description="Label drums as Indian percussion"),
    quantization: str = Form(default="sixteenth", description="Rhythmic detail: 'eighth' or 'sixteenth'"),
    bpm: float | None = Form(default=None, description="Tempo override in BPM (auto-detect when empty)"),
    time_signature: str = Form(default="4/4", description="Time signature: 4/4, 3/4 or 2/4"),
    db: Session = Depends(get_db),
) -> JobResponse:
    """
    Upload an audio file and start a transcription pipeline.

    Validates the file and options, saves the file to storage,
    creates a job record, and queues the background processing pipeline.
    """
    ext = Path(file.filename or "").suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type '{ext or 'unknown'}'. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}",
        )
    if file.size is not None and file.size > settings.MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size: {settings.MAX_FILE_SIZE_MB} MB",
        )
    if quantization not in QUANTIZATION_CHOICES:
        raise HTTPException(422, f"quantization must be one of {sorted(QUANTIZATION_CHOICES)}")
    if time_signature not in TIME_SIGNATURES:
        raise HTTPException(422, f"time_signature must be one of {sorted(TIME_SIGNATURES)}")
    if bpm is not None and not 30 <= bpm <= 260:
        raise HTTPException(422, "bpm must be between 30 and 260")

    job = await job_service.create_job(
        db,
        file,
        title,
        transcribe_vocals=transcribe_vocals,
        indian_percussion_mode=indian_percussion_mode,
        quantization=quantization,
        bpm_override=bpm,
        time_signature=time_signature,
    )
    if job.file_size_bytes == 0:
        job_service.delete_job(db, job.id)
        raise HTTPException(422, "The uploaded file is empty.")

    pipeline.submit_job(job.id)
    logger.info("Job %s created and queued", job.id)
    return JobResponse.from_job(job)


@router.get(
    "",
    response_model=list[JobListResponse],
    summary="List all transcription jobs",
)
def list_jobs(db: Session = Depends(get_db)) -> list[JobListResponse]:
    """Retrieve all jobs, ordered by creation date (newest first)."""
    return [JobListResponse.from_job(j) for j in job_service.list_jobs(db)]


@router.get(
    "/{job_id}",
    response_model=JobResponse,
    summary="Get job details",
)
def get_job(job_id: str, db: Session = Depends(get_db)) -> JobResponse:
    """Retrieve full details of a specific job including stems and scores."""
    job = job_service.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job '{job_id}' not found")
    return JobResponse.from_job(job)


@router.post(
    "/{job_id}/retry",
    response_model=JobResponse,
    summary="Re-run the pipeline for a job",
)
def retry_job(job_id: str, db: Session = Depends(get_db)) -> JobResponse:
    """Discard previous results and process the original upload again."""
    job = job_service.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job '{job_id}' not found")
    if pipeline.is_running(job_id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This job is already being processed")
    job = job_service.reset_job_for_retry(db, job)
    pipeline.submit_job(job.id)
    return JobResponse.from_job(job)


@router.patch(
    "/{job_id}",
    response_model=JobResponse,
    summary="Rename a job",
)
def rename_job(job_id: str, title: str = Form(...), db: Session = Depends(get_db)) -> JobResponse:
    job = job_service.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job '{job_id}' not found")
    title = title.strip()
    if not title:
        raise HTTPException(422, "Title cannot be empty")
    job.title = title[:255]
    db.commit()
    db.refresh(job)
    return JobResponse.from_job(job)


@router.delete(
    "/{job_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a job",
)
def delete_job(job_id: str, db: Session = Depends(get_db)) -> None:
    """Delete a job and all associated files, stems, and scores."""
    if pipeline.is_running(job_id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Wait for processing to finish before deleting")
    if not job_service.delete_job(db, job_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job '{job_id}' not found")
