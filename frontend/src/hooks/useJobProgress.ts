import { useEffect, useRef, useState, useCallback } from 'react';
import type { JobStatus, JobProgressEvent } from '../api/types';

interface UseJobProgressReturn {
  status: JobStatus;
  progress: number;
  message: string;
  stage: string;
  isComplete: boolean;
  isError: boolean;
}

/**
 * Subscribe to SSE progress events for a given job.
 * Auto-reconnects on error with exponential back-off (max 10 s).
 *
 * @param jobId  – the job to track
 * @param enabled – set to false to skip connecting (e.g., when the job is already done)
 */
export function useJobProgress(
  jobId: string | undefined,
  enabled: boolean = true,
): UseJobProgressReturn {
  const [status, setStatus] = useState<JobStatus>('pending');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Waiting…');
  const [stage, setStage] = useState('');
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(1000);

  const connect = useCallback(() => {
    if (!jobId || !enabled) return;

    const url = `http://localhost:8000/api/jobs/${jobId}/progress`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: JobProgressEvent = JSON.parse(event.data);
        setStatus(data.status);
        setProgress(data.progress);
        setMessage(data.message);
        setStage(data.stage);
        retryRef.current = 1000; // reset backoff on success

        // Close when terminal
        if (data.status === 'complete' || data.status === 'failed') {
          es.close();
        }
      } catch {
        // ignore malformed data
      }
    };

    es.onerror = () => {
      es.close();
      // Reconnect with exponential back-off
      const delay = retryRef.current;
      retryRef.current = Math.min(delay * 2, 10_000);
      setTimeout(connect, delay);
    };
  }, [jobId, enabled]);

  useEffect(() => {
    if (enabled) {
      connect();
    }
    return () => {
      esRef.current?.close();
    };
  }, [connect, enabled]);

  return {
    status,
    progress,
    message,
    stage,
    isComplete: status === 'complete',
    isError: status === 'failed',
  };
}
