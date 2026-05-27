import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { createJob } from '../api/client';
import { Button } from '../components/common/Button';
import { ProgressBar } from '../components/common/ProgressBar';
import { formatFileSize } from '../utils/formatters';

const ACCEPTED_TYPES = ['.mp3', '.wav', '.flac', '.ogg', '.m4a'];
const ACCEPTED_MIME = ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac'];
const MAX_SIZE_MB = 50;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Job options
  const [transcribeVocals, setTranscribeVocals] = useState(true);
  const [indianPercussionMode, setIndianPercussionMode] = useState(false);

  const validateFile = useCallback((file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_TYPES.includes(ext) && !ACCEPTED_MIME.includes(file.type)) {
      return `Unsupported format "${ext}". Please upload: ${ACCEPTED_TYPES.join(', ')}`;
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `File too large (${formatFileSize(file.size)}). Maximum size is ${MAX_SIZE_MB}MB.`;
    }
    return null;
  }, []);

  const handleFile = useCallback((file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSelectedFile(file);
  }, [validateFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadProgress(0);

    try {
      const job = await createJob(
        selectedFile, 
        undefined, 
        transcribeVocals,
        indianPercussionMode,
        (percent) => {
          setUploadProgress(percent);
        }
      );
      toast.success('Upload complete! Starting processing...');
      navigate(`/jobs/${job.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      toast.error(message);
      setUploading(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setUploadProgress(0);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="upload-page">
      <h1 className="upload-page__title">Upload a Song</h1>
      <p className="upload-page__subtitle text-secondary">
        Drop your audio file and we'll generate sheet music for every instrument
      </p>

      {/* ── Drop Zone ───────────────────────────────────────────────────── */}
      {!selectedFile && (
        <div
          className={`upload-zone glass-card ${dragOver ? 'upload-zone--dragover' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            onChange={handleInputChange}
            className="upload-zone__input"
            style={{ display: 'none' }}
          />
          <span className="upload-zone__icon">🎵</span>
          <p className="upload-zone__text">
            {dragOver ? 'Drop it here!' : 'Drag & drop your audio file'}
          </p>
          <p className="upload-zone__hint">or click to browse</p>
          <div className="upload-zone__formats">
            {ACCEPTED_TYPES.map((fmt) => (
              <span key={fmt} className="upload-zone__format-tag">{fmt}</span>
            ))}
            <span className="upload-zone__format-tag">max {MAX_SIZE_MB}MB</span>
          </div>
        </div>
      )}

      {/* ── Selected File / Upload Progress ─────────────────────────────── */}
      {selectedFile && (
        <div className="upload-progress glass-card">
          <div className="upload-progress__file">
            <span className="upload-progress__file-icon">🎧</span>
            <div className="upload-progress__file-info">
              <div className="upload-progress__file-name">{selectedFile.name}</div>
              <div className="upload-progress__file-size text-secondary">
                {formatFileSize(selectedFile.size)}
              </div>
            </div>
            {!uploading && (
              <Button variant="ghost" size="sm" onClick={handleReset}>✕</Button>
            )}
          </div>

          {!uploading && (
            <div className="upload-options" style={{ margin: '1.5rem 0', display: 'flex', gap: '1.5rem', justifyContent: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={transcribeVocals} 
                  onChange={(e) => setTranscribeVocals(e.target.checked)}
                  style={{ accentColor: 'var(--primary)' }}
                />
                <span className="text-sm">Transcribe Vocals</span>
              </label>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={indianPercussionMode} 
                  onChange={(e) => setIndianPercussionMode(e.target.checked)}
                  style={{ accentColor: 'var(--primary)' }}
                />
                <span className="text-sm">Indian Percussion Mode</span>
              </label>
            </div>
          )}

          {uploading && (
            <>
              <ProgressBar value={uploadProgress} showLabel />
              <p className="text-secondary text-sm mt-2" style={{ textAlign: 'center' }}>
                {uploadProgress < 100 ? 'Uploading...' : 'Processing started — redirecting...'}
              </p>
            </>
          )}

          {!uploading && (
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1rem' }}>
              <Button variant="primary" size="lg" onClick={handleUpload}>
                🚀 Start Transcription
              </Button>
              <Button variant="ghost" onClick={handleReset}>
                Choose Different File
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
