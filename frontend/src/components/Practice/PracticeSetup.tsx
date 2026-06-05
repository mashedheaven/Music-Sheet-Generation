import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Upload,
  Music,
  Mic,
  Piano,
  ChevronRight,
  AlertTriangle,
  Check,
  Layers,
  Settings,
  Target,
  Zap,
  Volume2,
  Timer,
} from 'lucide-react';
import type {
  PracticeConfig,
  PracticeInputMethod,
  NoteInfo,
  JobSummary,
  Job,
  Stem,
} from '../../api/types';
import { listJobs, getJob, getScoreDownloadUrl } from '../../api/client';
import { usePitchDetection } from '../../hooks/usePitchDetection';
import { useMidiInput } from '../../hooks/useMidiInput';
import { midiToNoteName } from '../../utils/pitchUtils';
import { getInstrumentIcon } from '../../utils/icons';

// ── Types ────────────────────────────────────────────────────────────────────
type SetupStep = 'source' | 'configure' | 'test';
type SourceType = 'upload' | 'existing';

interface PartInfo {
  index: number;
  name: string;
}

interface PracticeSetupProps {
  onStart: (config: PracticeConfig, musicxml: string, notes: NoteInfo[]) => void;
  preselectedJobId?: string;
  preselectedStemId?: string;
}

// ── Helper: Extract parts from MusicXML ──────────────────────────────────────
function extractPartsFromMusicXML(musicxml: string): PartInfo[] {
  const parts: PartInfo[] = [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(musicxml, 'text/xml');
    const partList = doc.querySelectorAll('part-list score-part');
    partList.forEach((sp, index) => {
      const id = sp.getAttribute('id') || `P${index + 1}`;
      const nameEl = sp.querySelector('part-name');
      const name = nameEl?.textContent?.trim() || id;
      parts.push({ index, name });
    });
  } catch {
    // fallback single part
    parts.push({ index: 0, name: 'Part 1' });
  }
  return parts;
}

// ── Helper: Extract NoteInfo[] from MusicXML ─────────────────────────────────
function extractNotesFromMusicXML(musicxml: string, partIndex: number): NoteInfo[] {
  const notes: NoteInfo[] = [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(musicxml, 'text/xml');
    const partElements = doc.querySelectorAll('part');
    const part = partElements[partIndex];
    if (!part) return notes;

    const measures = part.querySelectorAll('measure');
    const stepToSemitone: Record<string, number> = {
      C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
    };

    measures.forEach((measure) => {
      const measureNumber = parseInt(measure.getAttribute('number') || '1', 10);
      const noteEls = measure.querySelectorAll('note');

      noteEls.forEach((noteEl) => {
        const isRest = noteEl.querySelector('rest') !== null;
        const isChordMember = noteEl.querySelector('chord') !== null;
        if (isChordMember) return; // skip chord members, take only first note

        const durationEl = noteEl.querySelector('duration');
        const duration = durationEl ? parseInt(durationEl.textContent || '1', 10) : 1;

        if (isRest) {
          notes.push({
            midiPitch: 0,
            noteName: 'Rest',
            octave: 0,
            duration,
            measureNumber,
            isRest: true,
          });
          return;
        }

        const pitchEl = noteEl.querySelector('pitch');
        if (!pitchEl) return;

        const step = pitchEl.querySelector('step')?.textContent || 'C';
        const octave = parseInt(pitchEl.querySelector('octave')?.textContent || '4', 10);
        const alterEl = pitchEl.querySelector('alter');
        const alter = alterEl ? parseInt(alterEl.textContent || '0', 10) : 0;

        const semitone = stepToSemitone[step] ?? 0;
        const midiPitch = (octave + 1) * 12 + semitone + alter;

        notes.push({
          midiPitch,
          noteName: midiToNoteName(midiPitch),
          octave,
          duration,
          measureNumber,
          isRest: false,
        });
      });
    });
  } catch {
    // parsing failed
  }
  return notes;
}

