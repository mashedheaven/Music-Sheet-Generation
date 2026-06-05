import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getJob, deleteJob, getStemAudioUrl, getScoreDownloadUrl, getOriginalAudioUrl } from '../api/client';
import type { Job, Stem, Score } from '../api/types';
import { useJobProgress } from '../hooks/useJobProgress';
import { Button } from '../components/common/Button';
import { Badge, statusToBadgeVariant } from '../components/common/Badge';
import { ProgressBar } from '../components/common/ProgressBar';
import { Spinner } from '../components/common/Spinner';
import { ScoreViewer } from '../components/Score/ScoreViewer';
import { AudioPlayer } from '../components/Audio/AudioPlayer';
import { formatRelativeTime, formatFileSize } from '../utils/formatters';
import { getInstrumentIcon } from '../utils/icons';
import {
  Upload as UploadIcon,
  Split,
  FileMusic,
  PenTool,
  CheckCircle2,
  Check,
  AlertCircle,
  XCircle,
  ArrowLeft,
  Layers,
  FileText,
  FileAudio
} from 'lucide-react';

// ── Pipeline stages for the stepper ──────────────────────────────────────────
const PIPELINE_STAGES = [
  { key: 'uploading',    label: 'Upload',     icon: <UploadIcon size={16} /> },
  { key: 'separating',   label: 'Separate',   icon: <Split size={16} /> },
  { key: 'transcribing', label: 'Transcribe', icon: <FileMusic size={16} /> },
  { key: 'generating',   label: 'Score',      icon: <PenTool size={16} /> },
  { key: 'complete',     label: 'Done',       icon: <CheckCircle2 size={16} /> },
];

function getStageIndex(status: string): number {
  if (status === 'uploading' || status === 'processing' || status === 'preprocessing') return 0;
  if (status === 'separating') return 1;
  if (status === 'detecting' || status === 'transcribing' || status === 'quantizing') return 2;
  if (status === 'generating' || status === 'generating_scores') return 3;
  if (status === 'complete') return 4;
  return 0;
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
  const initialSelectDone = useRef(false);

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
      if (data.stems.length > 0 && !initialSelectDone.current) {
        setSelectedStem(data.stems[0]);
        initialSelectDone.current = true;
      }
    } catch {
      setError('Failed to load transcription details.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

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
          <AlertCircle size={48} className="empty-state__icon" style={{ opacity: 0.7 }} />
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
  const currentMessage = progress.message || job.progress_message;
  const stageIndex = getStageIndex(currentStatus);

  // Find scores for selected stem
  const stemScores = selectedStem
    ? job.scores?.filter((s: Score) => s.stem_id === selectedStem.id) ?? []
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
            {job.file_size_bytes > 0 && (
              <span className="text-secondary text-sm">
                · {formatFileSize(job.file_size_bytes)}
              </span>
            )}
          </div>
        </div>
        <div className="detail-page__actions">
          <Button variant="ghost" onClick={() => navigate('/')} icon={<ArrowLeft size={16} />}>Back</Button>
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
                  <div className="pipeline-step__icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {i < stageIndex ? <Check size={16} /> : stage.icon}
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
          <XCircle size={48} className="text-error" style={{ margin: '0 auto 1rem', display: 'block' }} />
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
                <span className="instrument-card__icon" style={{ display: 'flex', justifyContent: 'center' }}>
                  {getInstrumentIcon(stem.instrument_family, { size: 32 })}
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
              <span className="instrument-card__icon" style={{ display: 'flex', justifyContent: 'center' }}>
                <Layers size={32} />
              </span>
              <div className="instrument-card__name">Ensemble Score</div>
              <div className="instrument-card__family">All instruments</div>
            </div>
          </div>

          {/* Audio Player for Selected Stem or Ensemble */}
          <div className="score-section">
            <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {selectedStem
                ? <>{getInstrumentIcon(selectedStem.instrument_family, { size: 24 })} {selectedStem.instrument_name} — Audio</>
                : <><Layers size={24} /> Original Audio</>}
            </h3>
            <AudioPlayer 
              audioUrl={selectedStem ? getStemAudioUrl(selectedStem.id) : getOriginalAudioUrl(job.id)} 
              onTimeUpdate={setAudioTime}
            />
          </div>

          {/* Score Viewer */}
          <div className="score-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {selectedStem
                  ? <>{getInstrumentIcon(selectedStem.instrument_family, { size: 24 })} {selectedStem.instrument_name} — Sheet Music</>
                  : <><Layers size={24} /> Ensemble Score</>}
              </h3>
              {musicxmlScore && selectedStem && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => navigate(`/practice/${job.id}?stemId=${selectedStem.id}`)}
                  style={{ background: 'var(--gradient-secondary)', border: 'none' }}
                >
                  Practice This Part
                </Button>
              )}
            </div>
            <div className="score-viewer-container">
              {musicxmlScore ? (
                <ScoreViewer 
                  musicxmlUrl={getScoreDownloadUrl(musicxmlScore.id)}
                  allowTranspose={selectedStem ? selectedStem.instrument_family !== 'percussion' : false}
                  currentTime={audioTime}
                />
              ) : (
                <div className="score-viewer-placeholder">
                  <Layers size={48} className="score-viewer-placeholder__icon" style={{ opacity: 0.5, margin: '0 auto 1rem', display: 'block' }} />
                  <p>Score Not Available</p>
                  <p className="text-sm text-secondary mt-2" style={{ maxWidth: '400px', margin: '0.5rem auto 0' }}>
                    There is no MusicXML score available for this selection.
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
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                download
              >
                {score.format === 'musicxml' ? <FileText size={16} /> : <FileAudio size={16} />} Download {score.format.toUpperCase()}
              </a>
            ))}
            {selectedStem && ensembleScores.map((score: Score) => (
              <a
                key={score.id}
                href={getScoreDownloadUrl(score.id)}
                className="download-btn"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                download
              >
                <Layers size={16} /> Ensemble {score.format.toUpperCase()}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
