import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatDuration,
  formatFileSize,
  formatRelativeTime,
  getStatusColor,
} from './formatters';

describe('formatDuration', () => {
  it('formats 0 seconds as "0:00"', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('pads single-digit seconds with a leading zero', () => {
    expect(formatDuration(5)).toBe('0:05');
  });

  it('formats seconds under 1 minute', () => {
    expect(formatDuration(45)).toBe('0:45');
  });

  it('formats exact minutes', () => {
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(600)).toBe('10:00');
  });

  it('formats minutes and padded seconds correctly', () => {
    expect(formatDuration(225)).toBe('3:45');
    expect(formatDuration(123)).toBe('2:03');
  });

  it('formats large durations greater than an hour into minutes', () => {
    expect(formatDuration(3661)).toBe('61:01');
  });

  it('handles floating point second inputs correctly by flooring values', () => {
    expect(formatDuration(65.7)).toBe('1:05');
  });
});

describe('formatFileSize', () => {
  it('returns "0 B" for 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats bytes under 1 KB', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats KB, MB, and GB correctly', () => {
    expect(formatFileSize(1500)).toBe('1.5 KB');
    expect(formatFileSize(2_500_000)).toBe('2.4 MB');
    expect(formatFileSize(2_000_000_000)).toBe('1.9 GB');
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for times less than 60 seconds ago', () => {
    const now = new Date('2026-01-01T12:00:00Z').toISOString();
    expect(formatRelativeTime(now)).toBe('just now');
  });

  it('returns "Xm ago" for minutes', () => {
    const date = new Date('2026-01-01T11:45:00Z').toISOString();
    expect(formatRelativeTime(date)).toBe('15m ago');
  });

  it('returns "Xh ago" for hours', () => {
    const date = new Date('2026-01-01T09:00:00Z').toISOString();
    expect(formatRelativeTime(date)).toBe('3h ago');
  });

  it('returns "Xd ago" for days', () => {
    const date = new Date('2025-12-27T12:00:00Z').toISOString();
    expect(formatRelativeTime(date)).toBe('5d ago');
  });

  it('returns "Xmo ago" for months', () => {
    const date = new Date('2025-10-01T12:00:00Z').toISOString();
    expect(formatRelativeTime(date)).toBe('3mo ago');
  });
});

describe('getStatusColor', () => {
  it('returns corresponding color variables for known statuses', () => {
    expect(getStatusColor('pending')).toBe('var(--color-warning)');
    expect(getStatusColor('processing')).toBe('var(--color-info)');
    expect(getStatusColor('complete')).toBe('var(--color-success)');
    expect(getStatusColor('failed')).toBe('var(--color-error)');
  });

  it('returns fallback secondary text color variable for unknown statuses', () => {
    expect(getStatusColor('unknown_status')).toBe('var(--color-text-secondary)');
  });
});
