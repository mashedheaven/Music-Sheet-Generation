#!/usr/bin/env python3
"""Generate a synthetic multi-instrument test song with known ground truth.

    python scripts/make_test_song.py out.wav [--bpm 98] [--bars 16]

The song is in F major, 4/4, starts slightly after t=0, and contains
drums (kick/snare/hats), a bass line, sustained chords and a melody, so
tempo, key, rhythm and per-instrument transcription can all be checked.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 44100


def tone(freq: float, dur: float, harmonics=((1, 1.0), (2, 0.4), (3, 0.2)), decay=1.5, vibrato=0.0):
    t = np.arange(int(dur * SR)) / SR
    f = freq * (1 + vibrato * np.sin(2 * np.pi * 5.5 * t))
    phase = 2 * np.pi * np.cumsum(f) / SR
    y = sum(a * np.sin(m * phase) for m, a in harmonics)
    env = np.exp(-t * decay)
    a = min(len(t), int(0.01 * SR))
    env[:a] *= np.linspace(0, 1, a)
    r = min(len(t), int(0.03 * SR))
    env[-r:] *= np.linspace(1, 0, r)
    return y * env


def hz(midi: int) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def add(buf, start_s, sig, gain=1.0):
    i = int(start_s * SR)
    j = min(len(buf), i + len(sig))
    if i < len(buf):
        buf[i:j] += sig[: j - i] * gain


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--bpm", type=float, default=98.0)
    ap.add_argument("--bars", type=int, default=16)
    ap.add_argument("--offset", type=float, default=0.37)
    ap.add_argument("--stems-dir", type=Path, default=None, help="Also write each instrument separately")
    args = ap.parse_args()

    beat = 60.0 / args.bpm
    total = args.offset + args.bars * 4 * beat + 2.0
    rng = np.random.default_rng(1)
    drums = np.zeros(int(total * SR))
    bass = np.zeros_like(drums)
    keys = np.zeros_like(drums)
    lead = np.zeros_like(drums)

    # F – Dm – Bb – C  (I – vi – IV – V in F major)
    prog = [(53, [65, 69, 72]), (50, [62, 65, 69]), (46, [62, 65, 70]), (48, [64, 67, 72])]
    melody = [  # (beat offset within 2 bars, midi, beats)
        (0, 72, 1), (1, 74, 0.5), (1.5, 72, 0.5), (2, 69, 1), (3, 65, 1),
        (4, 67, 1.5), (5.5, 69, 0.5), (6, 70, 1), (7, 72, 1),
    ]

    for bar in range(args.bars):
        t0 = args.offset + bar * 4 * beat
        root, chord = prog[bar % 4]
        # drums
        for b in range(4):
            tb = t0 + b * beat
            if b in (0, 2):
                tt = np.arange(int(0.25 * SR)) / SR
                kick = np.sin(2 * np.pi * np.cumsum(50 + 90 * np.exp(-tt * 20)) / SR) * np.exp(-tt * 12)
                add(drums, tb, kick, 0.9)
            if b in (1, 3):
                tt = np.arange(int(0.18 * SR)) / SR
                sn = rng.standard_normal(tt.size) * np.exp(-tt * 20) * 0.5 + np.sin(2 * np.pi * 200 * tt) * np.exp(-tt * 25)
                add(drums, tb, sn, 0.6)
            for h in (0, 0.5):
                tt = np.arange(int(0.05 * SR)) / SR
                hat = np.diff(rng.standard_normal(tt.size + 1)) * np.exp(-tt * 70)
                add(drums, tb + h * beat, hat, 0.15)
        # bass: root on 1, 2.5 (eighth), 3
        for pos, dur in ((0, 1.5), (1.5, 0.5), (2, 2)):
            add(bass, t0 + pos * beat, tone(hz(root - 12 if root > 50 else root), dur * beat * 0.95, ((1, 1), (2, 0.5)), 1.0), 0.6)
        # keys: chord on beat 1 and 3 (half notes)
        for pos in (0, 2):
            for p in chord:
                add(keys, t0 + pos * beat, tone(hz(p), 2 * beat * 0.95, decay=1.0), 0.18)
        # melody over 2-bar phrase
        if bar % 2 == 0:
            for pos, p, d in melody:
                add(lead, t0 + pos * beat, tone(hz(p + 12 if bar >= 8 else p), d * beat * 0.9, ((1, 1), (2, 0.3)), 0.6, 0.004), 0.35)

    mix = drums + bass + keys + lead
    norm = np.max(np.abs(mix)) * 1.1
    mix /= norm
    if args.stems_dir:
        args.stems_dir.mkdir(parents=True, exist_ok=True)
        for name, sig in (("drums", drums), ("bass", bass), ("keys", keys), ("lead", lead)):
            sf.write(str(args.stems_dir / f"{name}.wav"), sig / norm, SR)
    stereo = np.stack([mix, mix], axis=1)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(args.out), stereo, SR)
    print(f"Wrote {args.out} ({total:.1f}s, {args.bpm} BPM, F major, first downbeat at {args.offset}s)")


if __name__ == "__main__":
    main()
