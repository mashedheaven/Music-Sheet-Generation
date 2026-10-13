import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, MicOff, Award, Activity } from 'lucide-react';
import type { LyricNote } from '../Lyrics/AppleLyricsView';

interface KaraokeCoachProps {
  vocalNotes: LyricNote[];
  currentTime: number;
}

// Convert MIDI pitch to note name (e.g., 60 -> C4)
function midiToNoteName(midi: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = Math.round(midi) % 12;
  return `${noteNames[noteIndex]}${octave}`;
}

// Convert pitch frequency (Hz) to MIDI pitch number
function autoCorrelateFrequencyToMidi(frequency: number): number {
  if (frequency <= 0) return 0;
  return 69 + 12 * Math.log2(frequency / 440);
}

// Web Audio API Autocorrelation algorithm for pitch detection
function autoCorrelate(buf: Float32Array, sampleRate: number): number {
  let SIZE = buf.length;
  let rms = 0;

  for (let i = 0; i < SIZE; i++) {
    let val = buf[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / SIZE);

  // Not enough signal
  if (rms < 0.01) return -1;

  let r1 = 0, r2 = SIZE - 1, thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < thres) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < thres) {
      r2 = SIZE - i;
      break;
    }
  }

  buf = buf.slice(r1, r2);
  SIZE = buf.length;

  let c = new Array(SIZE).fill(0);
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE - i; j++) {
      c[i] = c[i] + buf[j] * buf[j + i];
    }
  }

  let d = 0;
  while (c[d] > c[d + 1]) d++;
  let maxval = -1, maxpos = -1;
  for (let i = d; i < SIZE; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }
  let T0 = maxpos;

  let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
  let a = (x1 + x3 - 2 * x2) / 2;
  let b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);

  return sampleRate / T0;
}

export const KaraokeCoach: React.FC<KaraokeCoachProps> = ({
  vocalNotes,
  currentTime,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [detectedPitch, setDetectedPitch] = useState<number | null>(null);
  const [score, setScore] = useState(100);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Current active note at current audio playback time
  const targetNote = vocalNotes.find(
    (n) => currentTime >= n.onset && currentTime <= n.offset + 0.1
  );

  const updatePitch = useCallback(() => {
    if (!analyserRef.current || !audioCtxRef.current) return;

    const buf = new Float32Array(2048);
    analyserRef.current.getFloatTimeDomainData(buf);
    const freq = autoCorrelate(buf, audioCtxRef.current.sampleRate);

    if (freq > 0 && freq < 1200) {
      const midi = autoCorrelateFrequencyToMidi(freq);
      setDetectedPitch(midi);

      if (targetNote) {
        const diff = Math.abs(midi - targetNote.pitch);
        if (diff <= 1.5) {
          // In pitch
          setScore((prev) => Math.min(100, prev + 0.5));
        } else {
          // Off pitch
          setScore((prev) => Math.max(0, prev - 0.8));
        }
      }
    } else {
      setDetectedPitch(null);
    }

    animFrameRef.current = requestAnimationFrame(updatePitch);
  }, [targetNote]);

  const toggleListen = async () => {
    if (isListening) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
      setIsListening(false);
      setDetectedPitch(null);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current = audioCtx;

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        analyserRef.current = analyser;

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        setIsListening(true);
      } catch (err) {
        console.error('Microphone access error:', err);
        alert('Could not access microphone for Karaoke Pitch Coach.');
      }
    }
  };

  useEffect(() => {
    if (isListening) {
      animFrameRef.current = requestAnimationFrame(updatePitch);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isListening, updatePitch]);

  // Calculate pitch difference for visual gauge
  const pitchDiff =
    detectedPitch !== null && targetNote !== undefined
      ? detectedPitch - targetNote.pitch
      : null;

  let coachFeedback = 'Ready to sing!';
  let feedbackColor = '#94a3b8';

  if (targetNote) {
    if (detectedPitch === null) {
      coachFeedback = 'Sing now!';
      feedbackColor = '#38bdf8';
    } else if (pitchDiff !== null) {
      if (Math.abs(pitchDiff) <= 1.0) {
        coachFeedback = 'Perfect Pitch! 🔥';
        feedbackColor = '#22c55e';
      } else if (pitchDiff > 1.0) {
        coachFeedback = 'Sing Lower ⬇️';
        feedbackColor = '#f59e0b';
      } else {
        coachFeedback = 'Sing Higher ⬆️';
        feedbackColor = '#3b82f6';
      }
    }
  } else {
    coachFeedback = 'Listen & get ready for next note...';
  }

  return (
    <div
      className="karaoke-coach glass-card"
      style={{
        padding: '2rem',
        borderRadius: '16px',
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.9) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Activity size={28} className="text-primary" />
          <h3 style={{ margin: 0, fontSize: '1.3rem' }}>AI Karaoke Coach</h3>
        </div>

        <button
          onClick={toggleListen}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 1.2rem',
            borderRadius: '30px',
            border: 'none',
            fontWeight: 600,
            cursor: 'pointer',
            background: isListening
              ? 'linear-gradient(135deg, #ef4444, #dc2626)'
              : 'linear-gradient(135deg, #3b82f6, #2563eb)',
            color: '#ffffff',
            boxShadow: isListening ? '0 0 15px rgba(239, 68, 68, 0.5)' : 'none',
            transition: 'all 0.2s ease',
          }}
        >
          {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          {isListening ? 'Stop Listening' : 'Start Mic Pitch Coach'}
        </button>
      </div>

      {/* Main Pitch Match Gauge */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '1rem',
          alignItems: 'center',
          background: 'rgba(0,0,0,0.25)',
          padding: '1.5rem',
          borderRadius: '12px',
          textAlign: 'center',
        }}
      >
        <div>
          <span className="text-xs text-secondary" style={{ display: 'block', marginBottom: '0.25rem' }}>
            EXPECTED NOTE
          </span>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#38bdf8' }}>
            {targetNote ? midiToNoteName(targetNote.pitch) : '—'}
          </div>
          {targetNote?.lyric && (
            <span style={{ fontSize: '0.9rem', color: '#cbd5e1', fontStyle: 'italic' }}>
              "{targetNote.lyric}"
            </span>
          )}
        </div>

        <div>
          <span className="text-xs text-secondary" style={{ display: 'block', marginBottom: '0.25rem' }}>
            COACH FEEDBACK
          </span>
          <div
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: feedbackColor,
              textShadow: `0 0 12px ${feedbackColor}88`,
            }}
          >
            {coachFeedback}
          </div>
        </div>

        <div>
          <span className="text-xs text-secondary" style={{ display: 'block', marginBottom: '0.25rem' }}>
            YOUR PITCH
          </span>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: detectedPitch ? '#a855f7' : '#64748b' }}>
            {detectedPitch ? midiToNoteName(detectedPitch) : '—'}
          </div>
        </div>
      </div>

      {/* Live Pitch Accuracy Bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
          <span className="text-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Award size={16} className="text-warning" /> Overall Pitch Accuracy Score
          </span>
          <span style={{ fontWeight: 700, color: '#f59e0b' }}>{Math.round(score)}%</span>
        </div>
        <div
          style={{
            height: '10px',
            width: '100%',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '5px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${score}%`,
              background: 'linear-gradient(90deg, #ef4444 0%, #f59e0b 50%, #22c55e 100%)',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>
    </div>
  );
};
