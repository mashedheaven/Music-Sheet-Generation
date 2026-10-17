import React from 'react';
import type { Job, JobStatus } from '../../api/types';
import { Badge } from '../common/Badge';
import { statusToBadgeVariant } from '../../utils/status';
import { Button } from '../common/Button';
import { formatRelativeTime, formatFileSize } from '../../utils/formatters';
import { ArrowLeft } from 'lucide-react';

interface TranscriptionHeaderProps {
  job: Job;
  currentStatus: JobStatus | string;
  deleting: boolean;
  onBack: () => void;
  onDelete: () => void;
}

export const TranscriptionHeader: React.FC<TranscriptionHeaderProps> = ({
  job,
  currentStatus,
  deleting,
  onBack,
  onDelete,
}) => {
  return (
    <div className="detail-page__header">
      <div>
        <h1 className="detail-page__title">
          {job.title || job.original_filename}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
          <Badge variant={statusToBadgeVariant(currentStatus)}>
            {currentStatus}
          </Badge>
          <span className="text-secondary text-sm">
            {formatRelativeTime(job.created_at)}
          </span>
          {job.file_size_bytes > 0 && (
            <span className="text-secondary text-sm">
              · {formatFileSize(job.file_size_bytes)}
            </span>
          )}
        </div>
      </div>
      <div className="detail-page__actions">
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft size={16} />}>Back</Button>
        <Button variant="danger" size="sm" onClick={onDelete} loading={deleting}>
          Delete
        </Button>
      </div>
    </div>
  );
};
