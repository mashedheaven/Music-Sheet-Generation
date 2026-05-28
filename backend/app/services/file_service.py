"""File management service for uploads, stems, and score artifacts."""

import logging
import shutil
from pathlib import Path

from fastapi import UploadFile

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
        logger.debug("Ensured directory exists: %s", directory)


async def save_upload(file: UploadFile, job_id: str) -> str:
    """
    Save an uploaded file to the uploads directory.

    Args:
        file: The uploaded file from the request.
        job_id: UUID of the job, used to namespace the file.

    Returns:
        Relative path to the saved file (relative to STORAGE_BASE_PATH).
    """
    # Create a job-specific upload directory
    job_upload_dir = settings.UPLOAD_DIR / job_id
    job_upload_dir.mkdir(parents=True, exist_ok=True)

    # Sanitize the filename and preserve extension
    safe_filename = Path(file.filename).name if file.filename else "upload"
    dest_path = job_upload_dir / safe_filename

    # Stream the file to disk to handle large files efficiently
    try:
        with dest_path.open("wb") as buffer:
            while chunk := await file.read(1024 * 64):  # 64KB chunks
                buffer.write(chunk)
    except Exception:
        # Clean up partial file on failure
        if dest_path.exists():
            dest_path.unlink()
        raise

    # Return path relative to storage base
    relative_path = str(dest_path.relative_to(Path(settings.STORAGE_BASE_PATH)))
    logger.info("Saved upload: %s (%d bytes)", relative_path, dest_path.stat().st_size)
    return relative_path


def get_absolute_path(relative_path: str) -> Path:
    """
    Resolve a storage-relative path to an absolute filesystem path.

    Args:
        relative_path: Path relative to the storage base directory.

    Returns:
        Absolute Path object.
    """
    return (Path(settings.STORAGE_BASE_PATH) / relative_path).resolve()


def delete_job_files(job_id: str) -> None:
    """
    Remove all files associated with a job from every storage directory.

    Args:
        job_id: UUID of the job whose files should be deleted.
    """
    for base_dir in (
        settings.UPLOAD_DIR,
        settings.STEMS_DIR,
        settings.SCORES_DIR,
        settings.EXPORTS_DIR,
    ):
        job_dir = base_dir / job_id
        if job_dir.exists():
            shutil.rmtree(job_dir, ignore_errors=True)
            logger.info("Deleted files at: %s", job_dir)
