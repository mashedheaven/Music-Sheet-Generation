import React, { useCallback, useEffect, useRef, useState } from 'react';
import { OpenSheetMusicDisplay, TransposeCalculator } from 'opensheetmusicdisplay';
import { FileDown, Locate, Minus, Music4, Plus, Printer } from 'lucide-react';
import { apiUrl, errorMessage, getScoreXml } from '../api/client';
import { timeToBeats } from '../lib/beats';

interface ScoreViewerProps {
  musicxmlUrl: string;
  midiUrl?: string | null;
  label: string;
  allowTranspose: boolean;
  currentTime: number;
  playing: boolean;
  beatTimes: number[];
  bpm: number | null;
  beatUnit: number; // time-signature denominator
  onSeekToTime?: (seconds: number) => void;
}

const ZOOM_STEPS = [0.6, 0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5];

export const ScoreViewer: React.FC<ScoreViewerProps> = ({
  musicxmlUrl,
  midiUrl,
  label,
  allowTranspose,
  currentTime,
  playing,
  beatTimes,
  bpm,
  beatUnit,
}) => {
  const paperRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transpose, setTranspose] = useState(0);
  const [zoomIdx, setZoomIdx] = useState(() => (window.innerWidth < 700 ? 1 : 3));
  const [follow, setFollow] = useState(true);
  const [rendered, setRendered] = useState(0);

  // ── Load & render ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hostRef.current) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTranspose(0);

    if (!osmdRef.current) {
      const osmd = new OpenSheetMusicDisplay(hostRef.current, {
        autoResize: true,
        backend: 'svg',
        drawTitle: true,
        drawSubtitle: true,
        drawComposer: false,
        drawCredits: false,
        drawPartNames: true,
        drawMeasureNumbers: true,
        followCursor: false,
        autoBeam: false,
        cursorsOptions: [{ type: 0, color: '#ff6a3d', alpha: 0.45, follow: false }],
      });
      osmd.TransposeCalculator = new TransposeCalculator();
      osmdRef.current = osmd;
    }
    const osmd = osmdRef.current;

    getScoreXml(musicxmlUrl)
      .then((xml) => (cancelled ? undefined : osmd.load(xml)))
      .then(() => {
        if (cancelled) return;
        osmd.Zoom = ZOOM_STEPS[zoomIdx];
        osmd.render();
        osmd.cursor.show();
        osmd.cursor.reset();
        setLoading(false);
        setRendered((n) => n + 1);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('OSMD error', err);
        setError(errorMessage(err, 'Could not render this score'));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // zoom is applied separately; we only reload when the score changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicxmlUrl]);

  useEffect(
    () => () => {
      osmdRef.current?.clear();
      osmdRef.current = null;
    },
    [],
  );

  const rerender = useCallback(() => {
    const osmd = osmdRef.current;
    if (!osmd || loading || error) return;
    osmd.render();
    osmd.cursor.show();
    setRendered((n) => n + 1);
  }, [loading, error]);

  const changeZoom = (delta: number) => {
    const next = Math.max(0, Math.min(ZOOM_STEPS.length - 1, zoomIdx + delta));
    setZoomIdx(next);
    const osmd = osmdRef.current;
    if (osmd && !loading && !error) {
      osmd.Zoom = ZOOM_STEPS[next];
      rerender();
    }
  };

  const changeTranspose = (delta: number) => {
    const next = Math.max(-12, Math.min(12, transpose + delta));
    setTranspose(next);
    const osmd = osmdRef.current;
    if (osmd?.Sheet && !loading && !error) {
      osmd.Sheet.Transpose = next;
      osmd.updateGraphic();
      rerender();
    }
  };

  // ── Cursor follows playback ──────────────────────────────────────────────
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd || loading || error || !osmd.cursor) return;
    const cursor = osmd.cursor;
    const it = cursor.Iterator;
    if (!it) return;
    const target = timeToBeats(currentTime, beatTimes, bpm) / beatUnit; // whole notes
    const eps = 1e-4;
    try {
      if (it.currentTimeStamp.RealValue > target + eps) {
        cursor.reset();
      }
      let guard = 0;
      // Advance to the last entry that starts at or before the target.
      while (!it.EndReached && guard++ < 20000) {
        const probe = it.clone();
        probe.moveToNext();
        if (probe.EndReached || probe.currentTimeStamp.RealValue > target + eps) break;
        it.moveToNext();
      }
      cursor.update();

      const el = cursor.cursorElement;
      const paper = paperRef.current;
      if (follow && playing && el && paper) {
        const elRect = el.getBoundingClientRect();
        const paperRect = paper.getBoundingClientRect();
        const offset = elRect.top - paperRect.top;
        if (offset < 40 || offset > paperRect.height * 0.65) {
          paper.scrollTo({ top: paper.scrollTop + offset - paperRect.height * 0.25, behavior: 'smooth' });
        }
      }
    } catch (err) {
      console.warn('Cursor sync error', err);
    }
  }, [currentTime, loading, error, beatTimes, bpm, beatUnit, follow, playing, rendered]);

  const handlePrint = () => {
    document.body.classList.add('printing-score');
    window.print();
    window.setTimeout(() => document.body.classList.remove('printing-score'), 500);
  };

  return (
    <div className="score card">
      <div className="score__toolbar">
        <div className="score__title">
          <Music4 size={18} />
          <span>{label}</span>
        </div>
        <div className="score__tools">
          <div className="tool-group" aria-label="Zoom">
            <button className="icon-btn icon-btn--sm" onClick={() => changeZoom(-1)} disabled={zoomIdx === 0} aria-label="Zoom out">
              <Minus size={15} />
            </button>
            <span className="tool-group__value mono">{Math.round(ZOOM_STEPS[zoomIdx] * 100)}%</span>
            <button
              className="icon-btn icon-btn--sm"
              onClick={() => changeZoom(1)}
              disabled={zoomIdx === ZOOM_STEPS.length - 1}
              aria-label="Zoom in"
            >
              <Plus size={15} />
            </button>
          </div>
          {allowTranspose && (
            <div className="tool-group" aria-label="Transpose">
              <span className="tool-group__label">Transpose</span>
              <button className="icon-btn icon-btn--sm" onClick={() => changeTranspose(-1)} aria-label="Transpose down a semitone">
                <Minus size={15} />
              </button>
              <span className="tool-group__value mono">{transpose > 0 ? `+${transpose}` : transpose}</span>
              <button className="icon-btn icon-btn--sm" onClick={() => changeTranspose(1)} aria-label="Transpose up a semitone">
                <Plus size={15} />
              </button>
            </div>
          )}
          <button
            className={`tool-toggle ${follow ? 'is-on' : ''}`}
            onClick={() => setFollow((f) => !f)}
            aria-pressed={follow}
            title="Scroll the score to follow playback"
          >
            <Locate size={15} /> Follow
          </button>
          <a className="tool-toggle" href={apiUrl(musicxmlUrl)} download title="Download MusicXML (opens in MuseScore, Sibelius, Dorico, Finale…)">
            <FileDown size={15} /> MusicXML
          </a>
          {midiUrl && (
            <a className="tool-toggle" href={apiUrl(midiUrl)} download title="Download MIDI">
              <FileDown size={15} /> MIDI
            </a>
          )}
          <button className="tool-toggle" onClick={handlePrint} title="Print or save as PDF">
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      <div className="score__paper print-area" ref={paperRef}>
        {loading && (
          <div className="score__overlay">
            <div className="score__skeleton">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="staff-skel">
                  {Array.from({ length: 5 }).map((__, j) => (
                    <span key={j} />
                  ))}
                </div>
              ))}
            </div>
            <p>Engraving sheet music…</p>
          </div>
        )}
        {error && <div className="score__error">{error}</div>}
        <div ref={hostRef} className="score__host" style={{ opacity: loading ? 0 : 1 }} />
      </div>
    </div>
  );
};
