"""Audio transcription implementations.

Provides mock and real (Basic Pitch) transcribers that convert
audio stems into discrete note events.
"""
from __future__ import annotations

from pathlib import Path
from typing import List

from ml_pipeline.data_models import (
    InstrumentFamily,
    InstrumentInfo,
    Note,
    TempoInfo,
    TranscriptionResult,
)
from ml_pipeline.interfaces import AudioTranscriber


class MockTranscriber(AudioTranscriber):
    """Mock transcriber returning musically realistic note data.

    Generates 8 bars of instrument-appropriate music at 120 BPM in 4/4 time.
    Each instrument type gets a distinct, musically reasonable pattern.
    """

    def __init__(self, bpm: float = 120.0) -> None:
        self.bpm = bpm

    def transcribe(
        self, audio_path: Path, instrument: InstrumentInfo
    ) -> TranscriptionResult:
        """Generate mock transcription for the given instrument type.

        Args:
            audio_path: Path to the audio stem (not read in mock mode).
            instrument: Instrument metadata used to select the mock pattern.

        Returns:
            TranscriptionResult with 8 bars of mock note data.
        """
        beat_dur = 60.0 / self.bpm  # 0.5 seconds at 120 BPM
        measure_dur = beat_dur * 4  # 2.0 seconds per measure

        tempo_info = TempoInfo(
            bpm=self.bpm,
            time_signature_numerator=4,
            time_signature_denominator=4,
            beat_positions=[i * beat_dur for i in range(32)],  # 8 bars × 4 beats
        )

        generators = {
            InstrumentFamily.KEYS: self._generate_keys,
            InstrumentFamily.BASS: self._generate_bass,
            InstrumentFamily.DRUMS: self._generate_drums,
            InstrumentFamily.GUITAR: self._generate_guitar,
            InstrumentFamily.VOCALS: self._generate_vocals,
            InstrumentFamily.STRINGS: self._generate_melody,
            InstrumentFamily.WINDS: self._generate_melody,
        }

        generator = generators.get(instrument.family, self._generate_melody)
        notes = generator(beat_dur, measure_dur)

        return TranscriptionResult(
            notes=notes,
            instrument=instrument,
            tempo_info=tempo_info,
        )

    def _generate_keys(
        self, beat_dur: float, measure_dur: float
    ) -> List[Note]:
        """Generate a piano chord progression: C-F-G-C over 8 bars.

        Pattern: Two bars per chord, block chords on each beat.
        Chords: Cmaj(C4-E4-G4), Fmaj(F3-A3-C4), Gmaj(G3-B3-D4), Cmaj(C4-E4-G4)
        Repeated twice for 8 bars.
        """
        # MIDI: C4=60, E4=64, G4=67, F3=53, A3=57, C4=60, G3=55, B3=59, D4=62
        chord_progression = [
            [60, 64, 67],  # C major (C4, E4, G4)
            [53, 57, 60],  # F major (F3, A3, C4)
            [55, 59, 62],  # G major (G3, B3, D4)
            [60, 64, 67],  # C major (C4, E4, G4)
        ]

        notes: List[Note] = []
        for cycle in range(2):  # Repeat the progression twice = 8 bars
            for chord_idx, chord_pitches in enumerate(chord_progression):
                bar_offset = (cycle * 4 + chord_idx) * measure_dur
                for beat in range(4):  # One chord per beat
                    onset = bar_offset + beat * beat_dur
                    for pitch in chord_pitches:
                        notes.append(Note(
                            pitch=pitch,
                            onset=onset,
                            offset=onset + beat_dur * 0.9,  # Slightly staccato
                            velocity=75 if beat == 0 else 60,
                            channel=0,
                        ))

        return notes

    def _generate_bass(
        self, beat_dur: float, measure_dur: float
    ) -> List[Note]:
        """Generate a simple bassline using root notes of C-F-G-C.

        Pattern: Root note on beats 1 and 3, octave on beats 2 and 4.
        MIDI: C2=36, F2=41, G2=43
        """
        bass_roots = [36, 41, 43, 36]  # C2, F2, G2, C2

        notes: List[Note] = []
        for cycle in range(2):
            for chord_idx, root in enumerate(bass_roots):
                bar_offset = (cycle * 4 + chord_idx) * measure_dur
                for beat in range(4):
                    onset = bar_offset + beat * beat_dur
                    pitch = root if beat % 2 == 0 else root + 12  # Octave pattern
                    notes.append(Note(
                        pitch=pitch,
                        onset=onset,
                        offset=onset + beat_dur * 0.8,
                        velocity=90 if beat == 0 else 70,
                        channel=0,
                    ))

        return notes

    def _generate_drums(
        self, beat_dur: float, measure_dur: float
    ) -> List[Note]:
        """Generate a standard rock drum pattern over 8 bars.

        GM Drum Map:
        - Kick (Bass Drum 1): MIDI 36 (C2)
        - Snare: MIDI 38 (D2)
        - Closed Hi-Hat: MIDI 42 (F#2)
        - Open Hi-Hat: MIDI 46 (A#2)
        - Crash Cymbal: MIDI 49 (C#3)

        Pattern per bar (16th note grid, 16 steps per bar):
          Kick:  X...X...X...X...
          Snare: ....X.......X...
          HiHat: X.X.X.X.X.X.X.X.
        """
        sixteenth = beat_dur / 4

        notes: List[Note] = []
        for bar in range(8):
            bar_offset = bar * measure_dur

            # Add crash on beat 1 of bar 1 and bar 5
            if bar in (0, 4):
                notes.append(Note(
                    pitch=49, onset=bar_offset,
                    offset=bar_offset + beat_dur, velocity=100, channel=9,
                ))

            for step in range(16):
                t = bar_offset + step * sixteenth
                hit_dur = sixteenth * 0.8

                # Kick on steps 0, 4, 8, 12 (every beat)
                if step in (0, 4, 8, 12):
                    notes.append(Note(
                        pitch=36, onset=t, offset=t + hit_dur,
                        velocity=100 if step == 0 else 85, channel=9,
                    ))

                # Snare on steps 4 and 12 (beats 2 and 4)
                if step in (4, 12):
                    notes.append(Note(
                        pitch=38, onset=t, offset=t + hit_dur,
                        velocity=95, channel=9,
                    ))

                # Hi-hat on every even step (8th notes)
                if step % 2 == 0:
                    # Open hi-hat on step 14 for variation
                    hh_pitch = 46 if step == 14 else 42
                    notes.append(Note(
                        pitch=hh_pitch, onset=t, offset=t + hit_dur,
                        velocity=70 if step % 4 == 0 else 55, channel=9,
                    ))

        return notes

    def _generate_guitar(
        self, beat_dur: float, measure_dur: float
    ) -> List[Note]:
        """Generate a simple guitar melodic line.

        A pentatonic melody in C major over 8 bars.
        MIDI notes: C4=60, D4=62, E4=64, G4=67, A4=69, C5=72
        """
        # A repeating 2-bar melodic phrase
        phrase_notes = [
            (60, 1.0), (64, 0.5), (67, 0.5), (69, 1.0), (67, 1.0),
            (64, 0.5), (62, 0.5), (60, 1.0), (62, 0.5), (64, 0.5),
            (67, 1.0), (72, 0.5), (69, 0.5), (67, 1.0), (64, 1.0),
            (60, 1.0),
        ]

        notes: List[Note] = []
        t = 0.0
        for repeat in range(2):  # Repeat phrase pattern
            for pitch, dur_beats in phrase_notes:
                dur = dur_beats * beat_dur
                notes.append(Note(
                    pitch=pitch,
                    onset=t,
                    offset=t + dur * 0.85,
                    velocity=80,
                    channel=0,
                ))
                t += dur

        return notes

    def _generate_vocals(
        self, beat_dur: float, measure_dur: float
    ) -> List[Note]:
        """Generate a simple vocal melody line.

        Monophonic melody in C major, 8 bars. Phrases with rests
        to simulate natural vocal phrasing.
        """
        # (pitch, duration_beats, is_rest)
        melody_data = [
            # Bar 1-2: ascending phrase
            (67, 1.0, False), (69, 0.5, False), (72, 1.5, False),
            (0, 1.0, True),  # rest
            (72, 1.0, False), (74, 0.5, False), (76, 1.5, False),
            (0, 1.0, True),
            # Bar 3-4: descending phrase
            (76, 1.0, False), (74, 0.5, False), (72, 1.5, False),
            (0, 1.0, True),
            (72, 0.5, False), (69, 0.5, False), (67, 1.0, False),
            (0, 1.5, True),
            # Bar 5-6: variation
            (64, 1.0, False), (67, 1.0, False), (69, 1.0, False),
            (72, 1.0, False),
            (74, 1.5, False), (72, 0.5, False), (69, 1.0, False),
            (0, 1.0, True),
            # Bar 7-8: closing phrase
            (67, 1.0, False), (69, 0.5, False), (72, 1.5, False),
            (0, 1.0, True),
            (72, 2.0, False), (67, 2.0, False),
        ]

        notes: List[Note] = []
        t = 0.0
        for pitch, dur_beats, is_rest in melody_data:
            dur = dur_beats * beat_dur
            if not is_rest:
                notes.append(Note(
                    pitch=pitch,
                    onset=t,
                    offset=t + dur * 0.9,
                    velocity=85,
                    channel=0,
                ))
            t += dur

        return notes

    def _generate_melody(
        self, beat_dur: float, measure_dur: float
    ) -> List[Note]:
        """Generate a generic scale passage for unknown instruments.

        Ascending and descending C major scale over 8 bars.
        """
        # C major scale: C4 D4 E4 F4 G4 A4 B4 C5
        scale = [60, 62, 64, 65, 67, 69, 71, 72]
        descending = list(reversed(scale))

        notes: List[Note] = []
        t = 0.0
        for bar in range(8):
            pitches = scale if bar % 2 == 0 else descending
            for pitch in pitches:
                notes.append(Note(
                    pitch=pitch,
                    onset=t,
                    offset=t + beat_dur * 0.45,  # Eighth notes, slightly detached
                    velocity=70,
                    channel=0,
                ))
                t += beat_dur * 0.5  # Eighth note duration

        return notes


