"""Tests for AudioPreprocessor / BasicPreprocessor."""

from pathlib import Path
import wave
import pytest
import soundfile as sf
import numpy as np

from ml_pipeline.config import PipelineConfig
from ml_pipeline.preprocessor import BasicPreprocessor


@pytest.fixture
def preprocessor():
    config = PipelineConfig(
        supported_formats=[".wav", ".mp3", ".flac", ".ogg"],
        max_file_size_mb=10.0,
    )
    return BasicPreprocessor(config=config)


@pytest.fixture
def sample_wav_file(tmp_path: Path) -> Path:
    file_path = tmp_path / "test_sample.wav"
    sample_rate = 44100
    duration_sec = 1.0
    num_channels = 2
    num_frames = int(sample_rate * duration_sec)

    with wave.open(str(file_path), "wb") as wf:
        wf.setnchannels(num_channels)
        wf.setsampwidth(2)  # 16-bit PCM
        wf.setframerate(sample_rate)
        raw_data = b"\x00\x00" * num_channels * num_frames
        wf.writeframes(raw_data)

    return file_path


@pytest.fixture
def sample_flac_file(tmp_path: Path) -> Path:
    file_path = tmp_path / "test_sample.flac"
    sample_rate = 22050
    duration_sec = 1.5
    num_frames = int(sample_rate * duration_sec)
    # Generate stereo audio data
    audio_data = np.zeros((num_frames, 2), dtype=np.float32)
    sf.write(file_path, audio_data, sample_rate)
    return file_path


def test_process_nonexistent_file(preprocessor: BasicPreprocessor, tmp_path: Path):
    non_existent = tmp_path / "does_not_exist.mp3"
    with pytest.raises(FileNotFoundError):
        preprocessor.process(non_existent)


def test_process_unsupported_format(preprocessor: BasicPreprocessor, tmp_path: Path):
    unsupported_file = tmp_path / "test.xyz"
    unsupported_file.write_bytes(b"dummy data")
    with pytest.raises(ValueError, match="Unsupported audio format"):
        preprocessor.process(unsupported_file)


def test_process_file_too_large(tmp_path: Path):
    config = PipelineConfig(max_file_size_mb=0.0001)  # Very small limit
    preprocessor = BasicPreprocessor(config=config)
    large_file = tmp_path / "large_test.mp3"
    large_file.write_bytes(b"x" * 200)

    with pytest.raises(ValueError, match="exceeds maximum"):
        preprocessor.process(large_file)


def test_process_wav_metadata(preprocessor: BasicPreprocessor, sample_wav_file: Path):
    processed = preprocessor.process(sample_wav_file)

    assert processed.file_path == sample_wav_file
    assert processed.sample_rate == 44100
    assert processed.num_channels == 2
    assert pytest.approx(processed.duration, abs=0.01) == 1.0


def test_process_non_wav_metadata_librosa(
    preprocessor: BasicPreprocessor, sample_flac_file: Path
):
    processed = preprocessor.process(sample_flac_file)

    assert processed.file_path == sample_flac_file
    assert processed.sample_rate == 22050
    assert processed.num_channels == 2
    assert pytest.approx(processed.duration, abs=0.01) == 1.5


def test_process_non_wav_fallback_on_error(
    preprocessor: BasicPreprocessor, tmp_path: Path
):
    corrupt_mp3 = tmp_path / "corrupt.mp3"
    corrupt_mp3.write_bytes(b"invalid mp3 header and content")

    processed = preprocessor.process(corrupt_mp3)

    assert processed.file_path == corrupt_mp3
    assert processed.sample_rate == preprocessor.config.sample_rate
    assert processed.num_channels == 2
    assert processed.duration > 0  # Fallback duration estimation calculated
