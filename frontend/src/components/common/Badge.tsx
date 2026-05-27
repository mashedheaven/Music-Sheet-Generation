import React from 'react';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'processing' | 'default';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  children,
  className = '',
  style,
}) => {
  return (
    <span className={`badge badge--${variant} ${className}`} style={style}>
      {variant === 'processing' && <span className="badge__pulse" />}
      {children}
    </span>
  );
};

/** Map a JobStatus string to a Badge variant. */
export function statusToBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case 'complete':
      return 'success';
    case 'failed':
      return 'error';
    case 'pending':
      return 'warning';
    case 'processing':
    case 'separating':
    case 'transcribing':
    case 'generating':
    case 'uploading':
      return 'processing';
    default:
      return 'default';
  }
}
