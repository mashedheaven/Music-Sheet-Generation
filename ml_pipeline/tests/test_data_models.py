"""Tests for ml_pipeline data models."""
from __future__ import annotations

from ml_pipeline.data_models import (
    InstrumentFamily,
    InstrumentInfo,
    InstrumentPart,
    Note,
    PipelineProgress,
    PipelineResult,
    PipelineStage,
    ProcessedAudio,
    ScoreOutput,
    StemResult,
    TempoInfo,
    TranscriptionResult,
)
from pathlib import Path


class TestNote:
    def test_create_note(self):
        n = Note(pitch=60, onset=0.0, offset=0.5, velocity=100, channel=0)
        assert n.pitch == 60
        assert n.onset == 0.0
        assert n.offset == 0.5
        assert n.velocity == 100

    def test_note_duration(self):
        n = Note(pitch=60, onset=1.0, offset=2.5, velocity=80)
        assert n.duration == 1.5

    def test_note_defaults(self):
        n = Note(pitch=72, onset=0.0, offset=1.0)
        assert n.velocity == 80
        assert n.channel == 0


class TestInstrumentInfo:
    def test_create_instrument(self):
        info = InstrumentInfo(
            name="Piano",
            family=InstrumentFamily.KEYS,
            clef="treble",
            is_percussion=False,
            confidence=0.95,
        )
        assert info.name == "Piano"
        assert info.family == InstrumentFamily.KEYS
        assert info.is_percussion is False

    def test_percussion_instrument(self):
        info = InstrumentInfo(
            name="Drum Kit",
            family=InstrumentFamily.DRUMS,
            clef="percussion",
            is_percussion=True,
            confidence=1.0,
        )
        assert info.is_percussion is True
        assert info.clef == "percussion"


class TestTempoInfo:
    def test_defaults(self):
        t = TempoInfo()
        assert t.bpm == 120.0
        assert t.time_signature_numerator == 4
        assert t.time_signature_denominator == 4

    def test_custom_tempo(self):
        t = TempoInfo(bpm=140.0, time_signature_numerator=3, time_signature_denominator=4)
        assert t.bpm == 140.0
        assert t.time_signature_numerator == 3


class TestInstrumentFamily:
    def test_all_families(self):
        families = list(InstrumentFamily)
        assert InstrumentFamily.VOCALS in families
        assert InstrumentFamily.DRUMS in families
        assert InstrumentFamily.BASS in families
        assert InstrumentFamily.GUITAR in families
        assert InstrumentFamily.KEYS in families

    def test_family_values(self):
        assert InstrumentFamily.VOCALS.value == "vocals"
        assert InstrumentFamily.DRUMS.value == "drums"


class TestPipelineStage:
    def test_all_stages(self):
        stages = list(PipelineStage)
        assert len(stages) >= 7  # All defined stages
        assert PipelineStage.PREPROCESSING in stages
        assert PipelineStage.COMPLETE in stages
        assert PipelineStage.FAILED in stages


class TestPipelineProgress:
    def test_create_progress(self):
        p = PipelineProgress(
            stage=PipelineStage.SEPARATING,
            progress=0.5,
            message="Separating stems...",
        )
        assert p.stage == PipelineStage.SEPARATING
        assert p.progress == 0.5


class TestPipelineResult:
    def test_empty_result(self):
        r = PipelineResult(stems=[], ensemble_score=None, metadata={})
        assert len(r.stems) == 0
        assert r.ensemble_score is None

    def test_result_with_stems(self):
        info = InstrumentInfo(
            name="Bass", family=InstrumentFamily.BASS,
            clef="bass", is_percussion=False, confidence=0.9,
        )
        stem = StemResult(
            instrument_info=info,
            audio_path=Path("/tmp/bass.wav"),
        )
        r = PipelineResult(
            stems=[stem],
            ensemble_score=None,
            metadata={"test": True},
        )
        assert len(r.stems) == 1
        assert r.stems[0].instrument_info.name == "Bass"


class TestTranscriptionResult:
    def test_create(self):
        notes = [
            Note(pitch=60, onset=0.0, offset=0.5),
            Note(pitch=64, onset=0.5, offset=1.0),
        ]
        info = InstrumentInfo(
            name="Piano", family=InstrumentFamily.KEYS,
            clef="treble", is_percussion=False, confidence=0.8,
        )
        tempo = TempoInfo(bpm=120.0)
        result = TranscriptionResult(
            notes=notes, instrument=info, tempo_info=tempo,
        )
        assert len(result.notes) == 2
        assert result.tempo_info.bpm == 120.0
