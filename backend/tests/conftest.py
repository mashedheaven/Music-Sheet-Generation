"""Shared test fixtures for the backend test suite."""

import io
import os
import tempfile
import wave
from collections.abc import Generator

# Isolate storage and the app database from real data *before* app imports.
_TMP = tempfile.mkdtemp(prefix="musheet-test-")
os.environ["STORAGE_BASE_PATH"] = os.path.join(_TMP, "storage")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_TMP, 'app.db')}"

import numpy as np  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app import models  # noqa: E402,F401 — register models
from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.services.file_service import ensure_directories  # noqa: E402
from app.tasks import pipeline  # noqa: E402

# ── In-memory SQLite test database ───────────────────────────────────────────

test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(test_engine, "connect")
def _set_sqlite_pragma(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON;")
    cursor.close()


TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(autouse=True)
def setup_test_db() -> Generator[None, None, None]:
    """Create all tables before each test and drop them after."""
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def submitted(monkeypatch) -> list[str]:
    """Capture queued job ids instead of running the (slow) ML pipeline."""
    calls: list[str] = []
    monkeypatch.setattr(pipeline, "submit_job", lambda job_id: calls.append(job_id))
    monkeypatch.setattr(pipeline, "is_running", lambda job_id: False)
    return calls


@pytest.fixture()
def client(db_session: Session, submitted) -> Generator[TestClient, None, None]:
    """Provide a test client with the test database injected."""

    def _override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    ensure_directories()

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


def _wav_bytes(samples: np.ndarray, sr: int = 44100) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes((np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())
    return buffer.getvalue()


@pytest.fixture()
def sample_wav_bytes() -> bytes:
    """A minimal valid WAV file (0.1 seconds of silence)."""
    return _wav_bytes(np.zeros(4410))


@pytest.fixture()
def melody_wav_bytes() -> bytes:
    """Four seconds of a simple C–E–G–C melody (for end-to-end tests)."""
    sr = 44100
    out = []
    for midi in (60, 64, 67, 72) * 2:
        t = np.arange(int(0.5 * sr)) / sr
        f = 440.0 * 2 ** ((midi - 69) / 12)
        env = np.minimum(1, t * 50) * np.exp(-t * 2)
        out.append(0.5 * env * (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)))
    return _wav_bytes(np.concatenate(out), sr)


@pytest.fixture()
def sample_wav_file(sample_wav_bytes: bytes) -> io.BytesIO:
    return io.BytesIO(sample_wav_bytes)
