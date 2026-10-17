import React from 'react';
import type { Score, Stem } from '../../api/types';
import { getScoreDownloadUrl } from '../../api/client';
import { FileText, FileAudio, Layers } from 'lucide-react';

interface TranscriptionDownloadsProps {
  currentScores: Score[];
  ensembleScores: Score[];
  selectedStem: Stem | null;
}

export const TranscriptionDownloads: React.FC<TranscriptionDownloadsProps> = ({
  currentScores,
  ensembleScores,
  selectedStem,
}) => {
  return (
    <div className="downloads">
      {currentScores.map((score: Score) => (
        <a
          key={score.id}
          href={getScoreDownloadUrl(score.id)}
          className="download-btn"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          download
        >
          {score.format === 'musicxml' ? <FileText size={16} /> : <FileAudio size={16} />} Download {score.format.toUpperCase()}
        </a>
      ))}
      {selectedStem && ensembleScores.map((score: Score) => (
        <a
          key={score.id}
          href={getScoreDownloadUrl(score.id)}
          className="download-btn"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          download
        >
          <Layers size={16} /> Ensemble {score.format.toUpperCase()}
        </a>
      ))}
    </div>
  );
};
