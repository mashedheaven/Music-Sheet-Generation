"""Tempo / beat detection and note quantization.

The key idea: notes are not quantized against a fixed clock starting at
t=0 but against the *detected beat grid* of the recording. Each detected
beat is a grid line, so the notation stays aligned with the music even when
the song does not start exactly on a beat or the tempo drifts slightly.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Optional, Sequence

import numpy as np

from ml_pipeline.config import PipelineConfig
from ml_pipeline.data_models import Note, TempoInfo
from ml_pipeline.interfaces import NoteQuantizer

logger = logging.getLogger(__name__)


class BeatGrid:
    """Monotonic mapping between seconds and (fractional) beat numbers.

    Built from the beat positions in a ``TempoInfo``. Beat ``0`` is the
    start of the first measure of the score. When fewer than two beat
    positions are available a constant-tempo grid anchored at
    ``tempo_info.beat_offset`` is used instead.
    """

    def __init__(self, tempo_info: TempoInfo) -> None:
        self.period = 60.0 / tempo_info.bpm
        beats = np.asarray(tempo_info.beat_positions, dtype=float)
        self.times: Optional[np.ndarray] = beats if beats.size >= 2 else None
        self.offset = float(tempo_info.beat_offset)

    def to_beats(self, t: float | np.ndarray) -> float | np.ndarray:
        if self.times is None:
            return (np.asarray(t) - self.offset) / self.period if isinstance(t, np.ndarray) else (t - self.offset) / self.period
        idx = np.arange(self.times.size, dtype=float)
        result = np.interp(t, self.times, idx)
        # Linear extrapolation outside the tracked range.
        first_p = self.times[1] - self.times[0]
        last_p = self.times[-1] - self.times[-2]
        result = np.where(np.asarray(t) < self.times[0], (np.asarray(t) - self.times[0]) / first_p, result)
        result = np.where(
            np.asarray(t) > self.times[-1],
            idx[-1] + (np.asarray(t) - self.times[-1]) / last_p,
            result,
        )
        return float(result) if np.ndim(result) == 0 else result

    def to_seconds(self, b: float | np.ndarray) -> float | np.ndarray:
        if self.times is None:
            return np.asarray(b) * self.period + self.offset if isinstance(b, np.ndarray) else b * self.period + self.offset
        idx = np.arange(self.times.size, dtype=float)
        result = np.interp(b, idx, self.times)
        first_p = self.times[1] - self.times[0]
        last_p = self.times[-1] - self.times[-2]
        bb = np.asarray(b, dtype=float)
        result = np.where(bb < 0, self.times[0] + bb * first_p, result)
        result = np.where(bb > idx[-1], self.times[-1] + (bb - idx[-1]) * last_p, result)
        return float(result) if np.ndim(result) == 0 else result


class SimpleQuantizer(NoteQuantizer):
    """Snap note onsets and offsets to the nearest grid position.

    The grid is a subdivision of the beat (16th notes by default) laid over
    the detected beat grid. Duplicate notes that collapse onto the same
    grid slot are merged.

    Attributes:
        config: Pipeline configuration containing quantization_grid.
    """

    def __init__(self, config: PipelineConfig | None = None) -> None:
        self.config = config or PipelineConfig()

    def subdivisions_per_beat(self, tempo_info: TempoInfo) -> float:
        """Grid steps per beat (e.g. 4 for 16ths in x/4 time)."""
        beat_fraction = 1.0 / tempo_info.time_signature_denominator
        return beat_fraction / self.config.quantization_grid

    def quantize(self, notes: List[Note], tempo_info: TempoInfo) -> List[Note]:
        """Snap all note onsets and offsets to the nearest grid position.

        For 120 BPM, 4/4 time, 16th note grid the grid interval is 0.125 s.
        Notes that become zero-length get a minimum duration of one grid unit.
        """
        if not notes:
            return []

        grid = BeatGrid(tempo_info)
        subdiv = self.subdivisions_per_beat(tempo_info)

        quantized: dict[tuple[int, float], Note] = {}
        for note in notes:
            on_b = round(grid.to_beats(note.onset) * subdiv) / subdiv
            off_b = round(grid.to_beats(note.offset) * subdiv) / subdiv
            if off_b <= on_b:
                off_b = on_b + 1.0 / subdiv
            q_onset = round(float(grid.to_seconds(on_b)), 10)
            q_offset = round(float(grid.to_seconds(off_b)), 10)
            if q_onset < 0:
                q_offset -= q_onset
                q_onset = 0.0

            key = (note.pitch, q_onset)
            existing = quantized.get(key)
            if existing is not None:
                # Same pitch on the same slot: keep one note, longest duration.
                existing.offset = max(existing.offset, q_offset)
                existing.velocity = max(existing.velocity, note.velocity)
                existing.lyric = existing.lyric or note.lyric
                continue
            quantized[key] = Note(
                pitch=note.pitch,
                onset=q_onset,
                offset=q_offset,
                velocity=note.velocity,
                channel=note.channel,
                lyric=note.lyric,
            )

        return sorted(quantized.values(), key=lambda n: (n.onset, n.pitch))

    def _compute_grid_interval(self, tempo_info: TempoInfo) -> float:
        """Duration of one grid unit in seconds (constant-tempo case)."""
        beat_duration = 60.0 / tempo_info.bpm
        whole_note_duration = beat_duration * tempo_info.time_signature_denominator
        return self.config.quantization_grid * whole_note_duration

    @staticmethod
    def _snap_to_grid(time_value: float, grid_interval: float) -> float:
        if grid_interval <= 0:
            return time_value
        return round(time_value / grid_interval) * grid_interval


# ── Tempo / beat detection ──────────────────────────────────────────────────


def _regularize_beats(beats: np.ndarray, period: float) -> np.ndarray:
    """Fill in missed beats and drop spurious ones so intervals stay sane."""
    if beats.size < 2:
        return beats
    out = [float(beats[0])]
    for b in beats[1:]:
        gap = b - out[-1]
        ratio = gap / period
        if len(out) == 1 and abs(ratio - round(ratio)) > 0.1:
            out[0] = float(b)  # irregular leading beat → drop it, re-extrapolated later
            continue
        if gap < period * 0.6:
            continue  # spurious extra beat
        n = int(round(gap / period))
        if n > 1:  # missed beats → interpolate
            prev = out[-1]
            out.extend(prev + k * gap / n for k in range(1, n))
        out.append(float(b))
    # Beat trackers are least reliable at the edges: drop an irregular last beat.
    if len(out) >= 3:
        ratio = (out[-1] - out[-2]) / period
        if abs(ratio - round(ratio)) > 0.1:
            out.pop()
    return np.asarray(out)


def _downbeat_phase(
    beats: np.ndarray, low_env: np.ndarray, env_times: np.ndarray, beats_per_bar: int
) -> int:
    """Guess which beat (mod beats_per_bar) is the downbeat.

    Downbeats in popular music usually carry the strongest low-frequency
    accent (kick drum / bass note), so we pick the phase with the most
    low-band onset energy.
    """
    if beats_per_bar <= 1 or beats.size < beats_per_bar * 2:
        return 0
    strength = np.interp(beats, env_times, low_env)
    scores = [strength[p::beats_per_bar].mean() for p in range(beats_per_bar)]
    return int(np.argmax(scores))


def detect_tempo(
    audio_path: Path,
    bpm_override: float | None = None,
    time_signature: Sequence[int] = (4, 4),
) -> TempoInfo:
    """Detect tempo, beat positions and bar alignment from audio.

    Returns a TempoInfo whose ``beat_positions`` start at a downbeat that
    lies at or before t=0, cover the whole file, and are suitable for
    building a :class:`BeatGrid`.
    """
    import librosa

    num, den = int(time_signature[0]), int(time_signature[1])
    y, sr = librosa.load(str(audio_path), sr=22050, mono=True)
    duration = y.size / sr
    hop = 512

    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop, aggregate=np.median)
    kwargs = {"bpm": float(bpm_override)} if bpm_override else {"start_bpm": 110.0}
    tempo, beats = librosa.beat.beat_track(
        onset_envelope=onset_env, sr=sr, hop_length=hop, units="time", tightness=120, **kwargs
    )
    tempo = float(np.atleast_1d(tempo)[0]) if np.size(tempo) else 120.0
    beats = np.asarray(beats, dtype=float)

    if beats.size >= 4:
        period = _fit_period(beats)
    else:
        period = 60.0 / (bpm_override or tempo or 120.0)

    # Keep the notated tempo in a readable range (avoid half/double-time).
    if not bpm_override:
        while 60.0 / period > 175:
            period *= 2
            beats = beats[::2]
        while 60.0 / period < 62:
            period /= 2
            if beats.size >= 2:
                mids = (beats[:-1] + beats[1:]) / 2
                beats = np.sort(np.concatenate([beats, mids]))

    beats = _regularize_beats(beats, period)
    if beats.size < 2:
        beats = np.arange(0.0, duration + period, period)

    # Extend the grid so it covers [0, duration] completely.
    beats = _extend_beats(beats, period, duration)

    # Bar alignment from low-frequency accents.
    mel = librosa.feature.melspectrogram(y=y, sr=sr, hop_length=hop, n_mels=64, fmax=8000)
    mel_freqs = librosa.mel_frequencies(n_mels=64, fmax=8000)
    low = mel[mel_freqs < 180]
    low_env = librosa.onset.onset_strength(S=librosa.power_to_db(low), sr=sr, hop_length=hop)
    env_times = librosa.times_like(low_env, sr=sr, hop_length=hop)
    phase = _downbeat_phase(beats, low_env, env_times, num)
    k = (num - phase) % num
    if k:
        first_p = beats[1] - beats[0]
        pre = beats[0] - first_p * np.arange(k, 0, -1)
        beats = np.concatenate([pre, beats])

    bpm = 60.0 / period
    logger.info("Detected tempo %.1f BPM, %d beats, downbeat phase %d", bpm, beats.size, phase)
    return TempoInfo(
        bpm=float(bpm_override or round(bpm, 2)),
        time_signature_numerator=num,
        time_signature_denominator=den,
        beat_positions=[round(float(b), 4) for b in beats],
        beat_offset=float(beats[0]),
    )


def _fit_period(beats: np.ndarray) -> float:
    """Beat period from a least-squares fit of beat time vs. beat index.

    Much more precise than the median interval, which is limited to the
    analysis frame resolution (e.g. 98 BPM would read as 99.4 BPM).
    """
    if beats.size < 3:
        return float(beats[1] - beats[0]) if beats.size == 2 else 0.5
    diffs = np.diff(beats)
    med = float(np.median(diffs))
    # Only fit over stretches without dropped/extra beats.
    idx = np.concatenate([[0], np.cumsum(np.maximum(1, np.round(diffs / med)))])
    slope, _ = np.polyfit(idx, beats, 1)
    return float(slope) if 0.5 * med < slope < 1.5 * med else med


def _extend_beats(beats: np.ndarray, period: float, end_time: float) -> np.ndarray:
    """Extrapolate a beat list so it starts at/before 0 and runs past end_time."""
    head = []
    t = beats[0] - period
    while t > -period:
        head.insert(0, t)
        t -= period
    tail = []
    t = beats[-1] + period
    while t < end_time + 4 * period:
        tail.append(t)
        t += period
    return np.concatenate([np.asarray(head), beats, np.asarray(tail)])


def _drum_downbeat_phase(beats: np.ndarray, kicks: list[float], snares: list[float], num: int) -> int:
    """Phase (0..num-1) of the bar line implied by kick-on-1 / snare-on-2-and-4."""
    if num not in (2, 4) or beats.size < 2:
        return 0
    idx = np.arange(beats.size, dtype=float)
    kb = np.round(np.interp(kicks, beats, idx)).astype(int) if kicks else np.array([], int)
    sb = np.round(np.interp(snares, beats, idx)).astype(int) if snares else np.array([], int)
    scores = []
    for phase in range(num):
        k = np.mod(kb - phase, num)
        sn = np.mod(sb - phase, num)
        scores.append(2.0 * np.sum(k == 0) + 0.5 * np.sum(k == 2 % num) + np.sum(sn % 2 == 1) - 0.5 * np.sum(sn % 2 == 0))
    return int(np.argmax(scores))


def refine_grid_with_drums(tempo_info: TempoInfo, drum_notes: Sequence[Note]) -> TempoInfo:
    """Re-derive the beat grid from the transcribed drum hits.

    Full-mix beat trackers often lock onto the off-beat (dance hi-hats!) or
    drift between on- and off-beat phases from section to section. Kick and
    snare hits are the most reliable markers of the pulse, so when enough of
    them are available we re-run beat tracking on an envelope built from
    those hits (keeping the detected tempo), then place the bar lines using
    the backbeat convention: kick on beat 1, snare on beats 2 and 4.
    """
    import librosa

    beats = np.asarray(tempo_info.beat_positions, dtype=float)
    num = tempo_info.time_signature_numerator
    kicks = sorted(n.onset for n in drum_notes if n.pitch in (35, 36))
    snares = sorted(n.onset for n in drum_notes if n.pitch in (37, 38, 39, 40))
    if beats.size < num * 2 or len(kicks) + len(snares) < 12:
        return tempo_info

    period = 60.0 / tempo_info.bpm
    end_time = float(beats[-1])
    fps = 100
    env = np.zeros(int(end_time * fps) + fps)
    weights = {35: 1.0, 36: 1.0, 37: 0.9, 38: 0.9, 39: 0.6, 40: 0.9, 42: 0.25, 44: 0.2, 46: 0.3, 49: 0.5, 51: 0.25}
    for n in drum_notes:
        i = int(round(n.onset * fps))
        if 0 <= i < env.size:
            env[i] += weights.get(n.pitch, 0.2) * (n.velocity / 127.0)
    # Small smoothing so near-misses still reinforce each other.
    kernel = np.exp(-0.5 * (np.arange(-4, 5) / 1.5) ** 2)
    env = np.convolve(env, kernel / kernel.sum(), mode="same")

    _, new_beats = librosa.beat.beat_track(
        onset_envelope=env, sr=fps * 128, hop_length=128, start_bpm=tempo_info.bpm,
        units="time", tightness=200, trim=False,
    )
    new_beats = np.asarray(new_beats, dtype=float)
    if new_beats.size < num * 2:
        return tempo_info
    new_period = _fit_period(new_beats)
    if abs(new_period - period) / period > 0.06:
        logger.info("Drum-based tempo disagrees with mix tempo; keeping the mix grid")
        return tempo_info
    period = new_period
    new_beats = _regularize_beats(new_beats, period)
    new_beats = _extend_beats(new_beats, period, end_time)

    phase = _drum_downbeat_phase(new_beats, kicks, snares, num)
    k = (num - phase) % num
    if k:
        new_beats = np.concatenate([new_beats[0] - period * np.arange(k, 0, -1), new_beats])

    logger.info("Re-derived beat grid from %d kick/snare hits (bar phase %d)", len(kicks) + len(snares), phase)
    return TempoInfo(
        bpm=tempo_info.bpm if tempo_info.bpm and abs(60.0 / period - tempo_info.bpm) < 0.5 else round(60.0 / period, 2),
        time_signature_numerator=num,
        time_signature_denominator=tempo_info.time_signature_denominator,
        beat_positions=[round(float(b), 4) for b in new_beats],
        beat_offset=float(new_beats[0]),
    )


def align_grid_to_onsets(
    tempo_info: TempoInfo, onsets: Sequence[float], subdivisions: float = 4.0
) -> TempoInfo:
    """Nudge the beat grid so transcribed onsets sit on grid lines.

    Beat trackers report beats slightly late (onset-envelope lag), while
    note detectors are usually accurate. We measure the typical offset of
    the transcribed onsets from the nearest grid line and shift the grid
    by it, which keeps notes from being rounded to the wrong 16th.
    """
    if len(onsets) < 8 or len(tempo_info.beat_positions) < 2:
        return tempo_info
    grid = BeatGrid(tempo_info)
    pos = np.asarray(grid.to_beats(np.asarray(onsets, dtype=float))) * subdivisions
    dev = pos - np.round(pos)  # in grid units, -0.5..0.5
    shift_units = float(np.median(dev))
    if abs(shift_units) < 0.05 or abs(shift_units) > 0.45:
        return tempo_info
    period = 60.0 / tempo_info.bpm
    shift_s = shift_units * period / subdivisions
    beats = [round(b + shift_s, 4) for b in tempo_info.beat_positions]
    logger.info("Aligned beat grid to note onsets (shift %.0f ms)", shift_s * 1000)
    return TempoInfo(
        bpm=tempo_info.bpm,
        time_signature_numerator=tempo_info.time_signature_numerator,
        time_signature_denominator=tempo_info.time_signature_denominator,
        beat_positions=beats,
        beat_offset=beats[0],
    )


def trim_leading_bars(tempo_info: TempoInfo, first_onset: float) -> TempoInfo:
    """Drop whole leading measures of silence from the beat grid.

    Keeps the score from starting with many empty bars when a song has a
    long quiet intro.
    """
    beats = tempo_info.beat_positions
    num = tempo_info.time_signature_numerator
    if len(beats) < num * 2:
        return tempo_info
    grid = BeatGrid(tempo_info)
    first_beat = float(grid.to_beats(max(0.0, first_onset)))
    # A note slightly *before* a bar line (detection jitter) still belongs to
    # that bar, hence the quarter-beat tolerance.
    bars_to_drop = int(np.floor((first_beat + 0.25) / num))
    if bars_to_drop <= 0:
        return tempo_info
    drop = bars_to_drop * num
    new_beats = beats[drop:]
    if len(new_beats) < 2:
        return tempo_info
    return TempoInfo(
        bpm=tempo_info.bpm,
        time_signature_numerator=num,
        time_signature_denominator=tempo_info.time_signature_denominator,
        beat_positions=new_beats,
        beat_offset=new_beats[0],
    )
