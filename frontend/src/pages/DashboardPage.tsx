import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Music, Plus, Music2 } from 'lucide-react';
import { listJobs } from '../api/client';
import type { JobSummary } from '../api/types';
import { Card } from '../components/common/Card';
import { Badge, statusToBadgeVariant } from '../components/common/Badge';
import { ProgressBar } from '../components/common/ProgressBar';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import { formatRelativeTime } from '../utils/formatters';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listJobs()
      .then(setJobs)
      .catch(() => setError('Unable to load transcriptions. Is the backend running?'))
      .finally(() => setLoading(false));
  }, []);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page-center">
        <Spinner size="lg" label="Loading your transcriptions…" />
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="page-center">
        <div className="empty-state glass-card">
          <AlertTriangle size={48} className="empty-state__icon" style={{ opacity: 0.7 }} />
          <h2>Connection Error</h2>
          <p className="text-secondary">{error}</p>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard fade-in">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="dashboard__hero">
        <div className="dashboard__hero-bg">
          {/* Animated floating notes */}
          {[...Array(5)].map((_, i) => (
            <span
              key={i}
              className="dashboard__floating-note"
              style={{
                left: `${10 + i * 20}%`,
                animationDelay: `${i * 1.5}s`,
                width: `${4 + i * 2}px`,
                height: `${4 + i * 2}px`,
                borderRadius: '50%',
                background: 'var(--primary)',
                opacity: 0.3,
                boxShadow: '0 0 10px var(--primary)'
              }}
            />
          ))}
        </div>
        <h1 className="dashboard__title">Your Music Transcriptions</h1>
        <p className="dashboard__subtitle">
          Upload any song and get sheet music for every instrument
        </p>
        <Button
          variant="primary"
          size="lg"
          icon={<Plus size={20} />}
          onClick={() => navigate('/upload')}
          className="dashboard__cta"
        >
          Create New Transcription
        </Button>
      </section>

      {/* ── Job List ─────────────────────────────────────────────────────── */}
      {jobs.length === 0 ? (
        <div className="empty-state glass-card">
          <Music size={48} className="empty-state__icon" style={{ opacity: 0.5 }} />
          <h2>No transcriptions yet</h2>
          <p className="text-secondary">
            Upload your first song and watch the magic happen
          </p>
          <Button variant="secondary" onClick={() => navigate('/upload')}>
            Upload a Song
          </Button>
        </div>
      ) : (
        <div className="dashboard__grid">
          {jobs.map((job) => {
            const isProcessing = !['complete', 'failed', 'pending'].includes(job.status);
            return (
              <Card
                key={job.id}
                hoverable
                onClick={() => navigate(`/jobs/${job.id}`)}
                className="dashboard__job-card"
              >
                <div className="dashboard__job-header">
                  <h3 className="dashboard__job-title">{job.title || job.original_filename}</h3>
                  <div className="dashboard__job-status-text">
                    <Badge variant={statusToBadgeVariant(job.status)}>
                      {job.status}
                    </Badge>
                    {job.status !== 'complete' && job.status !== 'failed' && job.progress_message && (
                      <span className="text-secondary text-sm">{job.progress_message}</span>
                    )}
                  </div>
                </div>

                {isProcessing && (
                  <ProgressBar value={job.progress} showLabel className="mt-2" />
                )}

                <div className="dashboard__job-meta">
                  <span className="text-secondary text-sm">
                    {formatRelativeTime(job.created_at)}
                  </span>
                  {job.status === 'complete' && (
                    <span className="dashboard__instrument-count" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Music2 size={14} /> {job.instrument_count} instrument{job.instrument_count !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
