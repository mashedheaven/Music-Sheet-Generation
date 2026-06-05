import React, { useEffect, useState } from 'react';
import type { PracticeStats as StatsType } from '../../api/types';
import { Award, Timer, Target, Zap, RotateCcw, Home } from 'lucide-react';

interface PracticeStatsProps {
  stats: StatsType;
  onRestart: () => void;
  onExit: () => void;
}

export const PracticeStats: React.FC<PracticeStatsProps> = ({
  stats,
  onRestart,
  onExit,
}) => {
  const [animatedAccuracy, setAnimatedAccuracy] = useState(0);

  // Animate the accuracy percentage loader
  useEffect(() => {
    const duration = 1200; // ms
    const startTime = performance.now();
    const target = stats.accuracy;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out quad
      const easedProgress = progress * (2 - progress);
      setAnimatedAccuracy(Math.round(easedProgress * target));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [stats.accuracy]);

  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (animatedAccuracy / 100) * circumference;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Performance rating text
  let ratingText = 'Keep Practicing!';
  let ratingColor = 'var(--text-muted)';
  if (stats.accuracy >= 90) {
    ratingText = 'Virtuoso Performance!';
    ratingColor = 'var(--accent-emerald)';
  } else if (stats.accuracy >= 75) {
    ratingText = 'Great Progress!';
    ratingColor = 'var(--accent-blue)';
  } else if (stats.accuracy >= 50) {
    ratingText = 'Getting Better!';
    ratingColor = 'var(--accent-amber)';
  }

  return (
    <div className="practice-stats glass-card" style={{ maxWidth: '640px', margin: '2rem auto', padding: '3rem 2rem', textAlign: 'center', animation: 'fadeIn 0.5s ease-out' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '0.75rem', borderRadius: '50%', marginBottom: '1.5rem' }}>
        <Award size={36} style={{ color: 'var(--accent-blue)' }} />
      </div>

      <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem', background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Practice Session Complete!
      </h2>
      <p style={{ fontSize: '1.2rem', fontWeight: 600, color: ratingColor, marginBottom: '2.5rem' }}>
        {ratingText}
      </p>

      {/* Radial Accuracy Ring */}
      <div style={{ position: 'relative', width: '180px', height: '180px', margin: '0 auto 3rem' }}>
        <svg style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
          {/* Background Track */}
          <circle
            cx="90"
            cy="90"
            r={radius}
            fill="transparent"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth="12"
          />
          {/* Animated Foreground Arc */}
          <circle
            cx="90"
            cy="90"
            r={radius}
            fill="transparent"
            stroke="url(#accuracyGradient)"
            strokeWidth="12"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.1s ease' }}
          />
          <defs>
            <linearGradient id="accuracyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--accent-blue)" />
              <stop offset="100%" stopColor="var(--accent-emerald)" />
            </linearGradient>
          </defs>
        </svg>

        {/* Center Text overlay */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '2.5rem', fontWeight: 800, color: '#ffffff' }}>
            {animatedAccuracy}%
          </span>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
            Accuracy
          </span>
        </div>
      </div>

      {/* Grid of stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
        {/* Total Notes */}
        <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--glass-border)', padding: '1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '1rem', textAlign: 'left' }}>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '6px' }}>
            <Target size={20} style={{ color: 'var(--accent-cyan)' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Notes</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{stats.totalNotes}</div>
          </div>
        </div>

        {/* Correct First Try */}
        <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--glass-border)', padding: '1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '1rem', textAlign: 'left' }}>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '6px' }}>
            <Zap size={20} style={{ color: 'var(--accent-emerald)' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>First-try Correct</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{stats.correctFirstTry}</div>
          </div>
        </div>

        {/* Retries */}
        <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--glass-border)', padding: '1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '1rem', textAlign: 'left' }}>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '6px' }}>
            <RotateCcw size={20} style={{ color: 'var(--accent-rose)' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Correction Retries</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{stats.retriedNotes}</div>
          </div>
        </div>

        {/* Time Taken */}
        <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--glass-border)', padding: '1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '1rem', textAlign: 'left' }}>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '6px' }}>
            <Timer size={20} style={{ color: 'var(--accent-violet)' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Time Elapsed</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{formatTime(stats.elapsedSeconds)}</div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button onClick={onRestart} className="btn btn--secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem' }}>
          <RotateCcw size={18} /> Practice Again
        </button>
        <button onClick={onExit} className="btn btn--primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem' }}>
          <Home size={18} /> Back to Dashboard
        </button>
      </div>
    </div>
  );
};
