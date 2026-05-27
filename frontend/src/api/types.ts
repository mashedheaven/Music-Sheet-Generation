// ── Job Status ──────────────────────────────────────────────────────────────
export type JobStatus =
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'separating'
  | 'transcribing'
  | 'generating'
  | 'complete'
  | 'failed';

// ── Score ────────────────────────────────────────────────────────────────────
export interface Score {
  id: string;
  instrument_name: string;
  instrument_family: string;
  format: 'musicxml' | 'midi';
  file_path: string;
  created_at: string;
}

// ── Stem ─────────────────────────────────────────────────────────────────────
export interface Stem {
  id: string;
  instrument_name: string;
  instrument_family: string;
  confidence: number;
  audio_path: string;
  scores: Score[];
}

// ── Job (full detail) ────────────────────────────────────────────────────────
export interface Job {
  id: string;
  title: string;
  status: JobStatus;
  progress: number;
  message: string;
  original_filename: string;
  file_size: number;
  duration: number | null;
  stems: Stem[];
  created_at: string;
  updated_at: string;
}

// ── Job Summary (list view) ──────────────────────────────────────────────────
export interface JobSummary {
  id: string;
  title: string;
  status: JobStatus;
  progress: number;
  message: string;
  original_filename: string;
  instrument_count: number;
  created_at: string;
  updated_at: string;
}

// ── SSE Progress Event ───────────────────────────────────────────────────────
export interface JobProgressEvent {
  job_id: string;
  status: JobStatus;
  progress: number;
  message: string;
  stage: string;
}
