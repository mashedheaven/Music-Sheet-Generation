import axios from 'axios';
import type { Job, JobSummary } from './types';

// ── Axios Instance ───────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
});

// ── API Functions ────────────────────────────────────────────────────────────

/** Upload an audio file and create a new transcription job. */
export async function createJob(
  file: File,
  title?: string,
  transcribeVocals: boolean = true,
  indianPercussionMode: boolean = false,
  onProgress?: (percent: number) => void,
): Promise<Job> {
  const form = new FormData();
  form.append('file', file);
  if (title) form.append('title', title);
  form.append('transcribe_vocals', String(transcribeVocals));
  form.append('indian_percussion_mode', String(indianPercussionMode));

  const { data } = await api.post<Job>('/api/jobs', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress(event) {
      if (event.total && onProgress) {
        onProgress(Math.round((event.loaded * 100) / event.total));
      }
    },
  });
  return data;
}

/** List all jobs (summary view). */
export async function listJobs(): Promise<JobSummary[]> {
  const { data } = await api.get<JobSummary[]>('/api/jobs');
  return data;
}

/** Get full job detail including stems and scores. */
export async function getJob(jobId: string): Promise<Job> {
  const { data } = await api.get<Job>(`/api/jobs/${jobId}`);
  return data;
}

/** Delete a job and all associated data. */
export async function deleteJob(jobId: string): Promise<void> {
  await api.delete(`/api/jobs/${jobId}`);
}

// ── URL Builders ─────────────────────────────────────────────────────────────

export function getStemAudioUrl(stemId: string): string {
  return `${api.defaults.baseURL}/api/files/stems/${stemId}/audio`;
}

export function getScoreDownloadUrl(scoreId: string): string {
  return `${api.defaults.baseURL}/api/files/scores/${scoreId}/download`;
}

export function getOriginalAudioUrl(jobId: string): string {
  return `${api.defaults.baseURL}/api/files/jobs/${jobId}/original`;
}

/** Record a completed practice session */
export async function recordPracticeSession(
  jobId: string,
  stemId: string | null,
  accuracy: number,
  totalNotes: number,
  correctNotes: number,
  elapsedSeconds: number,
  tempoPercent: number,
): Promise<any> {
  const { data } = await api.post('/api/practice', {
    job_id: jobId,
    stem_id: stemId,
    accuracy,
    total_notes: totalNotes,
    correct_notes: correctNotes,
    elapsed_seconds: elapsedSeconds,
    tempo_percent: tempoPercent,
  });
  return data;
}

/** Get the last practice session for a job and stem */
export async function getLastPracticeSession(
  jobId: string,
  stemId?: string,
): Promise<any> {
  const { data } = await api.get('/api/practice/last', {
    params: { job_id: jobId, stem_id: stemId },
  });
  return data;
}

export default api;
