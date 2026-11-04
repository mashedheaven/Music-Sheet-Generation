import { useEffect, useState, useSyncExternalStore } from 'react';
import { API_BASE } from '../api/client';

export interface TrackSpec {
  id: string;
  label: string;
  family: string;
  src: string;
  /** Optional alternate source (synth rendering of the transcription). */
  altSrc?: string | null;
  peaksUrl?: string | null;
  noteCount?: number;
  defaultMuted?: boolean;
}

export interface TrackState {
  muted: boolean;
  solo: boolean;
  volume: number;
  source: 'audio' | 'notes';
}

export interface MixerSnapshot {
  playing: boolean;
  ready: boolean;
  error: string | null;
  duration: number;
  time: number;
  tracks: Record<string, TrackState>;
}

interface Channel {
  main: HTMLAudioElement;
  alt?: HTMLAudioElement;
  gainMain?: GainNode;
  gainAlt?: GainNode;
}

const DRIFT_TOLERANCE = 0.06; // seconds

/**
 * Multi-track player: every stem is an <audio> element routed through a
 * Web Audio gain node. The first track is the clock; the others are nudged
 * back whenever they drift, so all stems stay in sync.
 */
export class MixerEngine {
  private channels = new Map<string, Channel>();
  private order: string[] = [];
  private ctx: AudioContext | null = null;
  private raf = 0;
  private listeners = new Set<() => void>();
  private lastEmit = 0;
  private readyCount = 0;
  private expected = 0;
  snapshot: MixerSnapshot;

  constructor(specs: TrackSpec[]) {
    const tracks: Record<string, TrackState> = {};
    for (const spec of specs) {
      tracks[spec.id] = { muted: !!spec.defaultMuted, solo: false, volume: 0.9, source: 'audio' };
      const main = this.createElement(spec.src);
      const alt = spec.altSrc ? this.createElement(spec.altSrc, false) : undefined;
      this.channels.set(spec.id, { main, alt });
      this.order.push(spec.id);
    }
    this.snapshot = { playing: false, ready: specs.length === 0, error: null, duration: 0, time: 0, tracks };
    this.applyGains();

    const clock = this.clockElement();
    if (clock) {
      clock.addEventListener('ended', () => {
        this.pauseAll();
        this.update({ playing: false, time: this.snapshot.duration });
      });
    }
  }