// ═════════════════════════════════════════════════════════════════════════════
// PracticeSetup Component
// ═════════════════════════════════════════════════════════════════════════════
export const PracticeSetup: React.FC<PracticeSetupProps> = ({
  onStart,
  preselectedJobId,
  preselectedStemId,
}) => {
  // ── Step state ───────────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState<SetupStep>('source');
  const [sourceType, setSourceType] = useState<SourceType | null>(null);

  // ── Source data ──────────────────────────────────────────────────────────
  const [musicxml, setMusicxml] = useState<string>('');
  const [extractedNotes, setExtractedNotes] = useState<NoteInfo[]>([]);
  const [parts, setParts] = useState<PartInfo[]>([]);
  const [fileName, setFileName] = useState<string>('');

  // ── Existing transcription state ─────────────────────────────────────────
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedStem, setSelectedStem] = useState<Stem | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingScore, setLoadingScore] = useState(false);

  // ── Configuration ────────────────────────────────────────────────────────
  const [instrumentPartIndex, setInstrumentPartIndex] = useState(0);
  const [inputMethod, setInputMethod] = useState<PracticeInputMethod>('microphone');
  const [tempoPercent, setTempoPercent] = useState(100);
  const [metronomeEnabled, setMetronomeEnabled] = useState(true);
  const [startMeasure, setStartMeasure] = useState(1);

  // ── Input testing ────────────────────────────────────────────────────────
  const pitch = usePitchDetection(currentStep === 'test' && inputMethod === 'microphone');
  const midi = useMidiInput(currentStep === 'test' && inputMethod === 'midi');

  // ── Drag state ───────────────────────────────────────────────────────────
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Error state ──────────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);

  // ── Load preselected job ─────────────────────────────────────────────────
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

  // ── Fetch completed jobs ─────────────────────────────────────────────────
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

  // ── Load score for a stem ────────────────────────────────────────────────
  const loadScoreForStem = useCallback(async (job: Job, stem: Stem) => {
    setLoadingScore(true);
    setError(null);
    try {
      // Find the musicxml score for this stem
      const score = job.scores.find(
        (s) => s.stem_id === stem.id && s.format === 'musicxml'
      );
      if (!score) {
        // Try ensemble score
        const ensembleScore = job.scores.find(
          (s) => s.is_ensemble && s.format === 'musicxml'
        );
        if (!ensembleScore) {
          setError('No MusicXML score found for this instrument');
          setLoadingScore(false);
          return;
        }
        const url = getScoreDownloadUrl(ensembleScore.id);
        const response = await fetch(url);
        const content = await response.text();
        setMusicxml(content);
        const foundParts = extractPartsFromMusicXML(content);
        setParts(foundParts);
        // Try to match stem to a part by name
        const matchIndex = foundParts.findIndex(
          (p) => p.name.toLowerCase().includes(stem.instrument_name.toLowerCase())
        );
        setInstrumentPartIndex(matchIndex >= 0 ? matchIndex : 0);
        const noteList = extractNotesFromMusicXML(content, matchIndex >= 0 ? matchIndex : 0);
        setExtractedNotes(noteList);
      } else {
        const url = getScoreDownloadUrl(score.id);
        const response = await fetch(url);
        const content = await response.text();
        setMusicxml(content);
        const foundParts = extractPartsFromMusicXML(content);
        setParts(foundParts);
        setInstrumentPartIndex(0);
        const noteList = extractNotesFromMusicXML(content, 0);
        setExtractedNotes(noteList);
      }
    } catch {
      setError('Failed to load score');
    } finally {
      setLoadingScore(false);
    }
  }, []);

  // ── File handling ────────────────────────────────────────────────────────
  const processFile = useCallback(async (file: File) => {
    setError(null);
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'musicxml' || ext === 'xml') {
      // Read MusicXML directly
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setMusicxml(content);
        setFileName(file.name);
        const foundParts = extractPartsFromMusicXML(content);
        setParts(foundParts);
        setInstrumentPartIndex(0);
        const noteList = extractNotesFromMusicXML(content, 0);
        setExtractedNotes(noteList);
        setCurrentStep('configure');
      };
      reader.onerror = () => setError('Failed to read file');
      reader.readAsText(file);
    } else if (ext === 'midi' || ext === 'mid') {
      // Parse MIDI using @tonejs/midi
      try {
        const { Midi } = await import('@tonejs/midi');
        const arrayBuffer = await file.arrayBuffer();
        const midiData = new Midi(arrayBuffer);

        // Convert MIDI tracks to NoteInfo[]
        const noteList: NoteInfo[] = [];
        const track = midiData.tracks[0]; // Take first track
        if (track) {
          track.notes.forEach((note) => {
            noteList.push({
              midiPitch: note.midi,
              noteName: midiToNoteName(note.midi),
              octave: Math.floor(note.midi / 12) - 1,
              duration: note.durationTicks,
              measureNumber: 1, // MIDI doesn't have measure info easily
              isRest: false,
            });
          });
        }

        // Generate a simple MusicXML from MIDI notes
        const generatedXml = generateSimpleMusicXML(noteList, file.name);
        setMusicxml(generatedXml);
        setFileName(file.name);
        setExtractedNotes(noteList);

        const trackParts: PartInfo[] = midiData.tracks
          .filter((t) => t.notes.length > 0)
          .map((t, i) => ({
            index: i,
            name: t.name || t.instrument?.name || `Track ${i + 1}`,
          }));
        setParts(trackParts.length > 0 ? trackParts : [{ index: 0, name: 'Track 1' }]);
        setInstrumentPartIndex(0);
        setCurrentStep('configure');
      } catch {
        setError('Failed to parse MIDI file. Make sure @tonejs/midi is installed.');
      }
    } else {
      setError('Unsupported file format. Please use .musicxml, .xml, .midi, or .mid files.');
    }
  }, []);

  // ── Generate simple MusicXML from notes ────────────────────────────────
  const generateSimpleMusicXML = (notes: NoteInfo[], title: string): string => {
    const noteNames = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
    const alters = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];

    let measures = '<measure number="1">\n  <attributes>\n    <divisions>1</divisions>\n    <time><beats>4</beats><beat-type>4</beat-type></time>\n    <clef><sign>G</sign><line>2</line></clef>\n  </attributes>\n';

    let notesInMeasure = 0;
    let measureNum = 1;

    notes.forEach((n) => {
      if (notesInMeasure >= 4) {
        measures += '</measure>\n';
        measureNum++;
        measures += `<measure number="${measureNum}">\n`;
        notesInMeasure = 0;
      }

      if (n.isRest) {
        measures += '  <note><rest/><duration>1</duration><type>quarter</type></note>\n';
      } else {
        const pc = n.midiPitch % 12;
        const oct = Math.floor(n.midiPitch / 12) - 1;
        const step = noteNames[pc];
        const alter = alters[pc];
        measures += `  <note><pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${oct}</octave></pitch><duration>1</duration><type>quarter</type></note>\n`;
      }
      notesInMeasure++;
    });

    measures += '</measure>\n';

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>${title}</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Part 1</part-name></score-part>
  </part-list>
  <part id="P1">
    ${measures}
  </part>
