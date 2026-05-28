import React from 'react';

interface ProgressBarProps {
  /** 0–100 */
  value: number;
  /** Show indeterminate shimmer instead of a fixed value. */
  indeterminate?: boolean;
  /** Show percentage label. */
  showLabel?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  indeterminate = false,
  showLabel = false,
  size = 'md',
  className = '',
}) => {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={`${className}`}>
      <div className={`progress-bar ${size === 'lg' ? 'progress-bar--lg' : ''} ${indeterminate ? 'progress-bar--indeterminate' : ''}`}>
        <div
          className="progress-bar__fill"
          style={indeterminate ? undefined : { width: `${clamped}%` }}
        />
      </div>
      {showLabel && !indeterminate && (
        <span className="progress-bar__label">{Math.round(clamped)}%</span>
      )}
    </div>
  );
};
