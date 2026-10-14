"""Tests for AudioPreprocessor / BasicPreprocessor implementation."""

import struct
import wave
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import numpy as np

from ml_pipeline.config import PipelineConfig
from ml_pipeline.preprocessor import BasicPreprocessor


@pytest.fixture
def temp_wav(tmp_path: Path) -> Path:
    """Create a temporary valid 1-second stereo WAV file at 44100Hz."""
    file_path = tmp_path / "test_audio.wav"
    sample_rate = 44100
    num_channels = 2
    num_samples = sample_rate

    with wave.open(str(file_path), "wb") as wf:
        wf.setnchannels(num_channels)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        frames = struct.pack(f"<{num_samples * num_channels}h", *([0] * (num_samples * num_channels)))
        wf.writeframes(frames)

    return file_path


@pytest.fixture
def temp_mp3(tmp_path: Path) -> Path:
    """Create a dummy mp3 file."""
    file_path = tmp_path / "test_audio.mp3"
    file_path.write_bytes(b"DUMMY MP3 DATA CONTENT" * 1000)
    return file_path


class TestBasicPreprocessorValidation:
    """Test validation checks in BasicPreprocessor."""

    def test_file_not_found(self, tmp_path: Path) -> None:
        preprocessor = BasicPreprocessor()
        non_existent = tmp_path / "does_not_exist.mp3"
        with pytest.raises(FileNotFoundError, match="Audio file not found"):
            preprocessor.process(non_existent)

    def test_unsupported_format(self, tmp_path: Path) -> None:
        preprocessor = BasicPreprocessor()
        unsupported_file = tmp_path / "audio.txt"
        unsupported_file.write_text("not audio")
        with pytest.raises(ValueError, match="Unsupported audio format"):
            preprocessor.process(unsupported_file)

    def test_file_exceeds_max_size(self, tmp_path: Path) -> None:
        config = PipelineConfig(max_file_size_mb=1)  # 1 MB
        preprocessor = BasicPreprocessor(config=config)

        large_file = tmp_path / "large.mp3"
        # Write > 1MB of bytes
        large_file.write_bytes(b"0" * (1024 * 1024 + 100))

        with pytest.raises(ValueError, match="exceeds maximum"):
            preprocessor.process(large_file)


class TestBasicPreprocessorWav:
    """Test WAV file processing."""

    def test_process_wav_valid(self, temp_wav: Path) -> None:
        preprocessor = BasicPreprocessor()
        processed = preprocessor.process(temp_wav)

        assert processed.file_path == temp_wav
        assert processed.sample_rate == 44100
        assert processed.num_channels == 2
        assert abs(processed.duration - 1.0) < 0.01

    def test_process_wav_malformed_fallback(self, tmp_path: Path) -> None:
        preprocessor = BasicPreprocessor()
        malformed_wav = tmp_path / "malformed.wav"
        malformed_wav.write_bytes(b"RIFF invalid header data")

        processed = preprocessor.process(malformed_wav)

        assert processed.file_path == malformed_wav
        assert processed.sample_rate == preprocessor.config.sample_rate
        assert processed.duration == 0.0
        assert processed.num_channels == 2


class TestBasicPreprocessorNonWav:
    """Test non-WAV processing with librosa and fallback."""

    def test_process_non_wav_librosa_success_stereo(self, temp_mp3: Path) -> None:
        preprocessor = BasicPreprocessor()

        # Mock librosa load returning 2-channel stereo y with shape (2, 44100)
        y_mock = np.zeros((2, 44100))
        sr_mock = 44100

        with patch("librosa.load", return_value=(y_mock, sr_mock)) as mock_load, \
             patch("librosa.get_duration", return_value=1.0) as mock_get_duration:

            processed = preprocessor.process(temp_mp3)

            mock_load.assert_called_once_with(str(temp_mp3), sr=None, mono=False)
            mock_get_duration.assert_called_once_with(y=y_mock, sr=sr_mock)

            assert processed.file_path == temp_mp3
            assert processed.sample_rate == 44100
            assert processed.duration == 1.0
            assert processed.num_channels == 2

    def test_process_non_wav_librosa_success_mono(self, temp_mp3: Path) -> None:
        preprocessor = BasicPreprocessor()

        # Mock librosa load returning 1D mono array with shape (44100,)
        y_mock = np.zeros(44100)
        sr_mock = 22050

        with patch("librosa.load", return_value=(y_mock, sr_mock)), \
             patch("librosa.get_duration", return_value=2.0):

            processed = preprocessor.process(temp_mp3)

            assert processed.file_path == temp_mp3
            assert processed.sample_rate == 22050
            assert processed.duration == 2.0
            assert processed.num_channels == 1

    def test_process_non_wav_librosa_failure_fallback(self, temp_mp3: Path) -> None:
        preprocessor = BasicPreprocessor()

        with patch("librosa.load", side_effect=Exception("Failed to load audio")):
            processed = preprocessor.process(temp_mp3)

            assert processed.file_path == temp_mp3
            assert processed.sample_rate == preprocessor.config.sample_rate
            assert processed.num_channels == 2
            assert processed.duration > 0.0


class TestEstimateDuration:
    """Test heuristic duration estimation."""

    def test_estimate_duration_known_codecs(self, tmp_path: Path) -> None:
        preprocessor = BasicPreprocessor()
        test_file = tmp_path / "sample.mp3"
        # 192,000 bits per sec = 24,000 bytes per sec.
        # Write 24,000 bytes -> duration should be 1.0 second
        test_file.write_bytes(b"a" * 24000)

        duration = preprocessor._estimate_duration(test_file, ".mp3")
        assert duration == 1.0
