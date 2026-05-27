"""Audio preprocessor implementation.

Validates audio files and prepares metadata for downstream processing.
Architected for easy integration with librosa for actual audio processing.
"""
from __future__ import annotations

import struct
import wave
from pathlib import Path

from ml_pipeline.config import PipelineConfig
from ml_pipeline.data_models import ProcessedAudio
from ml_pipeline.interfaces import AudioPreprocessor


class BasicPreprocessor(AudioPreprocessor):
    """Preprocessor that validates files and extracts basic metadata.

    Currently performs file validation and metadata extraction without
    actual audio resampling or normalization. Designed so that librosa
    can be plugged in later for full audio processing.

    Attributes:
        config: Pipeline configuration with format and size constraints.
    """

    def __init__(self, config: PipelineConfig | None = None) -> None:
        self.config = config or PipelineConfig()

    def process(self, audio_path: Path) -> ProcessedAudio:
        """Validate an audio file and return its metadata.

        Checks that the file exists, has a supported format, and is within
        the size limit. For WAV files, reads actual metadata from headers.
        For other formats, returns reasonable defaults (to be replaced with
        librosa-based metadata extraction later).

        Args:
            audio_path: Path to the audio file to preprocess.

        Returns:
            ProcessedAudio with file metadata.

        Raises:
            FileNotFoundError: If audio_path does not exist.
            ValueError: If format is unsupported or file exceeds size limit.
        """
        audio_path = Path(audio_path)

        # --- Validation ---
        if not audio_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        suffix = audio_path.suffix.lower()
        if suffix not in self.config.supported_formats:
            raise ValueError(
                f"Unsupported audio format '{suffix}'. "
                f"Supported: {self.config.supported_formats}"
            )

        file_size = audio_path.stat().st_size
        if file_size > self.config.max_file_size_bytes:
            raise ValueError(
                f"File size ({file_size / (1024*1024):.1f} MB) exceeds "
                f"maximum ({self.config.max_file_size_mb} MB)"
            )

        # --- Metadata extraction ---
        if suffix == ".wav":
            return self._process_wav(audio_path)

        # For non-WAV formats, return stub metadata.
        # TODO: Use librosa.load() and librosa.get_duration() here.
        return ProcessedAudio(
            file_path=audio_path,
            sample_rate=self.config.sample_rate,
            duration=self._estimate_duration(audio_path, suffix),
            num_channels=2,
        )

    def _process_wav(self, audio_path: Path) -> ProcessedAudio:
        """Extract real metadata from a WAV file header.

        Args:
            audio_path: Path to a .wav file.

        Returns:
            ProcessedAudio with actual WAV metadata.
        """
        try:
            with wave.open(str(audio_path), "rb") as wf:
                sample_rate = wf.getframerate()
                num_channels = wf.getnchannels()
                num_frames = wf.getnframes()
                duration = num_frames / sample_rate if sample_rate > 0 else 0.0
        except wave.Error:
            # Fallback for malformed WAV files
            return ProcessedAudio(
                file_path=audio_path,
                sample_rate=self.config.sample_rate,
                duration=0.0,
                num_channels=2,
            )

        return ProcessedAudio(
            file_path=audio_path,
            sample_rate=sample_rate,
            duration=duration,
            num_channels=num_channels,
        )

    @staticmethod
    def _estimate_duration(audio_path: Path, suffix: str) -> float:
        """Estimate audio duration from file size and format.

        This is a rough heuristic. Real implementations should use librosa.

        Args:
            audio_path: Path to the audio file.
            suffix: File extension (e.g. ".mp3").

        Returns:
            Estimated duration in seconds.
        """
        file_size = audio_path.stat().st_size

        # Rough bitrate estimates for common formats
        bitrate_estimates: dict[str, int] = {
            ".mp3": 192_000,   # 192 kbps
            ".flac": 800_000,  # ~800 kbps
            ".ogg": 160_000,   # 160 kbps
            ".m4a": 256_000,   # 256 kbps
        }

        bitrate = bitrate_estimates.get(suffix, 256_000)
        return (file_size * 8) / bitrate  # bits / bits_per_second = seconds
