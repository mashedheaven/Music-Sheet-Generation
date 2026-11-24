"""Audio helpers shared across pipeline stages.

Everything here depends only on numpy / soundfile / ffmpeg so that the
pipeline keeps working even when the heavy ML packages are missing.
"""
from __future__ import annotations

import json
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Iterable, Optional

import numpy as np

logger = logging.getLogger(__name__)


# ── Loading / saving ────────────────────────────────────────────────────────


def load_audio(
    path: Path | str,
    sr: Optional[int] = None,
    mono: bool = False,
) -> tuple[np.ndarray, int]:
    """Load an audio file as float32.

    Returns ``(audio, sample_rate)`` where audio has shape ``(channels, samples)``
    (or ``(samples,)`` when ``mono=True``).

    Tries soundfile first (WAV/FLAC/OGG/MP3), and falls back to decoding
    through ffmpeg, which handles practically everything (M4A/AAC, etc).
    """
    import soundfile as sf

    path = Path(path)
    try:
        data, file_sr = sf.read(str(path), dtype="float32", always_2d=True)
        audio = data.T  # (channels, samples)
    except Exception as exc:  # noqa: BLE001 — any decode failure → try ffmpeg
        logger.info("soundfile could not decode %s (%s); using ffmpeg", path.name, exc)
        audio, file_sr = _load_with_ffmpeg(path)

    if mono and audio.ndim == 2:
        audio = audio.mean(axis=0)

    if sr is not None and sr != file_sr:
        import librosa

        audio = librosa.resample(audio, orig_sr=file_sr, target_sr=sr)
        file_sr = sr

    return np.ascontiguousarray(audio, dtype=np.float32), int(file_sr)


