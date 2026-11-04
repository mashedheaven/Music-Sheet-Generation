import React from 'react';
import { Headphones, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from 'lucide-react';
import type { MixerEngine, MixerSnapshot, TrackSpec } from '../hooks/useMixer';
import { formatTime } from '../lib/format';
import { instrumentStyle } from '../lib/instruments';
import { Waveform } from './Waveform';

interface MixerProps {
  engine: MixerEngine;
  snapshot: MixerSnapshot;
  specs: TrackSpec[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

export const Mixer: React.FC<MixerProps> = ({ engine, snapshot, specs, selectedId, onSelect }) => {
  const { playing, ready, time, duration, tracks, error } = snapshot;
  const progress = duration ? time / duration : 0;
  const hasPreviews = specs.some((s) => s.altSrc);
  const allNotes = hasPreviews && specs.filter((s) => s.altSrc).every((s) => tracks[s.id]?.source === 'notes');
  const anySolo = Object.values(tracks).some((t) => t.solo);

  return (
    <section className="mixer card" aria-label="Stem mixer">
      <div className="transport">
        <div className="transport__buttons">
          <button className="icon-btn" onClick={() => engine.skip(-5)} aria-label="Back 5 seconds" title="Back 5s (←)">
            <RotateCcw size={18} />
          </button>
          <button
            className={`play-btn ${playing ? 'is-playing' : ''}`}
            onClick={() => engine.toggle()}
            disabled={!ready && !playing}
            aria-label={playing ? 'Pause' : 'Play'}
            title="Play / pause (Space)"
          >
            {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
          </button>
          <button className="icon-btn" onClick={() => engine.skip(5)} aria-label="Forward 5 seconds" title="Forward 5s (→)">
            <RotateCw size={18} />
          </button>
        </div>
        <div className="transport__time mono">
          <span>{formatTime(time)}</span>
          <span className="muted"> / {formatTime(duration)}</span>
        </div>
        <input
          className="scrubber"
          type="range"
          min={0}
          max={duration || 1}
          step={0.05}
          value={Math.min(time, duration || 1)}
          onChange={(e) => engine.seek(Number(e.target.value))}
          aria-label="Seek"
          style={{ ['--pct' as string]: `${progress * 100}%` }}
        />
        {hasPreviews && (
          <div className="ab-toggle" role="radiogroup" aria-label="Listen to">
            <Headphones size={15} className="muted" />
            <button
              role="radio"
              aria-checked={!allNotes}
              className={!allNotes ? 'is-active' : ''}
              onClick={() => engine.setAllSources('audio')}
              title="Hear the separated recording"
            >
              Recording
            </button>
            <button
              role="radio"
              aria-checked={allNotes}
              className={allNotes ? 'is-active' : ''}
              onClick={() => engine.setAllSources('notes')}
              title="Hear a synth playing the transcribed notes"
            >
              Transcription
            </button>
          </div>
        )}
      </div>

      {!ready && !error && <div className="mixer__loading">Loading audio…</div>}
      {error && <div className="mixer__error">{error}</div>}

      <div className="tracks">
        {specs.map((spec) => {
          const st = tracks[spec.id];
          if (!st) return null;
          const style = instrumentStyle(spec.family);
          const audible = anySolo ? st.solo : !st.muted;
          const Icon = style.Icon;
          return (
            <div
              key={spec.id}
              className={`track ${selectedId === spec.id ? 'is-selected' : ''} ${audible ? '' : 'is-silent'}`}
              style={{ ['--track' as string]: style.color }}
            >
              <button
                className="track__label"
                onClick={() => onSelect?.(spec.id)}
                title={onSelect ? 'Show this part in the score' : undefined}
              >
                <span className="track__icon">
                  <Icon size={16} />
                </span>
                <span className="track__text">
                  <span className="track__name">{spec.label}</span>
                  <span className="track__meta">
                    {spec.noteCount != null ? `${spec.noteCount.toLocaleString()} notes` : 'Full mix'}
                  </span>
                </span>
              </button>
              <div className="track__controls">
                <button
                  className={`chip-btn ${st.muted ? 'is-on is-mute' : ''}`}
                  onClick={() => engine.setTrack(spec.id, { muted: !st.muted })}
                  aria-pressed={st.muted}
                  title="Mute"
                >
                  M
                </button>
                <button
                  className={`chip-btn ${st.solo ? 'is-on is-solo' : ''}`}
                  onClick={() => engine.soloOnly(spec.id)}
                  aria-pressed={st.solo}
                  title="Solo"
                >
                  S
                </button>
                <label className="vol" title={`Volume ${Math.round(st.volume * 100)}%`}>
                  {st.volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={st.volume}
                    onChange={(e) => engine.setTrack(spec.id, { volume: Number(e.target.value) })}
                    aria-label={`${spec.label} volume`}
                    style={{ ['--pct' as string]: `${st.volume * 100}%` }}
                  />
                </label>
                {!spec.altSrc && <span className="chip-btn chip-btn--wide chip-btn--ghost" aria-hidden />}
                {spec.altSrc && (
                  <button
                    className={`chip-btn chip-btn--wide ${st.source === 'notes' ? 'is-on is-notes' : ''}`}
                    onClick={() => engine.setTrack(spec.id, { source: st.source === 'notes' ? 'audio' : 'notes' })}
                    title="Switch between the recording and a synth playing the transcription"
                  >
                    {st.source === 'notes' ? 'Notes' : 'Audio'}
                  </button>
                )}
              </div>
              <div className="track__wave">
                <Waveform
                  peaksUrl={spec.peaksUrl}
                  color={style.color}
                  progress={progress}
                  dimmed={!audible}
                  onSeek={(f) => engine.seek(f * duration)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
