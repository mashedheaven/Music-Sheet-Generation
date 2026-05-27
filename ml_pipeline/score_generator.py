"""Score generation using music21.

Converts transcribed InstrumentPart objects into real MusicXML, MIDI,
and optionally PDF score files using the music21 library.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, List, Optional

from ml_pipeline.config import PipelineConfig
from ml_pipeline.data_models import (
    InstrumentFamily,
    InstrumentInfo,
    InstrumentPart,
    Note as PipelineNote,
    ScoreOutput,
    TempoInfo,
)
from ml_pipeline.interfaces import ScoreGenerator

logger = logging.getLogger(__name__)

# GM Drum Map — maps MIDI note numbers to percussion instrument names.
# Used for music21 unpitched percussion notation.
GM_DRUM_MAP: Dict[int, str] = {
    35: "Acoustic Bass Drum",
    36: "Bass Drum 1",
    37: "Side Stick",
    38: "Acoustic Snare",
    39: "Hand Clap",
    40: "Electric Snare",
    41: "Low Floor Tom",
    42: "Closed Hi-Hat",
    43: "High Floor Tom",
    44: "Pedal Hi-Hat",
    45: "Low Tom",
    46: "Open Hi-Hat",
    47: "Low-Mid Tom",
    48: "Hi-Mid Tom",
    49: "Crash Cymbal 1",
    50: "High Tom",
    51: "Ride Cymbal 1",
    52: "Chinese Cymbal",
    53: "Ride Bell",
    55: "Splash Cymbal",
    56: "Cowbell",
    57: "Crash Cymbal 2",
    59: "Ride Cymbal 2",
}

# Standard display positions for drum instruments on a percussion staff.
# Maps MIDI note to a music21 display step and octave for notation.
_DRUM_DISPLAY: Dict[int, tuple[str, int]] = {
    36: ("C", 4),   # Kick — space below staff
    38: ("C", 5),   # Snare — middle of staff
    42: ("G", 5),   # Closed Hi-Hat — top of staff
    46: ("G", 5),   # Open Hi-Hat — top of staff (with open notehead)
    49: ("A", 5),   # Crash — above staff
    51: ("F", 5),   # Ride — above middle
    45: ("A", 4),   # Low Tom
    47: ("B", 4),   # Mid Tom
    50: ("D", 5),   # High Tom
}


class Music21ScoreGenerator(ScoreGenerator):
    """Generates MusicXML and MIDI scores using music21.

    Takes InstrumentPart objects containing quantized notes and produces
    properly formatted musical scores with:
    - Correct clef assignment per instrument
    - Time signatures and tempo markings
    - Instrument names and measure numbers
    - Percussion notation for drums
    - Both individual part and combined ensemble scores

    Attributes:
        config: Pipeline configuration.
        tempo_info: Tempo information for score generation.
    """

    def __init__(
        self,
        config: PipelineConfig | None = None,
        tempo_info: TempoInfo | None = None,
    ) -> None:
        self.config = config or PipelineConfig()
        self.tempo_info = tempo_info or TempoInfo()

    def generate(self, instrument_parts: List[InstrumentPart]) -> ScoreOutput:
        """Generate MusicXML and MIDI from instrument parts.

        Creates both per-instrument files and a combined ensemble score.

        Args:
            instrument_parts: List of InstrumentPart objects.

        Returns:
            ScoreOutput with paths to the generated ensemble score files.
        """
        from music21 import (
            clef,
            instrument as m21instrument,
            key,
            metadata,
            meter,
            midi as m21midi,
            note as m21note,
            chord as m21chord,
            stream,
            tempo,
        )

        self.config.ensure_directories()
        assert self.config.output_dir is not None

        # Build the ensemble score
        score = stream.Score()
        score.metadata = metadata.Metadata()
        score.metadata.title = "Transcribed Score"
        score.metadata.composer = "ML Pipeline"

        for part_data in instrument_parts:
            m21_part = self._build_part(part_data)
            score.append(m21_part)

        # Write ensemble files
        ensemble_xml_path = self.config.output_dir / "ensemble_score.musicxml"
        ensemble_midi_path = self.config.output_dir / "ensemble_score.mid"

        score.write("musicxml", fp=str(ensemble_xml_path))
        logger.info("Wrote ensemble MusicXML: %s", ensemble_xml_path)

        score.write("midi", fp=str(ensemble_midi_path))
        logger.info("Wrote ensemble MIDI: %s", ensemble_midi_path)

        # Write individual part files
        for i, part_data in enumerate(instrument_parts):
            part_name = part_data.instrument_info.name.replace(" ", "_").lower()
            part_xml = self.config.output_dir / f"{part_name}_score.musicxml"
            part_midi = self.config.output_dir / f"{part_name}_score.mid"

            part_score = stream.Score()
            part_score.metadata = metadata.Metadata()
            part_score.metadata.title = f"{part_data.instrument_info.name} Part"
            part_score.append(self._build_part(part_data))

            part_score.write("musicxml", fp=str(part_xml))
            part_score.write("midi", fp=str(part_midi))
            logger.info("Wrote %s part files", part_data.instrument_info.name)

        return ScoreOutput(
            musicxml_path=ensemble_xml_path,
            midi_path=ensemble_midi_path,
            pdf_path=None,  # PDF requires external renderer (e.g. MuseScore)
        )

    def _build_part(self, part_data: InstrumentPart) -> "stream.Part":
        """Build a music21 Part from an InstrumentPart.

        Args:
            part_data: The instrument part with notes and metadata.

        Returns:
            A music21 Part object ready to be added to a Score.
        """
        from music21 import (
            clef as m21clef,
            instrument as m21instrument,
            key as m21key,
            meter,
            note as m21note,
            chord as m21chord,
            stream,
            tempo as m21tempo,
        )

        part = stream.Part()
        part.partName = part_data.instrument_info.name

        # Assign music21 instrument
        m21_inst = self._get_m21_instrument(part_data.instrument_info)
        part.insert(0, m21_inst)

        # Time signature and tempo at the start
        ts = meter.TimeSignature(
            f"{self.tempo_info.time_signature_numerator}/"
            f"{self.tempo_info.time_signature_denominator}"
        )
        part.insert(0, ts)

        mm = m21tempo.MetronomeMark(number=self.tempo_info.bpm)
        part.insert(0, mm)

        # Clef
        part_clef = self._get_clef(part_data.instrument_info)
        part.insert(0, part_clef)

        # Key signature (C major default)
        if not part_data.instrument_info.is_percussion:
            ks = m21key.Key("C")
            part.insert(0, ks)

        # Add notes
        if part_data.instrument_info.is_percussion:
            self._add_percussion_notes(part, part_data.notes)
        else:
            self._add_pitched_notes(part, part_data.notes)

        # Force music21 to snap all internal float timings to the 16th note grid
        # (1/4 of a quarter note). This eliminates any microscopic tuplets.
        part.quantize([4], processOffsets=True, processDurations=True, inPlace=True)

        # Make measures (music21 handles bar lines)
        part.makeMeasures(inPlace=True)

        return part

    def _add_pitched_notes(
        self, part: "stream.Part", notes: List[PipelineNote]
    ) -> None:
        """Add pitched notes to a music21 Part.

        Groups simultaneous notes into chords.

        Args:
            part: The music21 Part to add notes to.
            notes: List of pipeline Note objects.
        """
        from music21 import note as m21note, chord as m21chord, pitch as m21pitch

        if not notes:
            return

        # Group notes by onset time for chord detection
        onset_groups: Dict[float, List[PipelineNote]] = {}
        for n in notes:
            onset_key = round(n.onset, 6)
            if onset_key not in onset_groups:
                onset_groups[onset_key] = []
            onset_groups[onset_key].append(n)

        for onset in sorted(onset_groups.keys()):
            group = onset_groups[onset]

            if len(group) == 1:
                # Single note
                pn = group[0]
                duration_ql = self._seconds_to_quarter_lengths(pn.duration)
                m21_note = m21note.Note(pn.pitch, quarterLength=duration_ql)
                m21_note.volume.velocity = pn.velocity
                part.insert(self._seconds_to_offset(onset), m21_note)
            else:
                # Chord — group of simultaneous notes
                pitches = [pn.pitch for pn in group]
                # Use the shortest duration in the group
                min_dur = min(pn.duration for pn in group)
                duration_ql = self._seconds_to_quarter_lengths(min_dur)

                m21_chord = m21chord.Chord(pitches, quarterLength=duration_ql)
                m21_chord.volume.velocity = group[0].velocity
                part.insert(self._seconds_to_offset(onset), m21_chord)

    def _add_percussion_notes(
        self, part: "stream.Part", notes: List[PipelineNote]
    ) -> None:
        """Add percussion notes to a music21 Part using unpitched notation.

        Args:
            part: The music21 Part to add notes to.
            notes: List of pipeline Note objects with GM drum MIDI numbers.
        """
        from music21 import note as m21note, chord as m21chord, pitch as m21pitch

        if not notes:
            return

        # Group notes by onset time for chord detection
        onset_groups: Dict[float, List[PipelineNote]] = {}
        for n in notes:
            onset_key = round(n.onset, 6)
            if onset_key not in onset_groups:
                onset_groups[onset_key] = []
            onset_groups[onset_key].append(n)

        for onset in sorted(onset_groups.keys()):
            group = onset_groups[onset]
            
            # Percussion notation in music21 works best if we use regular Notes/Chords
            # but assign them to a percussion staff. The PercussionClef handles the rendering.
            # We will use regular notes/chords but map their display pitches.
            
            if len(group) == 1:
                pn = group[0]
                duration_ql = self._seconds_to_quarter_lengths(pn.duration)
                m21_note = m21note.Note(pn.pitch, quarterLength=duration_ql)
                
                # Set display position for the drum instrument
                if pn.pitch in _DRUM_DISPLAY:
                    display_step, display_octave = _DRUM_DISPLAY[pn.pitch]
                    m21_note.pitch.step = display_step
                    m21_note.pitch.octave = display_octave
                    
                m21_note.volume.velocity = pn.velocity
                # Noteheads for cymbals
                if pn.pitch in (42, 44, 46, 49, 51, 52, 53, 55, 57, 59):
                    m21_note.notehead = 'cross'
                if pn.pitch == 46: # Open hi-hat
                    m21_note.notehead = 'circle-x'

                part.insert(self._seconds_to_offset(onset), m21_note)
            else:
                # Chord of drum hits
                min_dur = min(pn.duration for pn in group)
                duration_ql = self._seconds_to_quarter_lengths(min_dur)
                
                m21_chord = m21chord.Chord([pn.pitch for pn in group], quarterLength=duration_ql)
                m21_chord.volume.velocity = group[0].velocity
                
                # Update display pitches and noteheads for each note in the chord
                for i, pn in enumerate(group):
                    chord_pitch = m21_chord.pitches[i]
                    if pn.pitch in _DRUM_DISPLAY:
                        display_step, display_octave = _DRUM_DISPLAY[pn.pitch]
                        chord_pitch.step = display_step
                        chord_pitch.octave = display_octave
                    
                    if pn.pitch in (42, 44, 46, 49, 51, 52, 53, 55, 57, 59):
                        m21_chord.notes[i].notehead = 'cross'
                    if pn.pitch == 46:
                        m21_chord.notes[i].notehead = 'circle-x'
                        
                part.insert(self._seconds_to_offset(onset), m21_chord)

    def _seconds_to_quarter_lengths(self, duration_seconds: float) -> float:
        """Convert a duration in seconds to music21 quarter note lengths.

        Args:
            duration_seconds: Duration in seconds.

        Returns:
            Duration in quarter note lengths. Minimum 0.25 (16th note).
        """
        beats = duration_seconds * (self.tempo_info.bpm / 60.0)
        # Snap strictly to a 16th note grid (0.25 quarter notes)
        return round(max(beats, 0.25) * 4) / 4.0

    def _seconds_to_offset(self, time_seconds: float) -> float:
        """Convert a time in seconds to music21 quarter note offset."""
        beats = time_seconds * (self.tempo_info.bpm / 60.0)
        # Snap strictly to a 16th note grid (0.25 quarter notes)
        return round(beats * 4) / 4.0

    @staticmethod
    def _get_m21_instrument(info: InstrumentInfo) -> "m21instrument.Instrument":
        """Map an InstrumentInfo to a music21 Instrument object.

        Args:
            info: Pipeline instrument metadata.

        Returns:
            Appropriate music21 Instrument subclass instance.
        """
        from music21 import instrument as m21instrument

        family_map = {
            InstrumentFamily.VOCALS: m21instrument.Vocalist,
            InstrumentFamily.DRUMS: m21instrument.UnpitchedPercussion,
            InstrumentFamily.BASS: m21instrument.ElectricBass,
            InstrumentFamily.GUITAR: m21instrument.ElectricGuitar,
            InstrumentFamily.KEYS: m21instrument.Piano,
            InstrumentFamily.STRINGS: m21instrument.Violin,
            InstrumentFamily.WINDS: m21instrument.Flute,
        }

        inst_class = family_map.get(info.family, m21instrument.Instrument)
        inst = inst_class()
        inst.partName = info.name
        return inst

    @staticmethod
    def _get_clef(info: InstrumentInfo) -> "m21clef.Clef":
        """Get the appropriate music21 clef for an instrument.

        Args:
            info: Pipeline instrument metadata.

        Returns:
            music21 Clef object.
        """
        from music21 import clef as m21clef

        clef_map = {
            "treble": m21clef.TrebleClef,
            "bass": m21clef.BassClef,
            "percussion": m21clef.PercussionClef,
        }

        clef_class = clef_map.get(info.clef, m21clef.TrebleClef)
        return clef_class()
