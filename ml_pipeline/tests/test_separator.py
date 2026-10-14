"""Tests for audio separation implementations."""
from __future__ import annotations

import wave
from pathlib import Path

import pytest

from ml_pipeline.config import PipelineConfig
from ml_pipeline.separator import MockSeparator


class TestMockSeparator:
    """Tests for MockSeparator functionality."""

    def test_separate_default_stems(self, tmp_path: Path):
        """MockSeparator should split audio file into default stems as silent WAVs."""
        output_dir = tmp_path / "output"
        config = PipelineConfig(output_dir=output_dir)
        separator = MockSeparator(config=config)

        # Create dummy audio file
        audio_file = tmp_path / "song.mp3"
        audio_file.write_bytes(b"dummy audio content")

        result = separator.separate(audio_file)

        # Check returned dictionary keys match default stems
        assert set(result.keys()) == set(MockSeparator.DEFAULT_STEMS)

        # Check each generated file
        for stem_name in MockSeparator.DEFAULT_STEMS:
            stem_path = result[stem_name]
            assert stem_path.exists()
            assert stem_path.parent == config.stems_dir
            assert stem_path.name == f"song_{stem_name}.wav"

            # Verify WAV file properties
            with wave.open(str(stem_path), "rb") as wf:
                assert wf.getnchannels() == 1
                assert wf.getsampwidth() == 2  # 16-bit
                assert wf.getframerate() == 44100
                assert wf.getnframes() == int(44100 * 16.0)

    def test_separate_custom_stems(self, tmp_path: Path):
        """MockSeparator should honor custom stem names passed to constructor."""
        config = PipelineConfig(output_dir=tmp_path / "output")
        custom_stems = ("vocals", "guitar", "synths")
        separator = MockSeparator(config=config, stem_names=custom_stems)

        audio_file = tmp_path / "track.wav"
        audio_file.write_bytes(b"dummy wav data")

        result = separator.separate(audio_file)

        assert set(result.keys()) == set(custom_stems)
        for stem_name in custom_stems:
            stem_path = result[stem_name]
            assert stem_path.exists()
            assert stem_path.name == f"track_{stem_name}.wav"

    def test_separate_string_path_input(self, tmp_path: Path):
        """MockSeparator should handle string file paths correctly."""
        config = PipelineConfig(output_dir=tmp_path / "output")
        separator = MockSeparator(config=config)

        audio_file = tmp_path / "sample.flac"
        audio_file.write_bytes(b"dummy flac data")

        # Pass string instead of Path object
        result = separator.separate(str(audio_file))

        assert len(result) == len(MockSeparator.DEFAULT_STEMS)
        for stem_path in result.values():
            assert stem_path.exists()

    def test_separate_nonexistent_file_raises_error(self, tmp_path: Path):
        """MockSeparator should raise FileNotFoundError if audio file does not exist."""
        separator = MockSeparator()
        non_existent_file = tmp_path / "does_not_exist.mp3"

        with pytest.raises(FileNotFoundError, match="Audio file not found"):
            separator.separate(non_existent_file)

    def test_create_silent_wav_custom_parameters(self, tmp_path: Path):
        """_create_silent_wav should create a valid WAV file with specified properties."""
        out_wav = tmp_path / "custom_silence.wav"
        duration = 2.5
        sample_rate = 22050
        num_channels = 2

        MockSeparator._create_silent_wav(
            path=out_wav,
            duration_seconds=duration,
            sample_rate=sample_rate,
            num_channels=num_channels,
        )

        assert out_wav.exists()
        with wave.open(str(out_wav), "rb") as wf:
            assert wf.getnchannels() == num_channels
            assert wf.getsampwidth() == 2
            assert wf.getframerate() == sample_rate
            assert wf.getnframes() == int(sample_rate * duration)
