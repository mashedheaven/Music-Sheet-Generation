"""Tests for the files API endpoints."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Job, Score, Stem
from app.services.file_service import get_absolute_path


class TestGetStemAudio:
    """Tests for GET /api/files/stems/{stem_id}/audio."""

    def test_get_stem_audio_not_found_in_db(self, client: TestClient):
        """Should return 404 when stem_id does not exist in the database."""
        response = client.get("/api/files/stems/non-existent-stem-id/audio")
        assert response.status_code == 404
        assert "Stem 'non-existent-stem-id' not found" in response.json()["detail"]

    def test_get_stem_audio_no_audio_path(self, client: TestClient, db_session: Session):
        """Should return 404 when stem exists but audio_path is None or empty."""
        job = Job(
            title="Test Job",
            original_filename="test.wav",
            audio_path="uploads/test.wav",
            file_size_bytes=100,
        )
        db_session.add(job)
        db_session.commit()

        stem = Stem(
            job_id=job.id,
            instrument_name="drums",
            instrument_family="percussion",
            audio_path=None,
        )
        db_session.add(stem)
        db_session.commit()

        response = client.get(f"/api/files/stems/{stem.id}/audio")
        assert response.status_code == 404
        assert "No audio file available for this stem" in response.json()["detail"]

    def test_get_stem_audio_file_not_found_on_disk(self, client: TestClient, db_session: Session):
        """Should return 404 with 'File not found on disk' when file is missing from disk."""
        job = Job(
            title="Test Job",
            original_filename="test.wav",
            audio_path="uploads/test.wav",
            file_size_bytes=100,
        )
        db_session.add(job)
        db_session.commit()

        stem = Stem(
            job_id=job.id,
            instrument_name="drums",
            instrument_family="percussion",
            audio_path="stems/nonexistent_file.wav",
        )
        db_session.add(stem)
        db_session.commit()

        response = client.get(f"/api/files/stems/{stem.id}/audio")
        assert response.status_code == 404
        assert "File not found on disk" in response.json()["detail"]

    def test_get_stem_audio_success(
        self, client: TestClient, db_session: Session, sample_wav_bytes: bytes
    ):
        """Should successfully stream audio file when file exists on disk."""
        relative_path = "stems/test_stem.wav"
        abs_path = get_absolute_path(relative_path)
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        abs_path.write_bytes(sample_wav_bytes)

        try:
            job = Job(
                title="Test Job",
                original_filename="test.wav",
                audio_path="uploads/test.wav",
                file_size_bytes=100,
            )
            db_session.add(job)
            db_session.commit()

            stem = Stem(
                job_id=job.id,
                instrument_name="drums",
                instrument_family="percussion",
                audio_path=relative_path,
            )
            db_session.add(stem)
            db_session.commit()

            response = client.get(f"/api/files/stems/{stem.id}/audio")
            assert response.status_code == 200
            assert response.headers["content-type"] == "audio/wav"
            assert response.content == sample_wav_bytes
        finally:
            if abs_path.exists():
                abs_path.unlink()


class TestDownloadScore:
    """Tests for GET /api/files/scores/{score_id}/download."""

    def test_download_score_not_found_in_db(self, client: TestClient):
        """Should return 404 when score_id does not exist in database."""
        response = client.get("/api/files/scores/non-existent-score-id/download")
        assert response.status_code == 404
        assert "Score 'non-existent-score-id' not found" in response.json()["detail"]

    def test_download_score_file_not_found_on_disk(self, client: TestClient, db_session: Session):
        """Should return 404 with 'File not found on disk' when score file missing on disk."""
        job = Job(
            title="Test Job",
            original_filename="test.wav",
            audio_path="uploads/test.wav",
            file_size_bytes=100,
        )
        db_session.add(job)
        db_session.commit()

        score = Score(
            job_id=job.id,
            format="midi",
            file_path="scores/nonexistent.mid",
        )
        db_session.add(score)
        db_session.commit()

        response = client.get(f"/api/files/scores/{score.id}/download")
        assert response.status_code == 404
        assert "File not found on disk" in response.json()["detail"]

    def test_download_score_success(self, client: TestClient, db_session: Session):
        """Should successfully download score file when file exists on disk."""
        relative_path = "scores/test_score.mid"
        abs_path = get_absolute_path(relative_path)
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        fake_midi_content = b"MThd\x00\x00\x00\x06\x00\x01\x00\x01\x00\x60"
        abs_path.write_bytes(fake_midi_content)

        try:
            job = Job(
                title="Test Job",
                original_filename="test.wav",
                audio_path="uploads/test.wav",
                file_size_bytes=100,
            )
            db_session.add(job)
            db_session.commit()

            score = Score(
                job_id=job.id,
                format="midi",
                file_path=relative_path,
            )
            db_session.add(score)
            db_session.commit()

            response = client.get(f"/api/files/scores/{score.id}/download")
            assert response.status_code == 200
            assert response.headers["content-type"] == "audio/midi"
            assert 'attachment; filename="test_score.mid"' in response.headers["content-disposition"]
            assert response.content == fake_midi_content
        finally:
            if abs_path.exists():
                abs_path.unlink()


class TestGetOriginalAudio:
    """Tests for GET /api/files/jobs/{job_id}/original."""

    def test_get_original_audio_not_found_in_db(self, client: TestClient):
        """Should return 404 when job_id does not exist in database."""
        response = client.get("/api/files/jobs/non-existent-job-id/original")
        assert response.status_code == 404
        assert "Job 'non-existent-job-id' not found" in response.json()["detail"]

    def test_get_original_audio_file_not_found_on_disk(
        self, client: TestClient, db_session: Session
    ):
        """Should return 404 with 'File not found on disk' when original audio is missing from disk."""
        job = Job(
            title="Test Job",
            original_filename="my_song.wav",
            audio_path="uploads/nonexistent.wav",
            file_size_bytes=100,
        )
        db_session.add(job)
        db_session.commit()

        response = client.get(f"/api/files/jobs/{job.id}/original")
        assert response.status_code == 404
        assert "File not found on disk" in response.json()["detail"]

    def test_get_original_audio_success(
        self, client: TestClient, db_session: Session, sample_wav_bytes: bytes
    ):
        """Should successfully stream original audio file when file exists on disk."""
        relative_path = "uploads/original_test.wav"
        abs_path = get_absolute_path(relative_path)
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        abs_path.write_bytes(sample_wav_bytes)

        try:
            job = Job(
                title="Test Job",
                original_filename="original_test.wav",
                audio_path=relative_path,
                file_size_bytes=len(sample_wav_bytes),
            )
            db_session.add(job)
            db_session.commit()

            response = client.get(f"/api/files/jobs/{job.id}/original")
            assert response.status_code == 200
            assert response.headers["content-type"] == "audio/wav"
            assert response.content == sample_wav_bytes
        finally:
            if abs_path.exists():
                abs_path.unlink()
