"""FastAPI application entry point."""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from functools import lru_cache

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings  # noqa: F401 — also puts ml_pipeline on sys.path
from app.database import init_db
from app.routers import files, jobs, progress
from app.services.file_service import ensure_directories
from app.tasks.pipeline import recover_interrupted_jobs

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

API_VERSION = "1.0.0"


@lru_cache(maxsize=1)
def engine_capabilities() -> dict:
    try:
        from ml_pipeline.orchestrator import capabilities

        return capabilities(settings.SEPARATOR_BACKEND)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not inspect ML capabilities: %s", exc)
        return {"separator": "unknown", "transcriber": "unknown", "lyrics": False}


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown lifecycle for the application."""
    logger.info("Starting MuSheet API…")
    init_db()
    ensure_directories()
    recovered = recover_interrupted_jobs()
    if recovered:
        logger.warning("Marked %d interrupted job(s) as failed", recovered)
    caps = engine_capabilities()
    logger.info("Engines: separation=%s, transcription=%s", caps.get("separator"), caps.get("transcriber"))
    yield
    logger.info("Shutting down.")


app = FastAPI(
    title="MuSheet API",
    description=(
        "Upload audio, separate it into instrument stems, transcribe each "
        "stem and generate sheet music (MusicXML + MIDI)."
    ),
    version=API_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Range", "Accept-Ranges"],
)

app.include_router(jobs.router, prefix="/api")
app.include_router(files.router, prefix="/api")
app.include_router(progress.router, prefix="/api")


@app.get("/", tags=["Root"])
def root() -> dict:
    """API information and welcome endpoint."""
    return {
        "name": "MuSheet API",
        "version": API_VERSION,
        "docs": "/docs",
        "health": "/api/health",
    }


@app.get("/api/health", tags=["Health"])
def health_check() -> dict:
    """Health check, including which ML engines are available."""
    return {
        "status": "healthy",
        "version": API_VERSION,
        "engines": engine_capabilities(),
        "limits": {
            "max_file_size_mb": settings.MAX_FILE_SIZE_MB,
            "max_duration_seconds": settings.MAX_DURATION_SECONDS,
            "allowed_extensions": settings.ALLOWED_EXTENSIONS,
        },
    }
