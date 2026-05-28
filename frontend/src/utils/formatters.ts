/**
 * Format bytes into human-readable file size.
 * e.g. 2_500_000 → "2.4 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/**
 * Format seconds into mm:ss display.
 * e.g. 225 → "3:45"
 */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Format an ISO date string into a relative time.
 * e.g. "2 hours ago", "just now"
 */
export function formatRelativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/**
 * Map job status to a CSS color variable class name.
 */
export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    pending: 'var(--color-warning)',
    uploading: 'var(--color-info)',
    processing: 'var(--color-info)',
    separating: 'var(--color-info)',
    transcribing: 'var(--color-info)',
    generating: 'var(--color-info)',
    complete: 'var(--color-success)',
    failed: 'var(--color-error)',
  };
  return map[status] ?? 'var(--color-text-secondary)';
}
