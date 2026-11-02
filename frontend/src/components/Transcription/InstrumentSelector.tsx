import React from 'react';
import type { Stem } from '../../api/types';
import { Badge } from '../common/Badge';
import { getInstrumentIcon } from '../../utils/icons';
import { Layers } from 'lucide-react';

interface InstrumentSelectorProps {
  stems: Stem[];
  selectedStem: Stem | null;
  onSelectStem: (stem: Stem | null) => void;
}

export const InstrumentSelector: React.FC<InstrumentSelectorProps> = ({
  stems,
  selectedStem,
  onSelectStem,
}) => {
  return (
    <>
      <h2 style={{ marginBottom: '1rem' }}>Detected Instruments</h2>
      <div className="instruments-grid">
        {stems.map((stem) => (
          <div
            key={stem.id}
            className={`glass-card instrument-card ${selectedStem?.id === stem.id ? 'instrument-card--active' : ''}`}
            onClick={() => onSelectStem(stem)}
          >
            <span className="instrument-card__icon" style={{ display: 'flex', justifyContent: 'center' }}>
              {getInstrumentIcon(stem.instrument_family, { size: 32 })}
            </span>
            <div className="instrument-card__name">{stem.instrument_name}</div>
            <div className="instrument-card__family">{stem.instrument_family}</div>
            {stem.confidence > 0 && (
              <Badge variant="info" style={{ marginTop: '0.5rem' }}>
                {Math.round(stem.confidence * 100)}% confidence
              </Badge>
            )}
          </div>
        ))}
        {/* Ensemble Score Card */}
        <div
          className={`glass-card instrument-card ${selectedStem === null ? 'instrument-card--active' : ''}`}
          onClick={() => onSelectStem(null)}
        >
          <span className="instrument-card__icon" style={{ display: 'flex', justifyContent: 'center' }}>
            <Layers size={32} />
          </span>
          <div className="instrument-card__name">Ensemble Score</div>
          <div className="instrument-card__family">All instruments</div>
        </div>
      </div>
    </>
  );
};
