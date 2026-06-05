"""Tests for the practice sessions API endpoints."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.models import Job, Stem

def test_practice_session_flow(client: TestClient, db_session: Session):
    # 1. Create a dummy job and stem in DB to satisfy foreign keys
    db_job = Job(
        id="test-job-id",
        title="Test Song",
        original_filename="song.wav",
        audio_path="/tmp/song.wav",
        file_size_bytes=1000,
        status="complete"
    )
    db_session.add(db_job)
    db_session.commit()

    db_stem = Stem(
        id="test-stem-id",
        job_id="test-job-id",
        instrument_name="Vocals",
        instrument_family="vocals",
        clef="treble"
    )
    db_session.add(db_stem)
    db_session.commit()

    # 2. Record a practice session
    payload = {
        "job_id": "test-job-id",
        "stem_id": "test-stem-id",
        "accuracy": 85.0,
        "total_notes": 10,
        "correct_notes": 8,
        "elapsed_seconds": 15.5,
        "tempo_percent": 100.0
    }
    response = client.post("/api/practice", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["job_id"] == "test-job-id"
    assert data["stem_id"] == "test-stem-id"
    assert data["accuracy"] == 85.0
    assert data["total_notes"] == 10
    assert data["correct_notes"] == 8
    assert data["elapsed_seconds"] == 15.5
    assert data["tempo_percent"] == 100.0
    assert "id" in data
    assert "created_at" in data

    # 3. Retrieve the last practice session
    response = client.get("/api/practice/last", params={"job_id": "test-job-id", "stem_id": "test-stem-id"})
    assert response.status_code == 200
    data = response.json()
    assert data is not None
    assert data["job_id"] == "test-job-id"
    assert data["stem_id"] == "test-stem-id"
    assert data["accuracy"] == 85.0

    # 4. Retrieve with no stem_id (should be null since we registered it with a stem)
    response = client.get("/api/practice/last", params={"job_id": "test-job-id"})
    assert response.status_code == 200
    data = response.json()
    assert data is None
