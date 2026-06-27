import { useState, useEffect, useCallback, useRef } from 'react';
import type { LyricWord } from '../utils/musicxmlParser';

export type AdvancementLogic = 'exact' | 'continuous';

interface UseLyricSyncProps {
  lyrics: LyricWord[];
  advancementLogic: AdvancementLogic;
  enabled: boolean;
}

export function useLyricSync({ lyrics, advancementLogic, enabled }: UseLyricSyncProps) {
  const [currentLyricIndex, setCurrentLyricIndex] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const currentIndexRef = useRef(0);
  const lastMatchedWordRef = useRef<string | null>(null);
  
  // Keep ref in sync with state for access in event listeners
  useEffect(() => {
    currentIndexRef.current = currentLyricIndex;
  }, [currentLyricIndex]);

  // Normalization helper
  const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

  useEffect(() => {
    if (!enabled || lyrics.length === 0) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
      }
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError('Speech Recognition API is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: any) => {
      if (currentIndexRef.current >= lyrics.length) return;

      // We only care about the latest interim or final result.
      let latestTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        latestTranscript += event.results[i][0].transcript + ' ';
      }
      
      const recognizedWords = latestTranscript.split(' ').map(normalize).filter(Boolean);
      if (recognizedWords.length === 0) return;

      const idx = currentIndexRef.current;
      
      if (advancementLogic === 'exact') {
        const nextTarget = normalize(lyrics[idx].text);
        if (recognizedWords.includes(nextTarget)) {
          setCurrentLyricIndex(prev => prev + 1);
        }
      } else {
        // Continuous: lookahead up to 5 words
        const lookahead = 5; 
        let bestMatchIndex = -1;
        
        for (let i = 0; i < lookahead; i++) {
          if (idx + i >= lyrics.length) break;
          const target = normalize(lyrics[idx + i].text);
          if (target && recognizedWords.includes(target)) {
            bestMatchIndex = idx + i;
          }
        }
        
        if (bestMatchIndex !== -1 && bestMatchIndex >= idx) {
          setCurrentLyricIndex(bestMatchIndex + 1);
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      if (event.error !== 'no-speech') {
        // setError(`Speech recognition error: ${event.error}`);
        // We do not stop listening entirely on error, we just restart in onend.
      }
    };

    recognition.onend = () => {
      // Auto-restart if still enabled
      if (enabled) {
        try {
          recognition.start();
        } catch (e) {
          setIsListening(false);
        }
      } else {
        setIsListening(false);
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      setError('Failed to start speech recognition');
    }

    return () => {
      recognition.onend = null; // Prevent restart
      recognition.stop();
      recognitionRef.current = null;
      setIsListening(false);
    };
  }, [enabled, advancementLogic, lyrics]);

  const resetSync = useCallback(() => {
    setCurrentLyricIndex(0);
  }, []);

  return {
    currentLyricIndex,
    isListening,
    error,
    resetSync,
  };
}
