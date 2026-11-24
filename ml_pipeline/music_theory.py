"""Small music-theory helpers: key detection and enharmonic spelling."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import numpy as np

# Krumhansl–Kessler key profiles.
_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

_SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
_FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

# Number of sharps (+) / flats (−) for each major tonic pitch class.
_MAJOR_FIFTHS = {0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 5: -1, 10: -2, 3: -3, 8: -4, 1: -5}


@dataclass(frozen=True)
class KeyEstimate:
    tonic_pc: int
    mode: str  # "major" | "minor"
    confidence: float

    @property
    def sharps(self) -> int:
        """Signed key-signature accidental count (+sharps / −flats)."""
        major_pc = self.tonic_pc if self.mode == "major" else (self.tonic_pc + 3) % 12
        return _MAJOR_FIFTHS[major_pc]

    @property
    def uses_flats(self) -> bool:
        return self.sharps < 0

    @property
    def tonic_name(self) -> str:
        names = _FLAT_NAMES if self.uses_flats else _SHARP_NAMES
        name = names[self.tonic_pc]
        # Prefer the conventional names for the 6-accidental keys.
        if self.mode == "major" and self.tonic_pc == 6:
            name = "F#"
        if self.mode == "minor" and self.tonic_pc == 3:
            name = "Eb"
        return name

    @property
    def name(self) -> str:
        return f"{self.tonic_name} {self.mode}"

    @property
    def music21_name(self) -> str:
        tonic = self.tonic_name.replace("b", "-")
        return tonic if self.mode == "major" else tonic.lower()


def estimate_key(weighted_pitches: Iterable[tuple[int, float]]) -> KeyEstimate:
    """Krumhansl–Schmuckler key finding on a duration-weighted pitch histogram."""
    hist = np.zeros(12)
    for pitch, weight in weighted_pitches:
        hist[pitch % 12] += max(weight, 0.0)
    if hist.sum() <= 0:
        return KeyEstimate(0, "major", 0.0)

    best = (-2.0, 0, "major")
    scores = []
    for tonic in range(12):
        for mode, profile in (("major", _MAJOR), ("minor", _MINOR)):
            r = float(np.corrcoef(hist, np.roll(profile, tonic))[0, 1])
            scores.append(r)
            if r > best[0]:
                best = (r, tonic, mode)
    return KeyEstimate(best[1], best[2], max(0.0, best[0]))


def spell_pitch(midi: int, key: KeyEstimate) -> tuple[str, int, int]:
    """Spell a MIDI pitch for the given key.

    Returns ``(step, alter, octave)`` e.g. ``("B", -1, 4)`` for B♭4.
    Diatonic notes use the key's spelling; chromatic notes use sharps in
    sharp keys and flats in flat keys.
    """
    pc = midi % 12
    names = _FLAT_NAMES if key.uses_flats else _SHARP_NAMES
    name = names[pc]

    # Diatonic exceptions in keys with 6+ accidentals (E#, B#, Cb, Fb).
    scale = _scale_spelling(key)
    if pc in scale:
        name = scale[pc]

    step = name[0]
    alter = 0
    for ch in name[1:]:
        alter += 1 if ch == "#" else -1
    # Octave follows the written letter (B#3 sounds as C4, Cb5 as B4).
    octave = (midi - alter) // 12 - 1
    return step, alter, octave


def _scale_spelling(key: KeyEstimate) -> dict[int, str]:
    """Map pitch classes in the key's (natural) scale to their spellings."""
    steps = ["C", "D", "E", "F", "G", "A", "B"]
    natural_pc = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
    intervals = [0, 2, 4, 5, 7, 9, 11] if key.mode == "major" else [0, 2, 3, 5, 7, 8, 10]
    tonic_letter = key.tonic_name[0]
    start = steps.index(tonic_letter)
    out: dict[int, str] = {}
    for degree, interval in enumerate(intervals):
        letter = steps[(start + degree) % 7]
        pc = (key.tonic_pc + interval) % 12
        diff = (pc - natural_pc[letter] + 6) % 12 - 6
        out[pc] = letter + ("#" * diff if diff > 0 else "b" * (-diff))
    if key.mode == "minor":
        # Raised leading tone (harmonic minor) is very common.
        lt_pc = (key.tonic_pc + 11) % 12
        letter = steps[(start + 6) % 7]
        diff = (lt_pc - natural_pc[letter] + 6) % 12 - 6
        out.setdefault(lt_pc, letter + ("#" * diff if diff > 0 else "b" * (-diff)))
    return out
