/**
 * Map playback time (seconds) to score position (beats) using the beat grid
 * the backend used for quantization. Beat 0 is the first beat of measure 1.
 */
export function timeToBeats(t: number, beats: number[], bpm: number | null): number {
  if (beats.length < 2) {
    const period = 60 / (bpm || 120);
    return t / period;
  }
  const n = beats.length;
  if (t <= beats[0]) return (t - beats[0]) / (beats[1] - beats[0]);
  if (t >= beats[n - 1]) return n - 1 + (t - beats[n - 1]) / (beats[n - 1] - beats[n - 2]);
  // binary search
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= t) lo = mid;
    else hi = mid;
  }
  return lo + (t - beats[lo]) / (beats[hi] - beats[lo]);
}

export function beatsToTime(b: number, beats: number[], bpm: number | null): number {
  if (beats.length < 2) return b * (60 / (bpm || 120));
  const n = beats.length;
  if (b <= 0) return beats[0] + b * (beats[1] - beats[0]);
  if (b >= n - 1) return beats[n - 1] + (b - (n - 1)) * (beats[n - 1] - beats[n - 2]);
  const i = Math.floor(b);
  return beats[i] + (b - i) * (beats[i + 1] - beats[i]);
}