</score-partwise>`;
  };

  // ── Drag & Drop handlers ─────────────────────────────────────────────────
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

  // ── Existing transcription selection ─────────────────────────────────────
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

  // ── Start practice ──────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    const config: PracticeConfig = {
      musicxmlContent: musicxml,
      instrumentPartIndex,
      inputMethod,
      tempoPercent,
      metronomeEnabled,
      startMeasure,
      jobId: selectedJob?.id,
      selectedStemId: selectedStem?.id,
      stems: selectedJob?.stems,
    };

    if (inputMethod === 'midi' && midi.selectedDevice) {
      config.midiDeviceId = midi.selectedDevice.id;
    }

    onStart(config, musicxml, extractedNotes);
  }, [
    musicxml, instrumentPartIndex, inputMethod, tempoPercent,
    metronomeEnabled, startMeasure, selectedJob, selectedStem,
    midi.selectedDevice, extractedNotes, onStart,
  ]);

  // ── Auto-start mic test ──────────────────────────────────────────────────
  useEffect(() => {
    if (currentStep === 'test' && inputMethod === 'microphone' && !pitch.isListening) {
      pitch.startListening();
    }
    return () => {
      if (pitch.isListening) pitch.stopListening();
    };
  }, [currentStep, inputMethod]);

  // ── Step navigation ──────────────────────────────────────────────────────
  const canProceedToConfigure = musicxml.length > 0;
  const canProceedToTest = parts.length > 0;
  const canStart =
    extractedNotes.length > 0 &&
    (inputMethod === 'microphone' ? pitch.isListening || true : midi.isConnected || true);

  // ── Step indicators ──────────────────────────────────────────────────────
  const steps: { key: SetupStep; label: string; icon: React.ReactNode }[] = [
    { key: 'source', label: 'Choose Source', icon: <Music size={18} /> },
    { key: 'configure', label: 'Configure', icon: <Settings size={18} /> },
    { key: 'test', label: 'Test Input', icon: <Target size={18} /> },
  ];

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════
  return (
    <div className="practice-setup" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', animation: 'fadeIn 0.3s ease-out' }}>
      {/* Step Indicators */}
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

      {/* Error Display */}
      {error && (
        <div className="alert alert--danger" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)', padding: '0.75rem 1rem', borderRadius: '8px', color: 'var(--accent-rose)', fontSize: '0.9rem' }}>
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* ── Step 1: Choose Source ──────────────────────────────────────────── */}
      {currentStep === 'source' && (
        <div className="practice-setup__content" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.4rem', fontWeight: 800 }}>Select Music Source</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Choose whether to upload a new sheet music file or use a completed transcription.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Upload Card */}
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
                accept=".musicxml,.xml,.midi,.mid"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <div style={{ background: 'rgba(6, 182, 212, 0.1)', color: 'var(--accent-cyan)', padding: '1rem', borderRadius: '50%', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Upload size={32} />
              </div>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 700 }}>Upload File</h4>
              <p style={{ margin: '0 0 1.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.4 }}>
                Drag and drop your score file, or click to browse local files.
              </p>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                {['.musicxml', '.xml', '.midi', '.mid'].map((fmt) => (
                  <span key={fmt} style={{ fontSize: '0.7rem', fontWeight: 600, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', padding: '0.15rem 0.45rem', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                    {fmt}
                  </span>
                ))}
              </div>
            </div>

            {/* From Existing Card */}
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
                Choose from your list of completed transcribing audio lessons.
              </p>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-violet)', background: 'rgba(139, 92, 246, 0.15)', padding: '0.2rem 0.6rem', borderRadius: '10px' }}>
                Load from Library
              </span>
            </div>
          </div>

          {/* Existing Transcription Browser */}
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
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Music size={12} /> {job.instrument_count} parts detected
                          </div>
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
                      Select Part to Practice
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
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block', marginTop: '0.15rem' }}>
                          {stem.instrument_family}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {loadingScore && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem 0' }}>
                  <div className="spinner spinner--md" />
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Fetching instrument score...</span>
                </div>
              )}

              {selectedStem && !loadingScore && musicxml && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.25rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Check size={20} style={{ color: 'var(--accent-emerald)' }} />
                    <span style={{ fontSize: '0.95rem' }}>
                      Score loaded for <strong>{selectedStem.instrument_name}</strong> ({extractedNotes.length} notes)
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
                    <button
                      className="btn btn--secondary btn--md"
                      onClick={() => setSelectedStem(null)}
                    >
                      Change Part
                    </button>
                    <button
                      className="btn btn--primary btn--md"
                      onClick={() => setCurrentStep('configure')}
                      disabled={!canProceedToConfigure}
                    >
                      Configure Session <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Upload success navigation */}
          {sourceType !== 'existing' && fileName && musicxml && (
            <div className="glass-card" style={{ padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Check size={20} style={{ color: 'var(--accent-emerald)' }} />
                <span>
                  Loaded <strong>{fileName}</strong> ({extractedNotes.length} notes, {parts.length} parts)
                </span>
              </div>
              <button
                className="btn btn--primary btn--md"
                style={{ marginLeft: 'auto' }}
                onClick={() => setCurrentStep('configure')}
                disabled={!canProceedToConfigure}
              >
                Configure Session <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Configure ─────────────────────────────────────────────── */}
      {currentStep === 'configure' && (
        <div className="practice-setup__content glass-card" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, borderBottom: '1px solid var(--glass-border)', paddingBottom: '1rem' }}>Configure Practice Session</h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2.5rem' }}>
            {/* Left Column: Instrument & Input Method */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Instrument Part */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  <Layers size={16} style={{ color: 'var(--accent-violet)' }} />
                  Instrument Part
                </label>
                <div className="practice-select-wrapper">
                  <select
                    className="practice-select"
                    value={instrumentPartIndex}
                    onChange={(e) => {
                      const idx = parseInt(e.target.value, 10);
                      setInstrumentPartIndex(idx);
                      const noteList = extractNotesFromMusicXML(musicxml, idx);
                      setExtractedNotes(noteList);
                    }}
                  >
                    {parts.map((p) => (
                      <option key={p.index} value={p.index}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Input Method */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  <Settings size={16} style={{ color: 'var(--accent-blue)' }} />
                  Input Method
                </label>
                <div className="input-method-cards">
                  <button
                    type="button"
                    onClick={() => setInputMethod('microphone')}
                    className={`input-method-card ${inputMethod === 'microphone' ? 'input-method-card--active-mic' : ''}`}
                  >
                    <Mic size={24} style={{ color: inputMethod === 'microphone' ? 'var(--accent-blue)' : 'var(--text-muted)' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Microphone</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMethod('midi')}
                    className={`input-method-card ${inputMethod === 'midi' ? 'input-method-card--active-midi' : ''} ${!('requestMIDIAccess' in navigator) ? 'input-method-card--disabled' : ''}`}
                    disabled={!('requestMIDIAccess' in navigator)}
                  >
                    <Piano size={24} style={{ color: inputMethod === 'midi' ? 'var(--accent-violet)' : 'var(--text-muted)' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>MIDI Device</span>
                  </button>
                </div>
                {inputMethod === 'midi' && !('requestMIDIAccess' in navigator) && (
                  <div className="practice-setup__warning" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', color: 'var(--accent-amber)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                    <AlertTriangle size={14} />
                    <span>MIDI input is only available in Chrome and Edge browsers</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Tempo, Metronome & Start Position */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Tempo */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    <Timer size={16} style={{ color: 'var(--accent-cyan)' }} />
                    Tempo Percentage
                  </label>
                  <span className="tempo-value">
                    {tempoPercent}%
                  </span>
                </div>
                <div className="tempo-slider-container">
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>25%</span>
                  <input
                    type="range"
                    min={25}
                    max={150}
                    step={5}
                    value={tempoPercent}
                    onChange={(e) => setTempoPercent(parseInt(e.target.value, 10))}
                    className="tempo-slider"
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>150%</span>
                </div>
              </div>

              {/* Start Position & Metronome Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Start Measure */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    <Target size={16} style={{ color: 'var(--accent-rose)' }} />
                    Start Measure
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={startMeasure}
                    onChange={(e) => setStartMeasure(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="practice-input-number"
                  />
                </div>

                {/* Metronome */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    <Volume2 size={16} style={{ color: 'var(--accent-emerald)' }} />
                    Metronome
                  </label>
                  <div className="practice-toggle-pill">
                    <button
                      type="button"
                      onClick={() => setMetronomeEnabled(false)}
                      className={`practice-toggle-pill__btn ${!metronomeEnabled ? 'practice-toggle-pill__btn--active' : ''}`}
                    >
                      Mute
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetronomeEnabled(true)}
                      className={`practice-toggle-pill__btn ${metronomeEnabled ? 'practice-toggle-pill__btn--active' : ''}`}
                    >
                      Click
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem' }}>
            <button
              className="btn btn--secondary btn--md"
              onClick={() => setCurrentStep('source')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              Back
            </button>
            <button
              className="btn btn--primary btn--md"
              onClick={() => setCurrentStep('test')}
              disabled={!canProceedToTest}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              Configure Input <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Test Input ────────────────────────────────────────────── */}
      {currentStep === 'test' && (
        <div className="practice-setup__content" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.4rem', fontWeight: 800 }}>Test Audio Input</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Verify that your microphone or MIDI device is detecting notes properly before starting.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {/* Input Card */}
            {inputMethod === 'microphone' && (
              <div className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
                  <Mic size={20} style={{ color: 'var(--accent-blue)' }} />
                  <span style={{ fontWeight: 700 }}>Microphone Setup</span>
                  {pitch.isListening && (
                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                      Active
                    </span>
                  )}
                </div>

                {pitch.error && (
                  <div className="alert alert--danger" style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '6px', color: 'var(--accent-rose)', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.15)', fontSize: '0.8rem' }}>
                    <AlertTriangle size={16} />
                    <span>{pitch.error}</span>
                  </div>
                )}

                {/* Level Meter */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Input Level</span>
                  <div style={{ position: 'relative', height: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '5px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, pitch.level * 100)}%`,
                        background: pitch.level > 0.8
                          ? 'var(--accent-rose)'
                          : pitch.level > 0.4
                          ? 'var(--accent-amber)'
                          : 'var(--accent-emerald)',
                        transition: 'width 50ms ease',
                      }}
                    />
                  </div>
                </div>

                {/* Detected Note */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Detected Pitch</span>
                  <span style={{ fontSize: '3rem', fontWeight: 800, color: pitch.detectedNote ? 'var(--accent-cyan)' : 'var(--text-muted)', textShadow: pitch.detectedNote ? '0 0 15px rgba(6,182,212,0.2)' : 'none', marginTop: '0.5rem', fontFamily: 'monospace' }}>
                    {pitch.detectedNote ? `${pitch.detectedNote.noteName}${pitch.detectedNote.octave}` : '—'}
                  </span>
                </div>

                {!pitch.isListening && !pitch.error && (
                  <button
                    className="btn btn--primary btn--md"
                    onClick={() => pitch.startListening()}
                    style={{ width: '100%' }}
                  >
                    <Mic size={16} /> Start Microphone Test
                  </button>
                )}
              </div>
            )}

            {inputMethod === 'midi' && (
              <div className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
                  <Piano size={20} style={{ color: 'var(--accent-violet)' }} />
                  <span style={{ fontWeight: 700 }}>MIDI Device Setup</span>
                  {midi.isConnected && (
                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                      Connected
                    </span>
                  )}
                </div>

                {!midi.isSupported && (
                  <div className="practice-setup__warning" style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', color: 'var(--accent-amber)', fontSize: '0.8rem' }}>
                    <AlertTriangle size={14} />
                    <span>MIDI input is only available in Chrome and Edge browsers</span>
                  </div>
                )}

                {midi.error && (
                  <div className="alert alert--danger" style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '6px', color: 'var(--accent-rose)', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.15)', fontSize: '0.8rem' }}>
                    <AlertTriangle size={16} />
                    <span>{midi.error}</span>
                  </div>
                )}

                {midi.isSupported && (
                  <>
                    {midi.devices.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Active MIDI Device</span>
                        <div className="practice-select-wrapper">
                          <select
                            className="practice-select"
                            value={midi.selectedDevice?.id || ''}
                            onChange={(e) => midi.selectDevice(e.target.value)}
                          >
                            {midi.devices.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name} ({d.manufacturer})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ) : (
                      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
                        No MIDI devices detected. Connect a USB keyboard or controller.
                      </p>
                    )}

                    {/* Last Note */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Note Played</span>
                      <span style={{ fontSize: '3rem', fontWeight: 800, color: midi.lastNote?.type === 'on' ? 'var(--accent-cyan)' : 'var(--text-muted)', textShadow: midi.lastNote?.type === 'on' ? '0 0 15px rgba(6,182,212,0.2)' : 'none', marginTop: '0.5rem', fontFamily: 'monospace' }}>
                        {midi.lastNote && midi.lastNote.type === 'on' ? midiToNoteName(midi.lastNote.note) : '—'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Session Summary Card */}
            <div className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
                <Settings size={20} style={{ color: 'var(--accent-violet)' }} />
                <span style={{ fontWeight: 700 }}>Session Summary</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Source File</span>
                  <span style={{ fontWeight: 600 }}>{fileName || selectedStem?.instrument_name || 'Uploaded file'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Selected Part</span>
                  <span style={{ fontWeight: 600 }}>{parts[instrumentPartIndex]?.name || 'Part 1'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Notes Count</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>{extractedNotes.filter((n) => !n.isRest).length} notes</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Input Capture</span>
                  <span style={{ fontWeight: 600 }}>{inputMethod === 'microphone' ? 'Microphone' : 'MIDI Device'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Practice Tempo</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>{tempoPercent}% speed</span>
                </div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem' }}>
            <button
              className="btn btn--secondary btn--md"
              onClick={() => setCurrentStep('configure')}
            >
              Back
            </button>
            <button
              className="btn btn--primary btn--lg"
              onClick={handleStart}
              disabled={!canStart}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 2rem', background: 'var(--gradient-secondary)', border: 'none' }}
            >
              <Zap size={18} />
              Start Practice Session
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PracticeSetup;
