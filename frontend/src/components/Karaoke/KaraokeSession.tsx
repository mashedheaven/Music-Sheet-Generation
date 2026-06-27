import React, { useEffect, useState, useRef } from 'react';
import { Play, Pause, Square, Volume2, VolumeX, ArrowLeft } from 'lucide-react';
import type { Stem } from '../../api/types';
import type { LyricWord } from '../../utils/musicxmlParser';
import { useLyricSync, AdvancementLogic } from '../../hooks/useLyricSync';
import { LyricsViewer } from './LyricsViewer';
import { getStemAudioUrl } from '../../api/client';
import { getInstrumentIcon } from '../../utils/icons';

type SessionState = 'idle' | 'countdown' | 'playing' | 'paused' | 'complete';

interface KaraokeSessionProps {
  jobId?: string;
  selectedStemId?: string;
  stems?: Stem[];
  lyrics: LyricWord[];
  advancementLogic: AdvancementLogic;
  onExit: () => void;
}

export const KaraokeSession: React.FC<KaraokeSessionProps> = ({
  jobId,
  selectedStemId,
  stems,
  lyrics,
  advancementLogic,
  onExit,
}) => {
  const [state, setState] = useState<SessionState>('idle');
  const [countdownValue, setCountdownValue] = useState(3);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  // Track if audio is muted overall
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [stemVolumes, setStemVolumes] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    if (stems) {
      stems.forEach((stem) => {
        // Mute selected stem (vocals), set others to 80% volume
        initial[stem.id] = stem.id === selectedStemId ? 0 : 0.8;
      });
    }
    return initial;
  });

  const audiosRef = useRef<Record<string, HTMLAudioElement>>({});
  const timerRef = useRef<number | null>(null);

  // Initialize lyric sync hook
  const { currentLyricIndex, isListening, error: speechError, resetSync } = useLyricSync({
    lyrics,
    advancementLogic,
    enabled: state === 'playing',
  });

  // Initialize accompaniment audio elements
  useEffect(() => {
    if (stems && stems.length > 0) {
      stems.forEach((stem) => {
        if (!audiosRef.current[stem.id]) {
          const audio = new Audio(getStemAudioUrl(stem.id));
          audio.loop = false;
          const isSelected = stem.id === selectedStemId;
          audio.volume = isSelected ? 0 : 0.8;
          audiosRef.current[stem.id] = audio;
        }
      });
    }

    return () => {
      Object.values(audiosRef.current).forEach((audio) => {
        audio.pause();
      });
      audiosRef.current = {};
    };
  }, [stems, selectedStemId]);

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
        audio.currentTime = masterTime;
        audio.play().catch((err) => console.warn("Failed to play stem audio:", err));
      });
      
      // Setup timer
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
      
    } else {
      audios.forEach((audio) => {
        audio.pause();
      });
      if (timerRef.current) clearInterval(timerRef.current);
    }
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state]);

  const handleStart = () => {
    setState('countdown');
    setCountdownValue(3);
    
    let currentCount = 3;
    const interval = setInterval(() => {
      currentCount--;
      if (currentCount > 0) {
        setCountdownValue(currentCount);
      } else {
        clearInterval(interval);
        setState('playing');
      }
    }, 1000);
  };

  const handlePause = () => setState('paused');
  const handleResume = () => setState('playing');
  const handleStop = () => {
    setState('idle');
    resetSync();
    setElapsedSeconds(0);
    Object.values(audiosRef.current).forEach((audio) => {
      audio.currentTime = 0;
    });
  };

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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="karaoke-session" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.3s ease-out' }}>
      {/* Top Session Bar */}
      <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={onExit} className="btn-icon" title="Exit Karaoke">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Karaoke Mode</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Logic: {advancementLogic === 'exact' ? 'Exact Match' : 'Continuous tracking'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Time</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'monospace' }}>
              {formatTime(elapsedSeconds)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Progress</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              {currentLyricIndex} / {lyrics.length}
            </div>
          </div>
          {isListening && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-rose)' }}>
               <div className="pulse-dot" style={{ width: '8px', height: '8px', background: 'var(--accent-rose)', borderRadius: '50%', animation: 'pulse 1s infinite' }} />
               <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Listening</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {state === 'idle' && (
            <button onClick={handleStart} className="btn btn--primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}>
              <Play size={16} /> Start
            </button>
          )}

          {state === 'playing' && (
            <button onClick={handlePause} className="btn btn--secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}>
              <Pause size={16} /> Pause
            </button>
          )}

          {state === 'paused' && (
            <button onClick={handleResume} className="btn btn--primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}>
              <Play size={16} /> Resume
            </button>
          )}

          {(state === 'playing' || state === 'paused') && (
            <button onClick={handleStop} className="btn btn--danger" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'var(--accent-rose)' }}>
              <Square size={16} /> Stop
            </button>
          )}
        </div>
      </div>

      {speechError && (
        <div className="alert alert--danger" style={{ background: 'rgba(244,63,94,0.1)', color: 'var(--accent-rose)', padding: '1rem', borderRadius: '8px' }}>
          ⚠️ {speechError}
        </div>
      )}

      {/* Main Workspace Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: stems && stems.length > 0 ? '3fr 1fr' : '1fr', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Lyrics Area */}
        <div style={{ height: '600px' }}>
          <LyricsViewer 
            lyrics={lyrics} 
            currentLyricIndex={currentLyricIndex} 
          />
        </div>

        {/* Accompaniment Audio Panel */}
        {stems && stems.length > 0 && (
          <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Accompaniment</h4>
              <button onClick={toggleMuteAll} className="btn-icon" title={isAudioMuted ? "Unmute All" : "Mute All"}>
                {isAudioMuted ? <VolumeX size={18} style={{ color: 'var(--accent-rose)' }} /> : <Volume2 size={18} />}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {stems.map((stem) => {
                const isUserInstrument = stem.id === selectedStemId;
                const volume = stemVolumes[stem.id] ?? 0.8;

                return (
                  <div key={stem.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.5rem', borderRadius: '6px', background: isUserInstrument ? 'rgba(59, 130, 246, 0.05)' : 'transparent', border: isUserInstrument ? '1px solid rgba(59,130,246,0.15)' : '1px solid transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {getInstrumentIcon(stem.instrument_name, { size: 16, style: { color: isUserInstrument ? 'var(--accent-blue)' : 'var(--text-secondary)' } })}
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{stem.instrument_name}</span>
                        {isUserInstrument && (
                          <span style={{ fontSize: '0.7rem', background: 'rgba(59, 130, 246, 0.2)', color: 'var(--accent-blue)', padding: '0.05rem 0.35rem', borderRadius: '4px' }}>
                            Vocals
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
    </div>
  );
};
