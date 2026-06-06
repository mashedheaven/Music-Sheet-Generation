import React, { useRef, useEffect, useState } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import type { NoteStatus, NoteInfo } from '../../api/types';

interface PracticeScoreProps {
  musicxml: string;
  partIndex: number;
  noteStatuses: NoteStatus[];
  currentNoteIndex: number;
  onNoteClick?: (index: number) => void;
  onNotesExtracted: (notes: NoteInfo[]) => void;
}

export const PracticeScore: React.FC<PracticeScoreProps> = ({
  musicxml,
  partIndex,
  noteStatuses,
  currentNoteIndex,
  onNoteClick,
  onNotesExtracted,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize and load score
  useEffect(() => {
    if (!containerRef.current || !musicxml) return;

    setLoading(true);
    setError(null);

    if (!osmdRef.current) {
      osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, {
        autoResize: true,
        backend: 'svg',
        drawTitle: false,
        drawSubtitle: false,
        drawComposer: false,
        drawCredits: false,
      });
    }

    const osmd = osmdRef.current;

    osmd.load(musicxml)
      .then(() => {
        try {
          osmd.render();

          // Extract notes list for the selected part
          const extractedNotes: NoteInfo[] = [];
          if (osmd.Sheet && osmd.Sheet.SourceMeasures) {
            for (const measure of osmd.Sheet.SourceMeasures) {
              const measureNumber = measure.MeasureNumber;
              for (const staffEntry of (measure as any).staffEntries || (measure as any).StaffEntries || []) {
                if (staffEntry.ParentStaff.ParentInstrument === osmd.Sheet.Instruments[partIndex]) {
                  for (const voiceEntry of staffEntry.VoiceEntries) {
                    for (const note of voiceEntry.Notes) {
                      if (note && !note.isRest() && note.Pitch) {
                        const midiPitch = note.Pitch.MidiKey;
                        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                        const octave = Math.floor(midiPitch / 12) - 1;
                        const noteName = noteNames[midiPitch % 12];

                        extractedNotes.push({
                          midiPitch,
                          noteName,
                          octave,
                          duration: note.Length ? note.Length.RealValue * 4 : 1,
                          measureNumber,
                          isRest: false,
                        });
                      }
                    }
                  }
                }
              }
            }
          }

          onNotesExtracted(extractedNotes);
          setLoading(false);
        } catch (err) {
          console.error("OSMD Render/Extraction Error:", err);
          setError("Failed to parse and extract sheet music notes.");
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("OSMD Load Error:", err);
        setError("Failed to load sheet music score.");
        setLoading(false);
      });

    return () => {
      if (osmdRef.current) {
        osmdRef.current.clear();
      }
    };
  }, [musicxml, partIndex]);

  // Color notes, apply pointer events, and scroll into view when noteStatuses or currentNoteIndex changes
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd || loading || error || !osmd.GraphicSheet) return;

    try {
      const targetInstrument = osmd.Sheet.Instruments[partIndex];
      let noteIdx = 0;

      for (const measureColumns of osmd.GraphicSheet.MeasureList) {
        for (const graphicalMeasure of measureColumns) {
          if (graphicalMeasure && graphicalMeasure.ParentStaff.ParentInstrument === targetInstrument) {
            for (const staffEntry of graphicalMeasure.staffEntries) {
              for (const gve of staffEntry.graphicalVoiceEntries) {
                for (const gnote of gve.notes) {
                  if (gnote && gnote.sourceNote && !gnote.sourceNote.isRest()) {
                    const status = noteStatuses[noteIdx] || 'pending';
                    let color = '#000000'; // Default black for sheet music

                    if (noteIdx === currentNoteIndex) {
                      color = '#3b82f6'; // Bright blue for current note
                    } else if (status === 'correct') {
                      color = '#22c55e'; // Green for correct
                    } else if (status === 'wrong') {
                      color = '#ef4444'; // Red for incorrect
                    }

                    const svgG = (gnote as any).getSVGGElement ? (gnote as any).getSVGGElement() : ((gnote as any).getSVGElement ? (gnote as any).getSVGElement() : null);
                    if (svgG) {
                      // Color all path elements inside the note graphical element
                      const paths = svgG.querySelectorAll('path');
                      paths.forEach((p: any) => p.setAttribute('fill', color));

                      // Cursor & seek behavior
                      svgG.style.cursor = 'pointer';
                      const indexToSeek = noteIdx;
                      svgG.onclick = (e: any) => {
                        e.stopPropagation();
                        if (onNoteClick) onNoteClick(indexToSeek);
                      };

                      // Scroll current note into view
                      if (noteIdx === currentNoteIndex) {
                        svgG.scrollIntoView({
                          behavior: 'smooth',
                          block: 'center',
                          inline: 'center',
                        });
                      }
                    }

                    noteIdx++;
                  }
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("Direct note manipulation failed:", err);
    }
  }, [noteStatuses, currentNoteIndex, loading, error, partIndex, onNoteClick]);

  return (
    <div className="practice-score score-viewer" style={{ position: 'relative', background: '#ffffff', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border)' }}>
      {loading && (
        <div className="score-viewer__loading" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.9)', zIndex: 10, borderRadius: '12px' }}>
          <p style={{ fontWeight: 600, color: '#0f172a' }}>Preparing sheet music for practice...</p>
        </div>
      )}

      {error && (
        <div className="score-viewer__error" style={{ padding: '2rem', textAlign: 'center', color: 'var(--accent-rose)' }}>
          <p>{error}</p>
        </div>
      )}

      <div style={{ width: '100%', overflowX: 'auto' }}>
        <div
          ref={containerRef}
          className="practice-score__canvas"
          style={{
            opacity: loading ? 0 : 1,
            transition: 'opacity 0.3s ease-in-out',
            minWidth: '800px',
            background: '#ffffff',
          }}
        />
      </div>
    </div>
  );
};
