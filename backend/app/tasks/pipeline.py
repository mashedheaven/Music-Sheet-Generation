"""Background execution of the transcription pipeline.

Jobs are queued on a small thread pool (one job at a time by default — the
ML models are memory hungry) and their progress is written to the database,
where the SSE endpoint picks it up.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from pathlib import Path

from app.config import settings
from app.database import SessionLocal
from app.models import Job, Score, Stem
from app.services.file_service import get_absolute_path, to_relative
from app.services.job_bus import job_bus

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(
    max_workers=max(1, settings.MAX_CONCURRENT_JOBS), thread_name_prefix="ml-pipeline"
)
_futures: dict[str, Future] = {}
_lock = threading.Lock()

# The session factory is a module attribute so tests can point it elsewhere.
session_factory = SessionLocal

# ML pipeline stage → user-facing job status.
STAGE_TO_STATUS = {
    "preprocessing": "processing",
    "separating": "separating",
    "detecting": "transcribing",
    "transcribing": "transcribing",
    "quantizing": "transcribing",
    "generating_scores": "generating",
    "complete": "generating",  # becomes "complete" once results are saved
    "failed": "failed",
}

FAMILY_SORT = {"vocals": 0, "keys": 1, "guitar": 2, "generic_melodic": 3, "strings": 4, "winds": 5, "bass": 6, "drums": 7}


def submit_job(job_id: str) -> None:
    """Queue a job for background processing."""
    with _lock:
        existing = _futures.get(job_id)
        if existing is not None and not existing.done():
            return
        _futures[job_id] = _executor.submit(run_pipeline, job_id)


def is_running(job_id: str) -> bool:
    with _lock:
        fut = _futures.get(job_id)
        return fut is not None and not fut.done()


def _update_progress(job_id: str, status: str, progress: float, message: str | None = None) -> None:
    db = session_factory()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = status
            # Progress only ever moves forward (no jumping back between stages).
            job.progress = max(job.progress or 0.0, max(0.0, min(1.0, progress)))
            job.progress_message = (message or "")[:255] or None
            db.commit()
    finally:
        db.close()
    job_bus.notify(job_id)


def _fail_job(job_id: str, error_message: str) -> None:
    db = session_factory()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = "failed"
            job.error_message = error_message
            job.progress_message = "Processing failed"
            db.commit()
            logger.error("Job %s failed: %s", job_id, error_message)
    finally:
        db.close()
    job_bus.notify(job_id)


def _build_config(job: Job):
    from ml_pipeline.config import PipelineConfig

    try:
        num, den = (int(x) for x in (job.time_signature or "4/4").split("/"))
    except ValueError:
        num, den = 4, 4

    return PipelineConfig(
        output_dir=settings.SCORES_DIR / job.id,
        stems_dir=settings.STEMS_DIR / job.id,
        transcribe_vocals=job.transcribe_vocals,
        indian_percussion_mode=job.indian_percussion_mode,
        quantization_grid=PipelineConfig.grid_from_name(job.quantization),
        bpm_override=job.bpm_override,
        time_signature=(num, den),
        title=job.title,
        max_duration_seconds=settings.MAX_DURATION_SECONDS,
        max_file_size_mb=settings.MAX_FILE_SIZE_MB,
        separator_backend=settings.SEPARATOR_BACKEND,
        separator_model=settings.SEPARATOR_MODEL,
        use_gpu=settings.USE_GPU,
        transcribe_lyrics=settings.TRANSCRIBE_LYRICS,
    )


def _persist_results(job_id: str, result) -> None:
    """Write stems, scores and analysis metadata to the database."""
    db = session_factory()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return

        md = result.metadata
        ordered = sorted(
            enumerate(result.stems),
            key=lambda p: (FAMILY_SORT.get(p[1].instrument_info.family.value, 9), p[0]),
        )
        for order, (_, sr) in enumerate(ordered):
            stem = Stem(
                job_id=job_id,
                instrument_name=sr.instrument_info.name,
                instrument_family=sr.instrument_info.family.value,
                clef=sr.instrument_info.clef,
                is_percussion=sr.instrument_info.is_percussion,
                confidence=sr.instrument_info.confidence,
                audio_path=to_relative(sr.audio_path),
                stem_name=sr.stem_name or None,
                note_count=sr.note_count,
                peaks_path=to_relative(sr.peaks_path) if sr.peaks_path else None,
                synth_path=to_relative(sr.synth_path) if sr.synth_path else None,
                sort_order=order,
            )
            db.add(stem)
            db.flush()
            if sr.score:
                for fmt, path in (("musicxml", sr.score.musicxml_path), ("midi", sr.score.midi_path)):
                    if path and Path(path).exists():
                        db.add(Score(job_id=job_id, stem_id=stem.id, format=fmt,
                                     file_path=to_relative(path), is_ensemble=False))

        ens = result.ensemble_score
        if ens:
            for fmt, path in (("musicxml", ens.musicxml_path), ("midi", ens.midi_path), ("pdf", ens.pdf_path)):
                if path and Path(path).exists():
                    db.add(Score(job_id=job_id, stem_id=None, format=fmt,
                                 file_path=to_relative(path), is_ensemble=True))

        job.duration_seconds = md.get("duration_seconds")
        job.tempo_bpm = md.get("global_bpm")
        job.key_signature = md.get("key")
        job.beat_times_json = json.dumps(md.get("beat_times") or [])
        job.separator_used = md.get("separator")
        job.transcriber_used = md.get("transcriber")
        job.processing_seconds = md.get("processing_time_seconds")
        if md.get("mix_peaks_path"):
            job.peaks_path = to_relative(md["mix_peaks_path"])
        job.status = "complete"
        job.progress = 1.0
        job.progress_message = "Transcription complete"
        job.error_message = None
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    job_bus.notify(job_id)


def run_pipeline(job_id: str, audio_path: str | None = None) -> None:
    """Execute the transcription pipeline for a job (blocking)."""
    from ml_pipeline.orchestrator import PipelineOrchestrator

    db = session_factory()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            logger.warning("Job %s disappeared before processing", job_id)
            return
        config = _build_config(job)
        absolute_audio = get_absolute_path(audio_path or job.audio_path)
    finally:
        db.close()

    logger.info("Starting pipeline for job %s", job_id)
    _update_progress(job_id, "processing", 0.01, "Starting…")
    started = time.time()

    def progress_callback(progress) -> None:
        status = STAGE_TO_STATUS.get(progress.stage.value, "processing")
        if status == "failed":
            return  # handled below with the real error message
        _update_progress(job_id, status, min(progress.progress, 0.99), progress.message)

    try:
        orchestrator = PipelineOrchestrator.create_real(config=config)
        result = orchestrator.run(absolute_audio, progress_callback=progress_callback)
        if "error" in result.metadata:
            _fail_job(job_id, _friendly_error(result.metadata["error"]))
            return
        _persist_results(job_id, result)
        logger.info("Job %s complete in %.1fs", job_id, time.time() - started)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Pipeline crashed for job %s", job_id)
        _fail_job(job_id, _friendly_error(str(exc)))


def _friendly_error(message: str) -> str:
    lower = message.lower()
    if "no space left" in lower:
        return "The server ran out of disk space while processing this file."
    if "out of memory" in lower or "cannot allocate" in lower:
        return "The server ran out of memory. Try a shorter clip."
    return message or "Unknown error"


def recover_interrupted_jobs() -> int:
    """Mark jobs left mid-processing by a previous server run as failed."""
    db = session_factory()
    try:
        stuck = db.query(Job).filter(Job.status.notin_(Job.TERMINAL_STATUSES)).all()
        for job in stuck:
            job.status = "failed"
            job.error_message = "Processing was interrupted because the server restarted. Click “Retry” to process it again."
            job.progress_message = "Interrupted"
        db.commit()
        return len(stuck)
    finally:
        db.close()
