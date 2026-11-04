import React from 'react';
import { Loader2 } from 'lucide-react';
import { STATUS_LABEL, isActive } from '../lib/format';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  loading,
  children,
  className = '',
  disabled,
  ...rest
}) => (
  <button
    className={`btn btn--${variant} btn--${size} ${children ? '' : 'btn--icon'} ${className}`}
    disabled={disabled || loading}
    {...rest}
  >
    {loading ? <Loader2 size={16} className="spin" /> : icon}
    {children && <span>{children}</span>}
  </button>
);

export const StatusPill: React.FC<{ status: string; progress?: number }> = ({ status, progress }) => (
  <span className={`pill pill--${status}`}>
    {isActive(status) ? <span className="pill__pulse" /> : <span className="pill__dot" />}
    {STATUS_LABEL[status] ?? status}
    {isActive(status) && progress != null && progress > 0 && (
      <span className="pill__pct">{Math.round(progress * 100)}%</span>
    )}
  </span>
);

export const ProgressBar: React.FC<{ value: number; indeterminate?: boolean }> = ({ value, indeterminate }) => (
  <div className={`progress ${indeterminate ? 'progress--indeterminate' : ''}`} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
    <div className="progress__fill" style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} />
  </div>
);

export const Spinner: React.FC<{ label?: string }> = ({ label }) => (
  <div className="spinner-wrap">
    <Loader2 size={28} className="spin" />
    {label && <p>{label}</p>}
  </div>
);

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
}

export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`segmented__opt ${value === o.value ? 'is-active' : ''}`}
          onClick={() => onChange(o.value)}
          title={o.hint}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }> = ({
  checked,
  onChange,
  label,
  description,
}) => (
  <label className="switch-row">
    <span className="switch-row__text">
      <span className="switch-row__label">{label}</span>
      {description && <span className="switch-row__desc">{description}</span>}
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`switch ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__thumb" />
    </button>
  </label>
);
