"""Tests for audio preprocessor and metadata extraction."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
import soundfile as sf

from ml_pipeline.config import PipelineConfig
from ml_pipeline.preprocessor import BasicPreprocessor


def test_process_non_wav_flac_file(tmp_path: Path) -> None:
    """Test metadata extraction from a real non-WAV (FLAC) audio file."""
    audio_path = tmp_path / "test_stereo.flac"
    sample_rate = 22050
    duration_sec = 2.0
    num_samples = int(sample_rate * duration_sec)

    # Create 2-channel stereo audio signal
    stereo_data = np.zeros((num_samples, 2), dtype=np.float32)
    sf.write(str(audio_path), stereo_data, sample_rate)

    preprocessor = BasicPreprocessor()
    processed = preprocessor.process(audio_path)

    assert processed.file_path == audio_path
    assert processed.sample_rate == sample_rate
    assert pytest.approx(processed.duration, abs=0.01) == duration_sec
    assert processed.num_channels == 2


def test_process_non_wav_mono_file(tmp_path: Path) -> None:
    """Test metadata extraction from a mono FLAC file."""
    audio_path = tmp_path / "test_mono.flac"
    sample_rate = 16000
    duration_sec = 1.5
    num_samples = int(sample_rate * duration_sec)

    mono_data = np.zeros(num_samples, dtype=np.float32)
    sf.write(str(audio_path), mono_data, sample_rate)

    preprocessor = BasicPreprocessor()
    processed = preprocessor.process(audio_path)

    assert processed.file_path == audio_path
    assert processed.sample_rate == sample_rate
    assert pytest.approx(processed.duration, abs=0.01) == duration_sec
    assert processed.num_channels == 1


@patch("ml_pipeline.preprocessor.librosa.load")
@patch("ml_pipeline.preprocessor.librosa.get_duration")
def test_process_non_wav_with_mocks(
    mock_get_duration: MagicMock, mock_load: MagicMock, tmp_path: Path
) -> None:
    """Test non-WAV processing using librosa mocks for formats like MP3."""
    audio_path = tmp_path / "test.mp3"
    audio_path.write_bytes(b"dummy mp3 data")

    mock_signal = np.zeros((2, 44100), dtype=np.float32)
    mock_load.return_value = (mock_signal, 44100)
    mock_get_duration.return_value = 1.0

    preprocessor = BasicPreprocessor()
    processed = preprocessor.process(audio_path)

    mock_load.assert_called_once_with(str(audio_path), sr=None, mono=False)
    mock_get_duration.assert_called_once_with(y=mock_signal, sr=44100)

    assert processed.file_path == audio_path
    assert processed.sample_rate == 44100
    assert processed.duration == 1.0
    assert processed.num_channels == 2


@patch("ml_pipeline.preprocessor.librosa.load")
def test_process_non_wav_librosa_exception_fallback(
    mock_load: MagicMock, tmp_path: Path
) -> None:
    """Test that librosa failure falls back gracefully to stub metadata."""
    audio_path = tmp_path / "corrupted.mp3"
    audio_path.write_bytes(b"corrupted mp3 content")

    mock_load.side_effect = RuntimeError("Librosa decode error")

    config = PipelineConfig(sample_rate=44100)
    preprocessor = BasicPreprocessor(config=config)
    processed = preprocessor.process(audio_path)

    assert processed.file_path == audio_path
    assert processed.sample_rate == 44100
    assert processed.duration > 0  # estimated duration
    assert processed.num_channels == 2


def test_process_validation_errors(tmp_path: Path) -> None:
    """Test file validation error handling."""
    preprocessor = BasicPreprocessor()

    # File not found
    with pytest.raises(FileNotFoundError):
        preprocessor.process(tmp_path / "non_existent.mp3")

    # Unsupported format
    unsupported_file = tmp_path / "test.txt"
    unsupported_file.write_bytes(b"text file")
    with pytest.raises(ValueError, match="Unsupported audio format"):
        preprocessor.process(unsupported_file)
