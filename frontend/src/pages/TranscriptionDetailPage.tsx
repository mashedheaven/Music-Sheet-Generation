import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getJob, deleteJob, getStemAudioUrl, getScoreDownloadUrl, getOriginalAudioUrl } from '../api/client';
import type { Job, Stem, Score } from '../api/types';
import { useJobProgress } from '../hooks/useJobProgress';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import { ScoreViewer } from '../components/Score/ScoreViewer';
import { AudioPlayer } from '../components/Audio/AudioPlayer';
import { getInstrumentIcon } from '../utils/icons';
import { TranscriptionHeader } from '../components/Transcription/TranscriptionHeader';
import { PipelineStepper } from '../components/Transcription/PipelineStepper';
import { FailedView } from '../components/Transcription/FailedView';
import { InstrumentSelector } from '../components/Transcription/InstrumentSelector';
import { TranscriptionDownloads } from '../components/Transcription/TranscriptionDownloads';
import {
  AlertCircle,
  Layers
} from 'lucide-react';

export const TranscriptionDetailPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStem, setSelectedStem] = useState<Stem | null>(null);
  const [audioTime, setAudioTime] = useState<number>(0);
  const [deleting, setDeleting] = useState(false);
  const initialSelectDone = useRef(false);

  // SSE progress for live updates
  const progress = useJobProgress(
    jobId ?? '',
    !!(job && !['complete', 'failed'].includes(job.status))
  );

  useEffect(() => {
    let ignore = false;
    if (!jobId) return;

    getJob(jobId)
      .then((data) => {
        if (!ignore) {
          setJob(data);
          if (data.stems.length > 0 && !initialSelectDone.current) {
            setSelectedStem(data.stems[0]);
            initialSelectDone.current = true;
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (!ignore) {
          setError('Failed to load transcription details.');
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [jobId]);

  // Refetch when SSE says complete
  const prevIsComplete = useRef(false);
  useEffect(() => {
    let ignore = false;
    if (progress.isComplete && !prevIsComplete.current && jobId) {
      prevIsComplete.current = true;
      getJob(jobId)
        .then((data) => {
          if (!ignore) {
            setJob(data);
          }
        })
        .catch(() => {
          if (!ignore) {
            setError('Failed to load transcription details.');
          }
        });
    }
    return () => {
      ignore = true;
    };
  }, [progress.isComplete, jobId]);

  const handleSelectStem = useCallback((stem: Stem | null) => {
    setSelectedStem(stem);
    setAudioTime(0);
  }, []);

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

  // Find scores for selected stem
  const stemScores = selectedStem
    ? job.scores?.filter((s: Score) => s.stem_id === selectedStem.id) ?? []
    : [];
  const ensembleScores = job.scores?.filter((s: Score) => s.is_ensemble) ?? [];
  const currentScores = selectedStem ? stemScores : ensembleScores;
  const musicxmlScore = currentScores.find((s: Score) => s.format === 'musicxml');

  return (
    <div className="detail-page">
      {/* Header */}
      <TranscriptionHeader
        job={job}
        currentStatus={currentStatus}
        deleting={deleting}
        onBack={() => navigate('/')}
        onDelete={handleDelete}
      />

      {/* Processing View */}
      {isProcessing && (
        <PipelineStepper
          currentStatus={currentStatus}
          currentProgress={currentProgress}
          currentMessage={currentMessage}
        />
      )}

      {/* Failed View */}
      {job.status === 'failed' && (
        <FailedView
          errorMessage={job.error_message}
          onTryAnother={() => navigate('/upload')}
        />
      )}

      {/* Complete View */}
      {job.status === 'complete' && (
        <>
          {/* Instrument Cards */}
          <InstrumentSelector
            stems={job.stems}
            selectedStem={selectedStem}
            onSelectStem={handleSelectStem}
          />

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
            <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {selectedStem
                ? <>{getInstrumentIcon(selectedStem.instrument_family, { size: 24 })} {selectedStem.instrument_name} — Sheet Music</>
                : <><Layers size={24} /> Ensemble Score</>}
            </h3>
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
          <TranscriptionDownloads
            currentScores={currentScores}
            ensembleScores={ensembleScores}
            selectedStem={selectedStem}
          />
        </>
      )}
    </div>
  );
};