def _load_with_ffmpeg(path: Path) -> tuple[np.ndarray, int]:
    import soundfile as sf

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError(
            f"Cannot decode '{path.suffix}' audio: ffmpeg is not installed. "
            "Install ffmpeg or upload a WAV/FLAC file."
        )
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "decoded.wav"
        proc = subprocess.run(
            [ffmpeg, "-nostdin", "-y", "-i", str(path), "-vn", "-acodec", "pcm_s16le", str(out)],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0 or not out.exists():
            tail = (proc.stderr or "").strip().splitlines()[-1:] or ["unknown error"]
            raise RuntimeError(f"Could not decode audio file: {tail[0]}")
        data, sr = sf.read(str(out), dtype="float32", always_2d=True)
    return data.T, sr


def save_wav(path: Path | str, audio: np.ndarray, sr: int) -> Path:
    """Write float audio (channels, samples) or (samples,) as 16-bit WAV."""
    import soundfile as sf

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = audio.T if audio.ndim == 2 else audio
    peak = float(np.max(np.abs(data))) if data.size else 0.0
    if peak > 1.0:  # avoid clipping
        data = data / peak
    sf.write(str(path), data, sr, subtype="PCM_16")
    return path


# ── Waveform peaks ──────────────────────────────────────────────────────────


def compute_peaks(audio: np.ndarray, num_points: int = 800) -> list[float]:
    """Downsample audio into ``num_points`` normalized peak values (0..1)."""
    mono = audio.mean(axis=0) if audio.ndim == 2 else audio
    if mono.size == 0:
        return [0.0] * num_points
    mono = np.abs(mono)
    bucket = max(1, int(np.ceil(mono.size / num_points)))
    padded = np.pad(mono, (0, bucket * num_points - mono.size))
    peaks = padded.reshape(num_points, bucket).max(axis=1)
    top = float(peaks.max())
    if top > 0:
        peaks = peaks / top
    return [round(float(p), 3) for p in peaks]


def write_peaks(path: Path | str, audio: np.ndarray, sr: int, num_points: int = 800) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    duration = (audio.shape[-1] / sr) if sr else 0.0
    rms = float(np.sqrt(np.mean(np.square(audio)))) if audio.size else 0.0
    payload = {
        "duration": round(duration, 3),
        "rms": round(rms, 5),
        "peaks": compute_peaks(audio, num_points),
    }
    path.write_text(json.dumps(payload))
    return path


# ── Note synthesis (for "hear the transcription" previews) ──────────────────


def midi_to_hz(pitch: float) -> float:
    return 440.0 * 2.0 ** ((pitch - 69) / 12.0)


def synthesize_notes(
    notes: Iterable,
    duration: float,
    sr: int = 22050,
    percussion: bool = False,
    timbre: str = "keys",
) -> np.ndarray:
    """Render note events to a mono waveform with a light additive synth.

    The goal is not realism — it is to let a musician *hear* what the
    transcription contains so they can compare it with the original stem.
    """
    total = int(max(duration, 0.5) * sr) + sr  # one second tail
    out = np.zeros(total, dtype=np.float32)
    rng = np.random.default_rng(7)

    harmonics = {
        "keys": [(1, 1.0), (2, 0.45), (3, 0.2), (4, 0.1)],
        "bass": [(1, 1.0), (2, 0.6), (3, 0.25)],
        "voice": [(1, 1.0), (2, 0.25), (3, 0.12)],
    }.get(timbre, [(1, 1.0), (2, 0.4), (3, 0.15)])

    for n in notes:
        start = int(n.onset * sr)
        if start >= total:
            continue
        vel = max(0.15, min(1.0, n.velocity / 127.0))
        if percussion:
            seg = _drum_hit(n.pitch, sr, rng) * vel
        else:
            dur = max(0.08, n.offset - n.onset)
            length = int((dur + 0.08) * sr)
            t = np.arange(length) / sr
            f0 = midi_to_hz(n.pitch)
            seg = np.zeros(length, dtype=np.float32)
            for mult, amp in harmonics:
                if f0 * mult < sr / 2:
                    seg += amp * np.sin(2 * np.pi * f0 * mult * t)
            attack = min(int(0.01 * sr), length)
            env = np.ones(length, dtype=np.float32)
            env[:attack] = np.linspace(0, 1, attack)
            sustain_end = int(dur * sr)
            decay = np.exp(-t * (2.5 if timbre == "keys" else 1.2))
            env *= decay
            if sustain_end < length:
                env[sustain_end:] *= np.linspace(1, 0, length - sustain_end)
            seg = seg * env * vel * 0.25
        end = min(total, start + len(seg))
        out[start:end] += seg[: end - start]

    peak = float(np.max(np.abs(out))) if out.size else 0.0
    if peak > 0:
        out = out / peak * 0.8
    return out


def _drum_hit(pitch: int, sr: int, rng: np.random.Generator) -> np.ndarray:
    if pitch in (35, 36):  # kick: pitch-swept sine
        length = int(0.25 * sr)
        t = np.arange(length) / sr
        freq = 110 * np.exp(-t * 18) + 45
        phase = 2 * np.pi * np.cumsum(freq) / sr
        return (np.sin(phase) * np.exp(-t * 14)).astype(np.float32)
    if pitch in (38, 40, 37, 39):  # snare: noise + body
        length = int(0.2 * sr)
        t = np.arange(length) / sr
        noise = rng.standard_normal(length) * np.exp(-t * 22)
        body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30)
        return (0.6 * noise + 0.5 * body).astype(np.float32) * 0.7
    if pitch in (41, 43, 45, 47, 48, 50):  # toms
        length = int(0.3 * sr)
        t = np.arange(length) / sr
        base = {41: 90, 43: 100, 45: 120, 47: 140, 48: 160, 50: 180}.get(pitch, 130)
        return (np.sin(2 * np.pi * base * t) * np.exp(-t * 10)).astype(np.float32)
    # cymbals / hats: high-passed noise
    long = pitch in (49, 51, 52, 55, 57, 59, 46)
    length = int((0.6 if long else 0.06) * sr)
    t = np.arange(length) / sr
    noise = rng.standard_normal(length)
    noise = np.diff(noise, prepend=0.0)  # crude high-pass
    return (noise * np.exp(-t * (6 if long else 60)) * 0.35).astype(np.float32)
