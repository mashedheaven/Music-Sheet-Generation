import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import type { PracticeConfig, NoteInfo } from '../api/types';
import { PracticeSetup } from '../components/Practice/PracticeSetup';
import { PracticeSession } from '../components/Practice/PracticeSession';

export const PracticePage: React.FC = () => {
  const { jobId } = useParams<{ jobId?: string }>();
  const [searchParams] = useSearchParams();
  const stemId = searchParams.get('stemId') || undefined;

  // Practice state
  const [activeConfig, setActiveConfig] = useState<PracticeConfig | null>(null);
  const [musicxml, setMusicxml] = useState<string>('');
  const [notes, setNotes] = useState<NoteInfo[]>([]);

  const handleStartPractice = (config: PracticeConfig, xmlContent: string, noteList: NoteInfo[]) => {
    setActiveConfig(config);
    setMusicxml(xmlContent);
    setNotes(noteList);
  };

  const handleExitPractice = () => {
    setActiveConfig(null);
    setMusicxml('');
    setNotes([]);
  };

  return (
    <div className="practice-page container" style={{ padding: '2rem 1.5rem', minHeight: 'calc(100vh - 80px)' }}>
      {/* Main header (only show when not in active playing mode to save screen space) */}
      {!activeConfig && (
        <div className="practice-page__header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)', padding: '0.75rem', borderRadius: '12px' }}>
            <GraduationCap size={32} style={{ color: 'var(--accent-violet)' }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>Practice Room</h1>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              Practice your instrument with real-time feedback using your microphone or MIDI device.
            </p>
          </div>
        </div>
      )}

      {/* Toggling between Setup phase and Active session phase */}
      {!activeConfig ? (
        <PracticeSetup
          onStart={handleStartPractice}
          preselectedJobId={jobId}
          preselectedStemId={stemId}
        />
      ) : (
        <PracticeSession
          config={activeConfig}
          musicxml={musicxml}
          initialNotes={notes}
          onExit={handleExitPractice}
        />
      )}
    </div>
  );
};

export default PracticePage;
