from __future__ import annotations
"""SSE endpoint for real-time job progress streaming."""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from app.database import get_db, SessionLocal
from app.models import Job
from app.schemas import JobProgressEvent

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Progress"])

POLL_INTERVAL_SECONDS = 1.0
TERMINAL_STATUSES = {"complete", "failed"}


async def _progress_event_generator(
    request: Request,
    job_id: str,
) -> AsyncGenerator[dict, None]:
    """
    Generate SSE events by polling the database for job progress changes.

    Yields dict payloads compatible with sse-starlette's EventSourceResponse.
    Stops when the job reaches a terminal status or the client disconnects.
    """
    last_status: str | None = None
    last_progress: float | None = None

    while True:
        # Check for client disconnect
        if await request.is_disconnected():
            logger.info("Client disconnected from SSE stream for job %s", job_id)
            break

        # Poll the database in a fresh session to get latest state
        db = SessionLocal()
        try:
            job = db.query(Job).filter(Job.id == job_id).first()
            if not job:
                yield {
                    "event": "error",
                    "data": json.dumps({"error": f"Job '{job_id}' not found"}),
                }
                break

            # Only emit an event if something changed
            if job.status != last_status or job.progress != last_progress:
                last_status = job.status
                last_progress = job.progress

                event_data = JobProgressEvent(
                    job_id=job.id,
                    status=job.status,
                    progress=job.progress,
                    message=job.progress_message,
                    stage=job.status,
                )

                if job.status == "complete":
                    yield {
                        "event": "progress",
                        "data": event_data.model_dump_json(),
                    }
                    yield {
                        "event": "complete",
                        "data": json.dumps({"job_id": job.id, "status": "complete"}),
                    }
                    break
                elif job.status == "failed":
                    yield {
                        "event": "progress",
                        "data": event_data.model_dump_json(),
                    }
                    yield {
                        "event": "error",
                        "data": json.dumps({
                            "job_id": job.id,
                            "error": job.error_message or "Unknown error",
                        }),
                    }
                    break
                else:
                    yield {
                        "event": "progress",
                        "data": event_data.model_dump_json(),
                    }
        finally:
            db.close()

        await asyncio.sleep(POLL_INTERVAL_SECONDS)


@router.get(
    "/jobs/{job_id}/progress",
    summary="Stream job progress via Server-Sent Events",
)
async def stream_job_progress(
    request: Request,
    job_id: str,
    db: Session = Depends(get_db),
) -> EventSourceResponse:
    """
    Server-Sent Events endpoint for real-time job progress updates.

    The client receives events with the following types:
    - `progress`: Periodic progress updates with status, progress %, and message.
    - `complete`: Sent once when the job finishes successfully.
    - `error`: Sent if the job fails, includes error details.

    The stream automatically closes on terminal events or client disconnect.
    """
    # Verify the job exists before starting the stream
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found",
        )

    return EventSourceResponse(
        _progress_event_generator(request, job_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )
