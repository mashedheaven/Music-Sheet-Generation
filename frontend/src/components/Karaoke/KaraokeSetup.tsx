import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Upload,
  Music,
  Mic,
  ChevronRight,
  AlertTriangle,
  Check,
  Layers,
  Settings,
} from 'lucide-react';
import type { JobSummary, Job, Stem } from '../../api/types';
import { listJobs, getJob, getScoreDownloadUrl } from '../../api/client';
import { extractLyricsFromMusicXML, LyricWord } from '../../utils/musicxmlParser';
import { getInstrumentIcon } from '../../utils/icons';
import type { AdvancementLogic } from '../../hooks/useLyricSync';

type SetupStep = 'source' | 'configure';
type SourceType = 'upload' | 'existing';

interface KaraokeSetupProps {
  onStart: (jobId: string | undefined, selectedStemId: string | undefined, stems: Stem[] | undefined, musicxml: string, lyrics: LyricWord[], advancementLogic: AdvancementLogic) => void;
  preselectedJobId?: string;
  preselectedStemId?: string;
}

export const KaraokeSetup: React.FC<KaraokeSetupProps> = ({
  onStart,
  preselectedJobId,
  preselectedStemId,
}) => {
  const [currentStep, setCurrentStep] = useState<SetupStep>('source');
  const [sourceType, setSourceType] = useState<SourceType | null>(null);

  const [musicxml, setMusicxml] = useState<string>('');
  const [extractedLyrics, setExtractedLyrics] = useState<LyricWord[]>([]);
  const [fileName, setFileName] = useState<string>('');

  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedStem, setSelectedStem] = useState<Stem | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingScore, setLoadingScore] = useState(false);

  const [advancementLogic, setAdvancementLogic] = useState<AdvancementLogic>('continuous');

  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preselectedJobId) {
      setSourceType('existing');
      setLoadingScore(true);
      getJob(preselectedJobId)
        .then((job) => {
          setSelectedJob(job);
          if (preselectedStemId) {
            const stem = job.stems.find((s) => s.id === preselectedStemId);
            if (stem) {
              setSelectedStem(stem);
              loadScoreForStem(job, stem);
            }
          }
        })
        .catch(() => setError('Failed to load transcription'))
        .finally(() => setLoadingScore(false));
    }
  }, [preselectedJobId, preselectedStemId]);

  const fetchJobs = useCallback(async () => {
    setLoadingJobs(true);
    setError(null);
    try {
      const allJobs = await listJobs();
      setJobs(allJobs.filter((j) => j.status === 'complete'));
    } catch {
      setError('Failed to load transcriptions');
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  const loadScoreForStem = useCallback(async (job: Job, stem: Stem) => {
    setLoadingScore(true);
    setError(null);
    try {
      const score = job.scores.find(
        (s) => s.stem_id === stem.id && s.format === 'musicxml'
      );
      if (!score) {
        const ensembleScore = job.scores.find(
          (s) => s.is_ensemble && s.format === 'musicxml'
        );
        if (!ensembleScore) {
          setError('No MusicXML score found for this track');
          setLoadingScore(false);
          return;
        }
        const url = getScoreDownloadUrl(ensembleScore.id);
        const response = await fetch(url);
        const content = await response.text();
        setMusicxml(content);
        const lyricsList = extractLyricsFromMusicXML(content);
        setExtractedLyrics(lyricsList);
      } else {
        const url = getScoreDownloadUrl(score.id);
        const response = await fetch(url);
        const content = await response.text();
        setMusicxml(content);
        const lyricsList = extractLyricsFromMusicXML(content);
        setExtractedLyrics(lyricsList);
      }
    } catch {
      setError('Failed to load score');
    } finally {
      setLoadingScore(false);
    }
  }, []);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'musicxml' || ext === 'xml') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setMusicxml(content);
        setFileName(file.name);
        const lyricsList = extractLyricsFromMusicXML(content);
        setExtractedLyrics(lyricsList);
        setCurrentStep('configure');
      };
      reader.onerror = () => setError('Failed to read file');
      reader.readAsText(file);
    } else {
      setError('Unsupported file format. Please use .musicxml or .xml files for Karaoke.');
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleSelectJob = useCallback(
    async (jobId: string) => {
      setLoadingScore(true);
      setError(null);
      try {
        const job = await getJob(jobId);
        setSelectedJob(job);
      } catch {
        setError('Failed to load transcription details');
      } finally {
        setLoadingScore(false);
      }
    },
    []
  );

  const handleSelectStem = useCallback(
    (stem: Stem) => {
      setSelectedStem(stem);
      if (selectedJob) {
        loadScoreForStem(selectedJob, stem);
      }
    },
    [selectedJob, loadScoreForStem]
  );

  const handleStart = useCallback(() => {
    onStart(selectedJob?.id, selectedStem?.id, selectedJob?.stems, musicxml, extractedLyrics, advancementLogic);
  }, [
    selectedJob, selectedStem, musicxml, extractedLyrics, advancementLogic, onStart,
  ]);

  const canProceedToConfigure = musicxml.length > 0;
  const canStart = extractedLyrics.length > 0;

  const steps: { key: SetupStep; label: string; icon: React.ReactNode }[] = [
    { key: 'source', label: 'Choose Song', icon: <Music size={18} /> },
    { key: 'configure', label: 'Configure', icon: <Settings size={18} /> },
  ];

  return (
    <div className="practice-setup" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', animation: 'fadeIn 0.3s ease-out' }}>
      <div className="setup-stepper">
        {steps.map((step, idx) => {
          const currentIdx = steps.findIndex((s) => s.key === currentStep);
          const isActive = currentStep === step.key;
          const isCompleted = currentIdx > idx;
          
          return (
            <React.Fragment key={step.key}>
              <button
                className={`setup-stepper__step ${isActive ? 'setup-stepper__step--active' : ''} ${isCompleted ? 'setup-stepper__step--completed' : ''}`}
                onClick={() => {
                  if (idx < currentIdx) setCurrentStep(step.key);
                }}
                disabled={currentIdx < idx}
              >
                <span className="setup-stepper__step-icon">
                  {isCompleted ? <Check size={14} /> : step.icon}
                </span>
                <span className="setup-stepper__step-label">{step.label}</span>
              </button>
              {idx < steps.length - 1 && (
                <ChevronRight size={14} className="setup-stepper__arrow" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {error && (
        <div className="alert alert--danger" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)', padding: '0.75rem 1rem', borderRadius: '8px', color: 'var(--accent-rose)', fontSize: '0.9rem' }}>
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {currentStep === 'source' && (
        <div className="practice-setup__content" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.4rem', fontWeight: 800 }}>Select a Song for Karaoke</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Upload a MusicXML with lyrics or select an existing AI transcription.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div
              className={`source-card ${isDragOver ? 'source-card--dragover' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".musicxml,.xml"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <div style={{ background: 'rgba(6, 182, 212, 0.1)', color: 'var(--accent-cyan)', padding: '1rem', borderRadius: '50%', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Upload size={32} />
              </div>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 700 }}>Upload File</h4>
              <p style={{ margin: '0 0 1.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.4 }}>
                Drag and drop your score file containing lyrics (.xml, .musicxml).
              </p>
            </div>

            <div
              className={`source-card ${sourceType === 'existing' ? 'source-card--active' : ''}`}
              onClick={() => {
                setSourceType('existing');
                fetchJobs();
              }}
            >
              <div style={{ background: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-violet)', padding: '1rem', borderRadius: '50%', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Layers size={32} />
              </div>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 700 }}>Choose Existing</h4>
              <p style={{ margin: '0 0 1.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.4 }}>
                Choose from your list of completed transcriptions.
              </p>
            </div>
          </div>

          {sourceType === 'existing' && (
            <div className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.2s ease-out' }}>
              {loadingJobs && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem 0' }}>
                  <div className="spinner spinner--md" />
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading completed transcriptions...</span>
                </div>
              )}

              {!loadingJobs && !selectedJob && (
                <>
                  <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
                    Select a transcription job
                  </h4>
                  {jobs.length === 0 ? (
                    <p style={{ margin: 0, color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>No completed transcriptions found.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                      {jobs.map((job) => (
                        <div
                          key={job.id}
                          className="glass-card glass-card--clickable"
                          style={{ padding: '1rem', border: '1px solid var(--glass-border)', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s ease' }}
                          onClick={() => handleSelectJob(job.id)}
                          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-violet)'}
                          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--glass-border)'}
                        >
                          <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.title}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {selectedJob && !selectedStem && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
                    <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                      Select Vocal Track
                    </h4>
                    <button
                      className="btn btn--secondary btn--sm"
                      onClick={() => setSelectedJob(null)}
                      style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                    >
                      Change Job
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
                    {selectedJob.stems.map((stem) => (
                      <div
                        key={stem.id}
                        className="glass-card glass-card--clickable"
                        style={{ padding: '1rem', border: '1px solid var(--glass-border)', borderRadius: '8px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s ease' }}
                        onClick={() => handleSelectStem(stem)}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-emerald)'}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--glass-border)'}
                      >
                        <span style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '50%', marginBottom: '0.5rem' }}>
                          {getInstrumentIcon(stem.instrument_family, { size: 24, style: { color: 'var(--accent-emerald)' } })}
                        </span>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{stem.instrument_name}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {loadingScore && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem 0' }}>
                  <div className="spinner spinner--md" />
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Fetching lyrics...</span>
                </div>
              )}

              {selectedStem && !loadingScore && musicxml && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.25rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Check size={20} style={{ color: 'var(--accent-emerald)' }} />
                    <span style={{ fontSize: '0.95rem' }}>
                      Lyrics loaded ({extractedLyrics.length} words found)
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
                    <button
                      className="btn btn--secondary btn--md"
                      onClick={() => setSelectedStem(null)}
                    >
                      Change Track
                    </button>
                    <button
                      className="btn btn--primary btn--md"
                      onClick={() => setCurrentStep('configure')}
                      disabled={!canProceedToConfigure || extractedLyrics.length === 0}
                    >
                      Configure Session <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {sourceType !== 'existing' && fileName && musicxml && (
            <div className="glass-card" style={{ padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Check size={20} style={{ color: 'var(--accent-emerald)' }} />
                <span>
                  Loaded <strong>{fileName}</strong> ({extractedLyrics.length} words found)
                </span>
              </div>
              <button
                className="btn btn--primary btn--md"
                style={{ marginLeft: 'auto' }}
                onClick={() => setCurrentStep('configure')}
                disabled={!canProceedToConfigure || extractedLyrics.length === 0}
              >
                Configure Session <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {currentStep === 'configure' && (
        <div className="practice-setup__content glass-card" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, borderBottom: '1px solid var(--glass-border)', paddingBottom: '1rem' }}>Configure Karaoke</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                <Settings size={16} style={{ color: 'var(--accent-blue)' }} />
                Lyric Advancement Logic
              </label>
              <div className="segmented-control" style={{ maxWidth: '400px' }}>
                <button
                  type="button"
                  className={`segmented-control__btn ${advancementLogic === 'continuous' ? 'segmented-control__btn--active' : ''}`}
                  onClick={() => setAdvancementLogic('continuous')}
                  style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.75rem' }}
                >
                  <span style={{ fontWeight: 600 }}>Continuous Tracking</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.8, fontWeight: 400 }}>Jumps ahead if you skip words</span>
                </button>
                <button
                  type="button"
                  className={`segmented-control__btn ${advancementLogic === 'exact' ? 'segmented-control__btn--active' : ''}`}
                  onClick={() => setAdvancementLogic('exact')}
                  style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.75rem' }}
                >
                  <span style={{ fontWeight: 600 }}>Exact Match</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.8, fontWeight: 400 }}>Waits for the exact current word</span>
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(6, 182, 212, 0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(6, 182, 212, 0.1)' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                 <Mic size={18} /> Microphone Check
               </div>
               <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                 Karaoke Mode requires microphone access for Speech Recognition. Please ensure you are using Chrome or Edge for the best experience.
               </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'space-between', borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem', marginTop: '0.5rem' }}>
            <button
              className="btn btn--secondary btn--lg"
              onClick={() => setCurrentStep('source')}
            >
              Back
            </button>
            <button
              className="btn btn--primary btn--lg"
              onClick={handleStart}
              disabled={!canStart}
              style={{ padding: '0 3rem' }}
            >
              Start Karaoke <Mic size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
