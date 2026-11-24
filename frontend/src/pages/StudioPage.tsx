import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowLeft,
  AudioWaveform,
  Check,
  Clock,
  Cpu,
  Download,
  FileMusic,
  Gauge,
  KeyRound,
  Layers,
  Music,
  Pencil,
  RotateCcw,
  Scissors,
  Trash2,
} from 'lucide-react';
import { apiUrl, deleteJob, errorMessage, renameJob, retryJob } from '../api/client';
import type { Job, Score } from '../api/types';
import { Mixer } from '../components/Mixer';
import { ScoreViewer } from '../components/ScoreViewer';
import { Button, ProgressBar, Spinner, StatusPill } from '../components/ui';
import { useJob } from '../hooks/useJob';
import { useMixer, type TrackSpec } from '../hooks/useMixer';
import { formatFileSize, formatKey, formatTime, isActive } from '../lib/format';
import { instrumentStyle } from '../lib/instruments';

const STEPS = [
  { key: 'processing', label: 'Analyze', icon: AudioWaveform, desc: 'Decode audio, find tempo & beats' },
  { key: 'separating', label: 'Separate', icon: Scissors, desc: 'Split into instrument stems' },
  { key: 'transcribing', label: 'Transcribe', icon: Music, desc: 'Detect the notes in every stem' },
  { key: 'generating', label: 'Engrave', icon: FileMusic, desc: 'Write the sheet music' },
];

export const StudioPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const { job, setJob, error, loading, refresh } = useJob(jobId);

  if (loading && !job) {
    return (
      <div className="page page--center">
        <Spinner label="Loading…" />
      </div>
    );
  }
  if (!job) {
    return (
      <div className="page page--center">
        <div className="empty card">
          <AlertTriangle size={36} className="accent" />
          <h2>Not found</h2>
          <p className="muted">{error ?? 'This transcription does not exist.'}</p>
          <Link className="btn btn--primary btn--md" to="/">
            Back to library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--wide">
      <StudioHeader job={job} onJobChange={setJob} />
      {isActive(job.status) && <ProcessingView job={job} />}
      {job.status === 'failed' && <FailedView job={job} onRetried={(j) => setJob(j)} />}
      {job.status === 'complete' && <CompleteView key={job.id + job.updated_at} job={job} onRetry={refresh} />}
    </div>
  );
};

// ── Header ──────────────────────────────────────────────────────────────────

