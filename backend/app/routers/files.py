"""API routes for serving audio and score files."""

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Job, Score, Stem
from app.services.file_service import get_absolute_path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["Files"])

# Content type mapping for score formats
SCORE_CONTENT_TYPES = {
    "musicxml": "application/vnd.recordare.musicxml+xml",
    "midi": "audio/midi",
    "pdf": "application/pdf",
}

AUDIO_CONTENT_TYPES = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
}


def _resolve_and_check(relative_path: str) -> Path:
    """Resolve a relative path and ensure the file exists."""
    absolute = get_absolute_path(relative_path)
    if not absolute.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found on disk",
        )
    return absolute


@router.get(
    "/stems/{stem_id}/audio",
    summary="Stream stem audio",
    response_class=FileResponse,
)
def get_stem_audio(stem_id: str, db: Session = Depends(get_db)) -> FileResponse:
    """Stream the audio file for a specific instrument stem."""
    stem = db.query(Stem).filter(Stem.id == stem_id).first()
    if not stem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stem '{stem_id}' not found",
        )
    if not stem.audio_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No audio file available for this stem",
        )

    file_path = _resolve_and_check(stem.audio_path)
    content_type = AUDIO_CONTENT_TYPES.get(file_path.suffix.lower(), "application/octet-stream")

    return FileResponse(
        path=file_path,
        media_type=content_type,
        filename=file_path.name,
    )


@router.get(
    "/scores/{score_id}/download",
    summary="Download a score file",
    response_class=FileResponse,
)
def download_score(score_id: str, db: Session = Depends(get_db)) -> FileResponse:
    """Download a generated score file (MusicXML, MIDI, or PDF)."""
    score = db.query(Score).filter(Score.id == score_id).first()
    if not score:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Score '{score_id}' not found",
        )

    file_path = _resolve_and_check(score.file_path)
    content_type = SCORE_CONTENT_TYPES.get(score.format, "application/octet-stream")

    return FileResponse(
        path=file_path,
        media_type=content_type,
        filename=file_path.name,
        headers={"Content-Disposition": f'attachment; filename="{file_path.name}"'},
    )


@router.get(
    "/jobs/{job_id}/original",
    summary="Stream original uploaded audio",
    response_class=FileResponse,
)
def get_original_audio(job_id: str, db: Session = Depends(get_db)) -> FileResponse:
    """Stream the original uploaded audio file for a job."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found",
        )

    file_path = _resolve_and_check(job.audio_path)
    content_type = AUDIO_CONTENT_TYPES.get(file_path.suffix.lower(), "application/octet-stream")

    return FileResponse(
        path=file_path,
        media_type=content_type,
        filename=job.original_filename,
    )
