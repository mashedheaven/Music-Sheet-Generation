import React from 'react';

type SpinnerSize = 'sm' | 'md' | 'lg';

interface SpinnerProps {
  size?: SpinnerSize;
  label?: string;
}

const sizeMap: Record<SpinnerSize, number> = { sm: 24, md: 40, lg: 64 };

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', label }) => {
  const px = sizeMap[size];
  return (
    <div className="spinner-wrapper" role="status">
      <div className="spinner" style={{ width: px, height: px }}>
        <svg viewBox="0 0 50 50" className="spinner__svg">
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            strokeWidth="4"
            className="spinner__track"
          />
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            strokeWidth="4"
            className="spinner__fill"
          />
        </svg>
        <span className="spinner__note">♪</span>
      </div>
      {label && <p className="spinner__label">{label}</p>}
    </div>
  );
};
