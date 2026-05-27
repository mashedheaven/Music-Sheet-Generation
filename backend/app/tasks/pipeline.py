from __future__ import annotations
"""Background pipeline task for processing transcription jobs.

Tries to use the real ml_pipeline orchestrator. Falls back to a stub
simulation when the ML package is not installed (MVP development mode).
"""

import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from app.config import settings
from app.database import SessionLocal
from app.models import Job, Score, Stem

logger = logging.getLogger(__name__)

# Thread pool for CPU-bound ML work
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="ml-pipeline")


def _update_progress(
    job_id: str,
    status: str,
    progress: float,
    message: str | None = None,
) -> None:
    """Update job progress in the database (called from the background thread)."""
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = status
            job.progress = max(0.0, min(1.0, progress))
            job.progress_message = message
            db.commit()
            logger.info(
                "Job %s: %s (%.0f%%) — %s", job_id, status, progress * 100, message
            )
    finally:
        db.close()


def _fail_job(job_id: str, error_message: str) -> None:
    """Mark a job as failed with an error message."""
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = "failed"
            job.progress = job.progress  # Keep last known progress
            job.error_message = error_message
            job.progress_message = "Pipeline failed"
            db.commit()
            logger.error("Job %s failed: %s", job_id, error_message)
    finally:
        db.close()


def _create_stub_stems(job_id: str) -> list[dict]:
    """Create simulated stem data for MVP development."""
    return [
        {
            "instrument_name": "Piano",
            "instrument_family": "keyboard",
            "clef": "treble",
            "is_percussion": False,
            "confidence": 0.95,
        },
        {
            "instrument_name": "Bass",
            "instrument_family": "strings",
            "clef": "bass",
            "is_percussion": False,
            "confidence": 0.88,
        },
        {
            "instrument_name": "Drums",
            "instrument_family": "percussion",
            "clef": "percussion",
            "is_percussion": True,
            "confidence": 0.92,
        },
    ]


def _create_stub_scores(job_id: str, stem_ids: list[str]) -> list[dict]:
    """Create simulated score file data for MVP development."""
    scores = []
    scores_dir = settings.SCORES_DIR / job_id
    scores_dir.mkdir(parents=True, exist_ok=True)

    # Per-stem MusicXML scores
    for stem_id in stem_ids:
        score_path = scores_dir / f"{stem_id}.musicxml"
        score_path.write_text('<?xml version="1.0"?>\n<score-partwise/>\n')
        scores.append({
            "stem_id": stem_id,
            "format": "musicxml",
            "file_path": str(score_path.relative_to(Path(settings.STORAGE_BASE_PATH))),
            "is_ensemble": False,
        })

    # Ensemble score
    ensemble_path = scores_dir / "ensemble.musicxml"
    ensemble_path.write_text('<?xml version="1.0"?>\n<score-partwise/>\n')
    scores.append({
        "stem_id": None,
        "format": "musicxml",
        "file_path": str(ensemble_path.relative_to(Path(settings.STORAGE_BASE_PATH))),
        "is_ensemble": True,
    })

    return scores


def _run_stub_pipeline(job_id: str, audio_path: str) -> None:
    """Simulate the ML pipeline with delays for SSE progress visibility."""
    stages = [
        ("processing", 0.1, "Analyzing audio file..."),
        ("processing", 0.2, "Detecting tempo and key signature..."),
        ("separating", 0.3, "Separating audio into stems..."),
        ("separating", 0.5, "Isolating instruments..."),
        ("transcribing", 0.6, "Transcribing notes from stems..."),
        ("transcribing", 0.75, "Applying pitch correction..."),
        ("generating", 0.85, "Generating sheet music..."),
        ("generating", 0.95, "Finalizing score layout..."),
    ]

    for stage_status, progress, message in stages:
        _update_progress(job_id, stage_status, progress, message)
        time.sleep(2)  # Simulate processing time

    # Create simulated results
    stem_data = _create_stub_stems(job_id)
    stem_ids: list[str] = []

    db = SessionLocal()
    try:
        # Create stem records
        for data in stem_data:
            stem = Stem(job_id=job_id, **data)
            db.add(stem)
            db.flush()
            stem_ids.append(stem.id)

        # Create score records
        score_data = _create_stub_scores(job_id, stem_ids)
        for data in score_data:
            score = Score(job_id=job_id, **data)
            db.add(score)

        # Mark job as complete
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = "complete"
            job.progress = 1.0
            job.progress_message = "Transcription complete"

        db.commit()
        logger.info("Stub pipeline completed for job %s", job_id)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _run_real_pipeline(job_id: str, audio_path: str) -> None:
    """Run the real ML pipeline orchestrator."""
    from ml_pipeline.orchestrator import PipelineOrchestrator

    absolute_audio = (Path(settings.STORAGE_BASE_PATH) / audio_path).resolve()

    def progress_callback(status: str, progress: float, message: str) -> None:
        _update_progress(job_id, status, progress, message)

    orchestrator = PipelineOrchestrator.create_default()
    result = orchestrator.run(
        audio_path=str(absolute_audio),
        progress_callback=progress_callback,
    )

    # Persist results to database
    db = SessionLocal()
    try:
        stem_ids: list[str] = []

        # Create stem records from pipeline result
        for stem_result in result.stems:
            stem = Stem(
                job_id=job_id,
                instrument_name=stem_result.instrument_name,
                instrument_family=stem_result.instrument_family,
                clef=stem_result.clef,
                is_percussion=stem_result.is_percussion,
                confidence=stem_result.confidence,
                audio_path=stem_result.audio_path,
            )
            db.add(stem)
            db.flush()
            stem_ids.append(stem.id)

        # Create score records from pipeline result
        for score_result in result.scores:
            # Map stem index to stem ID if applicable
            stem_id = None
            if score_result.stem_index is not None and score_result.stem_index < len(stem_ids):
                stem_id = stem_ids[score_result.stem_index]

            score = Score(
                job_id=job_id,
                stem_id=stem_id,
                format=score_result.format,
                file_path=score_result.file_path,
                is_ensemble=score_result.is_ensemble,
            )
            db.add(score)

        # Mark job as complete
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = "complete"
            job.progress = 1.0
            job.progress_message = "Transcription complete"
            job.duration_seconds = getattr(result, "duration_seconds", None)

        db.commit()
        logger.info("ML pipeline completed for job %s", job_id)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def run_pipeline(job_id: str, audio_path: str) -> None:
    """
    Execute the transcription pipeline for a job.

    Attempts to use the real ml_pipeline orchestrator. Falls back to
    a stub simulation if the ML package is not installed.

    This function is designed to be called from FastAPI's BackgroundTasks.
    """
    logger.info("Starting pipeline for job %s", job_id)
    _update_progress(job_id, "processing", 0.05, "Starting pipeline...")

    try:
        try:
            import ml_pipeline.orchestrator  # noqa: F401

            logger.info("Using real ML pipeline for job %s", job_id)
            _run_real_pipeline(job_id, audio_path)
        except ImportError:
            logger.warning(
                "ml_pipeline not installed — using stub pipeline for job %s", job_id
            )
            _run_stub_pipeline(job_id, audio_path)
    except Exception as exc:
        logger.exception("Pipeline failed for job %s", job_id)
        _fail_job(job_id, str(exc))