const StudioHeader: React.FC<{ job: Job; onJobChange: (j: Job) => void }> = ({ job, onJobChange }) => {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(job.title);
  const [busy, setBusy] = useState(false);

  const startEditing = () => {
    setTitle(job.title);
    setEditing(true);
  };

  const saveTitle = async () => {
    setEditing(false);
    const t = title.trim();
    if (!t || t === job.title) {
      setTitle(job.title);
      return;
    }
    try {
      onJobChange({ ...(await renameJob(job.id, t)) });
    } catch (err) {
      toast.error(errorMessage(err, 'Rename failed'));
      setTitle(job.title);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete “${job.title}” and all of its files?`)) return;
    setBusy(true);
    try {
      await deleteJob(job.id);
      toast.success('Deleted');
      navigate('/');
    } catch (err) {
      toast.error(errorMessage(err, 'Delete failed'));
      setBusy(false);
    }
  };

  const handleRetry = async () => {
    if (!confirm('Process this song again from scratch?')) return;
    try {
      onJobChange(await retryJob(job.id));
      toast.success('Re-processing started');
    } catch (err) {
      toast.error(errorMessage(err, 'Retry failed'));
    }
  };

  const done = job.status === 'complete';

  return (
    <header className="studio-head">
      <Link to="/" className="back-link">
        <ArrowLeft size={16} /> Library
      </Link>
      <div className="studio-head__row">
        <div className="studio-head__title">
          {editing ? (
            <input
              className="title-input"
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle();
                if (e.key === 'Escape') {
                  setTitle(job.title);
                  setEditing(false);
                }
              }}
              maxLength={255}
            />
          ) : (
            <h1 className="display display--sm" onDoubleClick={startEditing}>
              {job.title}
              <button className="icon-btn icon-btn--sm title-edit" onClick={startEditing} aria-label="Rename">
                <Pencil size={14} />
              </button>
            </h1>
          )}
          <div className="meta-row">
            <StatusPill status={job.status} progress={job.progress} />
            {done && (
              <>
                <span className="meta">
                  <Clock size={14} /> {formatTime(job.duration_seconds)}
                </span>
                <span className="meta">
                  <Gauge size={14} /> {job.tempo_bpm ? `${Math.round(job.tempo_bpm)} BPM` : '—'}
                </span>
                <span className="meta">
                  <KeyRound size={14} /> {formatKey(job.key_signature)}
                </span>
                <span className="meta">
                  <Layers size={14} /> {job.time_signature}
                </span>
                {job.separator_used && (
                  <span className="meta meta--soft" title="Engines used">
                    <Cpu size={14} /> {job.separator_used === 'demucs' ? 'Demucs' : 'Lite separation'} ·{' '}
                    {job.transcriber_used === 'basic-pitch' ? 'Basic Pitch' : job.transcriber_used}
                  </span>
                )}
              </>
            )}
            {!done && <span className="meta meta--soft">{job.original_filename} · {formatFileSize(job.file_size_bytes)}</span>}
          </div>
        </div>
        <div className="studio-head__actions">
          {!isActive(job.status) && (
            <Button variant="ghost" size="sm" icon={<RotateCcw size={15} />} onClick={handleRetry}>
              Re-run
            </Button>
          )}
          <Button variant="ghost" size="sm" icon={<Trash2 size={15} />} onClick={handleDelete} loading={busy} disabled={isActive(job.status)}>
            Delete
          </Button>
        </div>
      </div>
    </header>
  );
};

// ── Processing ──────────────────────────────────────────────────────────────

const ProcessingView: React.FC<{ job: Job }> = ({ job }) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => setElapsed((Date.now() - start) / 1000), 1000);
    return () => window.clearInterval(id);
  }, []);

  const currentIdx = job.status === 'pending' ? -1 : STEPS.findIndex((s) => s.key === job.status);

  return (
    <section className="card processing">
      <div className="processing__top">
        <div>
          <h2 className="section-title">{job.status === 'pending' ? 'Waiting in the queue' : 'Creating your sheet music'}</h2>
          <p className="muted">{job.progress_message || 'Getting ready…'}</p>
        </div>
        <div className="processing__pct mono">{Math.round(job.progress * 100)}%</div>
      </div>
      <ProgressBar value={job.progress} />
      <ol className="steps">
        {STEPS.map((step, i) => {
          const state = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'todo';
          const Icon = step.icon;
          return (
            <li key={step.key} className={`step step--${state}`}>
              <span className="step__icon">{state === 'done' ? <Check size={16} /> : <Icon size={16} />}</span>
              <span className="step__text">
                <span className="step__label">{step.label}</span>
                <span className="step__desc">{step.desc}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="processing__hint muted small">
        Elapsed {formatTime(elapsed)} on this page · A 3-minute song usually takes 1–5 minutes depending on your
        hardware. You can leave this page — processing continues in the background.
      </p>
    </section>
  );
};

// ── Failed ──────────────────────────────────────────────────────────────────

const FailedView: React.FC<{ job: Job; onRetried: (j: Job) => void }> = ({ job, onRetried }) => {
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    try {
      onRetried(await retryJob(job.id));
    } catch (err) {
      toast.error(errorMessage(err, 'Retry failed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card failed">
      <AlertTriangle size={28} className="danger" />
      <div className="failed__body">
        <h2 className="section-title">Processing failed</h2>
        <p className="failed__msg">{job.error_message || 'An unknown error occurred.'}</p>
        <div className="failed__actions">
          <Button variant="primary" icon={<RotateCcw size={16} />} onClick={retry} loading={busy}>
            Try again
          </Button>
          <Link to="/new" className="btn btn--ghost btn--md">
            Upload a different file
          </Link>
        </div>
      </div>
    </section>
  );
};

// ── Complete: mixer + score ─────────────────────────────────────────────────

const ENSEMBLE = '__ensemble__';

const CompleteView: React.FC<{ job: Job; onRetry: () => void }> = ({ job }) => {
  const specs: TrackSpec[] = useMemo(() => {
    const list: TrackSpec[] = [
      {
        id: 'mix',
        label: 'Original mix',
        family: 'mix',
        src: apiUrl(job.original_url),
        peaksUrl: job.peaks_url,
        defaultMuted: job.stems.length > 0,
      },
    ];
    for (const s of job.stems) {
      if (!s.audio_url) continue;
      list.push({
        id: s.id,
        label: s.instrument_name,
        family: s.instrument_family,
        src: apiUrl(s.audio_url),
        altSrc: s.preview_url ? apiUrl(s.preview_url) : null,
        peaksUrl: s.peaks_url,
        noteCount: s.note_count,
      });
    }
    return list;
  }, [job]);

  const { engine, snapshot } = useMixer(specs);
  const firstPart = job.stems.find((s) => s.note_count > 0) ?? job.stems[0];
  const [view, setView] = useState<string>(firstPart?.id ?? ENSEMBLE);

  // Keyboard shortcuts: space = play/pause, arrows = skip.
  useEffect(() => {
    if (!engine) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.code === 'Space') {
        e.preventDefault();
        engine.toggle();
      } else if (e.code === 'ArrowLeft') {
        engine.skip(-5);
      } else if (e.code === 'ArrowRight') {
        engine.skip(5);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine]);

  const scoresFor = (id: string): Score[] =>
    id === ENSEMBLE ? job.scores.filter((s) => s.is_ensemble) : job.scores.filter((s) => s.stem_id === id);
  const current = scoresFor(view);
  const xml = current.find((s) => s.format === 'musicxml');
  const midi = current.find((s) => s.format === 'midi');
  const stem = job.stems.find((s) => s.id === view);
  const beatUnit = Number(job.time_signature.split('/')[1]) || 4;

  const ensembleXml = scoresFor(ENSEMBLE).find((s) => s.format === 'musicxml');
  const ensembleMidi = scoresFor(ENSEMBLE).find((s) => s.format === 'midi');

  return (
    <div className="studio">
      {engine ? (
        <Mixer
          engine={engine}
          snapshot={snapshot}
          specs={specs}
          selectedId={view}
          onSelect={(id) => id !== 'mix' && setView(id)}
        />
      ) : (
        <div className="card mixer mixer--placeholder" />
      )}

      <div className="part-tabs" role="tablist" aria-label="Score parts">
        <button role="tab" aria-selected={view === ENSEMBLE} className={`part-tab ${view === ENSEMBLE ? 'is-active' : ''}`} onClick={() => setView(ENSEMBLE)}>
          <Layers size={15} /> Full score
        </button>
        {job.stems.map((s) => {
          const st = instrumentStyle(s.instrument_family);
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={view === s.id}
              className={`part-tab ${view === s.id ? 'is-active' : ''}`}
              style={{ ['--track' as string]: st.color }}
              onClick={() => setView(s.id)}
            >
              <st.Icon size={15} /> {s.instrument_name}
              <span className="part-tab__count">{s.note_count}</span>
            </button>
          );
        })}
        <div className="part-tabs__spacer" />
        {ensembleXml && (
          <a className="tool-toggle" href={apiUrl(ensembleXml.download_url)} download title="Full score as MusicXML">
            <Download size={15} /> Full score
          </a>
        )}
        {ensembleMidi && (
          <a className="tool-toggle" href={apiUrl(ensembleMidi.download_url)} download title="All parts as a multi-track MIDI file">
            <Download size={15} /> MIDI
          </a>
        )}
      </div>

      {stem && stem.note_count === 0 && (
        <div className="notice">
          No notes were detected in the {stem.instrument_name.toLowerCase()} stem — it may be silent in this song.
        </div>
      )}

      {xml ? (
        <ScoreViewer
          musicxmlUrl={xml.download_url}
          midiUrl={midi?.download_url}
          label={view === ENSEMBLE ? 'Full score' : stem?.instrument_name ?? 'Part'}
          allowTranspose={!(stem?.is_percussion ?? false)}
          currentTime={snapshot.time}
          playing={snapshot.playing}
          beatTimes={job.beat_times}
          bpm={job.tempo_bpm}
          beatUnit={beatUnit}
        />
      ) : (
        <div className="card empty">
          <FileMusic size={32} className="muted" />
          <p className="muted">There is no score for this selection.</p>
        </div>
      )}
    </div>
  );
};
