"""In-memory event bus for real-time job progress notifications."""

from __future__ import annotations

import asyncio
import logging
import threading
from collections import defaultdict

logger = logging.getLogger(__name__)


class JobEventBus:
    """
    In-memory pub/sub bus to notify SSE streams of job updates.

    Allows async SSE generators to wait on asyncio.Event signals instead of
    polling the database continuously in a tight loop.
    """

    def __init__(self) -> None:
        self._listeners: dict[str, set[asyncio.Event]] = defaultdict(set)
        self._lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    def register(self, job_id: str) -> asyncio.Event:
        """Register an asyncio.Event listener for a specific job."""
        evt = asyncio.Event()
        with self._lock:
            self._listeners[job_id].add(evt)
        try:
            self._loop = asyncio.get_running_loop()
        except RuntimeError:
            pass
        return evt

    def unregister(self, job_id: str, evt: asyncio.Event) -> None:
        """Unregister an asyncio.Event listener for a specific job."""
        with self._lock:
            if job_id in self._listeners:
                self._listeners[job_id].discard(evt)
                if not self._listeners[job_id]:
                    del self._listeners[job_id]

    def notify(self, job_id: str) -> None:
        """Notify all listeners that a job status/progress has changed."""
        with self._lock:
            if job_id not in self._listeners or not self._listeners[job_id]:
                return
            listeners = list(self._listeners[job_id])

        try:
            loop = asyncio.get_running_loop()
            for evt in listeners:
                evt.set()
        except RuntimeError:
            # Called from a background thread (e.g. ThreadPoolExecutor)
            if self._loop and self._loop.is_running():
                for evt in listeners:
                    self._loop.call_soon_threadsafe(evt.set)


job_bus = JobEventBus()
