import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, Clock, Gauge, KeyRound, Music, Search, Trash2 } from 'lucide-react';
import { deleteJob, errorMessage, listJobs } from '../api/client';
import type { JobSummary } from '../api/types';
import { Dropzone } from '../components/Dropzone';
import { Button, ProgressBar, Spinner, StatusPill } from '../components/ui';
import { useHealth } from '../hooks/useHealth';
import { formatKey, formatRelativeTime, formatTime, isActive } from '../lib/format';
import { instrumentStyle } from '../lib/instruments';
import { setPendingFile } from './pendingFile';

export const LibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const { health } = useHealth();
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      setJobs(await listJobs());
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Could not load your library'));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching; state is set after the request resolves
    void load();
  }, [load]);

  // Refresh while anything is processing.
  const anyActive = jobs?.some((j) => isActive(j.status));
  useEffect(() => {
    if (!anyActive) return;
    const id = window.setInterval(load, 2500);
    return () => window.clearInterval(id);
  }, [anyActive, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!jobs) return [];
    return q ? jobs.filter((j) => j.title.toLowerCase().includes(q) || j.original_filename.toLowerCase().includes(q)) : jobs;
  }, [jobs, query]);

  const handleDelete = async (e: React.MouseEvent, job: JobSummary) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete “${job.title}” and all of its files?`)) return;
    try {
      await deleteJob(job.id);
      setJobs((prev) => prev?.filter((j) => j.id !== job.id) ?? null);
      toast.success('Deleted');
    } catch (err) {
      toast.error(errorMessage(err, 'Delete failed'));
    }
  };

  const startWithFile = (file: File) => {
    setPendingFile(file);
    navigate('/new');
  };

  const maxMb = health?.limits.max_file_size_mb ?? 100;

  if (error && !jobs) {
    return (
      <div className="page page--center">
        <div className="empty card">
          <AlertTriangle size={36} className="accent" />
          <h2>Can’t reach the server</h2>
          <p className="muted">{error}</p>
          <pre className="code-hint">cd backend && uvicorn app.main:app --reload --port 8000</pre>
          <Button variant="primary" onClick={load}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!jobs) {
    return (
      <div className="page page--center">
        <Spinner label="Loading your library…" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="page hero-page">
        <section className="hero">
          <p className="eyebrow">Audio → notation</p>
          <h1 className="display">
            Any song, <em>every part</em>,<br /> on the page.
          </h1>
          <p className="hero__lede">
            MuSheet separates a recording into vocals, drums, bass and the rest, transcribes each one and engraves
            proper sheet music you can play along with, transpose, print, or open in MuseScore.
          </p>
          <div className="hero__drop">
            <Dropzone onFile={startWithFile} maxSizeMb={maxMb} />
          </div>
          <ol className="how">
            <li>
              <span>1</span>Separate stems
            </li>
            <li>
              <span>2</span>Detect tempo &amp; key
            </li>
            <li>
              <span>3</span>Transcribe notes
            </li>
            <li>
              <span>4</span>Engrave the score
            </li>
          </ol>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Library</h1>
          <p className="muted">
            {jobs.length} transcription{jobs.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="page-head__actions">
          <label className="search">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs" aria-label="Search songs" />
          </label>
        </div>
      </div>

      <div className="library-grid">
        <div className="library-drop">
          <Dropzone onFile={startWithFile} maxSizeMb={maxMb} compact />
        </div>
        {filtered.map((job) => (
          <Link key={job.id} to={`/jobs/${job.id}`} className={`job-card card ${job.status === 'failed' ? 'is-failed' : ''}`}>
            <div className="job-card__top">
              <div className="job-card__art" aria-hidden>
                <Music size={20} />
              </div>
              <div className="job-card__heading">
                <h3 className="job-card__title" title={job.title}>
                  {job.title}
                </h3>
                <p className="job-card__sub muted">{formatRelativeTime(job.created_at)}</p>
              </div>
              <button className="icon-btn icon-btn--sm job-card__delete" onClick={(e) => handleDelete(e, job)} aria-label="Delete" title="Delete">
                <Trash2 size={15} />
              </button>
            </div>

            {isActive(job.status) ? (
              <div className="job-card__progress">
                <div className="job-card__progress-row">
                  <StatusPill status={job.status} progress={job.progress} />
                </div>
                <ProgressBar value={job.progress} />
                <p className="job-card__msg muted">{job.progress_message || 'Waiting in queue…'}</p>
              </div>
            ) : job.status === 'failed' ? (
              <div className="job-card__progress">
                <StatusPill status="failed" />
                <p className="job-card__msg job-card__msg--error">{job.error_message || 'Processing failed'}</p>
              </div>
            ) : (
              <>
                <div className="job-card__meta">
                  <span title="Duration">
                    <Clock size={13} /> {formatTime(job.duration_seconds)}
                  </span>
                  <span title="Tempo">
                    <Gauge size={13} /> {job.tempo_bpm ? `${Math.round(job.tempo_bpm)} BPM` : '—'}
                  </span>
                  <span title="Key">
                    <KeyRound size={13} /> {formatKey(job.key_signature)}
                  </span>
                </div>
                <div className="job-card__stems">
                  {job.stems.map((s) => {
                    const st = instrumentStyle(s.instrument_family);
                    return (
                      <span key={s.id} className="stem-tag" style={{ ['--track' as string]: st.color }}>
                        <st.Icon size={12} />
                        {s.instrument_name}
                      </span>
                    );
                  })}
                </div>
              </>
            )}
          </Link>
        ))}
        {filtered.length === 0 && <p className="muted library-empty">No songs match “{query}”.</p>}
      </div>
    </div>
  );
};
