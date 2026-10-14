"""Unit tests for file_service module."""

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import UploadFile

from app.config import settings
from app.services.file_service import (
    delete_job_files,
    ensure_directories,
    get_absolute_path,
    save_upload,
)


@pytest.mark.asyncio
async def test_save_upload_exception_cleanup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Test that partial files are cleaned up if an exception occurs during streaming."""
    storage_base = tmp_path / "storage"
    monkeypatch.setattr(settings, "STORAGE_BASE_PATH", str(storage_base))

    job_id = "test-job-cleanup"

    # Create a mock UploadFile where reading fails on the second chunk
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = "corrupted_file.mp3"
    mock_file.read = AsyncMock(side_effect=[b"partial data chunk", RuntimeError("Read failed midway")])

    dest_path = settings.UPLOAD_DIR / job_id / "corrupted_file.mp3"

    with pytest.raises(RuntimeError, match="Read failed midway"):
        await save_upload(mock_file, job_id)

    # Verify that the partial file was unlinked and does not exist
    assert not dest_path.exists()


@pytest.mark.asyncio
async def test_save_upload_success(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Test successful file save and return relative path."""
    storage_base = tmp_path / "storage"
    monkeypatch.setattr(settings, "STORAGE_BASE_PATH", str(storage_base))

    job_id = "test-job-success"

    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = "song.wav"
    mock_file.read = AsyncMock(side_effect=[b"wav content header", b"wav content body", b""])

    rel_path = await save_upload(mock_file, job_id)

    expected_path = settings.UPLOAD_DIR / job_id / "song.wav"
    assert expected_path.exists()
    assert expected_path.read_bytes() == b"wav content headerwav content body"
    assert rel_path == str(expected_path.relative_to(storage_base))


@pytest.mark.asyncio
async def test_save_upload_no_filename(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Test file save with fallback name when filename is missing or None."""
    storage_base = tmp_path / "storage"
    monkeypatch.setattr(settings, "STORAGE_BASE_PATH", str(storage_base))

    job_id = "test-job-no-filename"

    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = None
    mock_file.read = AsyncMock(side_effect=[b"data", b""])

    rel_path = await save_upload(mock_file, job_id)

    expected_path = settings.UPLOAD_DIR / job_id / "upload"
    assert expected_path.exists()
    assert expected_path.read_bytes() == b"data"


def test_get_absolute_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Test resolving relative storage path to absolute path."""
    storage_base = tmp_path / "storage"
    monkeypatch.setattr(settings, "STORAGE_BASE_PATH", str(storage_base))

    rel_path = "uploads/job-123/file.mp3"
    abs_path = get_absolute_path(rel_path)

    assert abs_path == (storage_base / "uploads/job-123/file.mp3").resolve()


def test_ensure_directories(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Test directory creation for all required storage directories."""
    storage = tmp_path / "storage"
    monkeypatch.setattr(settings, "STORAGE_BASE_PATH", str(storage))

    ensure_directories()

    assert settings.UPLOAD_DIR.is_dir()
    assert settings.STEMS_DIR.is_dir()
    assert settings.SCORES_DIR.is_dir()
    assert settings.EXPORTS_DIR.is_dir()


def test_delete_job_files(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Test deletion of job files across storage directories."""
    job_id = "job-to-delete"
    storage = tmp_path / "storage"
    monkeypatch.setattr(settings, "STORAGE_BASE_PATH", str(storage))

    dirs = [
        settings.UPLOAD_DIR,
        settings.STEMS_DIR,
        settings.SCORES_DIR,
        settings.EXPORTS_DIR,
    ]

    for d in dirs:
        job_dir = d / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        (job_dir / "sample.txt").write_text("test")

    delete_job_files(job_id)

    for d in dirs:
        job_dir = d / job_id
        assert not job_dir.exists()
