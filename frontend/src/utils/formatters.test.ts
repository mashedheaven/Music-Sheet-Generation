import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatFileSize,
  formatDuration,
  formatRelativeTime,
  getStatusColor,
} from './formatters';

describe('formatDuration', () => {
  it('formats zero seconds correctly', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats single digit seconds with leading zero', () => {
    expect(formatDuration(5)).toBe('0:05');
  });

  it('formats double digit seconds under a minute', () => {
    expect(formatDuration(45)).toBe('0:45');
  });

  it('formats exact minutes', () => {
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(120)).toBe('2:00');
  });

  it('formats combination of minutes and seconds', () => {
    expect(formatDuration(225)).toBe('3:45');
  });

  it('handles floating point seconds by flooring', () => {
    expect(formatDuration(65.7)).toBe('1:05');
  });

  it('formats durations greater than one hour as total minutes', () => {
    expect(formatDuration(3665)).toBe('61:05');
  });
});

describe('formatFileSize', () => {
  it('returns 0 B for 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats bytes, KB, MB, and GB correctly', () => {
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(2500000)).toBe('2.4 MB');
    expect(formatFileSize(1073741824)).toBe('1.0 GB');
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for dates less than 60 seconds ago', () => {
    expect(formatRelativeTime('2025-01-01T11:59:30Z')).toBe('just now');
  });

  it('formats minutes ago', () => {
    expect(formatRelativeTime('2025-01-01T11:30:00Z')).toBe('30m ago');
  });

  it('formats hours ago', () => {
    expect(formatRelativeTime('2025-01-01T09:00:00Z')).toBe('3h ago');
  });

  it('formats days ago', () => {
    expect(formatRelativeTime('2024-12-25T12:00:00Z')).toBe('7d ago');
  });

  it('formats months ago', () => {
    expect(formatRelativeTime('2024-10-01T12:00:00Z')).toBe('3mo ago');
  });
});

describe('getStatusColor', () => {
  it('returns appropriate CSS color variable for valid statuses', () => {
    expect(getStatusColor('pending')).toBe('var(--color-warning)');
    expect(getStatusColor('processing')).toBe('var(--color-info)');
    expect(getStatusColor('complete')).toBe('var(--color-success)');
    expect(getStatusColor('failed')).toBe('var(--color-error)');
  });

  it('returns default text secondary color for unknown status', () => {
    expect(getStatusColor('unknown_status')).toBe('var(--color-text-secondary)');
  });
});
