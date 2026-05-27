"""Data models for the ML audio transcription pipeline.

All internal data structures used across pipeline stages are defined here
using dataclasses for simplicity and type safety.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Any, Optional


class InstrumentFamily(str, Enum):
    """Families of musical instruments recognized by the pipeline."""

    VOCALS = "vocals"
    DRUMS = "drums"
    BASS = "bass"
    GUITAR = "guitar"
    KEYS = "keys"
    STRINGS = "strings"
    WINDS = "winds"
    GENERIC_MELODIC = "generic_melodic"
    GENERIC_PERCUSSION = "generic_percussion"


class PipelineStage(str, Enum):
    """Enumeration of pipeline processing stages."""

    PREPROCESSING = "preprocessing"
    SEPARATING = "separating"
    DETECTING = "detecting"
    TRANSCRIBING = "transcribing"
    QUANTIZING = "quantizing"
    GENERATING_SCORES = "generating_scores"
    COMPLETE = "complete"
    FAILED = "failed"


@dataclass
class Note:
    """Represents a single musical note event.

    Attributes:
        pitch: MIDI note number (0-127). For drums, follows GM drum map.
        onset: Note start time in seconds from the beginning of the audio.
        offset: Note end time in seconds from the beginning of the audio.
        velocity: MIDI velocity (0-127), representing dynamics.
        channel: MIDI channel (0-15). Channel 9 is percussion by convention.
    """

    pitch: int
    onset: float
    offset: float
    velocity: int = 80
    channel: int = 0

    def __post_init__(self) -> None:
        if not 0 <= self.pitch <= 127:
            raise ValueError(f"MIDI pitch must be 0-127, got {self.pitch}")
        if not 0 <= self.velocity <= 127:
            raise ValueError(f"MIDI velocity must be 0-127, got {self.velocity}")
        if self.offset < self.onset:
            raise ValueError(
                f"Note offset ({self.offset}) must be >= onset ({self.onset})"
            )

    @property
    def duration(self) -> float:
        """Duration of the note in seconds."""
        return self.offset - self.onset

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return asdict(self)


@dataclass
class InstrumentInfo:
    """Describes a detected musical instrument.

    Attributes:
        name: Human-readable instrument name (e.g. "Piano", "Drum Kit").
        family: The instrument family category.
        clef: Musical clef to use ("treble", "bass", or "percussion").
        is_percussion: Whether the instrument uses unpitched percussion notation.
        confidence: Detection confidence score from 0.0 to 1.0.
    """

    name: str
    family: InstrumentFamily
    clef: str = "treble"
    is_percussion: bool = False
    confidence: float = 1.0

    def __post_init__(self) -> None:
        if self.clef not in ("treble", "bass", "percussion"):
            raise ValueError(
                f"Clef must be 'treble', 'bass', or 'percussion', got '{self.clef}'"
            )
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError(
                f"Confidence must be 0.0-1.0, got {self.confidence}"
            )

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        d = asdict(self)
        d["family"] = self.family.value
        return d


@dataclass
class TempoInfo:
    """Tempo and time signature information extracted from audio.

    Attributes:
        bpm: Tempo in beats per minute.
        time_signature_numerator: Top number of time signature (beats per measure).
        time_signature_denominator: Bottom number of time signature (beat unit).
        beat_positions: List of beat onset times in seconds.
    """

    bpm: float = 120.0
    time_signature_numerator: int = 4
    time_signature_denominator: int = 4
    beat_positions: list[float] = field(default_factory=list)

    @property
    def beat_duration(self) -> float:
        """Duration of one beat in seconds."""
        return 60.0 / self.bpm

    @property
    def measure_duration(self) -> float:
        """Duration of one measure in seconds."""
        return self.beat_duration * self.time_signature_numerator

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return asdict(self)


@dataclass
class ProcessedAudio:
    """Metadata about a preprocessed audio file.

    Attributes:
        file_path: Path to the processed audio file on disk.
        sample_rate: Sample rate in Hz.
        duration: Duration of the audio in seconds.
        num_channels: Number of audio channels (1=mono, 2=stereo).
    """

    file_path: Path
    sample_rate: int
    duration: float
    num_channels: int

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        d = asdict(self)
        d["file_path"] = str(self.file_path)
        return d


@dataclass
class TranscriptionResult:
    """Result of transcribing a single audio stem.

    Attributes:
        notes: List of detected Note events.
        instrument: The instrument this transcription is for.
        tempo_info: Detected tempo and timing information.
    """

    notes: list[Note]
    instrument: InstrumentInfo
    tempo_info: TempoInfo

    @property
    def note_count(self) -> int:
        """Number of notes in the transcription."""
        return len(self.notes)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "notes": [n.to_dict() for n in self.notes],
            "instrument": self.instrument.to_dict(),
            "tempo_info": self.tempo_info.to_dict(),
        }


@dataclass
class InstrumentPart:
    """A complete instrument part ready for score generation.

    Attributes:
        instrument_info: Description of the instrument.
        notes: Quantized note events for this part.
        stem_audio_path: Path to the source audio stem.
    """

    instrument_info: InstrumentInfo
    notes: list[Note]
    stem_audio_path: Optional[Path] = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "instrument_info": self.instrument_info.to_dict(),
            "notes": [n.to_dict() for n in self.notes],
            "stem_audio_path": str(self.stem_audio_path) if self.stem_audio_path else None,
        }


@dataclass
class ScoreOutput:
    """Paths to generated score files.

    Attributes:
        musicxml_path: Path to the MusicXML (.musicxml) file.
        midi_path: Path to the MIDI (.mid) file.
        pdf_path: Path to the PDF rendering, if available.
    """

    musicxml_path: Optional[Path] = None
    midi_path: Optional[Path] = None
    pdf_path: Optional[Path] = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "musicxml_path": str(self.musicxml_path) if self.musicxml_path else None,
            "midi_path": str(self.midi_path) if self.midi_path else None,
            "pdf_path": str(self.pdf_path) if self.pdf_path else None,
        }


@dataclass
class StemResult:
    """Processing result for a single stem.

    Attributes:
        instrument_info: The detected instrument.
        audio_path: Path to the separated audio stem file.
        transcription: Transcription of the stem, if completed.
        score: Generated score for this stem, if completed.
    """

    instrument_info: InstrumentInfo
    audio_path: Path
    transcription: Optional[TranscriptionResult] = None
    score: Optional[ScoreOutput] = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "instrument_info": self.instrument_info.to_dict(),
            "audio_path": str(self.audio_path),
            "transcription": self.transcription.to_dict() if self.transcription else None,
            "score": self.score.to_dict() if self.score else None,
        }


@dataclass
class PipelineResult:
    """Final output of the entire pipeline run.

    Attributes:
        stems: Per-stem processing results.
        ensemble_score: Combined ensemble score output, if generated.
        metadata: Arbitrary metadata about the pipeline run.
    """

    stems: list[StemResult] = field(default_factory=list)
    ensemble_score: Optional[ScoreOutput] = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "stems": [s.to_dict() for s in self.stems],
            "ensemble_score": self.ensemble_score.to_dict() if self.ensemble_score else None,
            "metadata": self.metadata,
        }

    def to_json(self, indent: int = 2) -> str:
        """Serialize to JSON string."""
        return json.dumps(self.to_dict(), indent=indent)


@dataclass
class PipelineProgress:
    """Reports progress of the pipeline to callers.

    Attributes:
        stage: The current pipeline stage.
        progress: Fractional progress within the current stage (0.0 to 1.0).
        message: Human-readable status message.
    """

    stage: PipelineStage
    progress: float = 0.0
    message: str = ""

    def __post_init__(self) -> None:
        if not 0.0 <= self.progress <= 1.0:
            raise ValueError(
                f"Progress must be 0.0-1.0, got {self.progress}"
            )

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "stage": self.stage.value,
            "progress": self.progress,
            "message": self.message,
        }
