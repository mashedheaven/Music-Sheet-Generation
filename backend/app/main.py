"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers import files, jobs, progress
from app.services.file_service import ensure_directories

# ── Logging setup ────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# ── Application lifespan ─────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown lifecycle for the application."""
    logger.info("Starting Music Sheet Generation API...")
    init_db()
    ensure_directories()
    logger.info("Startup complete.")
    yield
    logger.info("Shutting down.")


# ── Application factory ─────────────────────────────────────────────────────

app = FastAPI(
    title="Music Sheet Generation API",
    description=(
        "API for uploading audio files, separating instruments, "
        "transcribing notes, and generating sheet music."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS middleware ──────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────────

app.include_router(jobs.router, prefix="/api")
app.include_router(files.router, prefix="/api")
app.include_router(progress.router, prefix="/api")


# ── Root & health endpoints ──────────────────────────────────────────────────

@app.get("/", tags=["Root"])
def root() -> dict:
    """API information and welcome endpoint."""
    return {
        "name": "Music Sheet Generation API",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/api/health",
    }


@app.get("/api/health", tags=["Health"])
def health_check() -> dict:
    """Health check endpoint for monitoring."""
    return {"status": "healthy"}
