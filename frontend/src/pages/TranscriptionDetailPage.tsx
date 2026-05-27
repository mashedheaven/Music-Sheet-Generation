import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getJob, deleteJob, getStemAudioUrl, getScoreDownloadUrl } from '../api/client';
import type { Job, Stem, Score } from '../api/types';
import { useJobProgress } from '../hooks/useJobProgress';
import { Button } from '../components/common/Button';
import { Badge, statusToBadgeVariant } from '../components/common/Badge';
import { ProgressBar } from '../components/common/ProgressBar';
import { Spinner } from '../components/common/Spinner';
import { ScoreViewer } from '../components/Score/ScoreViewer';
import { AudioPlayer } from '../components/Audio/AudioPlayer';
import { formatRelativeTime, formatFileSize, getInstrumentEmoji } from '../utils/formatters';

// ── Pipeline stages for the stepper ──────────────────────────────────────────
const PIPELINE_STAGES = [
  { key: 'uploading',    label: 'Upload',     icon: '📤' },
  { key: 'separating',   label: 'Separate',   icon: '🎛️' },
  { key: 'transcribing', label: 'Transcribe', icon: '🎼' },
  { key: 'generating',   label: 'Score',      icon: '📝' },
  { key: 'complete',     label: 'Done',       icon: '✅' },
];

function getStageIndex(status: string): number {
  const idx = PIPELINE_STAGES.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : (status === 'processing' ? 1 : 0);
}

