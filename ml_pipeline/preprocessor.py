"""Audio preprocessor implementation.

Validates the upload, decodes any supported format (via soundfile or
ffmpeg), and writes a normalized 44.1 kHz stereo WAV that every later
stage can read reliably.
"""
from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from ml_pipeline.config import PipelineConfig
from ml_pipeline.data_models import ProcessedAudio
from ml_pipeline.interfaces import AudioPreprocessor

logger = logging.getLogger(__name__)


class BasicPreprocessor(AudioPreprocessor):
    """Validates, decodes and normalizes the input audio.

    Attributes:
        config: Pipeline configuration with format and size constraints.
    """

    def __init__(self, config: PipelineConfig | None = None) -> None:
        self.config = config or PipelineConfig()

    def validate(self, audio_path: Path) -> None:
        """Raise if the file is missing, unsupported or too large."""
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
        if file_size == 0:
            raise ValueError("The uploaded file is empty.")

    def process(self, audio_path: Path) -> ProcessedAudio:
        """Validate and decode the audio, returning a normalized WAV.

        Raises:
            FileNotFoundError: If audio_path does not exist.
            ValueError: If the format is unsupported, the file is too large,
                too long, or contains only silence.
        """
        from ml_pipeline.audio_utils import load_audio, save_wav

        audio_path = Path(audio_path)
        self.validate(audio_path)

        audio, sr = load_audio(audio_path)
        if audio.shape[-1] == 0:
            raise ValueError("The audio file contains no samples.")

        duration = audio.shape[-1] / sr
        if duration > self.config.max_duration_seconds:
            raise ValueError(
                f"Audio is {duration/60:.1f} minutes long; the maximum is "
                f"{self.config.max_duration_seconds/60:.0f} minutes."
            )

        peak = float(np.max(np.abs(audio)))
        if peak < 1e-4:
            raise ValueError("The audio file appears to be silent.")

        # Normalize to stereo 44.1 kHz with -1 dBFS headroom.
        if audio.shape[0] == 1:
            audio = np.vstack([audio, audio])
        elif audio.shape[0] > 2:
            audio = audio[:2]
        if sr != self.config.sample_rate:
            import librosa

            audio = librosa.resample(audio, orig_sr=sr, target_sr=self.config.sample_rate)
            sr = self.config.sample_rate
        audio = audio / peak * 0.89

        self.config.ensure_directories()
        assert self.config.stems_dir is not None
        out_path = self.config.stems_dir / "_mix.wav"
        save_wav(out_path, audio, sr)

        logger.info("Preprocessed %s → %s (%.1fs)", audio_path.name, out_path.name, duration)
        return ProcessedAudio(
            file_path=out_path,
            sample_rate=sr,
            duration=duration,
            num_channels=2,
        )
