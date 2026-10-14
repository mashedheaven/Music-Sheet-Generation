import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatFileSize,
  formatDuration,
  formatRelativeTime,
  getStatusColor,
} from './formatters';

describe('formatFileSize', () => {
  it('returns "0 B" for 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats byte values under 10 with 1 decimal place', () => {
    expect(formatFileSize(5)).toBe('5.0 B');
  });

  it('formats byte values 10 and above as rounded integer', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats kilobytes correctly', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(10 * 1024)).toBe('10 KB');
  });

  it('formats megabytes correctly', () => {
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
    expect(formatFileSize(50 * 1024 * 1024)).toBe('50 MB');
  });

  it('formats gigabytes correctly', () => {
    expect(formatFileSize(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB');
    expect(formatFileSize(12 * 1024 * 1024 * 1024)).toBe('12 GB');
  });
});

describe('formatDuration', () => {
  it('formats zero seconds as 0:00', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats seconds less than a minute with leading zero on seconds', () => {
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(45)).toBe('0:45');
  });

  it('formats minutes and seconds correctly', () => {
    expect(formatDuration(225)).toBe('3:45');
    expect(formatDuration(3600)).toBe('60:00');
  });
});

describe('formatRelativeTime', () => {
  const mockNow = new Date('2025-01-01T12:00:00Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for times within 60 seconds', () => {
    const date = new Date(mockNow - 30 * 1000).toISOString();
    expect(formatRelativeTime(date)).toBe('just now');
  });

  it('returns minutes ago for times under an hour', () => {
    const date = new Date(mockNow - 15 * 60 * 1000).toISOString();
    expect(formatRelativeTime(date)).toBe('15m ago');
  });

  it('returns hours ago for times under a day', () => {
    const date = new Date(mockNow - 5 * 3600 * 1000).toISOString();
    expect(formatRelativeTime(date)).toBe('5h ago');
  });

  it('returns days ago for times under 30 days', () => {
    const date = new Date(mockNow - 10 * 24 * 3600 * 1000).toISOString();
    expect(formatRelativeTime(date)).toBe('10d ago');
  });

  it('returns months ago for times 30 days or older', () => {
    const date = new Date(mockNow - 60 * 24 * 3600 * 1000).toISOString();
    expect(formatRelativeTime(date)).toBe('2mo ago');
  });
});

describe('getStatusColor', () => {
  it('returns the correct CSS variable for status values', () => {
    expect(getStatusColor('pending')).toBe('var(--color-warning)');
    expect(getStatusColor('uploading')).toBe('var(--color-info)');
    expect(getStatusColor('complete')).toBe('var(--color-success)');
    expect(getStatusColor('failed')).toBe('var(--color-error)');
  });

  it('returns secondary text color for unknown status', () => {
    expect(getStatusColor('unknown_status')).toBe('var(--color-text-secondary)');
  });
});
