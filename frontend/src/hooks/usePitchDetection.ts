import { useRef, useState, useEffect, useCallback } from 'react';
import type { PitchResult } from '../api/types';
import { PitchDetectorEngine } from '../utils/pitchDetector';

interface UsePitchDetectionReturn {
  detectedNote: PitchResult | null;
  isListening: boolean;
  error: string | null;
  level: number;
  startListening: () => Promise<void>;
  stopListening: () => void;
}

/**
 * React hook for real-time microphone pitch detection using the YIN algorithm.
 */
export function usePitchDetection(enabled: boolean): UsePitchDetectionReturn {
  const engineRef = useRef<PitchDetectorEngine | null>(null);
  const rafRef = useRef<number>(0);
  const [detectedNote, setDetectedNote] = useState<PitchResult | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);

  const detect = useCallback(() => {
    if (!engineRef.current?.isRunning) return;

    const result = engineRef.current.detect();
    setDetectedNote(result);
    setLevel(engineRef.current.getLevel());

    rafRef.current = requestAnimationFrame(detect);
  }, []);

  const startListening = useCallback(async () => {
    setError(null);
    try {
      if (!engineRef.current) {
        engineRef.current = new PitchDetectorEngine();
      }
      await engineRef.current.start();
      setIsListening(true);
      rafRef.current = requestAnimationFrame(detect);
    } catch (err: unknown) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access was denied. Please allow microphone access in your browser settings.'
          : 'Failed to start microphone. Please check your audio input.';
      setError(message);
      setIsListening(false);
    }
  }, [detect]);

  const stopListening = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    engineRef.current?.stop();
    setIsListening(false);
    setDetectedNote(null);
    setLevel(0);
  }, []);

  // Auto-stop when disabled
  useEffect(() => {
    if (!enabled && isListening) {
      stopListening();
    }
  }, [enabled, isListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      engineRef.current?.stop();
    };
  }, []);

  return { detectedNote, isListening, error, level, startListening, stopListening };
}
