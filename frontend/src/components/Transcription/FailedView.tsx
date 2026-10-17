import React from 'react';
import { XCircle } from 'lucide-react';
import { Button } from '../common/Button';

interface FailedViewProps {
  errorMessage?: string | null;
  onTryAnother: () => void;
}

export const FailedView: React.FC<FailedViewProps> = ({
  errorMessage,
  onTryAnother,
}) => {
  return (
    <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
      <XCircle size={48} className="text-error" style={{ margin: '0 auto 1rem', display: 'block' }} />
      <h2>Transcription Failed</h2>
      <p className="text-secondary mt-2">
        {errorMessage || 'An error occurred during processing.'}
      </p>
      <Button variant="primary" onClick={onTryAnother} className="mt-4">
        Try Another Song
      </Button>
    </div>
  );
};
