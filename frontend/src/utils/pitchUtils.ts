// ── Pitch / MIDI / Note Name Conversion Utilities ────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/** Convert a frequency (Hz) to the nearest MIDI note number. */
export function frequencyToMidi(freq: number): number {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

/** Convert a frequency (Hz) to an exact (non-rounded) MIDI note number. */
export function frequencyToMidiExact(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

/** Convert a MIDI note number to its frequency (Hz). */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Convert a MIDI note number to a note name string like "C4", "F#5". */
export function midiToNoteName(midi: number, useFlats = false): string {
  const names = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES;
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  return `${names[noteIndex]}${octave}`;
}

/** Get just the pitch class name (no octave) from a MIDI note. */
export function midiToPitchClass(midi: number, useFlats = false): string {
  const names = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES;
  return names[midi % 12];
}

/** Get the octave number from a MIDI note. */
export function midiToOctave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

/** Convert a note name string like "C4" or "F#5" to a MIDI note number. */
export function noteNameToMidi(name: string): number {
  const match = name.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!match) return -1;

  const [, letter, accidental, octaveStr] = match;
  const baseMap: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const base = baseMap[letter.toUpperCase()];
  if (base === undefined) return -1;

  const acc = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  const octave = parseInt(octaveStr, 10);
  return (octave + 1) * 12 + base + acc;
}

/**
 * Get how many cents the detected frequency deviates from the target MIDI note.
 * Positive = sharp, negative = flat.
 */
export function getCentsDeviation(freq: number, targetMidi: number): number {
  const targetFreq = midiToFrequency(targetMidi);
  return 1200 * Math.log2(freq / targetFreq);
}

/**
 * Check if a detected MIDI note matches an expected note within a semitone tolerance.
 * Default tolerance is 0 (exact match) for MIDI input, 1 for microphone.
 */
export function isNoteMatch(detected: number, expected: number, tolerance = 0): boolean {
  return Math.abs(detected - expected) <= tolerance;
}

/**
 * Get a human-readable interval name between two MIDI notes.
 */
export function getIntervalName(from: number, to: number): string {
  const intervals = [
    'Unison', 'Minor 2nd', 'Major 2nd', 'Minor 3rd', 'Major 3rd',
    'Perfect 4th', 'Tritone', 'Perfect 5th', 'Minor 6th', 'Major 6th',
    'Minor 7th', 'Major 7th', 'Octave',
  ];
  const diff = Math.abs(to - from) % 12;
  return intervals[diff] || `${Math.abs(to - from)} semitones`;
}
