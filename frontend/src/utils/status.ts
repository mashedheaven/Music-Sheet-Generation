export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'processing' | 'default';

/** Map a JobStatus string to a Badge variant. */
export function statusToBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case 'complete':
      return 'success';
    case 'failed':
      return 'error';
    case 'pending':
      return 'warning';
    case 'processing':
    case 'separating':
    case 'transcribing':
    case 'generating':
    case 'uploading':
      return 'processing';
    default:
      return 'default';
  }
}
