import React, { useRef, useEffect, useState } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { FileMusic, Printer } from 'lucide-react';

interface ScoreViewerProps {
  musicxmlUrl: string;
  instrumentName?: string;
  allowTranspose?: boolean;
  currentTime?: number;
}

export const ScoreViewer: React.FC<ScoreViewerProps> = ({ 
  musicxmlUrl, 
  instrumentName,
  allowTranspose = true,
  currentTime = 0
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transpose, setTranspose] = useState(0);

  // Measure BPM parsing could be done, but we'll use a standard 120BPM for MVP since that's what Basic Pitch exports

  useEffect(() => {
    if (!containerRef.current || !musicxmlUrl) return;

    setLoading(true);
    setError(null);
    setTranspose(0); // Reset transpose when score changes

    // Initialize OSMD only once
    if (!osmdRef.current) {
      osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, {
        autoResize: true,
        backend: 'svg',
        drawTitle: true,
        drawSubtitle: false,
        drawComposer: false,
      });
    }

    const osmd = osmdRef.current;

    osmd.load(musicxmlUrl)
      .then(() => {
        osmd.render();
        osmd.cursor.show(); // Enable cursor
        setLoading(false);
      })
      .catch((err) => {
        console.error("OSMD Error:", err);
        setError("Failed to render sheet music.");
        setLoading(false);
      });

    return () => {
      if (osmdRef.current) {
         osmdRef.current.clear();
      }
    };
  }, [musicxmlUrl]);

  // Sync cursor with audio time
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd || loading || error || !osmd.cursor) return;

    // A very basic linear approximation:
    // Basic Pitch exports at 120 BPM, 4/4 time signature.
    // 120 BPM = 2 beats/sec. So time in seconds * 2 = number of beats.
    // In OSMD, 1 whole note = 1.0 fraction. 1 quarter note = 0.25 fraction.
    // Number of beats * 0.25 = fraction of whole notes.
    // So fractional time = seconds * 2 * 0.25 = seconds * 0.5.
    
    // We can use osmd.cursor.iterator.currentTimeStamp to check where the cursor is,
    // and call osmd.cursor.next() to advance it until it matches.
    // However, resetting the cursor to beginning and stepping forward is safer
    // when seeking backwards.
    
    try {
      const targetFraction = currentTime * 0.5;
      
      // Reset cursor and step forward (simple approach)
      osmd.cursor.reset();
      
      let safetyCounter = 0;
      while (!osmd.cursor.Iterator.EndReached && safetyCounter < 10000) {
        if (osmd.cursor.Iterator.currentTimeStamp.RealValue >= targetFraction) {
          break; // Found the current note
        }
        osmd.cursor.next();
        safetyCounter++;
      }
      
      // Update cursor position visually
      osmd.cursor.update();
    } catch (err) {
      console.warn("Cursor sync error:", err);
    }
  }, [currentTime, loading, error]);

  const handleTranspose = (amount: number) => {
    const newTranspose = transpose + amount;
    setTranspose(newTranspose);
    
    if (osmdRef.current && osmdRef.current.Sheet) {
      osmdRef.current.Sheet.Transpose = newTranspose;
      osmdRef.current.updateGraphic();
      osmdRef.current.render();
    }
  };

  const handlePrint = () => {
    // Basic browser print, which users can save to PDF
    window.print();
  };

  return (
    <div className="score-viewer glass-card" style={{ position: 'relative' }}>
      <div className="score-viewer__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileMusic size={24} className="score-viewer__icon" />
          <h3 className="score-viewer__title" style={{ margin: 0 }}>{instrumentName ?? 'Score'}</h3>
        </div>
        
        <div className="score-viewer__controls" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {allowTranspose && !loading && !error && (
            <div className="transpose-controls" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.1)', padding: '0.25rem 0.5rem', borderRadius: '8px' }}>
              <span className="text-sm">Transpose:</span>
              <button onClick={() => handleTranspose(-1)} className="btn-icon" style={{ padding: '0 0.5rem' }}>-</button>
              <span style={{ minWidth: '2ch', textAlign: 'center' }}>{transpose > 0 ? `+${transpose}` : transpose}</span>
              <button onClick={() => handleTranspose(1)} className="btn-icon" style={{ padding: '0 0.5rem' }}>+</button>
            </div>
          )}
          
          {!loading && !error && (
            <button onClick={handlePrint} className="btn-icon" title="Print to PDF" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Printer size={16} /> Print
            </button>
          )}
        </div>
      </div>
      
      {loading && (
        <div className="score-viewer__loading" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10, 14, 26, 0.8)', zIndex: 10, backdropFilter: 'blur(4px)', borderRadius: '12px' }}>
          <p style={{ fontWeight: 600 }}>Rendering sheet music...</p>
        </div>
      )}
      
      {error && (
        <div className="score-viewer__error">
          <p>{error}</p>
        </div>
      )}

      {/* The print-container class ensures only this gets printed if we setup CSS for it */}
      <div style={{ width: '100%', overflowX: 'auto', marginTop: '1rem' }}>
        <div 
          ref={containerRef} 
          className="score-viewer__canvas print-container"
          style={{ 
            opacity: loading ? 0 : 1,
            transition: 'opacity 0.3s ease-in-out',
            minWidth: '800px'
          }}
        />
      </div>
    </div>
  );
};

