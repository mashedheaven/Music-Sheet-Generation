"""Abstract interfaces for each stage of the ML transcription pipeline.

Each interface defines a single-responsibility contract so that
implementations can be swapped independently (e.g. mock vs real ML models).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Dict, List, Optional, Protocol, runtime_checkable

from ml_pipeline.data_models import (
    InstrumentInfo,
    InstrumentPart,
    Note,
    PipelineProgress,
    ProcessedAudio,
    ScoreOutput,
    TempoInfo,
    TranscriptionResult,
)


class AudioPreprocessor(ABC):
    """Validates and normalizes raw audio files before processing."""

    @abstractmethod
    def process(self, audio_path: Path) -> ProcessedAudio:
        """Preprocess an audio file for the pipeline.

        Validates the file format, checks duration limits, and optionally
        resamples / normalizes the audio.

        Args:
            audio_path: Path to the raw audio file.

        Returns:
            ProcessedAudio with metadata about the validated file.

        Raises:
            FileNotFoundError: If the audio file does not exist.
            ValueError: If the format is unsupported or the file is too large.
        """
        ...


class AudioSeparator(ABC):
    """Separates a mixed audio file into individual instrument stems."""

    @abstractmethod
    def separate(self, audio_path: Path) -> Dict[str, Path]:
        """Separate audio into instrument stems.

        Args:
            audio_path: Path to the mixed audio file.

        Returns:
            Dictionary mapping stem names (e.g. "vocals", "drums") to
            file paths of the separated audio files.
        """
        ...


class InstrumentDetector(ABC):
    """Detects and classifies instruments present in audio stems."""

    @abstractmethod
    def detect(self, stems: Dict[str, Path]) -> List[InstrumentInfo]:
        """Detect instruments from separated audio stems.

        Args:
            stems: Dictionary mapping stem names to audio file paths.

        Returns:
            List of InstrumentInfo objects describing detected instruments,
            one per stem.
        """
        ...


class AudioTranscriber(ABC):
    """Transcribes audio into discrete note events."""

    @abstractmethod
    def transcribe(
        self, audio_path: Path, instrument: InstrumentInfo
    ) -> TranscriptionResult:
        """Transcribe an audio stem into note events.

        Args:
            audio_path: Path to the instrument audio stem.
            instrument: Metadata about the instrument being transcribed.

        Returns:
            TranscriptionResult containing detected notes and tempo info.
        """
        ...


class NoteQuantizer(ABC):
    """Quantizes note timings to a rhythmic grid."""

    @abstractmethod
    def quantize(self, notes: List[Note], tempo_info: TempoInfo) -> List[Note]:
        """Snap note onsets and offsets to the nearest grid positions.

        Args:
            notes: Raw note events with continuous timing.
            tempo_info: Tempo and time signature information.

        Returns:
            New list of Note objects with quantized timing.
        """
        ...


class ScoreGenerator(ABC):
    """Generates music notation from transcribed instrument parts."""

    @abstractmethod
    def generate(self, instrument_parts: List[InstrumentPart]) -> ScoreOutput:
        """Generate music scores from instrument parts.

        Args:
            instrument_parts: List of InstrumentPart objects, each containing
                quantized notes and instrument metadata.

        Returns:
            ScoreOutput with paths to generated MusicXML, MIDI, and PDF files.
        """
        ...


@runtime_checkable
class PipelineProgressCallback(Protocol):
    """Protocol for receiving pipeline progress updates.

    Implementations can be simple callables or full objects that
    implement this interface.
    """

    def __call__(self, progress: PipelineProgress) -> None:
        """Called when pipeline progress is updated.

        Args:
            progress: The current pipeline progress state.
        """
        ...
