import React, { useState } from 'react';

interface TransposeControlProps {
  onChange?: (semitones: number) => void;
  disabled?: boolean;
}

export const TransposeControl: React.FC<TransposeControlProps> = ({
  onChange,
  disabled = true,
}) => {
  const [semitones, setSemitones] = useState(0);

  const adjust = (delta: number) => {
    const next = semitones + delta;
    setSemitones(next);
    onChange?.(next);
  };

  return (
    <div className={`transpose-control ${disabled ? 'transpose-control--disabled' : ''}`}>
      <span className="transpose-control__label">Transpose</span>
      <div className="transpose-control__buttons">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => adjust(-1)}
          disabled={disabled}
          aria-label="Transpose down"
        >
          −
        </button>
        <span className="transpose-control__value">
          {semitones > 0 ? `+${semitones}` : semitones}
        </span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => adjust(1)}
          disabled={disabled}
          aria-label="Transpose up"
        >
          +
        </button>
      </div>
    </div>
  );
};
