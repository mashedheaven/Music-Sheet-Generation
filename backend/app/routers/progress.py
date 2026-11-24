"""SSE endpoint for real-time job progress streaming."""
from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from app.database import SessionLocal, get_db
from app.models import Job
from app.schemas import JobProgressEvent
from app.services.job_bus import job_bus

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Progress"])

# Updates are pushed via the in-process job bus; this is only the fallback
# re-check interval (e.g. if a job is processed by another worker process).
POLL_INTERVAL_SECONDS = 2.0
TERMINAL_STATUSES = {"complete", "failed"}


async def _progress_event_generator(request: Request, job_id: str) -> AsyncGenerator[dict, None]:
    """
    Yield SSE events whenever the job's status, progress or message changes.

    Waits on the job bus (notified by the pipeline thread) instead of polling
    the database in a tight loop. Stops on a terminal status or disconnect.
    """
    last: tuple | None = None
    evt = job_bus.register(job_id)
    try:
        while True:
            if await request.is_disconnected():
                logger.info("Client disconnected from SSE stream for job %s", job_id)
                break

            # Clear before reading so an update during the read isn't missed.
            evt.clear()
            db = SessionLocal()
            try:
                job = db.query(Job).filter(Job.id == job_id).first()
                if not job:
                    yield {"event": "error", "data": json.dumps({"error": f"Job '{job_id}' not found"})}
                    break

                current = (job.status, job.progress, job.progress_message)
                if current != last:
                    last = current
                    payload = JobProgressEvent(
                        job_id=job.id,
                        status=job.status,
                        progress=job.progress,
                        message=job.progress_message,
                        stage=job.status,
                    ).model_dump_json()
                    yield {"event": "progress", "data": payload}

                    if job.status == "complete":
                        yield {"event": "complete", "data": json.dumps({"job_id": job.id, "status": "complete"})}
                        break
                    if job.status == "failed":
                        yield {
                            "event": "error",
                            "data": json.dumps({"job_id": job.id, "error": job.error_message or "Unknown error"}),
                        }
                        break
            finally:
                db.close()

            try:
                await asyncio.wait_for(evt.wait(), timeout=POLL_INTERVAL_SECONDS)
            except asyncio.TimeoutError:
                pass
    finally:
        job_bus.unregister(job_id, evt)


@router.get("/jobs/{job_id}/progress", summary="Stream job progress via Server-Sent Events")
async def stream_job_progress(
    request: Request,
    job_id: str,
    db: Session = Depends(get_db),
) -> EventSourceResponse:
    """
    Server-Sent Events endpoint for real-time job progress updates.

    Event types:
    - `progress`: status, progress (0-1) and a human readable message.
    - `complete`: sent once when the job finishes successfully.
    - `error`: sent if the job fails, includes error details.
    """
    if not db.query(Job.id).filter(Job.id == job_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job '{job_id}' not found")

    return EventSourceResponse(
        _progress_event_generator(request, job_id),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )
