import React, { useEffect, useRef, useMemo } from 'react';
import type { LyricWord } from '../../utils/musicxmlParser';

interface LyricsViewerProps {
  lyrics: LyricWord[];
  currentLyricIndex: number;
}

export const LyricsViewer: React.FC<LyricsViewerProps> = ({ lyrics, currentLyricIndex }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  // Group lyrics by measure number to form "lines"
  const lines = useMemo(() => {
    if (!lyrics.length) return [];
    
    const grouped: { measureNumber: number; words: { word: LyricWord; globalIndex: number }[] }[] = [];
    let currentMeasure = lyrics[0].measureNumber;
    let currentWords: { word: LyricWord; globalIndex: number }[] = [];

    lyrics.forEach((word, index) => {
      // Create a new line every 2 measures to make lines a bit longer and more natural,
      // or just group by the exact measure. Let's group by measure for simplicity, 
      // but if a measure only has 1 word, it might look weird. We'll group by measure.
      if (word.measureNumber !== currentMeasure && currentWords.length > 0) {
        grouped.push({ measureNumber: currentMeasure, words: currentWords });
        currentWords = [];
        currentMeasure = word.measureNumber;
      }
      currentWords.push({ word, globalIndex: index });
    });

    if (currentWords.length > 0) {
      grouped.push({ measureNumber: currentMeasure, words: currentWords });
    }

    return grouped;
  }, [lyrics]);

  // Determine which line is currently active
  const activeLineIndex = useMemo(() => {
    return lines.findIndex(line => 
      line.words.some(w => w.globalIndex === currentLyricIndex)
    );
  }, [lines, currentLyricIndex]);

  // Scroll active line into view smoothly
  useEffect(() => {
    if (activeLineRef.current && containerRef.current) {
      const container = containerRef.current;
      const activeLine = activeLineRef.current;
      
      const scrollTarget = activeLine.offsetTop - container.offsetTop - (container.clientHeight / 2) + (activeLine.clientHeight / 2);
      
      container.scrollTo({
        top: Math.max(0, scrollTarget),
        behavior: 'smooth'
      });
    }
  }, [activeLineIndex]);

  if (!lyrics.length) {
    return (
      <div className="lyrics-viewer empty" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
        No lyrics available for this song.
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="lyrics-viewer glass-card"
      style={{
        height: '100%',
        maxHeight: '600px',
        overflowY: 'auto',
        padding: '3rem 2rem',
        borderRadius: '24px',
        position: 'relative',
        scrollBehavior: 'smooth',
        // Hide scrollbar
        scrollbarWidth: 'none',
        msOverflowStyle: 'none'
      }}
    >
      <style>{`.lyrics-viewer::-webkit-scrollbar { display: none; }`}</style>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '50%' }}>
        {lines.map((line, i) => {
          const isActiveLine = i === activeLineIndex;
          const isPastLine = i < activeLineIndex;
          
          return (
            <div 
              key={line.measureNumber}
              ref={isActiveLine ? activeLineRef : null}
              style={{
                transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                opacity: isActiveLine ? 1 : (isPastLine ? 0.3 : 0.5),
                transform: isActiveLine ? 'scale(1.05)' : 'scale(1)',
                transformOrigin: 'left center',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem',
                fontSize: isActiveLine ? '2.5rem' : '2rem',
                fontWeight: isActiveLine ? 800 : 700,
                lineHeight: 1.4,
              }}
            >
              {line.words.map((item) => {
                const isCurrentWord = item.globalIndex === currentLyricIndex;
                const isPastWord = item.globalIndex < currentLyricIndex;
                
                let color = 'var(--text-primary)';
                if (isActiveLine) {
                  if (isCurrentWord) color = 'var(--primary)';
                  else if (isPastWord) color = 'var(--text-secondary)';
                }

                return (
                  <span
                    key={item.globalIndex}
                    style={{
                      color,
                      transition: 'color 0.3s ease',
                      textShadow: isCurrentWord ? '0 0 20px rgba(139, 92, 246, 0.5)' : 'none',
                    }}
                  >
                    {item.word.text}
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
