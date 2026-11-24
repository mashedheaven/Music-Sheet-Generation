export const ACCEPTED_EXTENSIONS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.aiff', '.aif'];

export function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export function formatTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatRelativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(date).toLocaleDateString();
}

/** "B minor" → "B min", "F# major" → "F♯ maj" */
export function formatKey(key: string | null | undefined): string {
  if (!key) return '—';
  return key.replace('#', '♯').replace(/b(?= )/, '♭').replace(' major', ' maj').replace(' minor', ' min');
}

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Queued',
  processing: 'Analyzing',
  separating: 'Separating',
  transcribing: 'Transcribing',
  generating: 'Engraving',
  complete: 'Ready',
  failed: 'Failed',
};

export function isActive(status: string): boolean {
  return status !== 'complete' && status !== 'failed';
}
