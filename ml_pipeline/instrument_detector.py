"""Instrument detection from audio stems.

Maps stem names to structured InstrumentInfo objects using
well-known Demucs naming conventions and musical knowledge.
"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, List

from ml_pipeline.data_models import InstrumentFamily, InstrumentInfo
from ml_pipeline.interfaces import InstrumentDetector


# Canonical mapping of Demucs stem names to instrument metadata.
_STEM_INSTRUMENT_MAP: Dict[str, InstrumentInfo] = {
    "vocals": InstrumentInfo(
        name="Vocals",
        family=InstrumentFamily.VOCALS,
        clef="treble",
        is_percussion=False,
        confidence=0.95,
    ),
    "drums": InstrumentInfo(
        name="Drum Kit",
        family=InstrumentFamily.DRUMS,
        clef="percussion",
        is_percussion=True,
        confidence=0.95,
    ),
    "bass": InstrumentInfo(
        name="Bass",
        family=InstrumentFamily.BASS,
        clef="bass",
        is_percussion=False,
        confidence=0.90,
    ),
    "other": InstrumentInfo(
        name="Other Instruments",
        family=InstrumentFamily.GENERIC_MELODIC,
        clef="treble",
        is_percussion=False,
        confidence=0.70,
    ),
    "guitar": InstrumentInfo(
        name="Guitar",
        family=InstrumentFamily.GUITAR,
        clef="treble",
        is_percussion=False,
        confidence=0.85,
    ),
    "piano": InstrumentInfo(
        name="Piano",
        family=InstrumentFamily.KEYS,
        clef="treble",
        is_percussion=False,
        confidence=0.85,
    ),
}


class StemBasedDetector(InstrumentDetector):
    """Detects instruments by mapping Demucs stem names to known instruments.

    This detector uses a static lookup table rather than ML-based
    instrument recognition. It is reliable for the standard Demucs
    stem names and can be extended with additional mappings.

    Attributes:
        instrument_map: Mapping from stem names to InstrumentInfo objects.
    """

    def __init__(
        self,
        instrument_map: Dict[str, InstrumentInfo] | None = None,
        indian_percussion_mode: bool = False,
    ) -> None:
        self.instrument_map = instrument_map or dict(_STEM_INSTRUMENT_MAP)
        self.indian_percussion_mode = indian_percussion_mode

    def detect(self, stems: Dict[str, Path]) -> List[InstrumentInfo]:
        """Map stem names to InstrumentInfo objects.

        For each stem, looks up the stem name in the instrument map.
        Unknown stems are mapped to GENERIC_MELODIC with lower confidence.

        Args:
            stems: Dictionary mapping stem names to audio file paths.

        Returns:
            List of InstrumentInfo objects, one per stem, in the same
            order as the stems dictionary.
        """
        instruments: List[InstrumentInfo] = []

        for stem_name in stems:
            normalized = stem_name.lower().strip()
            if normalized in self.instrument_map:
                info = self.instrument_map[normalized]
                if normalized == "drums" and self.indian_percussion_mode:
                    info = InstrumentInfo(
                        name="Indian Percussion",
                        family=InstrumentFamily.DRUMS,
                        clef="percussion",
                        is_percussion=True,
                        confidence=0.95,
                    )
                instruments.append(info)
            else:
                # Unknown stem — assign generic melodic instrument
                instruments.append(
                    InstrumentInfo(
                        name=stem_name.title(),
                        family=InstrumentFamily.GENERIC_MELODIC,
                        clef="treble",
                        is_percussion=False,
                        confidence=0.5,
                    )
                )

        return instruments

    def detect_single(self, stem_name: str) -> InstrumentInfo:
        """Detect instrument for a single stem name.

        Args:
            stem_name: Name of the stem (e.g. "vocals", "drums").

        Returns:
            InstrumentInfo for the given stem name.
        """
        result = self.detect({stem_name: Path(".")})
        return result[0]
