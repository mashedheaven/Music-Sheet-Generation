import React, { useRef, useEffect, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

interface AudioPlayerProps {
  audioUrl: string;
  title?: string;
  onTimeUpdate?: (time: number) => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioUrl, title, onTimeUpdate }) => {
  const waveRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!waveRef.current || !audioUrl) return;

    setIsReady(false);

    // Initialize WaveSurfer
    const ws = WaveSurfer.create({
      container: waveRef.current,
      waveColor: '#3b82f6', // blue-500
      progressColor: '#06b6d4', // cyan-500
      cursorColor: '#8b5cf6', // violet-500
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 64,
      normalize: true,
      url: audioUrl,
    });

    wsRef.current = ws;

    ws.on('audioprocess', () => {
      const time = ws.getCurrentTime();
      setCurrentTime(time);
      if (onTimeUpdate) {
        onTimeUpdate(time);
      }
    });

    ws.on('seeking', () => {
      const time = ws.getCurrentTime();
      setCurrentTime(time);
      if (onTimeUpdate) {
        onTimeUpdate(time);
      }
    });

    ws.on('ready', () => {
      setDuration(ws.getDuration());
      setIsReady(true);
    });
    
    ws.on('finish', () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });

    return () => {
      ws.destroy();
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!wsRef.current || !isReady) return;
    
    if (isPlaying) {
      wsRef.current.pause();
    } else {
      wsRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

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
          onClick={togglePlay}
          disabled={!isReady}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <span className="audio-player__time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
      <div ref={waveRef} className="audio-player__waveform" />
      {!isReady && <p className="audio-player__hint">Loading audio...</p>}
    </div>
  );
};