class BasicPitchTranscriber(AudioTranscriber):
    """Audio transcriber using Spotify's Basic Pitch model.

    Basic Pitch predicts MIDI notes from monophonic or polyphonic audio.
    It works best for melodic instruments (vocals, guitar, piano, bass).
    """

    def transcribe(
        self, audio_path: Path, instrument: InstrumentInfo
    ) -> TranscriptionResult:
        """Transcribe audio using the Basic Pitch model.

        Args:
            audio_path: Path to the audio stem.
            instrument: Instrument metadata.

        Returns:
            TranscriptionResult with notes predicted by Basic Pitch.
        """
        import librosa
        from basic_pitch.inference import predict
        from basic_pitch import ICASSP_2022_MODEL_PATH

        if instrument.is_percussion:
            # Basic Pitch is not designed for percussion.
            # In a real system we would use madmom or onset detection here.
            # For this MVP, we will fallback to a simple onset detector using librosa.
            return self._transcribe_percussion(audio_path, instrument)

        # Run Basic Pitch prediction
        # Returns: model_output, midi_data, note_events
        # note_events is a list of tuples: (start_time_s, end_time_s, pitch_midi, amplitude, pitch_bends)
        _, _, note_events = predict(
            str(audio_path),
            ICASSP_2022_MODEL_PATH,
            onset_threshold=0.5,
            frame_threshold=0.3,
            minimum_note_length=11,
            minimum_frequency=None,
            maximum_frequency=None,
        )

        notes: List[Note] = []
        for start_s, end_s, pitch_midi, amplitude, _ in note_events:
            notes.append(Note(
                pitch=int(round(pitch_midi)),
                onset=float(start_s),
                offset=float(end_s),
                velocity=int(min(max(amplitude * 127, 0), 127)),
                channel=0,
            ))

        tempo_info = TempoInfo()

        if instrument.family == InstrumentFamily.VOCALS:
            notes = self._transcribe_lyrics(audio_path, notes)

        return TranscriptionResult(
            notes=notes,
            instrument=instrument,
            tempo_info=tempo_info,
        )

    def _transcribe_lyrics(self, audio_path: Path, notes: List[Note]) -> List[Note]:
        """Transcribe lyrics using Whisper and align them to notes."""
        import whisper
        import warnings
        
        # Suppress warnings from Whisper/FP16 if on CPU
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            # Using 'base' model for decent speed/accuracy tradeoff
            model = whisper.load_model("base")
            # Word-level timestamps require word_timestamps=True
            result = model.transcribe(str(audio_path), word_timestamps=True)

        if not result.get("segments"):
            return notes

        words = []
        for segment in result["segments"]:
            for word_info in segment.get("words", []):
                words.append(word_info)

        if not words:
            return notes

        # Simple alignment: assign each word to the first note that falls within its timestamp,
        # or the closest note.
        for word_info in words:
            word_text = word_info["word"].strip()
            word_start = word_info["start"]
            word_end = word_info["end"]
            
            if not word_text:
                continue

            # Find the best note for this word
            # We look for a note whose onset is close to the word start
            best_note = None
            min_dist = float('inf')
            
            for note in notes:
                # If note already has a lyric, skip it
                if note.lyric:
                    continue
                    
                # Calculate distance between word start and note onset
                dist = abs(note.onset - word_start)
                
                # If the note starts roughly around the same time as the word
                if dist < 0.5 and dist < min_dist:
                    min_dist = dist
                    best_note = note
                    
            if best_note:
                best_note.lyric = word_text
                
        return notes

    def _transcribe_percussion(self, audio_path: Path, instrument: InstrumentInfo) -> TranscriptionResult:
        """Simple onset-based drum transcription for MVP."""
        import librosa
        import numpy as np

        y, sr = librosa.load(str(audio_path), sr=None)
        
        # Detect onsets
        onset_frames = librosa.onset.onset_detect(y=y, sr=sr, wait=1, pre_avg=1, post_avg=1, pre_max=1, post_max=1)
        onset_times = librosa.frames_to_time(onset_frames, sr=sr)
        
        notes: List[Note] = []
        for onset in onset_times:
            # Simple heuristic: we just map everything to a closed hi-hat or snare for the MVP
            # A more sophisticated model would classify the drum hit type.
            notes.append(Note(
                pitch=42,  # Closed hi-hat GM midi
                onset=float(onset),
                offset=float(onset) + 0.1,  # 100ms duration
                velocity=100,
                channel=9,
            ))
            
        tempo_info = TempoInfo()
        return TranscriptionResult(
            notes=notes,
            instrument=instrument,
            tempo_info=tempo_info,
        )
