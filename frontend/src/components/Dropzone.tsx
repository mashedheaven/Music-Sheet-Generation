import React, { useCallback, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

import { ACCEPTED_EXTENSIONS } from '../lib/format';

interface DropzoneProps {
  onFile: (file: File) => void;
  maxSizeMb: number;
  compact?: boolean;
}

export const Dropzone: React.FC<DropzoneProps> = ({ onFile, maxSizeMb, compact }) => {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const f = files?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return (
    <div
      className={`dropzone ${over ? 'is-over' : ''} ${compact ? 'dropzone--compact' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
    >
      <input
        ref={input}
        type="file"
        accept={[...ACCEPTED_EXTENSIONS, 'audio/*'].join(',')}
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="dropzone__icon">
        <UploadCloud size={compact ? 26 : 34} />
      </div>
      <p className="dropzone__title">{over ? 'Drop to upload' : 'Drop a song here, or click to browse'}</p>
      <p className="dropzone__hint">
        MP3, WAV, FLAC, OGG, M4A · up to {maxSizeMb} MB
      </p>
    </div>
  );
};
