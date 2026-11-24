"""End-to-end test: run the real pipeline (DSP separator) on a short melody."""

import io

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.models import Job
from app.tasks import pipeline

pytest.importorskip("music21")
pytest.importorskip("librosa")


@pytest.fixture()
def run_inline(monkeypatch, db_session):
    """Run the pipeline synchronously against the test database."""
    from tests.conftest import TestSessionLocal

    monkeypatch.setattr(pipeline, "session_factory", TestSessionLocal)
    monkeypatch.setattr(settings, "SEPARATOR_BACKEND", "hpss")
    monkeypatch.setattr(settings, "TRANSCRIBE_LYRICS", False)
    return pipeline.run_pipeline


def test_full_pipeline(client: TestClient, melody_wav_bytes: bytes, run_inline, db_session):
    resp = client.post(
        "/api/jobs",
        files={"file": ("melody.wav", io.BytesIO(melody_wav_bytes), "audio/wav")},
        data={"title": "Melody", "bpm": "120"},
    )
    job_id = resp.json()["id"]

    run_inline(job_id)

    db_session.expire_all()
    job = db_session.query(Job).filter(Job.id == job_id).one()
    assert job.status == "complete", job.error_message
    assert job.progress == 1.0
    assert job.tempo_bpm == pytest.approx(120, abs=1)
    assert job.key_signature

    data = client.get(f"/api/jobs/{job_id}").json()
    assert data["stems"], "expected stems"
    assert data["beat_times"]
    assert data["peaks_url"]
    formats = {(s["format"], s["is_ensemble"]) for s in data["scores"]}
    assert ("musicxml", True) in formats and ("midi", True) in formats
    assert ("musicxml", False) in formats

    melodic = [s for s in data["stems"] if not s["is_percussion"]]
    assert sum(s["note_count"] for s in melodic) > 0

    stem = data["stems"][0]
    for url in (stem["audio_url"], stem["peaks_url"], stem["preview_url"], data["peaks_url"]):
        r = client.get(url)
        assert r.status_code == 200, url

    xml_score = next(s for s in data["scores"] if s["format"] == "musicxml" and s["is_ensemble"])
    xml = client.get(xml_score["download_url"]).text
    assert "<score-partwise" in xml and "<measure" in xml


def test_pipeline_failure_is_reported(client: TestClient, run_inline, db_session):
    resp = client.post(
        "/api/jobs",
        files={"file": ("broken.wav", io.BytesIO(b"RIFF....not really audio"), "audio/wav")},
    )
    job_id = resp.json()["id"]
    run_inline(job_id)
    db_session.expire_all()
    job = db_session.query(Job).filter(Job.id == job_id).one()
    assert job.status == "failed"
    assert job.error_message
