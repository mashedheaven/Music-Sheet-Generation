import axios, { AxiosError } from 'axios';
import type { CreateJobOptions, Health, Job, JobSummary, Peaks } from './types';

/**
 * API base URL. Empty (same origin) by default — Vite proxies `/api` to the
 * backend in development. Set VITE_API_URL to talk to a different host.
 */
export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

const api = axios.create({ baseURL: API_BASE });

/** Turn backend relative URLs (e.g. `/api/files/...`) into absolute ones. */
export function apiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE}${path}`;
}

/** Extract a human readable message from an API error. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof AxiosError) {
    if (!err.response) return 'Cannot reach the MuSheet server. Is the backend running on port 8000?';
    const detail = (err.response.data as { detail?: unknown })?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
    return `${fallback} (HTTP ${err.response.status})`;
  }
  return err instanceof Error ? err.message : fallback;
}

export async function createJob(
  file: File,
  options: CreateJobOptions,
  onProgress?: (percent: number) => void,
): Promise<Job> {
  const form = new FormData();
  form.append('file', file);
  if (options.title?.trim()) form.append('title', options.title.trim());
  form.append('transcribe_vocals', String(options.transcribeVocals));
  form.append('indian_percussion_mode', String(options.indianPercussionMode));
  form.append('quantization', options.quantization);
  form.append('time_signature', options.timeSignature);
  if (options.bpm) form.append('bpm', String(options.bpm));

  const { data } = await api.post<Job>('/api/jobs', form, {
    onUploadProgress(event) {
      if (event.total && onProgress) onProgress(Math.round((event.loaded * 100) / event.total));
    },
  });
  return data;
}

export async function listJobs(): Promise<JobSummary[]> {
  const { data } = await api.get<JobSummary[]>('/api/jobs');
  return data;
}

export async function getJob(jobId: string): Promise<Job> {
  const { data } = await api.get<Job>(`/api/jobs/${jobId}`);
  return data;
}

export async function retryJob(jobId: string): Promise<Job> {
  const { data } = await api.post<Job>(`/api/jobs/${jobId}/retry`);
  return data;
}

export async function renameJob(jobId: string, title: string): Promise<Job> {
  const form = new FormData();
  form.append('title', title);
  const { data } = await api.patch<Job>(`/api/jobs/${jobId}`, form);
  return data;
}

export async function deleteJob(jobId: string): Promise<void> {
  await api.delete(`/api/jobs/${jobId}`);
}

export async function getHealth(): Promise<Health> {
  const { data } = await api.get<Health>('/api/health');
  return data;
}

const peaksCache = new Map<string, Promise<Peaks>>();

export function getPeaks(url: string): Promise<Peaks> {
  let p = peaksCache.get(url);
  if (!p) {
    p = api.get<Peaks>(url).then((r) => r.data);
    p.catch(() => peaksCache.delete(url));
    peaksCache.set(url, p);
  }
  return p;
}

export async function getScoreXml(downloadUrl: string): Promise<string> {
  const { data } = await api.get<string>(downloadUrl, { params: { inline: true }, responseType: 'text' });
  return data;
}

export default api;
