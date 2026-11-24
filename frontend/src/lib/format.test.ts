import { describe, expect, it, vi } from 'vitest';
import { formatFileSize, formatKey, formatRelativeTime, formatTime, isActive } from './format';

describe('formatFileSize', () => {
  it('handles zero and bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
  });
  it('uses one decimal below 10 units', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });
  it('rounds larger values', () => {
    expect(formatFileSize(50 * 1024 * 1024)).toBe('50 MB');
  });
});

describe('formatTime', () => {
  it('formats m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5.9)).toBe('0:05');
    expect(formatTime(225)).toBe('3:45');
    expect(formatTime(3600)).toBe('60:00');
  });
  it('is safe for invalid input', () => {
    expect(formatTime(null)).toBe('0:00');
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(-3)).toBe('0:00');
  });
});

describe('formatRelativeTime', () => {
  it('describes recent times', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    expect(formatRelativeTime('2026-01-01T11:59:50Z')).toBe('just now');
    expect(formatRelativeTime('2026-01-01T11:55:00Z')).toBe('5 min ago');
    expect(formatRelativeTime('2026-01-01T09:00:00Z')).toBe('3 h ago');
    expect(formatRelativeTime('2025-12-29T12:00:00Z')).toBe('3 d ago');
    vi.useRealTimers();
  });
});

describe('formatKey', () => {
  it('uses musical symbols', () => {
    expect(formatKey('F# major')).toBe('F♯ maj');
    expect(formatKey('Bb minor')).toBe('B♭ min');
    expect(formatKey(null)).toBe('—');
  });
});

describe('isActive', () => {
  it('treats only complete/failed as terminal', () => {
    expect(isActive('transcribing')).toBe(true);
    expect(isActive('pending')).toBe(true);
    expect(isActive('complete')).toBe(false);
    expect(isActive('failed')).toBe(false);
  });
});
