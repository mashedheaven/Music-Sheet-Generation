import React from 'react';
import type { BadgeVariant } from '../../utils/status';

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

export { statusToBadgeVariant } from '../../utils/status';
