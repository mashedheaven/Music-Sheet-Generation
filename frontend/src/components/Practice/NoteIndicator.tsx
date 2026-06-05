import React from 'react';
import type { NoteInfo, PitchResult, MidiNoteEvent, PracticeInputMethod } from '../../api/types';
import { midiToNoteName } from '../../utils/pitchUtils';

interface NoteIndicatorProps {
  expectedNote: NoteInfo | null;
  detectedPitch: PitchResult | null;
  detectedMidi: MidiNoteEvent | null;
  inputMethod: PracticeInputMethod;
}

export const NoteIndicator: React.FC<NoteIndicatorProps> = ({
  expectedNote,
  detectedPitch,
  detectedMidi,
  inputMethod,
}) => {
  // Determine detected note name and MIDI number
  let detectedNoteName = '-';
  let detectedMidiNumber: number | null = null;
  let centsDeviation = 0;

  if (inputMethod === 'midi' && detectedMidi && detectedMidi.type === 'on') {
    detectedMidiNumber = detectedMidi.note;
    detectedNoteName = midiToNoteName(detectedMidiNumber);
  } else if (inputMethod === 'microphone' && detectedPitch && detectedPitch.confidence > 0.5) {
    detectedMidiNumber = Math.round(detectedPitch.midiNote);
    detectedNoteName = detectedPitch.noteName;
    centsDeviation = detectedPitch.cents;
  }

  // Determine feedback status
  let statusText = 'Play the note shown above';
  let statusClass = 'status-pending';

  if (expectedNote && detectedMidiNumber !== null) {
    const isCorrect = detectedMidiNumber === expectedNote.midiPitch;
    if (isCorrect) {
      statusText = 'Correct!';
      statusClass = 'status-correct';
    } else {
      statusText = 'Wrong note. Try again!';
      statusClass = 'status-wrong';
    }
  } else if (expectedNote && inputMethod === 'microphone' && detectedPitch && detectedPitch.confidence > 0.5) {
    const isCorrect = Math.round(detectedPitch.midiNote) === expectedNote.midiPitch;
    if (isCorrect) {
      if (centsDeviation > 15) {
        statusText = 'Correct note, but too sharp!';
        statusClass = 'status-warning';
      } else if (centsDeviation < -15) {
        statusText = 'Correct note, but too flat!';
        statusClass = 'status-warning';
      } else {
        statusText = 'Correct!';
        statusClass = 'status-correct';
      }
    } else {
      statusText = 'Incorrect pitch. Try again!';
      statusClass = 'status-wrong';
    }
  }

  // Generate mini keyboard notes dynamically centered on expectedNote
  const renderKeyboard = () => {
    if (!expectedNote) return null;

    // Center keyboard around expected note octave (start at C of octave below expected)
    const startMidi = Math.max(12, Math.floor(expectedNote.midiPitch / 12) * 12 - 12);

    const whiteKeys = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23];
    const blackKeys = [
      { offset: 1, leftOffset: 1 },
      { offset: 3, leftOffset: 2 },
      { offset: 6, leftOffset: 4 },
      { offset: 8, leftOffset: 5 },
      { offset: 10, leftOffset: 6 },
      { offset: 13, leftOffset: 8 },
      { offset: 15, leftOffset: 9 },
      { offset: 18, leftOffset: 11 },
      { offset: 20, leftOffset: 12 },
      { offset: 22, leftOffset: 13 },
    ];

    const whiteKeyWidth = 28;
    const blackKeyWidth = 16;
    const totalWidth = whiteKeys.length * whiteKeyWidth;

    return (
      <div
        className="mini-keyboard"
        style={{
          position: 'relative',
          height: '90px',
          width: `${totalWidth}px`,
          margin: '0 auto',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--glass-border)',
          borderRadius: '6px',
          overflow: 'hidden',
        }}
      >
        {/* Render white keys */}
        {whiteKeys.map((offset, idx) => {
          const midi = startMidi + offset;
          const isExpected = midi === expectedNote.midiPitch;
          const isDetected = detectedMidiNumber === midi;

          let bg = '#ffffff';
          if (isExpected) bg = 'rgba(59, 130, 246, 0.9)'; // Blue
          if (isDetected) bg = isExpected ? 'rgba(16, 185, 129, 0.9)' : 'rgba(244, 63, 94, 0.9)'; // Green or Red

          return (
            <div
              key={midi}
              style={{
                position: 'absolute',
                left: `${idx * whiteKeyWidth}px`,
                top: 0,
                width: `${whiteKeyWidth - 1}px`,
                height: '100%',
                backgroundColor: bg,
                borderRight: '1px solid rgba(0, 0, 0, 0.1)',
                zIndex: 1,
                transition: 'background-color 0.15s ease',
              }}
              title={midiToNoteName(midi)}
            />
          );
        })}

        {/* Render black keys */}
        {blackKeys.map(({ offset, leftOffset }) => {
          const midi = startMidi + offset;
          const isExpected = midi === expectedNote.midiPitch;
          const isDetected = detectedMidiNumber === midi;

          let bg = '#1e293b';
          if (isExpected) bg = 'rgba(59, 130, 246, 1)';
          if (isDetected) bg = isExpected ? 'rgba(16, 185, 129, 1)' : 'rgba(244, 63, 94, 1)';

          return (
            <div
              key={midi}
              style={{
                position: 'absolute',
                left: `${leftOffset * whiteKeyWidth - blackKeyWidth / 2}px`,
                top: 0,
                width: `${blackKeyWidth}px`,
                height: '54px',
                backgroundColor: bg,
                border: '1px solid rgba(0, 0, 0, 0.3)',
                borderRadius: '0 0 3px 3px',
                zIndex: 2,
                transition: 'background-color 0.15s ease',
              }}
              title={midiToNoteName(midi)}
            />
          );
        })}
      </div>
    );
  };

  const getMeterNeedleLeft = () => {
    // Map cents deviation (-50 to +50) to percentage (0% to 100%)
    const clamped = Math.max(-50, Math.min(50, centsDeviation));
    return `${((clamped + 50) / 100) * 100}%`;
  };

  return (
    <div className="note-indicator glass-card" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '2rem', alignItems: 'center', padding: '1.5rem' }}>
      {/* Expected Note Panel */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--glass-border)', paddingRight: '1.5rem' }}>
        <span style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Expected Note</span>
        <span style={{ fontSize: '3.5rem', fontWeight: 800, color: 'var(--accent-blue)', textShadow: '0 0 20px rgba(59,130,246,0.3)', lineHeight: 1.2 }}>
          {expectedNote ? `${expectedNote.noteName}${expectedNote.octave}` : '-'}
        </span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {expectedNote ? `MIDI: ${expectedNote.midiPitch}` : ''}
        </span>
      </div>

      {/* Center visual: Piano Keyboard */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'center' }}>
        {renderKeyboard()}
        <div className={`note-indicator__status ${statusClass}`} style={{ fontWeight: 600, fontSize: '1.1rem', letterSpacing: '0.02em', height: '24px' }}>
          {statusText}
        </div>
      </div>

      {/* Detected Pitch Meter (Microphone) / MIDI Device Info */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', borderLeft: '1px solid var(--glass-border)', paddingLeft: '1.5rem' }}>
        <span style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Detected</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '2rem', fontWeight: 700, color: detectedNoteName !== '-' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {detectedNoteName}
          </span>
          {inputMethod === 'microphone' && detectedPitch && detectedPitch.confidence > 0.5 && (
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {Math.round(detectedPitch.frequency)} Hz
            </span>
          )}
        </div>

        {inputMethod === 'microphone' ? (
          <div className="pitch-meter-container" style={{ width: '100%', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              <span>Flat</span>
              <span>In Tune</span>
              <span>Sharp</span>
            </div>
            {/* The horizontal bar */}
            <div style={{ position: 'relative', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', border: '1px solid var(--glass-border)' }}>
              {/* Zero center tick */}
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', background: 'rgba(255,255,255,0.3)' }} />
              {/* Needle/indicator */}
              {detectedPitch && detectedPitch.confidence > 0.5 && (
                <div
                  style={{
                    position: 'absolute',
                    left: getMeterNeedleLeft(),
                    top: '-4px',
                    width: '10px',
                    height: '16px',
                    background: centsDeviation > 15 || centsDeviation < -15 ? 'var(--accent-amber)' : 'var(--accent-emerald)',
                    borderRadius: '2px',
                    transform: 'translateX(-50%)',
                    boxShadow: '0 0 8px rgba(0,0,0,0.5)',
                    transition: 'left 0.1s ease',
                  }}
                />
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              <span>-50c</span>
              <span>0</span>
              <span>+50c</span>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {detectedMidi && detectedMidi.type === 'on' ? (
              <span>Velocity: {detectedMidi.velocity}</span>
            ) : (
              <span>Waiting for keyboard input...</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
