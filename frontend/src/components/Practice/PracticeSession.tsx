import React, { useEffect, useState, useRef } from 'react';
import { Play, Pause, Square, Volume2, VolumeX, ArrowLeft } from 'lucide-react';
import type { NoteInfo, PracticeConfig } from '../../api/types';
import { usePracticeSession } from '../../hooks/usePracticeSession';
import { usePitchDetection } from '../../hooks/usePitchDetection';
import { useMidiInput } from '../../hooks/useMidiInput';
import { PracticeScore } from './PracticeScore';
import { NoteIndicator } from './NoteIndicator';
import { PracticeStats } from './PracticeStats';
import { getStemAudioUrl, recordPracticeSession } from '../../api/client';
import { getInstrumentIcon } from '../../utils/icons';

interface PracticeSessionProps {
  config: PracticeConfig;
  musicxml: string;
  initialNotes: NoteInfo[];
  onExit: () => void;
}

export const PracticeSession: React.FC<PracticeSessionProps> = ({
  config,
  musicxml,
  initialNotes,
  onExit,
}) => {
  const [extractedNotes, setExtractedNotes] = useState<NoteInfo[]>(initialNotes);

  // Initialize practice session state machine
  const {
    state,
    currentNoteIndex,
    noteStatuses,
    expectedNote,
    stats,
    countdownValue,
    start,
    pause,
    resume,
    stop,
    seekTo,
    processDetectedPitch,
    processDetectedMidi,
  } = usePracticeSession(extractedNotes.length > 0 ? extractedNotes : initialNotes, config);

  // Save session to backend when completed
  const hasSavedRef = useRef<boolean>(false);
  useEffect(() => {
    if (state === 'complete' && config.jobId && !hasSavedRef.current) {
      hasSavedRef.current = true;
      recordPracticeSession(
        config.jobId,
        config.selectedStemId || null,
        stats.accuracy,
        stats.totalNotes,
        stats.correctFirstTry,
        stats.elapsedSeconds,
        config.tempoPercent
      ).catch((err) => {
        console.warn("Failed to save practice session to backend:", err);
      });
    } else if (state !== 'complete') {
      hasSavedRef.current = false;
    }
  }, [state, stats.accuracy, stats.totalNotes, stats.correctFirstTry, stats.elapsedSeconds, config.jobId, config.selectedStemId, config.tempoPercent]);

  // Microphone pitch detection
  const {
    detectedNote: detectedPitch,
    startListening,
    stopListening,
    error: micError,
  } = usePitchDetection(config.inputMethod === 'microphone' && state === 'playing');

  // MIDI device input
  const {
    lastNote: detectedMidi,
    error: midiError,
  } = useMidiInput(config.inputMethod === 'midi' && state === 'playing');

  // Multi-stem accompaniment audios
  const audiosRef = useRef<Record<string, HTMLAudioElement>>({});
  const [stemVolumes, setStemVolumes] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    if (config.stems) {
      config.stems.forEach((stem) => {
        // Mute selected stem, set others to 80% volume
        initial[stem.id] = stem.id === config.selectedStemId ? 0 : 0.8;
      });
    }
    return initial;
  });

  // Track if audio is muted overall
  const [isAudioMuted, setIsAudioMuted] = useState(false);

  // Initialize accompaniment audio elements
  useEffect(() => {
    if (config.stems && config.stems.length > 0) {
      config.stems.forEach((stem) => {
        if (!audiosRef.current[stem.id]) {
          const audio = new Audio(getStemAudioUrl(stem.id));
          audio.loop = false;
          // Set initial volumes
          const isSelected = stem.id === config.selectedStemId;
          audio.volume = isSelected ? 0 : 0.8;
          audiosRef.current[stem.id] = audio;
        }
      });
    }

    return () => {
      // Pause and clean up on unmount
      Object.values(audiosRef.current).forEach((audio) => {
        audio.pause();
      });
      audiosRef.current = {};
    };
  }, [config.stems, config.selectedStemId]);

  // Synchronize accompaniment audio play/pause states
  useEffect(() => {
    const audios = Object.values(audiosRef.current);
    if (state === 'playing') {
      let masterTime = 0;
      const firstAudio = audios[0];
      if (firstAudio) {
        masterTime = firstAudio.currentTime;
      }

      audios.forEach((audio) => {
        audio.playbackRate = config.tempoPercent / 100;
        audio.currentTime = masterTime;
        audio.play().catch((err) => console.warn("Failed to play stem audio:", err));
      });
    } else {
      audios.forEach((audio) => {
        audio.pause();
      });
    }
  }, [state, config.tempoPercent]);

  // Sync mic listener
  useEffect(() => {
    if (state === 'playing' && config.inputMethod === 'microphone') {
      startListening().catch((err) => console.error("Mic start error:", err));
    } else {
      stopListening();
    }
  }, [state, config.inputMethod, startListening, stopListening]);

  // Process inputs in loops
  useEffect(() => {
    if (state === 'playing' && config.inputMethod === 'microphone') {
      processDetectedPitch(detectedPitch);
    }
  }, [detectedPitch, state, config.inputMethod, processDetectedPitch]);

  useEffect(() => {
    if (state === 'playing' && config.inputMethod === 'midi') {
      processDetectedMidi(detectedMidi);
    }
  }, [detectedMidi, state, config.inputMethod, processDetectedMidi]);

  // Synthesizer metronome
  useEffect(() => {
    if (state === 'playing' && config.metronomeEnabled) {
      let audioCtx: AudioContext | null = null;
      let timer: number | null = null;
      let beatCounter = 0;

      try {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const intervalMs = (60 / (120 * (config.tempoPercent / 100))) * 1000;

        const tick = () => {
          if (!audioCtx) return;
          const isDownbeat = beatCounter % 4 === 0;
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);

          osc.frequency.setValueAtTime(isDownbeat ? 1000 : 800, audioCtx.currentTime);
          gain.gain.setValueAtTime(isAudioMuted ? 0 : 0.1, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);

          osc.start();
          osc.stop(audioCtx.currentTime + 0.06);

          beatCounter++;
        };

        tick();
        timer = window.setInterval(tick, intervalMs);
      } catch (err) {
        console.warn("Metronome initialization failed:", err);
      }

      return () => {
        if (timer) clearInterval(timer);
        if (audioCtx) audioCtx.close();
      };
    }
  }, [state, config.metronomeEnabled, config.tempoPercent, isAudioMuted]);

  const handleVolumeChange = (stemId: string, vol: number) => {
    const audio = audiosRef.current[stemId];
    if (audio) {
      audio.volume = isAudioMuted ? 0 : vol;
    }
    setStemVolumes((prev) => ({ ...prev, [stemId]: vol }));
  };

  const toggleMuteAll = () => {
    const newMuted = !isAudioMuted;
    setIsAudioMuted(newMuted);
    Object.entries(audiosRef.current).forEach(([stemId, audio]) => {
      audio.volume = newMuted ? 0 : (stemVolumes[stemId] || 0.8);
    });
  };

  // Handle extracted notes from OSMD
  const handleNotesExtracted = (notes: NoteInfo[]) => {
    if (notes && notes.length > 0) {
      setExtractedNotes(notes);
    }
  };

  // Format time (mins:secs)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // If completed, render Stats view
  if (state === 'complete') {
    return (
      <PracticeStats
        stats={stats}
        onRestart={start}
        onExit={onExit}
      />
    );
  }

  const notesToUse = extractedNotes.length > 0 ? extractedNotes : initialNotes;

  return (
    <div className="practice-session" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.3s ease-out' }}>
      {/* Top Session Bar */}
      <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={onExit} className="btn-icon" title="Exit Practice">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Practice Session</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Tempo: {config.tempoPercent}% | {config.inputMethod === 'microphone' ? 'Microphone' : 'MIDI Input'}
            </span>
          </div>
        </div>

        {/* Note progression and Time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Progress</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              {currentNoteIndex + 1} / {notesToUse.length}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Time</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'monospace' }}>
              {formatTime(stats.elapsedSeconds)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Accuracy</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>
              {stats.totalNotes > 0 ? Math.round((stats.correctFirstTry / stats.totalNotes) * 100) : 0}%
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {state === 'idle' && (
            <button onClick={start} className="btn btn--primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}>
              <Play size={16} /> Start Practice
            </button>
          )}

          {state === 'playing' && (
            <button onClick={pause} className="btn btn--secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}>
              <Pause size={16} /> Pause
            </button>
          )}

          {state === 'paused' && (
            <button onClick={resume} className="btn btn--primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}>
              <Play size={16} /> Resume
            </button>
          )}

          {(state === 'playing' || state === 'paused') && (
            <button onClick={stop} className="btn btn--danger" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'var(--accent-rose)' }}>
              <Square size={16} /> Finish
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: config.stems && config.stems.length > 0 ? '3fr 1fr' : '1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Sheet Music Score Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <PracticeScore
            musicxml={musicxml}
            partIndex={config.instrumentPartIndex}
            noteStatuses={noteStatuses}
            currentNoteIndex={currentNoteIndex}
            onNoteClick={seekTo}
            onNotesExtracted={handleNotesExtracted}
          />
        </div>

        {/* Accompaniment Audio Panel */}
        {config.stems && config.stems.length > 0 && (
          <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Accompaniment</h4>
              <button onClick={toggleMuteAll} className="btn-icon" title={isAudioMuted ? "Unmute All" : "Mute All"}>
                {isAudioMuted ? <VolumeX size={18} style={{ color: 'var(--accent-rose)' }} /> : <Volume2 size={18} />}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {config.stems.map((stem) => {
                const isUserInstrument = stem.id === config.selectedStemId;
                const volume = stemVolumes[stem.id] ?? 0.8;

                return (
                  <div key={stem.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.5rem', borderRadius: '6px', background: isUserInstrument ? 'rgba(59, 130, 246, 0.05)' : 'transparent', border: isUserInstrument ? '1px solid rgba(59,130,246,0.15)' : '1px solid transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {getInstrumentIcon(stem.instrument_name, { size: 16, style: { color: isUserInstrument ? 'var(--accent-blue)' : 'var(--text-secondary)' } })}
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{stem.instrument_name}</span>
                        {isUserInstrument && (
                          <span style={{ fontSize: '0.7rem', background: 'rgba(59, 130, 246, 0.2)', color: 'var(--accent-blue)', padding: '0.05rem 0.35rem', borderRadius: '4px' }}>
                            You
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {isAudioMuted ? 'Muted' : `${Math.round(volume * 100)}%`}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleVolumeChange(stem.id, volume > 0 ? 0 : 0.8)}
                        className="btn-icon"
                        style={{ padding: '0.25rem' }}
                      >
                        {volume === 0 || isAudioMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isAudioMuted ? 0 : volume}
                        onChange={(e) => handleVolumeChange(stem.id, parseFloat(e.target.value))}
                        className="practice-slider"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Note indicator bar */}
      <NoteIndicator
        expectedNote={expectedNote}
        detectedPitch={detectedPitch}
        detectedMidi={detectedMidi}
        inputMethod={config.inputMethod}
      />

      {/* Countdown overlay */}
      {state === 'countdown' && (
        <div className="countdown-overlay" style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,14,26,0.85)', backdropFilter: 'blur(8px)', animation: 'fadeIn 0.2s ease-out' }}>
          <div style={{ textAlign: 'center', transform: 'scale(1.2)' }}>
            <div style={{ fontSize: '1.25rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent-blue)', marginBottom: '0.5rem' }}>Get Ready!</div>
            <div style={{ fontSize: '6rem', fontWeight: 900, color: '#ffffff', lineHeight: 1, animation: 'pulse 1s ease-in-out infinite' }}>
              {countdownValue}
            </div>
          </div>
        </div>
      )}

      {/* Errors / Warnings */}
      {micError && config.inputMethod === 'microphone' && (
        <div className="alert alert--danger" style={{ display: 'flex', gap: '0.5rem', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)', padding: '0.75rem 1rem', borderRadius: '6px', color: 'var(--accent-rose)' }}>
          <span>⚠️ {micError}</span>
        </div>
      )}

      {midiError && config.inputMethod === 'midi' && (
        <div className="alert alert--danger" style={{ display: 'flex', gap: '0.5rem', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)', padding: '0.75rem 1rem', borderRadius: '6px', color: 'var(--accent-rose)' }}>
          <span>⚠️ {midiError}</span>
        </div>
      )}
    </div>
  );
};
