import React, { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Mic, ArrowLeft } from 'lucide-react';
import { Button } from '../components/common/Button';
import { KaraokeSetup } from '../components/Karaoke/KaraokeSetup';
import { KaraokeSession } from '../components/Karaoke/KaraokeSession';
import type { LyricWord } from '../utils/musicxmlParser';
import type { AdvancementLogic } from '../hooks/useLyricSync';
import type { Stem } from '../api/types';

export const KaraokePage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const [searchParams] = useSearchParams();
  const stemId = searchParams.get('stemId') || undefined;
  
  const navigate = useNavigate();

  const [sessionActive, setSessionActive] = useState(false);
  const [sessionConfig, setSessionConfig] = useState<{
    jobId?: string;
    selectedStemId?: string;
    stems?: Stem[];
    lyrics: LyricWord[];
    advancementLogic: AdvancementLogic;
  } | null>(null);

  const handleStart = (
    jobId: string | undefined, 
    selectedStemId: string | undefined, 
    stems: Stem[] | undefined, 
    musicxml: string, 
    lyrics: LyricWord[], 
    advancementLogic: AdvancementLogic
  ) => {
    setSessionConfig({
      jobId,
      selectedStemId,
      stems,
      lyrics,
      advancementLogic
    });
    setSessionActive(true);
  };

  const handleExit = () => {
    setSessionActive(false);
    setSessionConfig(null);
  };

  return (
    <div className="karaoke-page page-container fade-in">
      {!sessionActive && (
        <div className="page-header" style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Button variant="secondary" onClick={() => navigate(-1)} icon={<ArrowLeft size={20} />} style={{ padding: '0.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gradient-primary)', padding: '0.5rem', borderRadius: '8px' }}>
              <Mic size={24} style={{ color: '#ffffff' }} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Karaoke Mode</h1>
              <p className="text-secondary" style={{ margin: 0, fontSize: '0.9rem' }}>Sing along with AI-synced lyrics</p>
            </div>
          </div>
        </div>
      )}

      {!sessionActive ? (
        <KaraokeSetup 
          onStart={handleStart}
          preselectedJobId={jobId}
          preselectedStemId={stemId}
        />
      ) : (
        sessionConfig && (
          <KaraokeSession 
            jobId={sessionConfig.jobId}
            selectedStemId={sessionConfig.selectedStemId}
            stems={sessionConfig.stems}
            lyrics={sessionConfig.lyrics}
            advancementLogic={sessionConfig.advancementLogic}
            onExit={handleExit}
          />
        )
      )}
    </div>
  );
};