  private createElement(src: string, counts = true): HTMLAudioElement {
    const el = new Audio();
    el.preload = 'auto';
    if (API_BASE) el.crossOrigin = 'anonymous';
    el.src = src;
    if (counts) {
      this.expected += 1;
      const onReady = () => {
        el.removeEventListener('canplay', onReady);
        this.readyCount += 1;
        const duration = Math.max(this.snapshot.duration, Number.isFinite(el.duration) ? el.duration : 0);
        this.update({ ready: this.readyCount >= this.expected, duration });
      };
      el.addEventListener('canplay', onReady);
      el.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(el.duration)) {
          this.update({ duration: Math.max(this.snapshot.duration, el.duration) });
        }
      });
      el.addEventListener('error', () => {
        this.update({ error: 'Some audio could not be loaded.' });
        onReady();
      });
    }
    return el;
  }

  private clockElement(): HTMLAudioElement | undefined {
    return this.order.length ? this.channels.get(this.order[0])?.main : undefined;
  }

  private ensureContext() {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      for (const ch of this.channels.values()) {
        const g1 = ctx.createGain();
        ctx.createMediaElementSource(ch.main).connect(g1).connect(ctx.destination);
        ch.main.volume = 1;
        ch.gainMain = g1;
        if (ch.alt) {
          const g2 = ctx.createGain();
          ctx.createMediaElementSource(ch.alt).connect(g2).connect(ctx.destination);
          ch.alt.volume = 1;
          ch.gainAlt = g2;
        }
      }
      this.ctx = ctx;
      this.applyGains();
    } catch {
      // Fall back to element volume (e.g. very old browsers).
      this.ctx = null;
    }
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snapshot;

  private update(patch: Partial<MixerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  private effectiveVolume(id: string): number {
    const tracks = this.snapshot.tracks;
    const anySolo = Object.values(tracks).some((t) => t.solo);
    const t = tracks[id];
    if (!t) return 0;
    const audible = anySolo ? t.solo : !t.muted;
    return audible ? t.volume : 0;
  }

  private applyGains() {
    for (const [id, ch] of this.channels) {
      const v = this.effectiveVolume(id);
      const t = this.snapshot.tracks[id];
      const mainV = t?.source === 'notes' && ch.alt ? 0 : v;
      const altV = t?.source === 'notes' && ch.alt ? v : 0;
      if (ch.gainMain) {
        const now = this.ctx?.currentTime ?? 0;
        ch.gainMain.gain.setTargetAtTime(mainV, now, 0.015);
        ch.gainAlt?.gain.setTargetAtTime(altV, now, 0.015);
      } else {
        ch.main.volume = mainV;
        if (ch.alt) ch.alt.volume = altV;
      }
    }
  }

  private allElements(): HTMLAudioElement[] {
    const out: HTMLAudioElement[] = [];
    for (const ch of this.channels.values()) {
      out.push(ch.main);
      if (ch.alt) out.push(ch.alt);
    }
    return out;
  }

  async play() {
    if (!this.order.length) return;
    this.ensureContext();
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
    const t = this.snapshot.time >= this.snapshot.duration - 0.05 ? 0 : this.snapshot.time;
    const els = this.allElements();
    els.forEach((el) => {
      el.currentTime = t;
    });
    try {
      await Promise.all(els.map((el) => el.play()));
    } catch {
      this.update({ error: 'Playback was blocked by the browser. Click play again.' });
      this.pauseAll();
      return;
    }
    this.update({ playing: true, time: t, error: null });
    this.tick();
  }

  private pauseAll() {
    this.allElements().forEach((el) => el.pause());
    cancelAnimationFrame(this.raf);
  }

  pause() {
    this.pauseAll();
    const clock = this.clockElement();
    this.update({ playing: false, time: clock ? clock.currentTime : this.snapshot.time });
  }

  toggle() {
    if (this.snapshot.playing) this.pause();
    else void this.play();
  }

  seek(time: number) {
    const t = Math.max(0, Math.min(time, this.snapshot.duration || time));
    this.allElements().forEach((el) => {
      el.currentTime = t;
    });
    this.update({ time: t });
  }

  skip(delta: number) {
    this.seek(this.currentTime() + delta);
  }

  currentTime(): number {
    const clock = this.clockElement();
    return this.snapshot.playing && clock ? clock.currentTime : this.snapshot.time;
  }

  private tick = () => {
    const clock = this.clockElement();
    if (!clock || !this.snapshot.playing) return;
    const t = clock.currentTime;
    for (const el of this.allElements()) {
      if (el !== clock && !el.seeking && Math.abs(el.currentTime - t) > DRIFT_TOLERANCE) {
        el.currentTime = t;
      }
    }
    const now = performance.now();
    if (now - this.lastEmit > 40) {
      this.lastEmit = now;
      this.update({ time: t });
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  setTrack(id: string, patch: Partial<TrackState>) {
    const current = this.snapshot.tracks[id];
    if (!current) return;
    this.update({ tracks: { ...this.snapshot.tracks, [id]: { ...current, ...patch } } });
    this.applyGains();
  }

  soloOnly(id: string) {
    const tracks: Record<string, TrackState> = {};
    for (const [k, v] of Object.entries(this.snapshot.tracks)) tracks[k] = { ...v, solo: k === id ? !v.solo : false };
    this.update({ tracks });
    this.applyGains();
  }

  setAllSources(source: 'audio' | 'notes') {
    const tracks: Record<string, TrackState> = {};
    for (const [k, v] of Object.entries(this.snapshot.tracks)) {
      tracks[k] = this.channels.get(k)?.alt ? { ...v, source } : v;
    }
    this.update({ tracks });
    this.applyGains();
  }

  destroy() {
    this.pauseAll();
    for (const el of this.allElements()) {
      el.removeAttribute('src');
      el.load();
    }
    void this.ctx?.close();
    this.listeners.clear();
  }
}

const EMPTY: MixerSnapshot = { playing: false, ready: false, error: null, duration: 0, time: 0, tracks: {} };
const noopSubscribe = () => () => {};

/**
 * Create a MixerEngine for the given tracks. The engine is built inside an
 * effect (not useMemo) so React StrictMode's mount/unmount/mount cycle
 * can't leave us holding a destroyed engine.
 */
export function useMixer(specs: TrackSpec[]) {
  const key = specs.map((s) => `${s.id}|${s.src}|${s.altSrc ?? ''}`).join(',');
  const [engine, setEngine] = useState<MixerEngine | null>(null);

  useEffect(() => {
    const e = new MixerEngine(specs);
    // The engine wraps external resources (audio elements, AudioContext).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEngine(e);
    return () => e.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const snapshot = useSyncExternalStore(
    engine ? engine.subscribe : noopSubscribe,
    engine ? engine.getSnapshot : () => EMPTY,
  );
  return { engine, snapshot };
}
