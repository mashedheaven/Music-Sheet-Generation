"""Configuration for the ML audio transcription pipeline.

Provides a central configuration dataclass with sensible defaults
for all pipeline parameters.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

#: Human-friendly names accepted for the rhythmic grid.
GRID_PRESETS: dict[str, float] = {
    "quarter": 0.25,
    "eighth": 0.125,
    "sixteenth": 0.0625,
}


@dataclass
class PipelineConfig:
    """Central configuration for the audio transcription pipeline.

    Attributes:
        sample_rate: Target sample rate in Hz for audio processing.
        max_duration_seconds: Maximum allowed audio duration in seconds.
        quantization_grid: Rhythmic grid resolution as a fraction of a whole note.
            Common values: 0.25 (quarter), 0.125 (eighth), 0.0625 (16th).
        supported_formats: List of accepted audio file extensions.
        max_file_size_mb: Maximum input file size in megabytes.
        output_dir: Directory for all pipeline outputs. Defaults to ./output.
        stems_dir: Directory for separated audio stems. Defaults to output_dir/stems.
        use_gpu: Whether to attempt GPU acceleration for ML models.
        separator_model: Name of the Demucs model to use.
        separator_backend: "auto" (Demucs if installed, else HPSS), "demucs" or "hpss".
        transcribe_vocals: Whether to keep and transcribe the vocal stem.
        transcribe_lyrics: Attach Whisper lyrics to the vocal line (if installed).
        indian_percussion_mode: Label the percussion part as Indian percussion.
        bpm_override: Use this tempo instead of auto-detecting it.
        time_signature: Time signature as (numerator, denominator).
        title: Title written into the generated scores.
    """

    sample_rate: int = 44100
    max_duration_seconds: int = 600
    quantization_grid: float = 0.0625  # 16th note (1/16 of a whole note)
    supported_formats: list[str] = field(
        default_factory=lambda: [".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".aiff", ".aif"]
    )
    max_file_size_mb: int = 100
    output_dir: Optional[Path] = None
    stems_dir: Optional[Path] = None
    use_gpu: bool = True
    separator_model: str = "htdemucs"
    separator_backend: str = "auto"
    transcribe_vocals: bool = True
    transcribe_lyrics: bool = True
    indian_percussion_mode: bool = False
    bpm_override: Optional[float] = None
    time_signature: tuple[int, int] = (4, 4)
    title: str = "Transcribed Score"

    def __post_init__(self) -> None:
        """Set derived defaults and validate configuration."""
        if self.output_dir is None:
            self.output_dir = Path("output")
        self.output_dir = Path(self.output_dir)
        if self.stems_dir is None:
            self.stems_dir = self.output_dir / "stems"
        self.stems_dir = Path(self.stems_dir)
        if self.quantization_grid <= 0:
            raise ValueError("quantization_grid must be positive")
        if self.bpm_override is not None and not 20 <= self.bpm_override <= 300:
            raise ValueError("bpm_override must be between 20 and 300")

    @classmethod
    def grid_from_name(cls, name: str | None) -> float:
        """Translate "eighth"/"sixteenth"/"quarter" to a grid fraction."""
        if not name:
            return GRID_PRESETS["sixteenth"]
        return GRID_PRESETS.get(name.lower(), GRID_PRESETS["sixteenth"])

    def ensure_directories(self) -> None:
        """Create output and stems directories if they don't exist."""
        assert self.output_dir is not None
        assert self.stems_dir is not None
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.stems_dir.mkdir(parents=True, exist_ok=True)

    @property
    def max_file_size_bytes(self) -> int:
        """Maximum file size in bytes."""
        return self.max_file_size_mb * 1024 * 1024

    @property
    def quantization_grid_name(self) -> str:
        """Human-readable name for the quantization grid setting."""
        grid_names = {
            0.25: "quarter note",
            0.125: "eighth note",
            0.0625: "16th note",
            0.03125: "32nd note",
        }
        return grid_names.get(self.quantization_grid, f"1/{int(1/self.quantization_grid)} note")
