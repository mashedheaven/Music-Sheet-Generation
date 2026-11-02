import React from 'react';
import {
  Upload as UploadIcon,
  Split,
  FileMusic,
  PenTool,
  CheckCircle2,
  Check
} from 'lucide-react';
import { ProgressBar } from '../common/ProgressBar';

const PIPELINE_STAGES = [
  { key: 'uploading',    label: 'Upload',     icon: <UploadIcon size={16} /> },
  { key: 'separating',   label: 'Separate',   icon: <Split size={16} /> },
  { key: 'transcribing', label: 'Transcribe', icon: <FileMusic size={16} /> },
  { key: 'generating',   label: 'Score',      icon: <PenTool size={16} /> },
  { key: 'complete',     label: 'Done',       icon: <CheckCircle2 size={16} /> },
];

function getStageIndex(status: string): number {
  if (status === 'uploading' || status === 'processing' || status === 'preprocessing') return 0;
  if (status === 'separating') return 1;
  if (status === 'detecting' || status === 'transcribing' || status === 'quantizing') return 2;
  if (status === 'generating' || status === 'generating_scores') return 3;
  if (status === 'complete') return 4;
  return 0;
}

interface PipelineStepperProps {
  currentStatus: string;
  currentProgress: number;
  currentMessage: string | null;
}

export const PipelineStepper: React.FC<PipelineStepperProps> = ({
  currentStatus,
  currentProgress,
  currentMessage,
}) => {
  const stageIndex = getStageIndex(currentStatus);

  return (
    <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
      {/* Pipeline Stepper */}
      <div className="pipeline-stepper">
        {PIPELINE_STAGES.map((stage, i) => (
          <React.Fragment key={stage.key}>
            {i > 0 && (
              <div className={`pipeline-step__connector ${i <= stageIndex ? 'pipeline-step__connector--completed' : ''}`} />
            )}
            <div className={`pipeline-step ${i < stageIndex ? 'pipeline-step--completed' : ''} ${i === stageIndex ? 'pipeline-step--active' : ''}`}>
              <div className="pipeline-step__icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {i < stageIndex ? <Check size={16} /> : stage.icon}
              </div>
              <span className="pipeline-step__label">{stage.label}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      <ProgressBar value={currentProgress * 100} showLabel size="lg" />

      {currentMessage && (
        <p className="text-secondary mt-4" style={{ fontSize: '0.9rem' }}>
          {currentMessage}
        </p>
      )}
    </div>
  );
};
