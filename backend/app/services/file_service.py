"""File management service for uploads, stems, and score artifacts."""

import logging
import re
import shutil
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.config import settings

logger = logging.getLogger(__name__)


def ensure_directories() -> None:
    """Create all required storage directories if they don't exist."""
    for directory in (
        settings.UPLOAD_DIR,
        settings.STEMS_DIR,
        settings.SCORES_DIR,
        settings.EXPORTS_DIR,
    ):
        directory.mkdir(parents=True, exist_ok=True)


_JOB_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def _job_dir(base_dir: Path, job_id: str) -> Path:
    """Return ``base_dir/job_id``, refusing ids that could escape ``base_dir``."""
    if not job_id or not _JOB_ID_RE.match(job_id):
        raise ValueError(f"Invalid job id: {job_id!r}")
    base = base_dir.resolve()
    target = (base / job_id).resolve()
    if target.parent != base:
        raise ValueError(f"Invalid job id: {job_id!r}")
    return target


def _safe_filename(name: str | None) -> str:
    name = Path(name or "upload").name
    stem, suffix = Path(name).stem, Path(name).suffix.lower()
    stem = re.sub(r"[^\w\-. ]+", "_", stem).strip(" .") or "upload"
    return f"{stem[:120]}{suffix}"


async def save_upload(file: UploadFile, job_id: str) -> str:
    """
    Save an uploaded file to the uploads directory, enforcing the size limit
    while streaming (so huge uploads are rejected without filling the disk).

    Returns:
        Path to the saved file, relative to the storage directory.
    """
    job_upload_dir = _job_dir(settings.UPLOAD_DIR, job_id)
    job_upload_dir.mkdir(parents=True, exist_ok=True)
    dest_path = job_upload_dir / _safe_filename(file.filename)

    written = 0
    try:
        with dest_path.open("wb") as buffer:
            while chunk := await file.read(1024 * 256):
                written += len(chunk)
                if written > settings.MAX_FILE_SIZE_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Maximum size: {settings.MAX_FILE_SIZE_MB} MB",
                    )
                buffer.write(chunk)
    except Exception:
        shutil.rmtree(job_upload_dir, ignore_errors=True)
        raise

    relative_path = to_relative(dest_path)
    logger.info("Saved upload: %s (%d bytes)", relative_path, written)
    return relative_path


def to_relative(path: Path | str) -> str:
    """Express an absolute path relative to the storage directory."""
    return str(Path(path).resolve().relative_to(settings.STORAGE_DIR))


def get_absolute_path(relative_path: str) -> Path:
    """
    Resolve a storage-relative path to an absolute filesystem path.

    Refuses paths that escape the storage directory.
    """
    absolute = (settings.STORAGE_DIR / relative_path).resolve()
    if settings.STORAGE_DIR not in absolute.parents and absolute != settings.STORAGE_DIR:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return absolute


def delete_job_outputs(job_id: str) -> None:
    """Remove generated stems/scores for a job (keeps the original upload)."""
    for base_dir in (settings.STEMS_DIR, settings.SCORES_DIR, settings.EXPORTS_DIR):
        job_dir = _job_dir(base_dir, job_id)
        if job_dir.exists():
            shutil.rmtree(job_dir, ignore_errors=True)


def delete_job_files(job_id: str) -> None:
    """Remove all files associated with a job from every storage directory."""
    delete_job_outputs(job_id)
    job_dir = _job_dir(settings.UPLOAD_DIR, job_id)
    if job_dir.exists():
        shutil.rmtree(job_dir, ignore_errors=True)
    logger.info("Deleted files for job %s", job_id)
