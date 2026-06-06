import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  PracticeState,
  PracticeStats,
  NoteStatus,
  NoteInfo,
  PitchResult,
  MidiNoteEvent,
  PracticeConfig,
} from '../api/types';
import { isNoteMatch } from '../utils/pitchUtils';

interface UsePracticeSessionReturn {
  state: PracticeState;
  currentNoteIndex: number;
  noteStatuses: NoteStatus[];
  expectedNote: NoteInfo | null;
  stats: PracticeStats;
  countdownValue: number;

  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seekTo: (noteIndex: number) => void;
  processDetectedPitch: (pitch: PitchResult | null) => void;
  processDetectedMidi: (event: MidiNoteEvent | null) => void;
}

/**
 * Core practice session state machine.
 * Manages the note-by-note progression, scoring, and state transitions.
 */
export function usePracticeSession(
  notes: NoteInfo[],
  config: PracticeConfig,
): UsePracticeSessionReturn {
  const [state, setState] = useState<PracticeState>('idle');
  const [currentNoteIndex, setCurrentNoteIndex] = useState(0);
  const [noteStatuses, setNoteStatuses] = useState<NoteStatus[]>([]);
  const [countdownValue, setCountdownValue] = useState(3);
  const [stats, setStats] = useState<PracticeStats>({
    totalNotes: 0,
    correctFirstTry: 0,
    retriedNotes: 0,
    accuracy: 0,
    elapsedSeconds: 0,
    expectedSeconds: 0,
  });

  const startTimeRef = useRef(0);
  const elapsedBeforePauseRef = useRef(0);
  const triedCurrentNoteRef = useRef(false);
  const wrongAttemptsRef = useRef(new Set<number>());
  const countdownTimerRef = useRef<any>(null);
  const elapsedTimerRef = useRef<any>(null);
  // Debounce: prevent same correct note from registering multiple times
  const lastCorrectTimeRef = useRef(0);

  // Initialize note statuses when notes change
  useEffect(() => {
    if (notes.length > 0) {
      setNoteStatuses(notes.map(() => 'pending'));
      setCurrentNoteIndex(0);
    }
  }, [notes]);

  const advanceNote = useCallback(() => {
    setCurrentNoteIndex((prev) => {
      const next = prev + 1;
      if (next >= notes.length) {
        // Session complete
        setState('complete');
        clearInterval(elapsedTimerRef.current);
        const elapsed =
          (performance.now() - startTimeRef.current) / 1000 +
          elapsedBeforePauseRef.current;
        setStats((s) => ({
          ...s,
          elapsedSeconds: elapsed,
          accuracy:
            s.totalNotes > 0
              ? Math.round((s.correctFirstTry / s.totalNotes) * 100)
              : 0,
        }));
        return prev;
      }

      // Mark next note as current
      setNoteStatuses((statuses) => {
        const updated = [...statuses];
        updated[next] = 'current';
        return updated;
      });

      triedCurrentNoteRef.current = false;
      return next;
    });
  }, [notes.length]);

  const handleNoteDetection = useCallback(
    (detectedMidi: number) => {
      if (state !== 'playing' || currentNoteIndex >= notes.length) return;

      const expected = notes[currentNoteIndex];
      if (!expected || expected.isRest) {
        // Skip rests automatically
        setNoteStatuses((s) => {
          const u = [...s];
          u[currentNoteIndex] = 'correct';
          return u;
        });
        advanceNote();
        return;
      }

      // Debounce: prevent rapid duplicate detections
      const now = performance.now();
      if (now - lastCorrectTimeRef.current < 150) return;

      const tolerance = config.inputMethod === 'microphone' ? 1 : 0;
      const match = isNoteMatch(detectedMidi, expected.midiPitch, tolerance);

      if (match) {
        lastCorrectTimeRef.current = now;
        // Correct note!
        setNoteStatuses((s) => {
          const u = [...s];
          u[currentNoteIndex] = 'correct';
          return u;
        });

        setStats((s) => ({
          ...s,
          totalNotes: s.totalNotes + 1,
          correctFirstTry: triedCurrentNoteRef.current
            ? s.correctFirstTry
            : s.correctFirstTry + 1,
        }));

        advanceNote();
      } else {
        // Wrong note
        triedCurrentNoteRef.current = true;
        wrongAttemptsRef.current.add(currentNoteIndex);

        setNoteStatuses((s) => {
          const u = [...s];
          u[currentNoteIndex] = 'wrong';
          return u;
        });

        // Flash red briefly, then back to current
        setTimeout(() => {
          setNoteStatuses((s) => {
            const u = [...s];
            if (u[currentNoteIndex] === 'wrong') {
              u[currentNoteIndex] = 'current';
            }
            return u;
          });
        }, 400);

        setStats((s) => ({
          ...s,
          retriedNotes: wrongAttemptsRef.current.size,
        }));
      }
    },
    [state, currentNoteIndex, notes, config.inputMethod, advanceNote],
  );

  const processDetectedPitch = useCallback(
    (pitch: PitchResult | null) => {
      if (!pitch || pitch.confidence < 0.7) return;
      handleNoteDetection(pitch.midiNote);
    },
    [handleNoteDetection],
  );

  const processDetectedMidi = useCallback(
    (event: MidiNoteEvent | null) => {
      if (!event || event.type !== 'on' || event.velocity === 0) return;
      handleNoteDetection(event.note);
    },
    [handleNoteDetection],
  );

  const start = useCallback(() => {
    if (notes.length === 0) return;

    // Reset state
    setNoteStatuses(notes.map((_, i) => (i === 0 ? 'current' : 'pending')));
    setCurrentNoteIndex(0);
    triedCurrentNoteRef.current = false;
    wrongAttemptsRef.current.clear();
    elapsedBeforePauseRef.current = 0;
    lastCorrectTimeRef.current = 0;
    setStats({
      totalNotes: 0,
      correctFirstTry: 0,
      retriedNotes: 0,
      accuracy: 0,
      elapsedSeconds: 0,
      expectedSeconds: 0,
    });

    // Countdown 3-2-1
    setState('countdown');
    setCountdownValue(3);
    let count = 3;
    countdownTimerRef.current = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(countdownTimerRef.current);
        setState('playing');
        startTimeRef.current = performance.now();

        // Start elapsed timer
        elapsedTimerRef.current = setInterval(() => {
          const elapsed =
            (performance.now() - startTimeRef.current) / 1000 +
            elapsedBeforePauseRef.current;
          setStats((s) => ({ ...s, elapsedSeconds: elapsed }));
        }, 1000);
      } else {
        setCountdownValue(count);
      }
    }, 1000);
  }, [notes]);

  const pause = useCallback(() => {
    if (state !== 'playing') return;
    setState('paused');
    clearInterval(elapsedTimerRef.current);
    elapsedBeforePauseRef.current +=
      (performance.now() - startTimeRef.current) / 1000;
  }, [state]);

  const resume = useCallback(() => {
    if (state !== 'paused') return;
    setState('playing');
    startTimeRef.current = performance.now();
    elapsedTimerRef.current = setInterval(() => {
      const elapsed =
        (performance.now() - startTimeRef.current) / 1000 +
        elapsedBeforePauseRef.current;
      setStats((s) => ({ ...s, elapsedSeconds: elapsed }));
    }, 1000);
  }, [state]);

  const stop = useCallback(() => {
    clearInterval(countdownTimerRef.current);
    clearInterval(elapsedTimerRef.current);
    const elapsed =
      state === 'playing'
        ? (performance.now() - startTimeRef.current) / 1000 +
          elapsedBeforePauseRef.current
        : elapsedBeforePauseRef.current;
    setStats((s) => ({
      ...s,
      elapsedSeconds: elapsed,
      accuracy:
        s.totalNotes > 0
          ? Math.round((s.correctFirstTry / s.totalNotes) * 100)
          : 0,
    }));
    setState('complete');
  }, [state]);

  const seekTo = useCallback(
    (noteIndex: number) => {
      if (noteIndex < 0 || noteIndex >= notes.length) return;
      setCurrentNoteIndex(noteIndex);
      triedCurrentNoteRef.current = false;
      setNoteStatuses((prev) => {
        const updated = [...prev];
        // Reset everything from the seek point onwards
        for (let i = noteIndex; i < updated.length; i++) {
          updated[i] = i === noteIndex ? 'current' : 'pending';
        }
        return updated;
      });
    },
    [notes.length],
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearInterval(countdownTimerRef.current);
      clearInterval(elapsedTimerRef.current);
    };
  }, []);

  return {
    state,
    currentNoteIndex,
    noteStatuses,
    expectedNote: notes[currentNoteIndex] ?? null,
    stats,
    countdownValue,
    start,
    pause,
    resume,
    stop,
    seekTo,
    processDetectedPitch,
    processDetectedMidi,
  };
}
