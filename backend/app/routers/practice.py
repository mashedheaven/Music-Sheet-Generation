from __future__ import annotations
"""API routes for managing practice sessions."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import PracticeSession
from app.schemas import PracticeSessionCreate, PracticeSessionResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/practice", tags=["Practice"])


@router.post(
    "",
    response_model=PracticeSessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record a completed practice session",
)
def record_practice_session(
    session_in: PracticeSessionCreate,
    db: Session = Depends(get_db),
) -> PracticeSession:
    """Record the statistics and accuracy of a completed practice session."""
    logger.info(
        f"Recording practice session for job={session_in.job_id}, stem={session_in.stem_id}, accuracy={session_in.accuracy}"
    )
    
    db_session = PracticeSession(
        job_id=session_in.job_id,
        stem_id=session_in.stem_id,
        accuracy=session_in.accuracy,
        total_notes=session_in.total_notes,
        correct_notes=session_in.correct_notes,
        elapsed_seconds=session_in.elapsed_seconds,
        tempo_percent=session_in.tempo_percent,
    )
    
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session


@router.get(
    "/last",
    response_model=Optional[PracticeSessionResponse],
    summary="Get the last practice session for a job and/or stem",
)
def get_last_practice_session(
    job_id: str,
    stem_id: Optional[str] = None,
    db: Session = Depends(get_db),
) -> Optional[PracticeSession]:
    """Retrieve the most recent practice session matching the job and stem."""
    query = select(PracticeSession).where(PracticeSession.job_id == job_id)
    if stem_id:
        query = query.where(PracticeSession.stem_id == stem_id)
    else:
        query = query.where(PracticeSession.stem_id.is_(None))
        
    query = query.order_by(PracticeSession.created_at.desc()).limit(1)
    
    result = db.execute(query).scalar_one_or_none()
    return result
