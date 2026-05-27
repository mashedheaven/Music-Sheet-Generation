import React from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/upload', label: 'Upload' },
];

export const Header: React.FC = () => {
  return (
    <header className="header">
      <NavLink to="/" className="header__brand">
        <span className="header__brand-icon">♪</span>
        <span>ScoreForge</span>
      </NavLink>

      <nav className="header__nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `header__nav-link ${isActive ? 'header__nav-link--active' : ''}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
};
