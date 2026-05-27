"""Audio source separation implementations.

Provides mock and real (Demucs) separators that split a mixed audio
file into individual instrument stems.
"""
from __future__ import annotations

import struct
import wave
from pathlib import Path
from typing import Dict

from ml_pipeline.config import PipelineConfig
from ml_pipeline.interfaces import AudioSeparator


class MockSeparator(AudioSeparator):
    """Mock separator that creates silent WAV placeholder stems.

    Useful for testing the pipeline end-to-end without requiring
    an actual source separation model.

    Attributes:
        config: Pipeline configuration.
        stem_names: Names of the stems to produce.
    """

    DEFAULT_STEMS = ("vocals", "drums", "bass", "other")

    def __init__(
        self,
        config: PipelineConfig | None = None,
        stem_names: tuple[str, ...] | None = None,
    ) -> None:
        self.config = config or PipelineConfig()
        self.stem_names = stem_names or self.DEFAULT_STEMS

    def separate(self, audio_path: Path) -> Dict[str, Path]:
        """Create silent WAV placeholder files for each stem.

        Args:
            audio_path: Path to the source audio file (used for naming).

        Returns:
            Dictionary mapping stem names to paths of generated silent WAVs.
        """
        audio_path = Path(audio_path)
        if not audio_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        self.config.ensure_directories()
        assert self.config.stems_dir is not None

        stems: Dict[str, Path] = {}
        for stem_name in self.stem_names:
            stem_path = self.config.stems_dir / f"{audio_path.stem}_{stem_name}.wav"
            self._create_silent_wav(stem_path, duration_seconds=16.0)
            stems[stem_name] = stem_path

        return stems

    @staticmethod
    def _create_silent_wav(
        path: Path,
        duration_seconds: float = 16.0,
        sample_rate: int = 44100,
        num_channels: int = 1,
    ) -> None:
        """Write a silent WAV file.

        Args:
            path: Output file path.
            duration_seconds: Duration of silence in seconds.
            sample_rate: Sample rate in Hz.
            num_channels: Number of audio channels.
        """
        num_frames = int(sample_rate * duration_seconds)
        silent_data = b"\x00\x00" * num_frames * num_channels  # 16-bit silence

        with wave.open(str(path), "wb") as wf:
            wf.setnchannels(num_channels)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(sample_rate)
            wf.writeframes(silent_data)


class DemucsSeparator(AudioSeparator):
    """Source separator using Meta's Demucs model.

    This class provides the interface structure for Demucs integration.
    The actual model loading and inference is not implemented yet.

    Attributes:
        config: Pipeline configuration.
        model_name: Name of the Demucs model to use.
    """

    def __init__(self, config: PipelineConfig | None = None) -> None:
        self.config = config or PipelineConfig()
        self.model_name = self.config.separator_model

    def separate(self, audio_path: Path) -> Dict[str, Path]:
        """Separate audio using the Demucs model.

        Args:
            audio_path: Path to the mixed audio file.

        Returns:
            Dictionary mapping stem names to separated audio file paths.

        Raises:
            NotImplementedError: Always — Demucs integration is not yet complete.
        """
        raise NotImplementedError(
            f"DemucsSeparator is not yet implemented. "
            f"To use real source separation, install demucs:\n"
            f"  pip install demucs\n"
            f"Model configured: {self.model_name}\n"
            f"For now, use MockSeparator for testing."
        )
