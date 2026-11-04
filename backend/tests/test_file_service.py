"""Unit tests for the file service (ported/adapted from PRs #12, #15–#17, #21, #25)."""

import asyncio
import io

import pytest
from fastapi import HTTPException, UploadFile

from app.config import settings
from app.services import file_service


def _upload(data: bytes, name: str = "song.wav") -> UploadFile:
    return UploadFile(file=io.BytesIO(data), filename=name)


def test_save_upload_writes_file_and_returns_relative_path():
    rel = asyncio.run(file_service.save_upload(_upload(b"abc" * 1000), "job-1"))
    assert rel == "uploads/job-1/song.wav"
    assert (settings.STORAGE_DIR / rel).read_bytes() == b"abc" * 1000


def test_save_upload_sanitizes_filename():
    rel = asyncio.run(file_service.save_upload(_upload(b"x", "../../evil name?.MP3"), "job-2"))
    assert rel.startswith("uploads/job-2/")
    assert ".." not in rel and rel.endswith(".mp3")


def test_save_upload_enforces_size_limit_and_cleans_up(monkeypatch):
    monkeypatch.setattr(settings, "MAX_FILE_SIZE_MB", 0)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(file_service.save_upload(_upload(b"x" * 10), "job-3"))
    assert exc.value.status_code == 413
    assert not (settings.UPLOAD_DIR / "job-3").exists()


def test_save_upload_cleans_up_on_read_error():
    class Broken(io.BytesIO):
        def read(self, *a, **k):
            raise OSError("disk exploded")

    with pytest.raises(OSError):
        asyncio.run(file_service.save_upload(UploadFile(file=Broken(), filename="a.wav"), "job-4"))
    assert not (settings.UPLOAD_DIR / "job-4").exists()


@pytest.mark.parametrize("bad", ["", "..", "../x", "a/b", "a\\b", "x" * 65, "café"])
def test_job_ids_that_could_escape_storage_are_rejected(bad):
    with pytest.raises(ValueError):
        file_service.delete_job_files(bad)
    with pytest.raises(ValueError):
        asyncio.run(file_service.save_upload(_upload(b"x"), bad))


def test_get_absolute_path_blocks_traversal():
    with pytest.raises(HTTPException):
        file_service.get_absolute_path("../../etc/passwd")
    assert file_service.get_absolute_path("uploads/x.wav").is_relative_to(settings.STORAGE_DIR)


def test_delete_job_files_removes_all_dirs():
    for d in (settings.UPLOAD_DIR, settings.STEMS_DIR, settings.SCORES_DIR):
        (d / "job-5").mkdir(parents=True, exist_ok=True)
        (d / "job-5" / "f.txt").write_text("x")
    file_service.delete_job_files("job-5")
    for d in (settings.UPLOAD_DIR, settings.STEMS_DIR, settings.SCORES_DIR):
        assert not (d / "job-5").exists()
