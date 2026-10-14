"""Unit tests for file_service.py."""

import io
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi import UploadFile

from app.config import settings
from app.services.file_service import (
    delete_job_files,
    ensure_directories,
    get_absolute_path,
    save_upload,
)


@pytest.fixture
def temp_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Override STORAGE_BASE_PATH to point to a temporary directory."""
    storage_dir = tmp_path / "storage"
    storage_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "STORAGE_BASE_PATH", str(storage_dir))
    return storage_dir


class TestEnsureDirectories:
    def test_ensure_directories_creates_all_dirs(self, temp_storage: Path):
        ensure_directories()

        assert settings.UPLOAD_DIR.exists()
        assert settings.STEMS_DIR.exists()
        assert settings.SCORES_DIR.exists()
        assert settings.EXPORTS_DIR.exists()


class TestGetAbsolutePath:
    def test_get_absolute_path(self, temp_storage: Path):
        rel_path = "uploads/test-job-id/file.wav"
        abs_path = get_absolute_path(rel_path)

        expected = (temp_storage / rel_path).resolve()
        assert abs_path == expected


class TestDeleteJobFiles:
    def test_delete_job_files_removes_existing_job_directories(self, temp_storage: Path):
        ensure_directories()
        job_id = "test-job-123"

        # Create dummy job folders and files in storage directories
        job_dirs = [
            settings.UPLOAD_DIR / job_id,
            settings.STEMS_DIR / job_id,
            settings.SCORES_DIR / job_id,
            settings.EXPORTS_DIR / job_id,
        ]
        for d in job_dirs:
            d.mkdir(parents=True, exist_ok=True)
            (d / "dummy.txt").write_text("hello")

        # Call delete_job_files
        delete_job_files(job_id)

        # Verify all job directories are removed
        for d in job_dirs:
            assert not d.exists()

    def test_delete_job_files_non_existent_job_id(self, temp_storage: Path):
        ensure_directories()
        # Deleting a job that has no directories should not raise any error
        delete_job_files("non-existent-job-id")


class TestSaveUpload:
    @pytest.mark.asyncio
    async def test_save_upload_success(self, temp_storage: Path):
        ensure_directories()
        job_id = "job-abc-123"
        content = b"fake audio content " * 1000
        upload_file = UploadFile(filename="my_song.wav", file=io.BytesIO(content))

        rel_path = await save_upload(upload_file, job_id)

        expected_rel_path = f"uploads/{job_id}/my_song.wav"
        assert rel_path == expected_rel_path

        saved_file_path = get_absolute_path(rel_path)
        assert saved_file_path.exists()
        assert saved_file_path.read_bytes() == content

    @pytest.mark.asyncio
    async def test_save_upload_filename_none(self, temp_storage: Path):
        ensure_directories()
        job_id = "job-no-filename"
        content = b"content without filename"
        upload_file = UploadFile(filename=None, file=io.BytesIO(content))

        rel_path = await save_upload(upload_file, job_id)

        expected_rel_path = f"uploads/{job_id}/upload"
        assert rel_path == expected_rel_path

        saved_file_path = get_absolute_path(rel_path)
        assert saved_file_path.exists()
        assert saved_file_path.read_bytes() == content

    @pytest.mark.asyncio
    async def test_save_upload_sanitizes_path_traversal(self, temp_storage: Path):
        ensure_directories()
        job_id = "job-path-traversal"
        content = b"traversal test"
        upload_file = UploadFile(filename="../../secret.wav", file=io.BytesIO(content))

        rel_path = await save_upload(upload_file, job_id)

        expected_rel_path = f"uploads/{job_id}/secret.wav"
        assert rel_path == expected_rel_path

        saved_file_path = get_absolute_path(rel_path)
        assert saved_file_path.exists()
        assert saved_file_path.read_bytes() == content

    @pytest.mark.asyncio
    async def test_save_upload_error_cleans_up_partial_file(self, temp_storage: Path):
        ensure_directories()
        job_id = "job-error-cleanup"

        mock_file = MagicMock(spec=UploadFile)
        mock_file.filename = "corrupted.wav"

        # First read call returns some data, second read call raises an exception
        read_calls = [b"partial data", IOError("Disk error")]

        async def mock_read(chunk_size=1024 * 64):
            val = read_calls.pop(0)
            if isinstance(val, Exception):
                raise val
            return val

        mock_file.read = mock_read

        dest_path = settings.UPLOAD_DIR / job_id / "corrupted.wav"

        with pytest.raises(IOError, match="Disk error"):
            await save_upload(mock_file, job_id)

        # Confirm partial file was cleaned up
        assert not dest_path.exists()
