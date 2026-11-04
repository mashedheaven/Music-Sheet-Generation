"""Audio transcription implementations.

Provides mock and real (Basic Pitch) transcribers that convert
audio stems into discrete note events.
"""
from __future__ import annotations

import bisect
import contextlib
import importlib.util
import logging
import warnings
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
from ml_pipeline.note_cleanup import clean_notes

logger = logging.getLogger(__name__)


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



# ═════════════════════════════════════════════════════════════════════════════
# Real transcribers
# ═════════════════════════════════════════════════════════════════════════════


def basic_pitch_available() -> bool:
    """True when Basic Pitch and at least one inference backend can load."""
    if importlib.util.find_spec("basic_pitch") is None:
        return False
    try:
        with _quiet_logs():
            from basic_pitch import ICASSP_2022_MODEL_PATH  # noqa: F401
            from basic_pitch.inference import Model  # noqa: F401
    except Exception as exc:  # noqa: BLE001
        logger.warning("basic-pitch is installed but failed to import: %s", exc)
        return False
    return True


def whisper_available() -> bool:
    return importlib.util.find_spec("whisper") is not None


@contextlib.contextmanager
def _quiet_logs():
    """basic-pitch logs noisy warnings about optional backends on import."""
    root = logging.getLogger()
    level = root.level
    root.setLevel(logging.ERROR)
    try:
        yield
    finally:
        root.setLevel(level)


# Per-family Basic Pitch settings: (onset_thr, frame_thr, min_note_ms, fmin, fmax)
_BP_PARAMS: dict[InstrumentFamily, tuple[float, float, float, float, float]] = {
    InstrumentFamily.VOCALS: (0.5, 0.3, 120.0, 80.0, 1200.0),
    InstrumentFamily.BASS: (0.45, 0.3, 100.0, 30.0, 420.0),
    InstrumentFamily.GUITAR: (0.5, 0.32, 90.0, 75.0, 2000.0),
    InstrumentFamily.KEYS: (0.5, 0.3, 80.0, 27.0, 4200.0),
    InstrumentFamily.GENERIC_MELODIC: (0.55, 0.35, 100.0, 60.0, 3000.0),
}


class BasicPitchTranscriber(AudioTranscriber):
    """Audio transcriber using Spotify's Basic Pitch model.

    Works with whichever inference backend is installed (TensorFlow, CoreML,
    TFLite or ONNX Runtime). Percussion is delegated to ``DrumTranscriber``.
    """

    name = "basic-pitch"
    _model = None

    def __init__(self, transcribe_lyrics: bool = True) -> None:
        self.transcribe_lyrics = transcribe_lyrics
        self.drums = DrumTranscriber()

    @classmethod
    def _get_model(cls):
        if cls._model is None:
            with _quiet_logs():
                from basic_pitch import ICASSP_2022_MODEL_PATH
                from basic_pitch.inference import Model

                cls._model = Model(ICASSP_2022_MODEL_PATH)
        return cls._model

    def transcribe(self, audio_path: Path, instrument: InstrumentInfo) -> TranscriptionResult:
        if instrument.is_percussion:
            return self.drums.transcribe(audio_path, instrument)

        if _is_silent(audio_path):
            return TranscriptionResult(notes=[], instrument=instrument, tempo_info=TempoInfo())

        with _quiet_logs():
            from basic_pitch.inference import predict

        onset_t, frame_t, min_ms, fmin, fmax = _BP_PARAMS.get(
            instrument.family, _BP_PARAMS[InstrumentFamily.GENERIC_MELODIC]
        )
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            _, _, note_events = predict(
                str(audio_path),
                self._get_model(),
                onset_threshold=onset_t,
                frame_threshold=frame_t,
                minimum_note_length=min_ms,
                minimum_frequency=fmin,
                maximum_frequency=fmax,
                multiple_pitch_bends=False,
                melodia_trick=True,
            )

        notes: List[Note] = []
        for start_s, end_s, pitch_midi, amplitude, *_ in note_events:
            pitch = int(round(pitch_midi))
            if not 0 <= pitch <= 127 or end_s <= start_s:
                continue
            notes.append(Note(
                pitch=pitch,
                onset=float(start_s),
                offset=float(end_s),
                velocity=int(min(max(amplitude * 127, 1), 127)),
                channel=0,
            ))

        notes = clean_notes(notes, instrument)

        if instrument.family == InstrumentFamily.VOCALS and self.transcribe_lyrics and whisper_available():
            try:
                notes = transcribe_lyrics(audio_path, notes)
            except Exception as exc:  # noqa: BLE001 — lyrics are optional
                logger.warning("Lyrics transcription failed: %s", exc)

        return TranscriptionResult(notes=notes, instrument=instrument, tempo_info=TempoInfo())


