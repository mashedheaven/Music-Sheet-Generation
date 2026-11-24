import { describe, expect, it } from 'vitest';
import { beatsToTime, timeToBeats } from './beats';

const beats = [0.5, 1.0, 1.5, 2.1, 2.7];

describe('timeToBeats', () => {
  it('interpolates between detected beats', () => {
    expect(timeToBeats(0.5, beats, 120)).toBeCloseTo(0);
    expect(timeToBeats(1.25, beats, 120)).toBeCloseTo(1.5);
    expect(timeToBeats(2.4, beats, 120)).toBeCloseTo(3.5);
  });
  it('extrapolates outside the grid', () => {
    expect(timeToBeats(0, beats, 120)).toBeCloseTo(-1);
    expect(timeToBeats(3.3, beats, 120)).toBeCloseTo(5);
  });
  it('falls back to a constant tempo', () => {
    expect(timeToBeats(3, [], 120)).toBeCloseTo(6);
    expect(timeToBeats(3, [], null)).toBeCloseTo(6);
  });
  it('is the inverse of beatsToTime', () => {
    for (const b of [-0.5, 0, 0.25, 2.75, 6]) {
      expect(timeToBeats(beatsToTime(b, beats, 120), beats, 120)).toBeCloseTo(b);
    }
  });
});
