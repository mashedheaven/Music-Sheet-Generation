import React from 'react';
import { getInstrumentIcon } from '../../utils/icons';
import { Play } from 'lucide-react';
import type { Stem } from '../../api/types';

interface StemPlayerProps {
  stems: Stem[];
}

export const StemPlayer: React.FC<StemPlayerProps> = ({ stems }) => {
  return (
    <div className="stem-player glass-card">
      <h3 className="stem-player__title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Play size={20} /> Stems
      </h3>
      <div className="stem-player__list">
        {stems.map((stem) => (
          <div key={stem.id} className="stem-player__row">
            <span className="stem-player__emoji" style={{ display: 'flex', alignItems: 'center' }}>
              {getInstrumentIcon(stem.instrument_family, { size: 16 })}
            </span>
            <span className="stem-player__name">{stem.instrument_name}</span>

            {/* Placeholder waveform */}
            <div className="stem-player__wave">
              {[...Array(30)].map((_, i) => (
                <div
                  key={i}
                  className="stem-player__wave-bar"
                  style={{
                    height: `${15 + Math.sin(i * 0.5) * 25 + Math.random() * 15}%`,
                  }}
                />
              ))}
            </div>

            {/* Controls */}
            <div className="stem-player__controls">
              <button className="btn btn-ghost btn-sm" title="Solo">
                S
              </button>
              <button className="btn btn-ghost btn-sm" title="Mute">
                M
              </button>
              <button className="btn btn-ghost btn-sm" title="Play" aria-label="Play stem" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Play size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
