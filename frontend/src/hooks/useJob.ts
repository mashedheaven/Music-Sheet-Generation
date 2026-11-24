import { useCallback, useEffect, useState } from 'react';
import { API_BASE, errorMessage, getJob } from '../api/client';
import type { Job, JobProgressEvent } from '../api/types';
import { isActive } from '../lib/format';

/**
 * Load a job and keep it live while it is processing.
 *
 * Progress arrives over Server-Sent Events; a slow poll runs alongside as a
 * safety net (e.g. if a proxy buffers the event stream). When the job
 * finishes the full record is re-fetched to pick up stems and scores.
 */
export function useJob(jobId: string | undefined) {
  const [state, setState] = useState<{ id: string; job: Job | null; error: string | null } | null>(null);
  // Only expose data that belongs to the job currently being viewed.
  const current = state && state.id === jobId ? state : null;
  const job = current?.job ?? null;
  const error = current?.error ?? null;
  const loading = !current;

  const setJob = useCallback(
    (update: Job | ((prev: Job | null) => Job | null)) =>
      setState((s) => {
        if (!s || !jobId || s.id !== jobId) return s;
        const next = typeof update === 'function' ? update(s.job) : update;
        return { ...s, job: next };
      }),
    [jobId],
  );

  const refresh = useCallback(async () => {
    if (!jobId) return;
    try {
      const data = await getJob(jobId);
      setState({ id: jobId, job: data, error: null });
    } catch (err) {
      setState((s) => ({
        id: jobId,
        job: s && s.id === jobId ? s.job : null,
        error: errorMessage(err, 'Could not load this transcription'),
      }));
    }
  }, [jobId]);

  useEffect(() => {
     
    void refresh();
  }, [refresh]);

  const active = job ? isActive(job.status) : false;

  useEffect(() => {
    if (!jobId || !active) return;
    let closed = false;
    const es = new EventSource(`${API_BASE}/api/jobs/${jobId}/progress`);

    es.addEventListener('progress', (ev) => {
      try {
        const data: JobProgressEvent = JSON.parse((ev as MessageEvent).data);
        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: data.status,
                progress: Math.max(prev.progress, data.progress),
                progress_message: data.message,
              }
            : prev,
        );
      } catch {
        /* ignore malformed events */
      }
    });
    const finish = () => {
      if (closed) return;
      closed = true;
      es.close();
      refresh();
    };
    es.addEventListener('complete', finish);
    es.addEventListener('error', (ev) => {
      // Server-sent "error" events carry data; network errors don't.
      if ((ev as MessageEvent).data) finish();
    });

    const poll = window.setInterval(async () => {
      try {
        const data = await getJob(jobId);
        if (!isActive(data.status)) {
          finish();
        } else {
          setJob((prev) => (prev ? { ...data, progress: Math.max(prev.progress, data.progress) } : data));
        }
      } catch {
        /* keep trying */
      }
    }, 4000);

    return () => {
      closed = true;
      es.close();
      window.clearInterval(poll);
    };
  }, [jobId, active, refresh, setJob]);

  return { job, setJob, error, loading, refresh };
}
