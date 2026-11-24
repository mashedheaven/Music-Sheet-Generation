import React, { useEffect, useRef, useState } from 'react';
import { getPeaks } from '../api/client';

interface WaveformProps {
  peaksUrl?: string | null;
  peaks?: number[];
  color: string;
  progress: number; // 0..1
  height?: number;
  dimmed?: boolean;
  onSeek?: (fraction: number) => void;
}

function draw(canvas: HTMLCanvasElement, peaks: number[], color: string) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = color;
  const bar = 2;
  const gap = 1;
  const count = Math.max(1, Math.floor(width / (bar + gap)));
  const mid = height / 2;
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i / count) * peaks.length);
    const end = Math.max(start + 1, Math.floor(((i + 1) / count) * peaks.length));
    let v = 0;
    for (let j = start; j < end; j++) v = Math.max(v, peaks[j] ?? 0);
    const h = Math.max(1, Math.pow(v, 0.8) * (height - 2));
    ctx.beginPath();
    ctx.roundRect(i * (bar + gap), mid - h / 2, bar, h, 1);
    ctx.fill();
  }
}

/** Static waveform drawn once from server-computed peaks; progress is a CSS clip. */
export const Waveform: React.FC<WaveformProps> = ({ peaksUrl, peaks: given, color, progress, height = 44, dimmed, onSeek }) => {
  const base = useRef<HTMLCanvasElement>(null);
  const top = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [fetched, setFetched] = useState<{ url: string; peaks: number[] } | null>(null);
  const peaks = given ?? (fetched && fetched.url === peaksUrl ? fetched.peaks : null);

  useEffect(() => {
    if (given || !peaksUrl) return;
    let alive = true;
    getPeaks(peaksUrl)
      .then((p) => alive && setFetched({ url: peaksUrl, peaks: p.peaks }))
      .catch(() => alive && setFetched({ url: peaksUrl, peaks: [] }));
    return () => {
      alive = false;
    };
  }, [peaksUrl, given]);

  useEffect(() => {
    if (!peaks || !wrap.current) return;
    const render = () => {
      if (base.current) draw(base.current, peaks, 'rgba(255,255,255,0.16)');
      if (top.current) draw(top.current, peaks, color);
    };
    render();
    const ro = new ResizeObserver(render);
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [peaks, color]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek || !wrap.current) return;
    const rect = wrap.current.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  };

  const pct = Math.max(0, Math.min(1, progress)) * 100;

  return (
    <div
      ref={wrap}
      className={`waveform ${dimmed ? 'is-dimmed' : ''} ${onSeek ? 'is-seekable' : ''}`}
      style={{ height }}
      onClick={handleClick}
    >
      {peaks === null && <div className="waveform__loading" />}
      <canvas ref={base} className="waveform__canvas" />
      <canvas
        ref={top}
        className="waveform__canvas"
        style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
      />
      <div className="waveform__head" style={{ left: `${pct}%` }} />
    </div>
  );
};
