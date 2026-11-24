"""File endpoint + CORS tests (ported/adapted from PRs #8, #14, #24)."""

import io

from fastapi.testclient import TestClient

from app.models import Score, Stem


def _create(client: TestClient, wav: bytes) -> str:
    return client.post("/api/jobs", files={"file": ("a.wav", io.BytesIO(wav), "audio/wav")}).json()["id"]


def test_missing_resources_return_404(client: TestClient):
    for url in (
        "/api/files/stems/nope/audio",
        "/api/files/stems/nope/peaks",
        "/api/files/stems/nope/preview",
        "/api/files/scores/nope/download",
        "/api/files/jobs/nope/original",
        "/api/files/jobs/nope/peaks",
        "/api/jobs/nope/progress",
    ):
        assert client.get(url).status_code == 404, url


def test_records_whose_files_are_gone_return_404(client: TestClient, sample_wav_bytes, db_session):
    job_id = _create(client, sample_wav_bytes)
    stem = Stem(job_id=job_id, instrument_name="Bass", instrument_family="bass", audio_path="stems/x/missing.wav")
    db_session.add(stem)
    db_session.flush()
    score = Score(job_id=job_id, stem_id=stem.id, format="musicxml", file_path="scores/x/missing.musicxml")
    db_session.add(score)
    db_session.commit()
    assert client.get(f"/api/files/stems/{stem.id}/audio").status_code == 404
    assert client.get(f"/api/files/stems/{stem.id}/peaks").status_code == 404  # no peaks recorded
    assert client.get(f"/api/files/scores/{score.id}/download").status_code == 404
    assert client.get(f"/api/files/jobs/{job_id}/peaks").status_code == 404


def test_traversal_paths_in_db_are_not_served(client: TestClient, sample_wav_bytes, db_session):
    job_id = _create(client, sample_wav_bytes)
    stem = Stem(job_id=job_id, instrument_name="X", instrument_family="bass", audio_path="../../../../etc/passwd")
    db_session.add(stem)
    db_session.commit()
    assert client.get(f"/api/files/stems/{stem.id}/audio").status_code == 404


def test_cors_allows_frontend_origin(client: TestClient):
    resp = client.options(
        "/api/jobs",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "PATCH"},
    )
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "PATCH" in resp.headers["access-control-allow-methods"]


def test_cors_rejects_unknown_method_and_origin(client: TestClient):
    bad_method = client.options(
        "/api/jobs",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "PUT"},
    )
    assert bad_method.status_code == 400
    bad_origin = client.get("/api/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in bad_origin.headers
