export type JobStatus =
  | 'pending'
  | 'processing'
  | 'separating'
  | 'transcribing'
  | 'generating'
  | 'complete'
  | 'failed';

export interface Score {
  id: string;
  stem_id: string | null;
  format: 'musicxml' | 'midi' | 'pdf';
  download_url: string;
  is_ensemble: boolean;
}

export interface Stem {
  id: string;
  instrument_name: string;
  instrument_family: string;
  clef: string;
  is_percussion: boolean;
  confidence: number;
  stem_name: string | null;
  note_count: number;
  audio_url: string | null;
  peaks_url: string | null;
  preview_url: string | null;
}

export interface Job {
  id: string;
  title: string;
  status: JobStatus;
  progress: number;
  progress_message: string | null;
  error_message: string | null;
  original_filename: string;
  file_size_bytes: number;
  duration_seconds: number | null;
  transcribe_vocals: boolean;
  indian_percussion_mode: boolean;
  quantization: 'eighth' | 'sixteenth';
  bpm_override: number | null;
  time_signature: string;
  tempo_bpm: number | null;
  key_signature: string | null;
  separator_used: string | null;
  transcriber_used: string | null;
  processing_seconds: number | null;
  original_url: string;
  peaks_url: string | null;
  beat_times: number[];
  stems: Stem[];
  scores: Score[];
  created_at: string;
  updated_at: string;
}

export interface JobSummary {
  id: string;
  title: string;
  status: JobStatus;
  progress: number;
  progress_message: string | null;
  error_message: string | null;
  original_filename: string;
  duration_seconds: number | null;
  tempo_bpm: number | null;
  key_signature: string | null;
  time_signature: string;
  instrument_count: number;
  stems: Stem[];
  created_at: string;
  updated_at: string;
}

export interface JobProgressEvent {
  job_id: string;
  status: JobStatus;
  progress: number;
  message: string | null;
  stage: string | null;
}

export interface Health {
  status: string;
  version: string;
  engines: {
    separator: string;
    transcriber: string;
    lyrics: boolean;
    demucs?: boolean;
    basic_pitch?: boolean;
  };
  limits: {
    max_file_size_mb: number;
    max_duration_seconds: number;
    allowed_extensions: string[];
  };
}

export interface Peaks {
  duration: number;
  rms: number;
  peaks: number[];
}

export interface CreateJobOptions {
  title?: string;
  transcribeVocals: boolean;
  indianPercussionMode: boolean;
  quantization: 'eighth' | 'sixteenth';
  bpm?: number | null;
  timeSignature: string;
}