export const TranscriptionDetailPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStem, setSelectedStem] = useState<Stem | null>(null);
  const [audioTime, setAudioTime] = useState<number>(0);

  // When switching stems, reset audio time
  useEffect(() => {
    setAudioTime(0);
  }, [selectedStem]);
  const [deleting, setDeleting] = useState(false);

  // SSE progress for live updates
  const progress = useJobProgress(
    jobId ?? '',
    !!(job && !['complete', 'failed'].includes(job.status))
  );

  // ── Fetch job detail ────────────────────────────────────────────────────
  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    try {
      const data = await getJob(jobId);
      setJob(data);
      if (data.stems.length > 0 && !selectedStem) {
        setSelectedStem(data.stems[0]);
      }
    } catch {
      setError('Failed to load transcription details.');
    } finally {
      setLoading(false);
    }
  }, [jobId, selectedStem]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  // Refetch when SSE says complete
  useEffect(() => {
    if (progress.isComplete) fetchJob();
  }, [progress.isComplete, fetchJob]);

  // ── Delete handler ──────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!jobId || !confirm('Delete this transcription and all its data?')) return;
    setDeleting(true);
    try {
      await deleteJob(jobId);
      navigate('/');
    } catch {
      setError('Failed to delete.');
      setDeleting(false);
    }
  };

  // ── Loading state ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page-center">
        <Spinner size="lg" label="Loading transcription…" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="page-center">
        <div className="empty-state glass-card">
          <span className="empty-state__icon">😕</span>
          <h2>Something went wrong</h2>
          <p className="text-secondary">{error || 'Transcription not found.'}</p>
          <Button variant="primary" onClick={() => navigate('/')}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  const isProcessing = !['complete', 'failed'].includes(job.status);
  const currentStatus = progress.status || job.status;
  const currentProgress = progress.progress ?? job.progress;
  const currentMessage = progress.message || job.message;
  const stageIndex = getStageIndex(currentStatus);

  // Find scores for selected stem
  const stemScores = selectedStem
    ? job.stems.find(s => s.id === selectedStem.id)?.scores ?? []
    : [];
  const ensembleScores = job.scores?.filter((s: Score) => s.is_ensemble) ?? [];
  const currentScores = selectedStem ? stemScores : ensembleScores;
  const musicxmlScore = currentScores.find((s: Score) => s.format === 'musicxml');

  return (
    <div className="detail-page">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="detail-page__header">
        <div>
          <h1 className="detail-page__title">
            {job.title || job.original_filename}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Badge variant={statusToBadgeVariant(currentStatus as any)}>
              {currentStatus}
            </Badge>
            <span className="text-secondary text-sm">
              {formatRelativeTime(job.created_at)}
            </span>
            {job.file_size > 0 && (
              <span className="text-secondary text-sm">
                · {formatFileSize(job.file_size)}
              </span>
            )}
          </div>
        </div>
        <div className="detail-page__actions">
          <Button variant="ghost" onClick={() => navigate('/')}>← Back</Button>
          <Button variant="danger" size="sm" onClick={handleDelete} loading={deleting}>
            Delete
          </Button>
        </div>
      </div>

      {/* ── Processing View ─────────────────────────────────────────────── */}
      {isProcessing && (
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          {/* Pipeline Stepper */}
          <div className="pipeline-stepper">
            {PIPELINE_STAGES.map((stage, i) => (
              <React.Fragment key={stage.key}>
                {i > 0 && (
                  <div className={`pipeline-step__connector ${i <= stageIndex ? 'pipeline-step__connector--completed' : ''}`} />
                )}
                <div className={`pipeline-step ${i < stageIndex ? 'pipeline-step--completed' : ''} ${i === stageIndex ? 'pipeline-step--active' : ''}`}>
                  <div className="pipeline-step__icon">
                    {i < stageIndex ? '✓' : stage.icon}
                  </div>
                  <span className="pipeline-step__label">{stage.label}</span>
                </div>
              </React.Fragment>
            ))}
          </div>

          <ProgressBar value={currentProgress * 100} showLabel size="lg" />

          {currentMessage && (
            <p className="text-secondary mt-4" style={{ fontSize: '0.9rem' }}>
              {currentMessage}
            </p>
          )}
        </div>
      )}

      {/* ── Failed View ─────────────────────────────────────────────────── */}
      {job.status === 'failed' && (
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>❌</span>
          <h2>Transcription Failed</h2>
          <p className="text-secondary mt-2">
            {(job as any).error_message || 'An error occurred during processing.'}
          </p>
          <Button variant="primary" onClick={() => navigate('/upload')} className="mt-4">
            Try Another Song
          </Button>
        </div>
      )}

      {/* ── Complete View ───────────────────────────────────────────────── */}
      {job.status === 'complete' && (
        <>
          {/* Instrument Cards */}
          <h2 style={{ marginBottom: '1rem' }}>Detected Instruments</h2>
          <div className="instruments-grid">
            {job.stems.map((stem) => (
              <div
                key={stem.id}
                className={`glass-card instrument-card ${selectedStem?.id === stem.id ? 'instrument-card--active' : ''}`}
                onClick={() => setSelectedStem(stem)}
              >
                <span className="instrument-card__icon">
                  {getInstrumentEmoji(stem.instrument_family)}
                </span>
                <div className="instrument-card__name">{stem.instrument_name}</div>
                <div className="instrument-card__family">{stem.instrument_family}</div>
                {stem.confidence > 0 && (
                  <Badge variant="info" style={{ marginTop: '0.5rem' }}>
                    {Math.round(stem.confidence * 100)}% confidence
                  </Badge>
                )}
              </div>
            ))}
            {/* Ensemble Score Card */}
            <div
              className={`glass-card instrument-card ${selectedStem === null ? 'instrument-card--active' : ''}`}
              onClick={() => setSelectedStem(null)}
            >
              <span className="instrument-card__icon">🎼</span>
              <div className="instrument-card__name">Ensemble Score</div>
              <div className="instrument-card__family">All instruments</div>
            </div>
          </div>

          {/* Audio Player for Selected Stem */}
          {selectedStem && (
            <div className="score-section">
              <h3 style={{ marginBottom: '0.75rem' }}>
                {getInstrumentEmoji(selectedStem.instrument_family)} {selectedStem.instrument_name} — Audio
              </h3>
              <AudioPlayer 
                audioUrl={getStemAudioUrl(selectedStem.id)} 
                onTimeUpdate={setAudioTime}
              />
            </div>
          )}

          {/* Score Viewer */}
          <div className="score-section">
            <h3 style={{ marginBottom: '0.75rem' }}>
              {selectedStem
                ? `${getInstrumentEmoji(selectedStem.instrument_family)} ${selectedStem.instrument_name} — Sheet Music`
                : '🎼 Ensemble Score'}
            </h3>
            <div className="score-viewer-container">
              {musicxmlScore && selectedStem ? (
                <ScoreViewer 
                  musicxmlUrl={getScoreDownloadUrl(musicxmlScore.id)}
                  allowTranspose={selectedStem.instrument_family !== 'percussion'}
                  currentTime={audioTime}
                />
              ) : (
                <div className="score-viewer-placeholder">
                  <span className="score-viewer-placeholder__icon">🎼</span>
                  <p>Ensemble Score Overview</p>
                  <p className="text-sm text-secondary mt-2" style={{ maxWidth: '400px', margin: '0.5rem auto 0' }}>
                    The combined ensemble score is too complex for browser rendering. Please download the MusicXML or MIDI file below and open it in desktop notation software like MuseScore 4 or Sibelius.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Downloads */}
          <div className="downloads">
            {currentScores.map((score: Score) => (
              <a
                key={score.id}
                href={getScoreDownloadUrl(score.id)}
                className="download-btn"
                download
              >
                {score.format === 'musicxml' ? '📄' : '🎹'} Download {score.format.toUpperCase()}
              </a>
            ))}
            {selectedStem && ensembleScores.map((score: Score) => (
              <a
                key={score.id}
                href={getScoreDownloadUrl(score.id)}
                className="download-btn"
                download
              >
                🎼 Ensemble {score.format.toUpperCase()}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
