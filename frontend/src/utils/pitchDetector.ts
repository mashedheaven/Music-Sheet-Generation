// ── YIN Pitch Detection Algorithm ────────────────────────────────────────────
// Reference: "YIN, a fundamental frequency estimator for speech and music"
// by Alain de Cheveigné and Hideki Kawahara (2002)

import type { PitchResult } from '../api/types';
import { frequencyToMidi, midiToNoteName, midiToOctave, getCentsDeviation } from './pitchUtils';

const DEFAULT_THRESHOLD = 0.15;
const MIN_FREQUENCY = 60;   // ~B1
const MAX_FREQUENCY = 1500; // ~F#6

/**
 * YIN pitch detection on a Float32Array audio buffer.
 * Returns a PitchResult if a pitch is confidently detected, or null.
 */
export function detectPitchYIN(
  buffer: Float32Array,
  sampleRate: number,
  threshold = DEFAULT_THRESHOLD,
): PitchResult | null {
  // 1. Check if there's enough signal (RMS energy gate)
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.01) return null; // Too quiet — no meaningful pitch

  const halfLen = Math.floor(buffer.length / 2);
  const minPeriod = Math.max(2, Math.floor(sampleRate / MAX_FREQUENCY));
  const maxPeriod = Math.min(halfLen, Math.floor(sampleRate / MIN_FREQUENCY));

  if (maxPeriod <= minPeriod) return null;

  // 2. Compute the difference function d(tau)
  const diff = new Float32Array(maxPeriod);
  for (let tau = minPeriod; tau < maxPeriod; tau++) {
    let sum = 0;
    for (let j = 0; j < halfLen; j++) {
      const delta = buffer[j] - buffer[j + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // 3. Cumulative mean normalized difference function d'(tau)
  const cmndf = new Float32Array(maxPeriod);
  cmndf[0] = 1;
  let runningSum = 0;
  for (let tau = minPeriod; tau < maxPeriod; tau++) {
    runningSum += diff[tau];
    cmndf[tau] = runningSum > 0 ? (diff[tau] * tau) / runningSum : 1;
  }

  // 4. Absolute threshold — find first tau where cmndf < threshold
  let bestTau = -1;
  for (let tau = minPeriod; tau < maxPeriod; tau++) {
    if (cmndf[tau] < threshold) {
      // Find the local minimum in this dip
      while (tau + 1 < maxPeriod && cmndf[tau + 1] < cmndf[tau]) {
        tau++;
      }
      bestTau = tau;
      break;
    }
  }

  // Fallback: if no value below threshold, find global minimum
  if (bestTau === -1) {
    let minVal = Infinity;
    for (let tau = minPeriod; tau < maxPeriod; tau++) {
      if (cmndf[tau] < minVal) {
        minVal = cmndf[tau];
        bestTau = tau;
      }
    }
    // If the global min is still too high, no pitch detected
    if (minVal > 0.5) return null;
  }

  // 5. Parabolic interpolation for sub-sample accuracy
  const confidence = 1 - (cmndf[bestTau] ?? 0);
  if (bestTau > 0 && bestTau < maxPeriod - 1) {
    const s0 = cmndf[bestTau - 1];
    const s1 = cmndf[bestTau];
    const s2 = cmndf[bestTau + 1];
    const adjustment = (s2 - s0) / (2 * (2 * s1 - s2 - s0));
    if (isFinite(adjustment)) {
      bestTau += adjustment;
    }
  }

  // 6. Convert period to frequency
  const frequency = sampleRate / bestTau;
  if (frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY) return null;

  const midiNote = frequencyToMidi(frequency);
  const cents = getCentsDeviation(frequency, midiNote);

  return {
    frequency,
    midiNote,
    noteName: midiToNoteName(midiNote),
    octave: midiToOctave(midiNote),
    cents: Math.round(cents),
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

/**
 * PitchDetectorEngine — manages the Web Audio API pipeline for continuous
 * pitch detection from the microphone.
 */
export class PitchDetectorEngine {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private buffer: Float32Array | null = null;
  private _isRunning = false;

  get isRunning() { return this._isRunning; }

  /**
   * Start capturing from the microphone.
   */
  async start(): Promise<void> {
    if (this._isRunning) return;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 4096; // Good balance of accuracy vs latency
      this.analyser.smoothingTimeConstant = 0;

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(this.analyser);

      this.buffer = new Float32Array(this.analyser.fftSize);
      this._isRunning = true;
    } catch (err) {
      this.stop();
      throw err;
    }
  }

  /**
   * Detect the current pitch from the microphone input.
   * Call this in a requestAnimationFrame loop.
   */
  detect(threshold?: number): PitchResult | null {
    if (!this._isRunning || !this.analyser || !this.buffer || !this.audioContext) {
      return null;
    }

    this.analyser.getFloatTimeDomainData(this.buffer as any);
    return detectPitchYIN(this.buffer as any, this.audioContext.sampleRate, threshold);
  }

  /**
   * Get the current RMS level (0–1) for a volume meter.
   */
  getLevel(): number {
    if (!this.analyser || !this.buffer) return 0;
    this.analyser.getFloatTimeDomainData(this.buffer as any);
    let sum = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      sum += this.buffer[i] * this.buffer[i];
    }
    return Math.sqrt(sum / this.buffer.length);
  }

  /**
   * Stop capturing and release resources.
   */
  stop(): void {
    this._isRunning = false;

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.buffer = null;
  }
}
