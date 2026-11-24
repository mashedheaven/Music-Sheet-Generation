"""Tests for the jobs API endpoints."""

import io
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


class TestCreateJob:
    """Tests for POST /api/jobs."""

    def test_create_job_success(self, client: TestClient, sample_wav_bytes: bytes):
        """Uploading a valid WAV file should create a job with status 201."""
        response = client.post(
            "/api/jobs",
            files={"file": ("test_song.wav", io.BytesIO(sample_wav_bytes), "audio/wav")},
            data={"title": "My Test Song", "transcribe_vocals": "false", "indian_percussion_mode": "true"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "My Test Song"
        assert data["status"] == "pending"
        assert data["original_filename"] == "test_song.wav"
        assert data["file_size_bytes"] > 0
        assert data["progress"] == 0.0
        assert data["transcribe_vocals"] is False
        assert data["indian_percussion_mode"] is True
        assert "id" in data

    def test_create_job_default_title(self, client: TestClient, sample_wav_bytes: bytes):
        """When no title is provided, it should default to the filename stem."""
        response = client.post(
            "/api/jobs",
            files={"file": ("awesome_track.wav", io.BytesIO(sample_wav_bytes), "audio/wav")},
        )
        assert response.status_code == 201
        assert response.json()["title"] == "awesome_track"

    def test_create_job_invalid_extension(self, client: TestClient):
        """Uploading a file with an unsupported extension should return 422."""
        fake_file = io.BytesIO(b"not real audio data")
        response = client.post(
            "/api/jobs",
            files={"file": ("song.txt", fake_file, "text/plain")},
        )
        assert response.status_code == 422
        assert "Unsupported file type" in response.json()["detail"]

    def test_create_job_no_file(self, client: TestClient):
        """Sending a request without a file should return 422."""
        response = client.post("/api/jobs")
        assert response.status_code == 422


class TestListJobs:
    """Tests for GET /api/jobs."""

    def test_list_jobs_empty(self, client: TestClient):
        """Should return an empty list when no jobs exist."""
        response = client.get("/api/jobs")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_jobs_with_data(self, client: TestClient, sample_wav_bytes: bytes):
        """Should return all created jobs in reverse chronological order."""
        # Create two jobs
        client.post(
            "/api/jobs",
            files={"file": ("song1.wav", io.BytesIO(sample_wav_bytes), "audio/wav")},
            data={"title": "First Song"},
        )
        client.post(
            "/api/jobs",
            files={"file": ("song2.wav", io.BytesIO(sample_wav_bytes), "audio/wav")},
            data={"title": "Second Song"},
        )

        response = client.get("/api/jobs")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        # Newest first
        assert data[0]["title"] == "Second Song"
        assert data[1]["title"] == "First Song"


class TestGetJob:
    """Tests for GET /api/jobs/{job_id}."""

    def test_get_job_success(self, client: TestClient, sample_wav_bytes: bytes):
        """Should return full job details for an existing job."""
        create_resp = client.post(
            "/api/jobs",
            files={"file": ("song.wav", io.BytesIO(sample_wav_bytes), "audio/wav")},
            data={"title": "Test Song"},
        )
        job_id = create_resp.json()["id"]

        response = client.get(f"/api/jobs/{job_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == job_id
        assert data["title"] == "Test Song"
        assert "stems" in data
        assert "scores" in data

    def test_get_job_not_found(self, client: TestClient):
        """Should return 404 for a non-existent job ID."""
        response = client.get("/api/jobs/non-existent-uuid")
        assert response.status_code == 404


class TestDeleteJob:
    """Tests for DELETE /api/jobs/{job_id}."""

    def test_delete_job_success(self, client: TestClient, sample_wav_bytes: bytes):
        """Should delete the job and return 204."""
        create_resp = client.post(
            "/api/jobs",
            files={"file": ("song.wav", io.BytesIO(sample_wav_bytes), "audio/wav")},
            data={"title": "To Delete"},
        )
        job_id = create_resp.json()["id"]

        response = client.delete(f"/api/jobs/{job_id}")
        assert response.status_code == 204

        # Verify it's gone
        get_resp = client.get(f"/api/jobs/{job_id}")
        assert get_resp.status_code == 404

    def test_delete_job_not_found(self, client: TestClient):
        """Should return 404 for a non-existent job ID."""
        response = client.delete("/api/jobs/non-existent-uuid")
        assert response.status_code == 404


class TestHealthCheck:
    """Tests for GET /api/health."""

    def test_health_check(self, client: TestClient):
        """Health endpoint should return healthy status."""
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"


class TestRootEndpoint:
    """Tests for GET /."""

    def test_root(self, client: TestClient):
        """Root endpoint should return API info."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "name" in data
        assert "version" in data


class TestJobOptions:
    """Validation of the processing options accepted on upload."""

    def test_job_is_queued(self, client: TestClient, sample_wav_bytes: bytes, submitted):
        resp = client.post("/api/jobs", files={"file": ("a.wav", io.BytesIO(sample_wav_bytes), "audio/wav")})
        assert resp.status_code == 201
        assert submitted == [resp.json()["id"]]

    def test_options_are_stored(self, client: TestClient, sample_wav_bytes: bytes):
        resp = client.post(
            "/api/jobs",
            files={"file": ("a.wav", io.BytesIO(sample_wav_bytes), "audio/wav")},
            data={"quantization": "eighth", "bpm": "92", "time_signature": "3/4"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["quantization"] == "eighth"
        assert data["bpm_override"] == 92
        assert data["time_signature"] == "3/4"
        assert data["original_url"].endswith("/original")

    @pytest.mark.parametrize(
        "field,value",
        [("quantization", "32nd"), ("time_signature", "7/8"), ("bpm", "5")],
    )
    def test_invalid_options_rejected(self, client: TestClient, sample_wav_bytes: bytes, field, value):
        resp = client.post(
            "/api/jobs",
            files={"file": ("a.wav", io.BytesIO(sample_wav_bytes), "audio/wav")},
            data={field: value},
        )
        assert resp.status_code == 422

    def test_empty_file_rejected(self, client: TestClient):
        resp = client.post("/api/jobs", files={"file": ("a.wav", io.BytesIO(b""), "audio/wav")})
        assert resp.status_code == 422


class TestRetryAndRename:
    def test_retry_requeues(self, client: TestClient, sample_wav_bytes: bytes, submitted):
        job_id = client.post(
            "/api/jobs", files={"file": ("a.wav", io.BytesIO(sample_wav_bytes), "audio/wav")}
        ).json()["id"]
        resp = client.post(f"/api/jobs/{job_id}/retry")
        assert resp.status_code == 200
        assert resp.json()["status"] == "pending"
        assert submitted == [job_id, job_id]

    def test_rename(self, client: TestClient, sample_wav_bytes: bytes):
        job_id = client.post(
            "/api/jobs", files={"file": ("a.wav", io.BytesIO(sample_wav_bytes), "audio/wav")}
        ).json()["id"]
        resp = client.patch(f"/api/jobs/{job_id}", data={"title": "  New name "})
        assert resp.status_code == 200
        assert resp.json()["title"] == "New name"

    def test_original_audio_served(self, client: TestClient, sample_wav_bytes: bytes):
        job_id = client.post(
            "/api/jobs", files={"file": ("a.wav", io.BytesIO(sample_wav_bytes), "audio/wav")}
        ).json()["id"]
        resp = client.get(f"/api/files/jobs/{job_id}/original", headers={"Range": "bytes=0-99"})
        assert resp.status_code == 206
        assert len(resp.content) == 100


class TestHealthEngines:
    def test_health_reports_engines(self, client: TestClient):
        data = client.get("/api/health").json()
        assert "engines" in data
        assert data["engines"]["separator"] in {"demucs", "hpss", "unknown"}
