"""Tests for file service path resolution and security checks."""

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.database import get_db
from app.models import Job, Score, Stem
from app.services.file_service import get_absolute_path


def test_get_absolute_path_valid():
    base_path = Path(settings.STORAGE_BASE_PATH).resolve()
    rel_path = "uploads/test.wav"
    expected = base_path / rel_path
    assert get_absolute_path(rel_path) == expected


def test_get_absolute_path_traversal_relative():
    with pytest.raises(ValueError, match="Access denied"):
        get_absolute_path("../../etc/passwd")


def test_get_absolute_path_traversal_absolute():
    with pytest.raises(ValueError, match="Access denied"):
        get_absolute_path("/etc/passwd")


def test_router_path_traversal(client: TestClient, db_session):
    # Setup job with malicious audio_path
    job = Job(
        title="Test Job",
        original_filename="test.mp3",
        file_size_bytes=100,
        status="completed",
        audio_path="../../etc/passwd",
    )
    db_session.add(job)
    db_session.commit()

    response = client.get(f"/api/files/jobs/{job.id}/original")
    assert response.status_code == 400
    assert "Access denied" in response.json()["detail"]
