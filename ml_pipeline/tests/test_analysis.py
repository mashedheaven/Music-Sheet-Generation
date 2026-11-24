"""Tests for key detection, spelling, note cleanup, beat grid, lyrics and drums."""
from __future__ import annotations

import numpy as np
import pytest

from ml_pipeline.data_models import InstrumentFamily, InstrumentInfo, Note, TempoInfo
from ml_pipeline.music_theory import KeyEstimate, estimate_key, spell_pitch
from ml_pipeline.note_cleanup import clean_notes, make_monophonic, merge_fragments, suppress_harmonics
from ml_pipeline.quantizer import BeatGrid, SimpleQuantizer, trim_leading_bars
from ml_pipeline.config import PipelineConfig
from ml_pipeline.transcriber import align_lyrics


# ── music theory ────────────────────────────────────────────────────────────

def _scale_notes(tonic: int, steps: list[int]):
    return [((tonic + s) % 12) + 60 for s in steps]


@pytest.mark.parametrize("tonic,name", [(0, "C major"), (7, "G major"), (5, "F major"), (10, "Bb major")])
def test_estimate_major_keys(tonic, name):
    pitches = _scale_notes(tonic, [0, 2, 4, 5, 7, 9, 11]) + _scale_notes(tonic, [0, 4, 7]) * 3
    assert estimate_key((p, 1.0) for p in pitches).name == name


def test_estimate_minor_key():
    pitches = _scale_notes(9, [0, 2, 3, 5, 7, 8, 10]) + _scale_notes(9, [0, 3, 7]) * 4
    assert estimate_key((p, 1.0) for p in pitches).name == "A minor"


def test_spelling_follows_key():
    f_major = KeyEstimate(5, "major", 1.0)
    assert spell_pitch(70, f_major) == ("B", -1, 4)  # Bb4 not A#4
    e_major = KeyEstimate(4, "major", 1.0)
    assert spell_pitch(68, e_major) == ("G", 1, 4)  # G#4 not Ab4
    assert KeyEstimate(2, "major", 1.0).sharps == 2
    assert KeyEstimate(5, "major", 1.0).sharps == -1


# ── cleanup ─────────────────────────────────────────────────────────────────

VOCALS = InstrumentInfo("Vocals", InstrumentFamily.VOCALS)


def test_repeated_notes_are_not_merged_but_weak_fragments_are():
    reattack = [Note(60, 0.0, 0.5, 90), Note(60, 0.5, 1.0, 85)]
    assert len(merge_fragments(reattack, 0.03)) == 2
    fragment = [Note(60, 0.0, 0.5, 90), Note(60, 0.51, 1.0, 30)]
    assert len(merge_fragments(fragment, 0.03)) == 1


def test_monophonic_keeps_one_note_at_a_time():
    notes = [Note(60, 0.0, 1.0, 100), Note(64, 0.02, 1.0, 40), Note(67, 0.8, 1.5, 90)]
    out = make_monophonic(notes)
    assert [n.pitch for n in out] == [60, 67]
    assert out[0].offset == pytest.approx(0.8)


def test_octave_harmonic_is_suppressed():
    notes = [Note(48, 0.0, 1.0, 100), Note(60, 0.01, 1.0, 50)]
    assert [n.pitch for n in suppress_harmonics(notes)] == [48]


def test_clean_notes_drops_blips_and_out_of_range():
    notes = [Note(60, 0.0, 0.5, 90), Note(62, 1.0, 1.02, 90), Note(20, 2.0, 3.0, 90)]
    assert [n.pitch for n in clean_notes(notes, VOCALS)] == [60]


# ── beat grid ───────────────────────────────────────────────────────────────

def test_beat_grid_quantizes_to_detected_beats():
    beats = [0.3 + i * 0.6 for i in range(20)]  # 100 BPM, first beat at 0.3 s
    tempo = TempoInfo(bpm=100, beat_positions=beats, beat_offset=0.3)
    grid = BeatGrid(tempo)
    assert grid.to_beats(0.3) == pytest.approx(0)
    assert grid.to_seconds(2.5) == pytest.approx(1.8)
    q = SimpleQuantizer(PipelineConfig(quantization_grid=0.0625)).quantize([Note(60, 0.93, 1.21)], tempo)
    assert q[0].onset == pytest.approx(0.9)  # beat 1
    assert q[0].offset == pytest.approx(1.2)  # beat 1.5


def test_trim_leading_bars():
    beats = [i * 0.5 for i in range(40)]
    tempo = TempoInfo(bpm=120, beat_positions=beats)
    trimmed = trim_leading_bars(tempo, first_onset=4.05)  # beat 8.1 → drop two bars
    assert trimmed.beat_positions[0] == pytest.approx(4.0)


# ── lyrics (adapted from PR #22) ────────────────────────────────────────────

def test_align_lyrics_assigns_nearest_free_note():
    notes = [Note(60, t, t + 0.4) for t in (0.0, 0.5, 1.0, 3.0)]
    words = [{"word": " hel", "start": 0.05}, {"word": "lo", "start": 0.45}, {"word": "far", "start": 2.0}]
    out = align_lyrics(notes, words)
    assert [n.lyric for n in out] == ["hel", "lo", None, None]


# ── drums ───────────────────────────────────────────────────────────────────

def test_drum_classifier_on_synthetic_kit(tmp_path):
    import soundfile as sf

    from ml_pipeline.transcriber import DrumTranscriber

    sr = 44100
    beat = 0.5
    y = np.zeros(int(sr * 4.5))
    rng = np.random.default_rng(0)
    for b in range(8):
        i = int((0.25 + b * beat) * sr)
        t = np.arange(int(0.2 * sr)) / sr
        if b % 2 == 0:  # kick
            sig = np.sin(2 * np.pi * np.cumsum(50 + 90 * np.exp(-t * 20)) / sr) * np.exp(-t * 12)
        else:  # snare
            sig = rng.standard_normal(t.size) * np.exp(-t * 20) * 0.5 + np.sin(2 * np.pi * 200 * t) * np.exp(-t * 25)
        y[i:i + sig.size] += sig
    path = tmp_path / "drums.wav"
    sf.write(path, y * 0.5, sr)
    info = InstrumentInfo("Drum Kit", InstrumentFamily.DRUMS, "percussion", True)
    notes = DrumTranscriber().transcribe(path, info).notes
    kicks = [n for n in notes if n.pitch == 36]
    snares = [n for n in notes if n.pitch == 38]
    assert len(kicks) == 4 and len(snares) == 4
    assert all(round((n.onset - 0.25) / beat) % 2 == 0 for n in kicks)
