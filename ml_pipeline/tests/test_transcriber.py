"""Tests for transcriber implementations and word-to-note lyric alignment."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from ml_pipeline.data_models import (
    InstrumentFamily,
    InstrumentInfo,
    Note,
)
from ml_pipeline.transcriber import BasicPitchTranscriber, MockTranscriber


class TestMockTranscriber:
    def test_mock_transcribe_keys(self):
        transcriber = MockTranscriber(bpm=120.0)
        info = InstrumentInfo(
            name="Piano", family=InstrumentFamily.KEYS, clef="treble"
        )
        res = transcriber.transcribe(Path("dummy.wav"), info)
        assert len(res.notes) > 0
        assert res.instrument.family == InstrumentFamily.KEYS
        assert res.tempo_info.bpm == 120.0

    def test_mock_transcribe_vocals(self):
        transcriber = MockTranscriber(bpm=120.0)
        info = InstrumentInfo(
            name="Vocals", family=InstrumentFamily.VOCALS, clef="treble"
        )
        res = transcriber.transcribe(Path("dummy.wav"), info)
        assert len(res.notes) > 0
        assert res.instrument.family == InstrumentFamily.VOCALS


class TestBasicPitchTranscriberLyricAlignment:
    def test_transcribe_lyrics_alignment(self):
        mock_whisper = MagicMock()
        mock_model = MagicMock()
        mock_whisper.load_model.return_value = mock_model
        mock_model.transcribe.return_value = {
            "segments": [
                {
                    "words": [
                        {"word": " Hello ", "start": 1.0, "end": 1.4},
                        {"word": " world ", "start": 2.0, "end": 2.3},
                        {"word": " far ", "start": 10.0, "end": 10.3},  # Distant word
                    ]
                }
            ]
        }

        with patch.dict("sys.modules", {"whisper": mock_whisper}):
            transcriber = BasicPitchTranscriber()
            notes = [
                Note(pitch=60, onset=0.0, offset=0.8),
                Note(pitch=62, onset=1.05, offset=1.5),  # Close to 1.0s
                Note(pitch=64, onset=2.02, offset=2.5),  # Close to 2.0s
                Note(pitch=65, onset=3.0, offset=3.5),
            ]

            result_notes = transcriber._transcribe_lyrics(Path("dummy.wav"), notes)

            assert len(result_notes) == 4
            assert result_notes[1].lyric == "Hello"
            assert result_notes[2].lyric == "world"
            assert result_notes[0].lyric is None
            assert result_notes[3].lyric is None

    def test_transcribe_lyrics_skips_already_assigned_notes(self):
        mock_whisper = MagicMock()
        mock_model = MagicMock()
        mock_whisper.load_model.return_value = mock_model
        mock_model.transcribe.return_value = {
            "segments": [
                {
                    "words": [
                        {"word": " First ", "start": 1.0, "end": 1.2},
                        {"word": " Second ", "start": 1.05, "end": 1.3},
                    ]
                }
            ]
        }

        with patch.dict("sys.modules", {"whisper": mock_whisper}):
            transcriber = BasicPitchTranscriber()
            note1 = Note(pitch=60, onset=1.01, offset=1.5)
            note2 = Note(pitch=62, onset=1.08, offset=1.6)
            notes = [note1, note2]

            result_notes = transcriber._transcribe_lyrics(Path("dummy.wav"), notes)

            assert note1.lyric == "First"
            assert note2.lyric == "Second"

    def test_transcribe_lyrics_empty_inputs(self):
        transcriber = BasicPitchTranscriber()

        mock_whisper = MagicMock()
        mock_model = MagicMock()
        mock_whisper.load_model.return_value = mock_model
        mock_model.transcribe.return_value = {"segments": []}

        with patch.dict("sys.modules", {"whisper": mock_whisper}):
            # Empty notes
            res1 = transcriber._transcribe_lyrics(Path("dummy.wav"), [])
            assert res1 == []

            notes = [Note(pitch=60, onset=1.0, offset=1.5)]
            res2 = transcriber._transcribe_lyrics(Path("dummy.wav"), notes)
            assert res2[0].lyric is None
