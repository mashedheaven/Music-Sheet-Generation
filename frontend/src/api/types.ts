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
  stem_id: string | null;
  format: 'musicxml' | 'midi' | 'pdf';
  download_url: string;
  is_ensemble: boolean;
}

// ── Stem ─────────────────────────────────────────────────────────────────────
export interface Stem {
  id: string;
  instrument_name: string;
  instrument_family: string;
  clef: string;
  is_percussion: boolean;
  confidence: number;
  audio_url: string | null;
}

// ── Job (full detail) ────────────────────────────────────────────────────────
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
  stems: Stem[];
  scores: Score[];
  created_at: string;
  updated_at: string;
}

// ── Job Summary (list view) ──────────────────────────────────────────────────
export interface JobSummary {
  id: string;
  title: string;
  status: JobStatus;
  progress: number;
  progress_message: string | null;
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

// ── Practice Mode ────────────────────────────────────────────────────────────
export type PracticeInputMethod = 'microphone' | 'midi';
export type PracticeState = 'idle' | 'countdown' | 'playing' | 'paused' | 'complete';
export type NoteStatus = 'pending' | 'correct' | 'wrong' | 'current' | 'skipped';

export interface PracticeConfig {
  musicxmlUrl?: string;
  musicxmlContent?: string;
  instrumentPartIndex: number;
  inputMethod: PracticeInputMethod;
  midiDeviceId?: string;
  tempoPercent: number;
  metronomeEnabled: boolean;
  startMeasure: number;
  // Accompaniment
  jobId?: string;
  selectedStemId?: string;
  stems?: Stem[];
}

export interface PracticeStats {
  totalNotes: number;
  correctFirstTry: number;
  retriedNotes: number;
  accuracy: number;
  elapsedSeconds: number;
  expectedSeconds: number;
}

export interface PitchResult {
  frequency: number;
  midiNote: number;
  noteName: string;
  octave: number;
  cents: number;
  confidence: number;
}

export interface MidiNoteEvent {
  note: number;
  velocity: number;
  type: 'on' | 'off';
  timestamp: number;
}

export interface NoteInfo {
  midiPitch: number;
  noteName: string;
  octave: number;
  duration: number;
  measureNumber: number;
  isRest: boolean;
}

export interface PracticeSessionRecord {
  id: string;
  job_id: string;
  stem_id: string | null;
  accuracy: number;
  total_notes: number;
  correct_notes: number;
  elapsed_seconds: number;
  tempo_percent: number;
  created_at: string;
}
