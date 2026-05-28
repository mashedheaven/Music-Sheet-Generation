import React from 'react';

interface CardProps {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  header,
  footer,
  children,
  onClick,
  className = '',
  hoverable = false,
}) => {
  return (
    <div
      className={`glass-card ${hoverable ? 'glass-card--hoverable' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      {header && <div className="glass-card__header">{header}</div>}
      <div className="glass-card__body">{children}</div>
      {footer && <div className="glass-card__footer">{footer}</div>}
    </div>
  );
};