class PitchTrackTranscriber(AudioTranscriber):
    """Fallback melodic transcriber built on librosa's pYIN pitch tracker.

    Monophonic only — it extracts the dominant melodic line of each stem.
    Used automatically when Basic Pitch is not installed.
    """

    name = "pyin"

    _RANGES: dict[InstrumentFamily, tuple[str, str]] = {
        InstrumentFamily.VOCALS: ("E2", "C6"),
        InstrumentFamily.BASS: ("B0", "G3"),
        InstrumentFamily.GUITAR: ("E2", "E6"),
        InstrumentFamily.KEYS: ("A1", "C7"),
    }

    def __init__(self) -> None:
        self.drums = DrumTranscriber()

    def transcribe(self, audio_path: Path, instrument: InstrumentInfo) -> TranscriptionResult:
        import librosa
        import numpy as np

        if instrument.is_percussion:
            return self.drums.transcribe(audio_path, instrument)
        if _is_silent(audio_path):
            return TranscriptionResult(notes=[], instrument=instrument, tempo_info=TempoInfo())

        sr = 22050
        hop = 256
        y, _ = librosa.load(str(audio_path), sr=sr, mono=True)
        lo, hi = self._RANGES.get(instrument.family, ("C2", "C6"))
        f0, voiced, voiced_prob = librosa.pyin(
            y,
            fmin=librosa.note_to_hz(lo),
            fmax=librosa.note_to_hz(hi),
            sr=sr,
            frame_length=2048,
            hop_length=hop,
        )
        rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]
        rms = rms[: f0.size]
        loud_floor = max(1e-4, float(np.percentile(rms, 30)))
        times = librosa.times_like(f0, sr=sr, hop_length=hop)

        midi = np.full(f0.shape, -1)
        ok = voiced & (voiced_prob > 0.4) & (rms[: f0.size] > loud_floor)
        midi[ok] = np.round(librosa.hz_to_midi(f0[ok])).astype(int)
        # Smooth single-frame jitter.
        from scipy.ndimage import median_filter

        midi = median_filter(midi, size=5)

        notes: List[Note] = []
        rms_ref = float(np.percentile(rms, 95)) or 1.0
        start = None
        for i in range(midi.size + 1):
            cur = midi[i] if i < midi.size else -1
            if start is not None and (cur != midi[start]):
                pitch = int(midi[start])
                if pitch >= 0:
                    seg_rms = float(rms[start:i].mean())
                    notes.append(Note(
                        pitch=pitch,
                        onset=float(times[start]),
                        offset=float(times[min(i, times.size - 1)]),
                        velocity=int(min(127, max(20, 127 * seg_rms / rms_ref))),
                    ))
                start = None
            if start is None and cur >= 0:
                start = i

        notes = clean_notes(notes, instrument)
        return TranscriptionResult(notes=notes, instrument=instrument, tempo_info=TempoInfo())


