import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Cpu, Plus, WifiOff } from 'lucide-react';
import { useHealth } from '../hooks/useHealth';

const Logo = () => (
  <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden>
    <rect width="64" height="64" rx="16" fill="var(--accent)" />
    <path d="M26 44a6 6 0 1 1-4-5.66V16l20-4v24a6 6 0 1 1-4-5.66V19.2l-12 2.4V44z" fill="var(--bg)" />
  </svg>
);

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { health, offline } = useHealth();
  const engines = health?.engines;
  const pro = engines?.separator === 'demucs' && engines?.transcriber === 'basic-pitch';

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/" className="brand">
            <Logo />
            <span className="brand__name">MuSheet</span>
          </Link>
          <nav className="topbar__nav">
            <NavLink to="/" end className={({ isActive }) => `navlink ${isActive ? 'is-active' : ''}`}>
              Library
            </NavLink>
          </nav>
          <div className="topbar__right">
            {offline ? (
              <span className="engine-chip engine-chip--offline" title="The API server is not reachable">
                <WifiOff size={14} /> Server offline
              </span>
            ) : engines ? (
              <span
                className={`engine-chip ${pro ? 'engine-chip--pro' : ''}`}
                title={`Separation: ${engines.separator} · Transcription: ${engines.transcriber}${engines.lyrics ? ' · Lyrics: Whisper' : ''}${
                  pro ? '' : '\nInstall demucs + basic-pitch for best quality'
                }`}
              >
                <Cpu size={14} />
                {engines.separator === 'demucs' ? 'Demucs' : 'Lite separation'} ·{' '}
                {engines.transcriber === 'basic-pitch' ? 'Basic Pitch' : 'Pitch tracking'}
              </span>
            ) : null}
            <Link to="/new" className="btn btn--primary btn--sm">
              <Plus size={16} />
              <span>New</span>
            </Link>
          </div>
        </div>
      </header>
      <main className="main">{children}</main>
      <footer className="footer">
        MuSheet turns recordings into editable notation. Automatic transcription is a starting point — always check
        it against your ears.
      </footer>
    </div>
  );
};
