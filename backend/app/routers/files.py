"""API routes for serving audio, waveform and score files."""

import logging
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Job, Score, Stem
from app.services.file_service import get_absolute_path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["Files"])

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
    ".aac": "audio/aac",
    ".aif": "audio/aiff",
    ".aiff": "audio/aiff",
}

# Audio is immutable once generated → let the browser cache it.
CACHE_HEADERS = {"Cache-Control": "private, max-age=3600"}


def _resolve_and_check(relative_path: str | None) -> Path:
    """Resolve a relative path and ensure the file exists."""
    if not relative_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not available")
    absolute = get_absolute_path(relative_path)
    if not absolute.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk")
    return absolute


def _get_stem(db: Session, stem_id: str) -> Stem:
    stem = db.query(Stem).filter(Stem.id == stem_id).first()
    if not stem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Stem '{stem_id}' not found")
    return stem


def _audio_response(path: Path) -> FileResponse:
    # FileResponse supports HTTP Range requests, so the browser can seek.
    return FileResponse(
        path=path,
        media_type=AUDIO_CONTENT_TYPES.get(path.suffix.lower(), "application/octet-stream"),
        headers=CACHE_HEADERS,
        content_disposition_type="inline",
        filename=path.name,
    )


def _download_name(job: Job | None, suffix: str, label: str) -> str:
    base = re.sub(r"[^\w\- ]+", "", job.title if job else "score").strip() or "score"
    return f"{base} - {label}{suffix}"


@router.get("/stems/{stem_id}/audio", summary="Stream stem audio")
def get_stem_audio(stem_id: str, db: Session = Depends(get_db)) -> FileResponse:
    stem = _get_stem(db, stem_id)
    return _audio_response(_resolve_and_check(stem.audio_path))


@router.get("/stems/{stem_id}/preview", summary="Audio rendering of the transcribed notes")
def get_stem_preview(stem_id: str, db: Session = Depends(get_db)) -> FileResponse:
    stem = _get_stem(db, stem_id)
    return _audio_response(_resolve_and_check(stem.synth_path))


@router.get("/stems/{stem_id}/peaks", summary="Waveform peaks for a stem")
def get_stem_peaks(stem_id: str, db: Session = Depends(get_db)) -> FileResponse:
    stem = _get_stem(db, stem_id)
    return FileResponse(_resolve_and_check(stem.peaks_path), media_type="application/json", headers=CACHE_HEADERS)


@router.get("/scores/{score_id}/download", summary="Download a score file")
def download_score(score_id: str, inline: bool = False, db: Session = Depends(get_db)) -> FileResponse:
    """Download a generated score file (MusicXML, MIDI, or PDF)."""
    score = db.query(Score).filter(Score.id == score_id).first()
    if not score:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Score '{score_id}' not found")

    file_path = _resolve_and_check(score.file_path)
    label = "Full Score" if score.is_ensemble else (score.stem.instrument_name if score.stem else "Part")
    return FileResponse(
        path=file_path,
        media_type=SCORE_CONTENT_TYPES.get(score.format, "application/octet-stream"),
        filename=_download_name(score.job, file_path.suffix, label),
        content_disposition_type="inline" if inline else "attachment",
    )


@router.get("/jobs/{job_id}/original", summary="Stream original uploaded audio")
def get_original_audio(job_id: str, db: Session = Depends(get_db)) -> FileResponse:
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job '{job_id}' not found")
    return _audio_response(_resolve_and_check(job.audio_path))


@router.get("/jobs/{job_id}/peaks", summary="Waveform peaks for the full mix")
def get_job_peaks(job_id: str, db: Session = Depends(get_db)) -> FileResponse:
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job '{job_id}' not found")
    return FileResponse(_resolve_and_check(job.peaks_path), media_type="application/json", headers=CACHE_HEADERS)
