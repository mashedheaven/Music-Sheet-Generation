import React, { useRef, useEffect } from 'react';

interface ScoreViewerProps {
  musicxmlUrl: string;
  instrumentName?: string;
}

/**
 * Sheet music viewer — placeholder for MVP.
 * The useEffect skeleton is ready for OSMD integration.
 */
export const ScoreViewer: React.FC<ScoreViewerProps> = ({ musicxmlUrl, instrumentName }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !musicxmlUrl) return;

    // ── OSMD Integration (post-MVP) ──────────────────────────────────
    // const osmd = new OpenSheetMusicDisplay(containerRef.current, {
    //   autoResize: true,
    //   backend: 'svg',
    //   drawTitle: true,
    // });
    // osmd.load(musicxmlUrl).then(() => osmd.render());
    // return () => osmd.clear();
    // ──────────────────────────────────────────────────────────────────
  }, [musicxmlUrl]);

  return (
    <div className="score-viewer glass-card">
      <div className="score-viewer__header">
        <span className="score-viewer__icon">🎼</span>
        <h3 className="score-viewer__title">{instrumentName ?? 'Score'}</h3>
      </div>
      <div ref={containerRef} className="score-viewer__canvas">
        <div className="score-viewer__placeholder">
          <div className="score-viewer__placeholder-staff">
            {/* Decorative staff lines */}
            {[...Array(5)].map((_, i) => (
              <div key={i} className="score-viewer__staff-line" />
            ))}
            <span className="score-viewer__clef">𝄞</span>
          </div>
          <p className="score-viewer__placeholder-text">
            Sheet music will be rendered here
          </p>
        </div>
      </div>
    </div>
  );
};
