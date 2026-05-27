"""Tests for the Music21ScoreGenerator.

Note: These tests require music21 to be installed.
They test that the score generator can produce valid MusicXML from mock data.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from ml_pipeline.config import PipelineConfig
from ml_pipeline.data_models import (
    InstrumentFamily,
    InstrumentInfo,
    InstrumentPart,
    Note,
    TempoInfo,
)


@pytest.fixture
def output_dir():
    """Create a temporary directory for test output."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def config(output_dir):
    """Create a pipeline config with temp output dir."""
    return PipelineConfig(output_dir=output_dir)


@pytest.fixture
def tempo():
    return TempoInfo(bpm=120.0, time_signature_numerator=4, time_signature_denominator=4)


@pytest.fixture
def piano_part():
    """A simple piano part with a C major chord progression."""
    info = InstrumentInfo(
        name="Piano", family=InstrumentFamily.KEYS,
        clef="treble", is_percussion=False, confidence=0.95,
    )
    notes = [
        # C major chord at beat 1
        Note(pitch=60, onset=0.0, offset=0.5, velocity=80),
        Note(pitch=64, onset=0.0, offset=0.5, velocity=80),
        Note(pitch=67, onset=0.0, offset=0.5, velocity=80),
        # F major chord at beat 2
        Note(pitch=65, onset=0.5, offset=1.0, velocity=80),
        Note(pitch=69, onset=0.5, offset=1.0, velocity=80),
        Note(pitch=72, onset=0.5, offset=1.0, velocity=80),
    ]
    return InstrumentPart(instrument_info=info, notes=notes)


@pytest.fixture
def bass_part():
    """A simple bass part."""
    info = InstrumentInfo(
        name="Bass", family=InstrumentFamily.BASS,
        clef="bass", is_percussion=False, confidence=0.9,
    )
    notes = [
        Note(pitch=36, onset=0.0, offset=0.5, velocity=90),
        Note(pitch=41, onset=0.5, offset=1.0, velocity=90),
    ]
    return InstrumentPart(instrument_info=info, notes=notes)


@pytest.fixture
def drum_part():
    """A simple drum part (kick-snare pattern)."""
    info = InstrumentInfo(
        name="Drum Kit", family=InstrumentFamily.DRUMS,
        clef="percussion", is_percussion=True, confidence=1.0,
    )
    notes = [
        Note(pitch=36, onset=0.0, offset=0.1, velocity=100),   # Kick
        Note(pitch=42, onset=0.0, offset=0.1, velocity=80),    # Hi-hat
        Note(pitch=38, onset=0.5, offset=0.6, velocity=100),   # Snare
        Note(pitch=42, onset=0.5, offset=0.6, velocity=80),    # Hi-hat
    ]
    return InstrumentPart(instrument_info=info, notes=notes)


class TestMusic21ScoreGenerator:
    """Tests for score generation using music21."""

    def test_generate_single_part(self, config, tempo, piano_part):
        """Should generate MusicXML and MIDI for a single piano part."""
        try:
            from ml_pipeline.score_generator import Music21ScoreGenerator
        except ImportError:
            pytest.skip("music21 not installed")

        generator = Music21ScoreGenerator(config=config, tempo_info=tempo)
        result = generator.generate([piano_part])

        assert result.musicxml_path is not None
        assert result.musicxml_path.exists()
        assert result.musicxml_path.suffix == ".musicxml"

        assert result.midi_path is not None
        assert result.midi_path.exists()
        assert result.midi_path.suffix == ".mid"

    def test_generate_multi_part(self, config, tempo, piano_part, bass_part, drum_part):
        """Should generate ensemble score with multiple instruments."""
        try:
            from ml_pipeline.score_generator import Music21ScoreGenerator
        except ImportError:
            pytest.skip("music21 not installed")

        generator = Music21ScoreGenerator(config=config, tempo_info=tempo)
        result = generator.generate([piano_part, bass_part, drum_part])

        assert result.musicxml_path is not None
        assert result.musicxml_path.exists()

        # Verify MusicXML contains instrument names
        content = result.musicxml_path.read_text()
        assert "Piano" in content or "piano" in content.lower()

    def test_generate_empty_parts(self, config, tempo):
        """Should handle empty instrument parts."""
        try:
            from ml_pipeline.score_generator import Music21ScoreGenerator
        except ImportError:
            pytest.skip("music21 not installed")

        info = InstrumentInfo(
            name="Empty", family=InstrumentFamily.GENERIC_MELODIC,
            clef="treble", is_percussion=False,
        )
        empty_part = InstrumentPart(instrument_info=info, notes=[])

        generator = Music21ScoreGenerator(config=config, tempo_info=tempo)
        result = generator.generate([empty_part])

        assert result.musicxml_path is not None
        assert result.musicxml_path.exists()

    def test_individual_part_files(self, config, tempo, piano_part, bass_part):
        """Should generate individual part files alongside ensemble score."""
        try:
            from ml_pipeline.score_generator import Music21ScoreGenerator
        except ImportError:
            pytest.skip("music21 not installed")

        generator = Music21ScoreGenerator(config=config, tempo_info=tempo)
        generator.generate([piano_part, bass_part])

        # Check individual files were created
        assert config.output_dir is not None
        files = list(config.output_dir.glob("*.musicxml"))
        assert len(files) >= 3  # ensemble + piano + bass
