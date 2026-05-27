import React, { useRef, useEffect, useState } from 'react';

interface AudioPlayerProps {
  audioUrl: string;
  title?: string;
}

/**
 * Audio player — styled placeholder for MVP.
 * The useEffect skeleton is ready for WaveSurfer integration.
 */
export const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioUrl, title }) => {
  const waveRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration] = useState(0);

  useEffect(() => {
    if (!waveRef.current || !audioUrl) return;

    // ── WaveSurfer Integration (post-MVP) ────────────────────────────
    // const ws = WaveSurfer.create({
    //   container: waveRef.current,
    //   waveColor: '#3b82f6',
    //   progressColor: '#06b6d4',
    //   cursorColor: '#8b5cf6',
    //   barWidth: 2,
    //   barRadius: 3,
    //   height: 64,
    //   normalize: true,
    // });
    // ws.load(audioUrl);
    // ws.on('audioprocess', () => setCurrentTime(ws.getCurrentTime()));
    // ws.on('ready', () => setDuration(ws.getDuration()));
    // return () => ws.destroy();
    // ──────────────────────────────────────────────────────────────────
  }, [audioUrl]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="audio-player glass-card">
      {title && <p className="audio-player__title">{title}</p>}
      <div className="audio-player__controls">
        <button
          className="audio-player__play-btn"
          onClick={() => setIsPlaying(!isPlaying)}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <span className="audio-player__time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
      <div ref={waveRef} className="audio-player__waveform">
        {/* Placeholder waveform bars */}
        <div className="audio-player__wave-placeholder">
          {[...Array(60)].map((_, i) => (
            <div
              key={i}
              className="audio-player__wave-bar"
              style={{
                height: `${20 + Math.sin(i * 0.4) * 30 + Math.random() * 20}%`,
                animationDelay: `${i * 0.02}s`,
              }}
            />
          ))}
        </div>
      </div>
      <p className="audio-player__hint">Audio playback coming soon</p>
    </div>
  );
};
