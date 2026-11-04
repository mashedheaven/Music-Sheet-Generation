import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, FileAudio, X } from 'lucide-react';
import { createJob, errorMessage } from '../api/client';
import { Dropzone } from '../components/Dropzone';
import { Button, ProgressBar, Segmented, Switch } from '../components/ui';
import { useHealth } from '../hooks/useHealth';
import { ACCEPTED_EXTENSIONS, formatFileSize } from '../lib/format';
import { takePendingFile } from './pendingFile';

function titleFromName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
}

export const NewPage: React.FC = () => {
  const navigate = useNavigate();
  const { health } = useHealth();
  const maxMb = health?.limits.max_file_size_mb ?? 100;

  const [file, setFile] = useState<File | null>(() => {
    const pending = takePendingFile();
    return pending && pending.size <= 1024 * 1024 * 1024 ? pending : null;
  });
  const [title, setTitle] = useState(() => (file ? titleFromName(file.name) : ''));
  const [transcribeVocals, setTranscribeVocals] = useState(true);
  const [indian, setIndian] = useState(false);
  const [quantization, setQuantization] = useState<'eighth' | 'sixteenth'>('sixteenth');
  const [timeSignature, setTimeSignature] = useState('4/4');
  const [tempoMode, setTempoMode] = useState<'auto' | 'manual'>('auto');
  const [bpm, setBpm] = useState('120');
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const acceptFile = (f: File) => {
    const ext = `.${f.name.split('.').pop()?.toLowerCase()}`;
    if (!ACCEPTED_EXTENSIONS.includes(ext) && !f.type.startsWith('audio/')) {
      toast.error(`“${ext}” isn’t a supported audio format.`);
      return;
    }
    if (f.size > maxMb * 1024 * 1024) {
      toast.error(`That file is ${formatFileSize(f.size)} — the limit is ${maxMb} MB.`);
      return;
    }
    setTitle(titleFromName(f.name));
    setFile(f);
  };

  const bpmNumber = Number(bpm);
  const bpmValid = tempoMode === 'auto' || (Number.isFinite(bpmNumber) && bpmNumber >= 30 && bpmNumber <= 260);

  const submit = async () => {
    if (!file || !bpmValid) return;
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`That file is ${formatFileSize(file.size)} — the limit is ${maxMb} MB.`);
      return;
    }
    setUploading(true);
    setUploadPct(0);
    try {
      const job = await createJob(
        file,
        {
          title,
          transcribeVocals,
          indianPercussionMode: indian,
          quantization,
          timeSignature,
          bpm: tempoMode === 'manual' ? bpmNumber : null,
        },
        setUploadPct,
      );
      toast.success('Uploaded — processing has started');
      navigate(`/jobs/${job.id}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Upload failed'));
      setUploading(false);
    }
  };

  return (
    <div className="page page--narrow">
      <div className="page-head">
        <div>
          <p className="eyebrow">New transcription</p>
          <h1 className="page-title">Upload a song</h1>
        </div>
      </div>

      {!file ? (
        <Dropzone onFile={acceptFile} maxSizeMb={maxMb} />
      ) : (
        <div className="new-form">
          <div className="card file-card">
            <div className="file-card__row">
              <div className="file-card__icon">
                <FileAudio size={22} />
              </div>
              <div className="file-card__info">
                <div className="file-card__name">{file.name}</div>
                <div className="muted small">{formatFileSize(file.size)}</div>
              </div>
              {!uploading && (
                <button className="icon-btn" onClick={() => setFile(null)} aria-label="Remove file">
                  <X size={18} />
                </button>
              )}
            </div>
            {previewUrl && <audio className="file-card__audio" src={previewUrl} controls preload="metadata" />}
          </div>

          <div className="card form-card">
            <label className="field">
              <span className="field__label">Title</span>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} placeholder="Song title" />
            </label>

            <div className="field">
              <span className="field__label">Notation detail</span>
              <Segmented
                ariaLabel="Notation detail"
                value={quantization}
                onChange={setQuantization}
                options={[
                  { value: 'eighth', label: 'Simple · 8ths', hint: 'Easier to read; rhythms rounded to eighth notes' },
                  { value: 'sixteenth', label: 'Detailed · 16ths', hint: 'More precise rhythms' },
                ]}
              />
            </div>

            <div className="field-row">
              <div className="field">
                <span className="field__label">Time signature</span>
                <Segmented
                  ariaLabel="Time signature"
                  value={timeSignature}
                  onChange={setTimeSignature}
                  options={[
                    { value: '4/4', label: '4/4' },
                    { value: '3/4', label: '3/4' },
                    { value: '2/4', label: '2/4' },
                  ]}
                />
              </div>
              <div className="field">
                <span className="field__label">Tempo</span>
                <div className="tempo-field">
                  <Segmented
                    ariaLabel="Tempo"
                    value={tempoMode}
                    onChange={setTempoMode}
                    options={[
                      { value: 'auto', label: 'Detect' },
                      { value: 'manual', label: 'Set BPM' },
                    ]}
                  />
                  {tempoMode === 'manual' && (
                    <input
                      className={`input input--bpm ${bpmValid ? '' : 'is-invalid'}`}
                      type="number"
                      min={30}
                      max={260}
                      value={bpm}
                      onChange={(e) => setBpm(e.target.value)}
                      aria-label="Beats per minute"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="switches">
              <Switch
                checked={transcribeVocals}
                onChange={setTranscribeVocals}
                label="Transcribe vocals"
                description="Write the sung melody as its own part (with lyrics when Whisper is installed)."
              />
              <Switch
                checked={indian}
                onChange={setIndian}
                label="Indian percussion"
                description="Label the percussion part for tabla / mridangam style recordings."
              />
            </div>
          </div>

          {uploading ? (
            <div className="card upload-status">
              <ProgressBar value={uploadPct / 100} />
              <p className="muted small">{uploadPct < 100 ? `Uploading… ${uploadPct}%` : 'Starting the pipeline…'}</p>
            </div>
          ) : (
            <div className="form-actions">
              <Button variant="ghost" onClick={() => setFile(null)}>
                Choose another file
              </Button>
              <Button variant="primary" size="lg" onClick={submit} disabled={!bpmValid} icon={<ArrowRight size={18} />}>
                Generate sheet music
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
