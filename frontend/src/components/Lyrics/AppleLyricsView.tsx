import React, { useEffect, useRef } from 'react';

export interface LyricNote {
  pitch: number;
  onset: number;
  offset: number;
  velocity: number;
  channel: number;
  lyric?: string | null;
}

interface AppleLyricsViewProps {
  notes: LyricNote[];
  currentTime: number;
  onSeek?: (time: number) => void;
}

export const AppleLyricsView: React.FC<AppleLyricsViewProps> = ({
  notes,
  currentTime,
  onSeek,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLSpanElement>(null);

  // Filter notes that actually have lyric text
  const lyricNotes = notes.filter((n) => n.lyric && n.lyric.trim().length > 0);

  // Group lyrics into lines/phrases based on silence/time gaps (> 0.8s gap)
  const lines: LyricNote[][] = [];
  let currentLine: LyricNote[] = [];

  lyricNotes.forEach((note, idx) => {
    if (currentLine.length === 0) {
      currentLine.push(note);
    } else {
      const prevNote = currentLine[currentLine.length - 1];
      if (note.onset - prevNote.offset > 0.8) {
        lines.push(currentLine);
        currentLine = [note];
      } else {
        currentLine.push(note);
      }
    }
    if (idx === lyricNotes.length - 1 && currentLine.length > 0) {
      lines.push(currentLine);
    }
  });

  // Auto-scroll active word into view smoothly
  useEffect(() => {
    if (activeWordRef.current && containerRef.current) {
      activeWordRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    }
  }, [currentTime]);

  if (lyricNotes.length === 0) {
    return (
      <div className="glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
        <p className="text-secondary" style={{ fontSize: '1.1rem' }}>
          No lyrics detected for this stem.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="apple-lyrics-container glass-card"
      style={{
        padding: '2.5rem 2rem',
        maxHeight: '450px',
        overflowY: 'auto',
        borderRadius: '16px',
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.85) 0%, rgba(30, 41, 59, 0.85) 100%)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {lines.map((line, lineIdx) => {
          const isLineActive = line.some(
            (n) => currentTime >= n.onset && currentTime <= n.offset + 0.3
          );
          const isLinePassed = line.every((n) => currentTime > n.offset + 0.3);

          return (
            <div
              key={lineIdx}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.4rem 0.6rem',
                fontSize: isLineActive ? '1.8rem' : '1.5rem',
                fontWeight: isLineActive ? 700 : 500,
                opacity: isLineActive ? 1 : isLinePassed ? 0.4 : 0.65,
                transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                cursor: 'pointer',
                transform: isLineActive ? 'scale(1.02)' : 'scale(1)',
                transformOrigin: 'left center',
              }}
              onClick={() => onSeek && onSeek(line[0].onset)}
            >
              {line.map((note, noteIdx) => {
                const isActive =
                  currentTime >= note.onset && currentTime <= note.offset + 0.15;
                const isPassed = currentTime > note.offset + 0.15;

                return (
                  <span
                    key={noteIdx}
                    ref={isActive ? activeWordRef : null}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSeek) onSeek(note.onset);
                    }}
                    style={{
                      display: 'inline-block',
                      color: isActive
                        ? '#38bdf8'
                        : isPassed
                        ? '#e2e8f0'
                        : '#94a3b8',
                      textShadow: isActive
                        ? '0 0 20px rgba(56, 189, 248, 0.8), 0 0 35px rgba(56, 189, 248, 0.5)'
                        : 'none',
                      transition: 'all 0.2s ease-in-out',
                      padding: '0.1rem 0.2rem',
                      borderRadius: '6px',
                    }}
                  >
                    {note.lyric}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
