"""Score generation: quantized notes → MusicXML (music21) + MIDI (mido).

How a part is engraved:

1. Note times (seconds) are mapped onto the detected beat grid and expressed
   as integer grid ticks, so every note lands exactly on a 16th/8th slot.
2. Each staff is reduced to a single *chord line*: notes that start together
   become a chord, and every event lasts until the next one starts. This
   removes the overlapping-note mess that made earlier scores unreadable.
3. Gaps become explicit rests, tiny 1-tick gaps are absorbed for legibility.
4. Pitches are spelled for the detected key (B♭ not A♯ in F major).
5. Wide-range polyphonic parts (keys / "other") get a piano-style grand
   staff split at middle C; low voices get an octave clef.
6. Drums use real percussion notation (unpitched notes, x noteheads).

MIDI is written directly from the note data (not from music21) so that
playback keeps full polyphony and exact durations.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

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
from ml_pipeline.music_theory import KeyEstimate, estimate_key, spell_pitch
from ml_pipeline.quantizer import BeatGrid

logger = logging.getLogger(__name__)

# GM Drum Map — maps MIDI note numbers to percussion instrument names.
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

# Standard drum-set staff positions (percussion clef): (display step, octave).
_DRUM_DISPLAY: Dict[int, tuple[str, int]] = {
    35: ("F", 4), 36: ("F", 4),             # kick — bottom space
    37: ("C", 5), 38: ("C", 5), 40: ("C", 5), 39: ("C", 5),  # snare — 3rd space
    41: ("A", 4), 43: ("A", 4),             # floor tom
    45: ("D", 5), 47: ("D", 5),             # mid tom
    48: ("E", 5), 50: ("E", 5),             # high tom
    42: ("G", 5), 46: ("G", 5),             # hi-hat — above the staff
    44: ("D", 4),                           # pedal hi-hat — below the staff
    49: ("A", 5), 57: ("A", 5), 52: ("A", 5), 55: ("A", 5),  # crash family
    51: ("F", 5), 53: ("F", 5), 59: ("F", 5),  # ride
}
_X_NOTEHEADS = {42, 44, 46, 49, 51, 52, 53, 55, 57, 59}

# General MIDI programs for MIDI export.
_GM_PROGRAMS: Dict[InstrumentFamily, int] = {
    InstrumentFamily.VOCALS: 53,       # Voice Oohs
    InstrumentFamily.BASS: 33,         # Electric Bass (finger)
    InstrumentFamily.GUITAR: 27,       # Electric Guitar (clean)
    InstrumentFamily.KEYS: 0,          # Acoustic Grand
    InstrumentFamily.STRINGS: 48,      # String Ensemble
    InstrumentFamily.WINDS: 73,        # Flute
    InstrumentFamily.GENERIC_MELODIC: 0,
}

PPQ = 480

_ENSEMBLE_ORDER: Dict[InstrumentFamily, int] = {
    InstrumentFamily.VOCALS: 0,
    InstrumentFamily.WINDS: 1,
    InstrumentFamily.STRINGS: 2,
    InstrumentFamily.GUITAR: 3,
    InstrumentFamily.KEYS: 4,
    InstrumentFamily.GENERIC_MELODIC: 5,
    InstrumentFamily.BASS: 6,
    InstrumentFamily.DRUMS: 7,
    InstrumentFamily.GENERIC_PERCUSSION: 8,
}


@dataclass
class _Event:
    tick: int
    end: int
    pitches: list[int]
    velocity: int = 80
    lyric: Optional[str] = None


@dataclass
class _Staff:
    events: list[_Event]
    clef: str  # treble | treble8vb | bass | bass8vb | percussion
    name: str = ""
    extra: dict = field(default_factory=dict)


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return slug or "part"


class Music21ScoreGenerator(ScoreGenerator):
    """Generates MusicXML and MIDI scores.

    Attributes:
        config: Pipeline configuration.
        tempo_info: Default tempo information (overridden per ``generate`` call).
    """

    def __init__(
        self,
        config: PipelineConfig | None = None,
        tempo_info: TempoInfo | None = None,
    ) -> None:
        self.config = config or PipelineConfig()
        self.tempo_info = tempo_info or TempoInfo(
            time_signature_numerator=self.config.time_signature[0],
            time_signature_denominator=self.config.time_signature[1],
        )

    # ── Public API ──────────────────────────────────────────────────────────

    def generate(
        self,
        instrument_parts: List[InstrumentPart],
        tempo_info: Optional[TempoInfo] = None,
    ) -> ScoreOutput:
        """Generate the ensemble score plus one score per instrument part."""
        from music21 import metadata, stream

        if tempo_info is not None:
            self.tempo_info = tempo_info
        self.config.ensure_directories()
        assert self.config.output_dir is not None
        out_dir = self.config.output_dir

        self._grid = BeatGrid(self.tempo_info)
        self._subdiv = max(1, int(round((1.0 / self.tempo_info.time_signature_denominator) / self.config.quantization_grid)))
        self._key = self._detect_key(instrument_parts)

        # Total length (in ticks, rounded up to whole bars) shared by all parts
        # so every part has the same number of measures.
        bar_ticks = self._bar_ticks()
        max_tick = 0
        for p in instrument_parts:
            for n in p.notes:
                max_tick = max(max_tick, self._to_tick(n.offset))
        self._total_ticks = max(bar_ticks, int(np.ceil(max_tick / bar_ticks)) * bar_ticks)

        staves_per_part = [self._plan_staves(p) for p in instrument_parts]

        # Ensemble score — conventional order: voice, melodic, bass, drums.
        score = self._new_score(self.config.title, subtitle="Full score")
        order = sorted(
            range(len(instrument_parts)),
            key=lambda i: (_ENSEMBLE_ORDER.get(instrument_parts[i].instrument_info.family, 5), i),
        )
        for idx in order:
            part_data, staves = instrument_parts[idx], staves_per_part[idx]
            for element in self._build_part(part_data, staves):
                score.insert(0, element)
        ensemble_xml = out_dir / "ensemble_score.musicxml"
        ensemble_midi = out_dir / "ensemble_score.mid"
        score.write("musicxml", fp=str(ensemble_xml))
        self._write_midi(ensemble_midi, [instrument_parts[i] for i in order])
        logger.info("Wrote ensemble score with %d parts", len(instrument_parts))

        # Individual part scores
        part_outputs: list[ScoreOutput] = []
        used: set[str] = set()
        for part_data, staves in zip(instrument_parts, staves_per_part):
            slug = slugify(part_data.instrument_info.name)
            base, i = slug, 2
            while slug in used:
                slug, i = f"{base}_{i}", i + 1
            used.add(slug)

            part_xml = out_dir / f"{slug}_score.musicxml"
            part_midi = out_dir / f"{slug}_score.mid"
            part_score = self._new_score(f"{self.config.title}", subtitle=part_data.instrument_info.name)
            for element in self._build_part(part_data, staves):
                part_score.insert(0, element)
            part_score.write("musicxml", fp=str(part_xml))
            self._write_midi(part_midi, [part_data])
            part_outputs.append(ScoreOutput(musicxml_path=part_xml, midi_path=part_midi, key_name=self._key.name))

        return ScoreOutput(
            musicxml_path=ensemble_xml,
            midi_path=ensemble_midi,
            pdf_path=None,
            parts=part_outputs,
            key_name=self._key.name,
        )

    # ── Timing helpers ──────────────────────────────────────────────────────

    def _to_tick(self, seconds: float) -> int:
        return max(0, int(round(float(self._grid.to_beats(seconds)) * self._subdiv)))

    def _bar_ticks(self) -> int:
        return self.tempo_info.time_signature_numerator * self._subdiv

    def _ql_per_tick(self) -> float:
        return (4.0 / self.tempo_info.time_signature_denominator) / self._subdiv

    # ── Analysis ────────────────────────────────────────────────────────────

    def _detect_key(self, parts: List[InstrumentPart]) -> KeyEstimate:
        weighted = []
        for p in parts:
            if p.instrument_info.is_percussion:
                continue
            # Bass lines are very informative about the tonic → extra weight.
            w = 1.5 if p.instrument_info.family == InstrumentFamily.BASS else 1.0
            weighted.extend((n.pitch, n.duration * w) for n in p.notes)
        key = estimate_key(weighted)
        logger.info("Estimated key: %s (r=%.2f)", key.name, key.confidence)
        return key

    def _plan_staves(self, part: InstrumentPart) -> list[_Staff]:
        info = part.instrument_info
        notes = part.notes
        if info.is_percussion:
            return [_Staff(self._percussion_events(notes), "percussion")]

        pitches = np.array([n.pitch for n in notes]) if notes else np.array([60])
        median = float(np.median(pitches))
        polyphonic_family = info.family in (
            InstrumentFamily.KEYS,
            InstrumentFamily.GENERIC_MELODIC,
            InstrumentFamily.GUITAR,
        )
        if polyphonic_family and notes:
            upper = [n for n in notes if n.pitch >= 60]
            lower = [n for n in notes if n.pitch < 60]
            share = min(len(upper), len(lower)) / len(notes)
            span = float(np.percentile(pitches, 95) - np.percentile(pitches, 5))
            if share >= 0.12 and span >= 19:
                return [
                    _Staff(self._chord_line(upper), "treble", "upper"),
                    _Staff(self._chord_line(lower), "bass", "lower"),
                ]

        if info.family == InstrumentFamily.BASS:
            clef = "bass8vb" if median < 40 else "bass"
        elif info.clef == "bass" or median < 50:
            clef = "bass"
        elif median < 60 and info.family in (InstrumentFamily.VOCALS, InstrumentFamily.GUITAR):
            clef = "treble8vb"
        else:
            clef = "treble"
        return [_Staff(self._chord_line(notes), clef)]

    # ── Event construction ─────────────────────────────────────────────────

    def _chord_line(self, notes: List[PipelineNote]) -> list[_Event]:
        groups: dict[int, _Event] = {}
        for n in notes:
            tick = self._to_tick(n.onset)
            end = max(tick + 1, self._to_tick(n.offset))
            ev = groups.get(tick)
            if ev is None:
                groups[tick] = _Event(tick, end, [n.pitch], n.velocity, n.lyric)
            else:
                if n.pitch not in ev.pitches:
                    ev.pitches.append(n.pitch)
                ev.end = max(ev.end, end)
                ev.velocity = max(ev.velocity, n.velocity)
                ev.lyric = ev.lyric or n.lyric

        events = [groups[t] for t in sorted(groups)]
        for i, ev in enumerate(events):
            ev.pitches.sort()
            if i + 1 < len(events):
                nxt = events[i + 1].tick
                ev.end = min(ev.end, nxt)
                # Absorb a single-tick gap: a 16th rest between two notes is
                # almost always detection noise, and it clutters the page.
                if nxt - ev.end == 1 and ev.end - ev.tick >= 2:
                    ev.end = nxt
            ev.end = max(ev.end, ev.tick + 1)
            ev.end = min(ev.end, self._total_ticks)
        return [e for e in events if e.tick < self._total_ticks]

    def _percussion_events(self, notes: List[PipelineNote]) -> list[_Event]:
        events = self._chord_line(notes)
        beat = self._subdiv
        for i, ev in enumerate(events):
            nxt = events[i + 1].tick if i + 1 < len(events) else ev.tick + beat
            # Drum hits are notated by spacing: each lasts until the next hit
            # but never past the end of its beat (no tied drum notes).
            beat_end = (ev.tick // beat + 1) * beat
            ev.end = max(ev.tick + 1, min(nxt, beat_end))
        return events

    # ── music21 construction ────────────────────────────────────────────────

    def _new_score(self, title: str, subtitle: str | None = None):
        from music21 import metadata, stream

        score = stream.Score()
        score.metadata = metadata.Metadata()
        score.metadata.title = title
        if subtitle:
            score.metadata.movementName = subtitle
        score.metadata.composer = "Transcribed with MuSheet"
        return score

    def _build_part(self, part_data: InstrumentPart, staves: list[_Staff]) -> list:
        """Return the music21 objects (Part / PartStaffs + StaffGroup) for a part."""
        from music21 import layout, stream

        info = part_data.instrument_info
        if len(staves) == 1:
            part = stream.Part()
            self._fill_staff(part, staves[0], info, first=True)
            part.partName = info.name
            part.partAbbreviation = self._abbrev(info.name)
            return [part]

        elements = []
        parts = []
        for idx, staff in enumerate(staves):
            ps = stream.PartStaff()
            self._fill_staff(ps, staff, info, first=idx == 0)
            ps.partName = info.name
            ps.partAbbreviation = self._abbrev(info.name)
            parts.append(ps)
            elements.append(ps)
        group = layout.StaffGroup(parts, name=info.name, abbreviation=self._abbrev(info.name), symbol="brace")
        group.barTogether = True
        elements.append(group)
        return elements

    @staticmethod
    def _abbrev(name: str) -> str:
        words = name.split()
        return (words[0][:3] + ".") if words else ""

    def _fill_staff(self, part, staff: _Staff, info: InstrumentInfo, first: bool) -> None:
        from music21 import (
            clef as m21clef,
            key as m21key,
            meter,
            note as m21note,
            stream,
            tempo as m21tempo,
        )

        ql = self._ql_per_tick()
        bar_ticks = self._bar_ticks()
        num = self.tempo_info.time_signature_numerator
        den = self.tempo_info.time_signature_denominator

        inst = self._get_m21_instrument(info)
        part.insert(0, inst)

        events = staff.events
        # Fill the timeline: notes/chords and explicit rests.
        cursor = 0
        timeline: list[tuple[int, int, object]] = []
        for ev in events:
            if ev.tick > cursor:
                timeline.append((cursor, ev.tick, None))
            timeline.append((ev.tick, ev.end, ev))
            cursor = ev.end
        if cursor < self._total_ticks:
            timeline.append((cursor, self._total_ticks, None))

        flat = stream.Part()
        for start, end, ev in timeline:
            # Split anything that crosses a barline so each measure is exact.
            seg_start = start
            while seg_start < end:
                bar_end = (seg_start // bar_ticks + 1) * bar_ticks
                seg_end = min(end, bar_end)
                tied_from = seg_start > start
                tied_to = seg_end < end
                obj = self._make_element(ev, (seg_end - seg_start) * ql, staff, tied_from, tied_to)
                flat.insert(seg_start * ql, obj)
                seg_start = seg_end

        measures = flat.makeMeasures()
        for i, m in enumerate(measures.getElementsByClass(stream.Measure)):
            if i == 0:
                # Use the property setters: makeMeasures() already attached an
                # auto-chosen clef/meter that would otherwise take precedence.
                m.clef = self._make_clef(staff.clef)
                if not info.is_percussion:
                    m.keySignature = m21key.KeySignature(self._key.sharps)
                m.timeSignature = meter.TimeSignature(f"{num}/{den}")
                if first:
                    mm = m21tempo.MetronomeMark(number=round(self.tempo_info.bpm))
                    mm.placement = "above"
                    m.insert(0, mm)
            # Whole-measure rests display as a centered whole rest.
            notes_and_rests = list(m.notesAndRests)
            if len(notes_and_rests) == 1 and isinstance(notes_and_rests[0], m21note.Rest):
                notes_and_rests[0].fullMeasure = True
            part.append(m)

        try:
            part.makeBeams(inPlace=True)
        except Exception:  # noqa: BLE001 — beaming is cosmetic
            pass

    def _make_element(self, ev: Optional[_Event], ql: float, staff: _Staff, tied_from: bool, tied_to: bool):
        from music21 import chord as m21chord, note as m21note, percussion, pitch as m21pitch, tie

        if ev is None:
            return m21note.Rest(quarterLength=ql)

        if staff.clef == "percussion":
            heads = []
            for p in ev.pitches:
                u = m21note.Unpitched(quarterLength=ql)
                step, octave = _DRUM_DISPLAY.get(p, ("C", 5))
                u.displayStep = step
                u.displayOctave = octave
                if p in _X_NOTEHEADS:
                    u.notehead = "x"
                u.stemDirection = "up"
                heads.append(u)
            if len(heads) == 1:
                el = heads[0]
            else:
                # Drop duplicate staff positions (e.g. two hats on one line).
                seen, uniq = set(), []
                for h in heads:
                    k = (h.displayStep, h.displayOctave)
                    if k not in seen:
                        seen.add(k)
                        uniq.append(h)
                el = uniq[0] if len(uniq) == 1 else percussion.PercussionChord(uniq, quarterLength=ql)
                el.stemDirection = "up"
            el.volume.velocity = ev.velocity
            return el

        pitches = []
        for p in ev.pitches:
            step, alter, octave = spell_pitch(p, self._key)
            mp = m21pitch.Pitch(step=step, octave=octave)
            if alter:
                mp.accidental = m21pitch.Accidental(alter)
            pitches.append(mp)

        if len(pitches) == 1:
            el = m21note.Note(pitches[0], quarterLength=ql)
        else:
            el = m21chord.Chord(pitches, quarterLength=ql)
        el.volume.velocity = ev.velocity
        if ev.lyric and not tied_from:
            el.lyric = ev.lyric
        if tied_from and tied_to:
            el.tie = tie.Tie("continue")
        elif tied_from:
            el.tie = tie.Tie("stop")
        elif tied_to:
            el.tie = tie.Tie("start")
        return el

    @staticmethod
    def _make_clef(name: str):
        from music21 import clef as m21clef

        return {
            "treble": m21clef.TrebleClef,
            "treble8vb": m21clef.Treble8vbClef,
            "bass": m21clef.BassClef,
            "bass8vb": m21clef.Bass8vbClef,
            "percussion": m21clef.PercussionClef,
        }.get(name, m21clef.TrebleClef)()

    @staticmethod
    def _get_m21_instrument(info: InstrumentInfo):
        """Map an InstrumentInfo to a (non-transposing) music21 Instrument."""
        from music21 import instrument as m21instrument

        family_map = {
            InstrumentFamily.VOCALS: m21instrument.Vocalist,
            InstrumentFamily.DRUMS: m21instrument.UnpitchedPercussion,
            InstrumentFamily.KEYS: m21instrument.Piano,
            InstrumentFamily.STRINGS: m21instrument.Violin,
            InstrumentFamily.WINDS: m21instrument.Flute,
        }
        inst_class = family_map.get(info.family, m21instrument.Instrument)
        inst = inst_class()
        # Notes are stored at sounding pitch; make sure no transposition is
        # applied on export (music21's guitar/bass classes transpose by 8va).
        inst.transposition = None
        inst.partName = info.name
        inst.instrumentName = info.name
        return inst

    @staticmethod
    def _get_clef(info: InstrumentInfo):
        """Backward-compatible helper: clef from an InstrumentInfo."""
        return Music21ScoreGenerator._make_clef(info.clef)

    # ── MIDI ────────────────────────────────────────────────────────────────

    def _write_midi(self, path: Path, parts: List[InstrumentPart]) -> None:
        import mido

        mid = mido.MidiFile(ticks_per_beat=PPQ, type=1)
        conductor = mido.MidiTrack()
        conductor.append(mido.MetaMessage("track_name", name=self.config.title, time=0))
        conductor.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(self.tempo_info.bpm), time=0))
        conductor.append(mido.MetaMessage(
            "time_signature",
            numerator=self.tempo_info.time_signature_numerator,
            denominator=self.tempo_info.time_signature_denominator,
            time=0,
        ))
        sharps = max(-7, min(7, self._key.sharps))
        key_name = _MIDO_KEYS.get((sharps, self._key.mode))
        if key_name:
            conductor.append(mido.MetaMessage("key_signature", key=key_name, time=0))
        mid.tracks.append(conductor)

        melodic_channel = 0
        beat_scale = 4.0 / self.tempo_info.time_signature_denominator  # quarter notes per beat
        for part in parts:
            info = part.instrument_info
            track = mido.MidiTrack()
            track.append(mido.MetaMessage("track_name", name=info.name, time=0))
            if info.is_percussion:
                channel = 9
            else:
                channel = melodic_channel
                melodic_channel = (melodic_channel + 1) % 16
                if melodic_channel == 9:
                    melodic_channel = 10
                track.append(mido.Message(
                    "program_change", channel=channel,
                    program=_GM_PROGRAMS.get(info.family, 0), time=0,
                ))

            msgs: list[tuple[int, int, mido.Message]] = []
            for n in part.notes:
                on = int(round(float(self._grid.to_beats(n.onset)) * beat_scale * PPQ))
                off = int(round(float(self._grid.to_beats(n.offset)) * beat_scale * PPQ))
                on = max(0, on)
                off = max(on + PPQ // 8, off)
                vel = max(1, min(127, int(n.velocity)))
                msgs.append((on, 1, mido.Message("note_on", note=n.pitch, velocity=vel, channel=channel)))
                msgs.append((off, 0, mido.Message("note_off", note=n.pitch, velocity=0, channel=channel)))
            msgs.sort(key=lambda m: (m[0], m[1]))
            last = 0
            for tick, _, msg in msgs:
                track.append(msg.copy(time=tick - last))
                last = tick
            mid.tracks.append(track)

        mid.save(str(path))


_MIDO_KEYS: Dict[tuple[int, str], str] = {}
for _sharps, _maj, _min in [
    (-7, "Cb", "Abm"), (-6, "Gb", "Ebm"), (-5, "Db", "Bbm"), (-4, "Ab", "Fm"),
    (-3, "Eb", "Cm"), (-2, "Bb", "Gm"), (-1, "F", "Dm"), (0, "C", "Am"),
    (1, "G", "Em"), (2, "D", "Bm"), (3, "A", "F#m"), (4, "E", "C#m"),
    (5, "B", "G#m"), (6, "F#", "D#m"), (7, "C#", "A#m"),
]:
    _MIDO_KEYS[(_sharps, "major")] = _maj
    _MIDO_KEYS[(_sharps, "minor")] = _min
