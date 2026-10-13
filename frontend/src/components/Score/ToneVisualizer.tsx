import React, { useRef, useEffect } from 'react';
import type { LyricNote } from '../Lyrics/AppleLyricsView';

interface ToneVisualizerProps {
  notes: LyricNote[];
  currentTime: number;
}

const MIDI_MIN = 36; // C2
const MIDI_MAX = 84; // C6

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function midiToNoteName(midi: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = Math.round(midi) % 12;
  return `${noteNames[noteIndex]}${octave}`;
}

export const ToneVisualizer: React.FC<ToneVisualizerProps> = ({
  notes,
  currentTime,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw grid background
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;

    // Horizontal pitch lines
    const totalPitches = MIDI_MAX - MIDI_MIN;
    for (let p = MIDI_MIN; p <= MIDI_MAX; p += 3) {
      const y = height - ((p - MIDI_MIN) / totalPitches) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.font = '10px sans-serif';
      ctx.fillText(midiToNoteName(p), 10, y - 4);
    }

    // Time window: currentTime - 2s to currentTime + 6s
    const windowStart = Math.max(0, currentTime - 2);
    const windowEnd = windowStart + 8;
    const timeToX = (t: number) => ((t - windowStart) / (windowEnd - windowStart)) * width;

    // Draw playhead line
    const playheadX = timeToX(currentTime);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();

    // Draw notes (Piano Roll blocks)
    notes.forEach((note) => {
      if (note.offset < windowStart || note.onset > windowEnd) return;

      const x1 = timeToX(note.onset);
      const x2 = timeToX(note.offset);
      const noteWidth = Math.max(x2 - x1, 4);

      const normalizedPitch = Math.min(
        Math.max((note.pitch - MIDI_MIN) / totalPitches, 0),
        1
      );
      const y = height - normalizedPitch * height;
      const noteHeight = height / totalPitches + 4;

      const isActive = currentTime >= note.onset && currentTime <= note.offset;

      if (isActive) {
        // Glowing effect for active tones
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#38bdf8';
      } else {
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(59, 130, 246, 0.6)';
      }

      ctx.beginPath();
      ctx.roundRect(x1, y - noteHeight / 2, noteWidth, noteHeight, 4);
      ctx.fill();

      // Reset shadow
      ctx.shadowBlur = 0;

      // Draw lyric label on top of block if available
      if (note.lyric && noteWidth > 15) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(note.lyric, x1 + 4, y + 3);
      }
    });
  }, [notes, currentTime]);

  const activeNote = notes.find(
    (n) => currentTime >= n.onset && currentTime <= n.offset
  );

  return (
    <div
      className="tone-visualizer glass-card"
      style={{
        padding: '1.5rem',
        borderRadius: '16px',
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.9) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc' }}>
          Interactive Tone & Note Visualizer
        </h3>
        {activeNote && (
          <div
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '20px',
              background: 'rgba(6, 182, 212, 0.2)',
              border: '1px solid rgba(6, 182, 212, 0.5)',
              color: '#38bdf8',
              fontWeight: 600,
              fontSize: '0.9rem',
              boxShadow: '0 0 12px rgba(56, 189, 248, 0.4)',
            }}
          >
            Active Tone: {midiToNoteName(activeNote.pitch)} ({Math.round(midiToFrequency(activeNote.pitch))} Hz)
          </div>
        )}
      </div>

      <canvas
        ref={canvasRef}
        width={800}
        height={220}
        style={{
          width: '100%',
          height: '220px',
          background: 'rgba(10, 15, 30, 0.8)',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      />
    </div>
  );
};