class DrumTranscriber(AudioTranscriber):
    """Onset detection + spectral classification for drum stems.

    Every onset is classified from how much energy it adds in four bands:

    * low  (30–150 Hz)   → kick
    * mid  (150–1000 Hz) + noise (1–5 kHz) → snare (broadband crack)
    * high (5–16 kHz)    → hi-hat / cymbals

    Hits are mapped to General MIDI drum numbers (36 kick, 38 snare,
    42 closed hi-hat, 49 crash).
    """

    name = "drum-classifier"

    BANDS = {"low": (30.0, 150.0), "mid": (150.0, 1000.0), "noise": (1000.0, 5000.0), "high": (5000.0, 16000.0)}

    def transcribe(self, audio_path: Path, instrument: InstrumentInfo) -> TranscriptionResult:
        import librosa
        import numpy as np

        if _is_silent(audio_path):
            return TranscriptionResult(notes=[], instrument=instrument, tempo_info=TempoInfo())

        sr = 44100
        hop = 441  # 10 ms frames
        y, _ = librosa.load(str(audio_path), sr=sr, mono=True)
        power = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop)) ** 2
        freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
        bands = {k: power[(freqs >= lo) & (freqs < hi)].sum(axis=0) for k, (lo, hi) in self.BANDS.items()}
        refs = {k: float(np.percentile(v, 99)) or 1.0 for k, v in bands.items()}

        onset_env = librosa.onset.onset_strength(S=librosa.power_to_db(power), sr=sr, hop_length=hop)
        onset_frames = librosa.onset.onset_detect(
            onset_envelope=onset_env, sr=sr, hop_length=hop, wait=4, delta=0.07, backtrack=False
        )

        notes: List[Note] = []
        n_frames = power.shape[1]
        for f in onset_frames:
            pre = slice(max(0, f - 5), max(1, f - 1))
            post = slice(f, min(n_frames, f + 5))
            inc = {
                k: max(0.0, float(v[post].max() - v[pre].min())) / refs[k]
                for k, v in bands.items()
            }
            t = float(librosa.frames_to_time(f, sr=sr, hop_length=hop))
            hits: list[tuple[int, float]] = []
            is_snare = inc["noise"] >= 0.3 and inc["mid"] >= 0.15
            is_kick = inc["low"] >= 0.3 and (inc["low"] >= 0.5 * inc["noise"] or inc["low"] >= 0.8)
            if is_kick:
                hits.append((36, inc["low"]))
            if is_snare:
                hits.append((38, inc["noise"]))
            if inc["high"] >= 0.12 and (not is_snare or inc["high"] >= 1.3 * inc["noise"]):
                # Long, loud high-band events are crashes rather than hats.
                tail = bands["high"][min(n_frames - 1, f + 30)] / refs["high"]
                gm = 49 if inc["high"] > 0.9 and tail > 0.35 else 42
                hits.append((gm, inc["high"]))
            for gm, strength in hits:
                notes.append(Note(
                    pitch=gm,
                    onset=t,
                    offset=t + 0.1,
                    velocity=int(min(127, 45 + 70 * min(1.0, strength))),
                    channel=9,
                ))

        notes.sort(key=lambda n: (n.onset, n.pitch))
        return TranscriptionResult(notes=notes, instrument=instrument, tempo_info=TempoInfo())


# ── Lyrics ──────────────────────────────────────────────────────────────────

_whisper_model = None


def transcribe_lyrics(audio_path: Path, notes: List[Note]) -> List[Note]:
    """Transcribe lyrics with Whisper and attach each word to the nearest note."""
    global _whisper_model
    import whisper

    if not notes:
        return notes
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        if _whisper_model is None:
            _whisper_model = whisper.load_model("base")
        result = _whisper_model.transcribe(str(audio_path), word_timestamps=True, fp16=False)

    words = [w for seg in result.get("segments", []) for w in seg.get("words", [])]
    return align_lyrics(notes, words)


def align_lyrics(notes: List[Note], words: list[dict], max_distance: float = 0.35) -> List[Note]:
    """Attach each word to the closest free note starting within ``max_distance``.

    Uses binary search over the sorted note onsets, so it stays fast for long
    songs (O(words · log notes) instead of O(words · notes)).
    """
    if not notes or not words:
        return notes
    notes.sort(key=lambda n: n.onset)
    onsets = [n.onset for n in notes]
    taken: set[int] = set()
    for w in words:
        text = (w.get("word") or "").strip()
        if not text:
            continue
        start = float(w["start"])
        lo = bisect.bisect_left(onsets, start - max_distance)
        hi = bisect.bisect_right(onsets, start + max_distance)
        best, best_d = None, max_distance
        for idx in range(lo, hi):
            if idx in taken:
                continue
            d = abs(onsets[idx] - start)
            if d < best_d:
                best, best_d = idx, d
        if best is not None:
            notes[best].lyric = text
            taken.add(best)
    return notes


# ── Helpers / factory ───────────────────────────────────────────────────────


def _is_silent(audio_path: Path, threshold: float = 1e-3) -> bool:
    """Cheap check so we don't hallucinate notes from an empty stem."""
    try:
        import numpy as np
        import soundfile as sf

        data, _ = sf.read(str(audio_path), dtype="float32", always_2d=True)
        if data.size == 0:
            return True
        rms = float(np.sqrt(np.mean(np.square(data))))
        return rms < threshold
    except Exception:  # noqa: BLE001
        return False


def create_transcriber(transcribe_lyrics: bool = True) -> AudioTranscriber:
    """Pick the best available melodic transcriber."""
    if basic_pitch_available():
        return BasicPitchTranscriber(transcribe_lyrics=transcribe_lyrics)
    logger.warning("basic-pitch not available — using the pYIN fallback transcriber")
    return PitchTrackTranscriber()
