"""Post-processing that turns raw model output into readable note lists.

Raw transcription models output a lot of material a musician would never
write down: ghost notes, 30 ms blips, fragmented sustained notes, octave
harmonics, and overlapping notes on monophonic instruments. These helpers
clean that up per instrument family before quantization.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

import numpy as np

from ml_pipeline.data_models import InstrumentFamily, InstrumentInfo, Note


@dataclass(frozen=True)
class CleanupProfile:
    """Per-instrument cleanup parameters."""

    min_pitch: int
    max_pitch: int
    min_duration: float  # seconds
    monophonic: bool
    max_polyphony: int
    relative_velocity_floor: float  # fraction of the 90th percentile velocity
    merge_gap: float  # merge same-pitch fragments separated by less than this


PROFILES: dict[InstrumentFamily, CleanupProfile] = {
    InstrumentFamily.VOCALS: CleanupProfile(40, 88, 0.09, True, 1, 0.30, 0.03),
    InstrumentFamily.BASS: CleanupProfile(23, 67, 0.08, True, 1, 0.25, 0.02),
    InstrumentFamily.GUITAR: CleanupProfile(40, 90, 0.07, False, 6, 0.30, 0.02),
    InstrumentFamily.KEYS: CleanupProfile(21, 108, 0.07, False, 8, 0.25, 0.02),
    InstrumentFamily.STRINGS: CleanupProfile(28, 100, 0.08, False, 4, 0.30, 0.03),
    InstrumentFamily.WINDS: CleanupProfile(34, 100, 0.08, True, 1, 0.30, 0.03),
    InstrumentFamily.GENERIC_MELODIC: CleanupProfile(28, 100, 0.08, False, 4, 0.32, 0.02),
}


def profile_for(instrument: InstrumentInfo) -> CleanupProfile:
    return PROFILES.get(instrument.family, PROFILES[InstrumentFamily.GENERIC_MELODIC])


def clean_notes(notes: List[Note], instrument: InstrumentInfo) -> List[Note]:
    """Apply the instrument's cleanup profile to a raw note list."""
    if instrument.is_percussion or not notes:
        return sorted(notes, key=lambda n: (n.onset, n.pitch))

    prof = profile_for(instrument)
    out = [n for n in notes if prof.min_pitch <= n.pitch <= prof.max_pitch]
    out = merge_fragments(out, prof.merge_gap)
    out = [n for n in out if n.duration >= prof.min_duration]

    if out:
        vel = np.array([n.velocity for n in out], dtype=float)
        floor = max(12.0, float(np.percentile(vel, 90)) * prof.relative_velocity_floor)
        out = [n for n in out if n.velocity >= floor]

    out = suppress_harmonics(out)
    if prof.monophonic:
        out = make_monophonic(out)
    else:
        out = limit_polyphony(out, prof.max_polyphony)
    return sorted(out, key=lambda n: (n.onset, n.pitch))


def merge_fragments(notes: List[Note], max_gap: float) -> List[Note]:
    """Join consecutive same-pitch notes separated by a tiny gap."""
    by_pitch: dict[int, list[Note]] = {}
    for n in sorted(notes, key=lambda n: n.onset):
        by_pitch.setdefault(n.pitch, []).append(n)

    merged: list[Note] = []
    for seq in by_pitch.values():
        cur = _copy(seq[0])
        for n in seq[1:]:
            # Only a *weak* continuation is a fragment; a note of similar or
            # greater strength right after is a genuine re-attack.
            if n.onset - cur.offset <= max_gap and n.velocity < 0.7 * cur.velocity:
                cur.offset = max(cur.offset, n.offset)
                cur.velocity = max(cur.velocity, n.velocity)
                cur.lyric = cur.lyric or n.lyric
            else:
                merged.append(cur)
                cur = _copy(n)
        merged.append(cur)
    return merged


def suppress_harmonics(notes: List[Note]) -> List[Note]:
    """Drop quiet notes that are just overtones of a louder simultaneous note.

    Pitch models often report the octave (+12), twelfth (+19) or double
    octave (+24) of a strong note as a separate, weaker note.
    """
    ordered = sorted(notes, key=lambda n: n.onset)
    drop: set[int] = set()
    for i, n in enumerate(ordered):
        for j in range(i - 1, -1, -1):
            m = ordered[j]
            if n.onset - m.onset > 2.0:
                break
            _check_pair(m, n, i, j, drop)
        for j in range(i + 1, len(ordered)):
            m = ordered[j]
            if m.onset - n.onset > 0.05:
                break
            _check_pair(m, n, i, j, drop)
    return [n for k, n in enumerate(ordered) if k not in drop]


def _check_pair(base: Note, cand: Note, cand_idx: int, base_idx: int, drop: set[int]) -> None:
    if base_idx in drop or (cand.pitch - base.pitch) not in (12, 19, 24, 28):
        return
    overlap = min(base.offset, cand.offset) - max(base.onset, cand.onset)
    if overlap <= 0.6 * cand.duration:
        return
    if abs(cand.onset - base.onset) < 0.08 and base.velocity >= cand.velocity * 1.15:
        drop.add(cand_idx)


def make_monophonic(notes: List[Note]) -> List[Note]:
    """Resolve overlaps so only one note sounds at a time.

    When two notes overlap substantially the weaker one (velocity × duration)
    is dropped; small overlaps are resolved by truncating the earlier note.
    """
    ordered = sorted(notes, key=lambda n: (n.onset, -n.velocity))
    result: list[Note] = []
    for n in ordered:
        n = _copy(n)
        if not result:
            result.append(n)
            continue
        prev = result[-1]
        if n.onset >= prev.offset:
            result.append(n)
            continue
        overlap = prev.offset - n.onset
        shorter = min(prev.duration, n.duration)
        if n.onset - prev.onset < 0.05 or overlap > 0.6 * shorter:
            # Essentially simultaneous → keep the more salient note.
            if _salience(n) > _salience(prev):
                n.lyric = n.lyric or prev.lyric
                result[-1] = n
            else:
                prev.lyric = prev.lyric or n.lyric
        else:
            prev.offset = n.onset
            result.append(n)
    return [n for n in result if n.offset > n.onset]


def limit_polyphony(notes: List[Note], max_voices: int, window: float = 0.035) -> List[Note]:
    """Keep at most ``max_voices`` notes per (near-)simultaneous onset group."""
    ordered = sorted(notes, key=lambda n: n.onset)
    kept: list[Note] = []
    i = 0
    while i < len(ordered):
        j = i
        while j < len(ordered) and ordered[j].onset - ordered[i].onset <= window:
            j += 1
        group = ordered[i:j]
        if len(group) > max_voices:
            group = sorted(group, key=_salience, reverse=True)[:max_voices]
        kept.extend(group)
        i = j
    return kept


def _salience(n: Note) -> float:
    return n.velocity * min(n.duration, 1.0)


def _copy(n: Note) -> Note:
    return Note(
        pitch=n.pitch,
        onset=n.onset,
        offset=n.offset,
        velocity=n.velocity,
        channel=n.channel,
        lyric=n.lyric,
    )
