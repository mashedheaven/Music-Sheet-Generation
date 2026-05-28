"""Tests for the SimpleQuantizer."""
from __future__ import annotations

from ml_pipeline.config import PipelineConfig
from ml_pipeline.data_models import Note, TempoInfo
from ml_pipeline.quantizer import SimpleQuantizer


class TestSimpleQuantizer:
    """Tests for note quantization logic."""

    def setup_method(self):
        self.config = PipelineConfig(quantization_grid=0.0625)  # 16th note
        self.quantizer = SimpleQuantizer(self.config)
        self.tempo = TempoInfo(bpm=120.0, time_signature_numerator=4, time_signature_denominator=4)
        # At 120 BPM, 4/4:
        # beat_duration = 0.5s
        # whole_note = 2.0s
        # grid_interval = 0.0625 * 2.0 = 0.125s

    def test_already_on_grid(self):
        """Notes already on grid positions should not move."""
        notes = [Note(pitch=60, onset=0.0, offset=0.5)]
        result = self.quantizer.quantize(notes, self.tempo)
        assert len(result) == 1
        assert result[0].onset == 0.0
        assert result[0].offset == 0.5

    def test_snap_to_nearest_grid(self):
        """Notes slightly off-grid should snap to nearest position."""
        # grid_interval = 0.125s
        # 0.06 should snap to 0.0 (closer to 0.0 than to 0.125)
        notes = [Note(pitch=60, onset=0.06, offset=0.56)]
        result = self.quantizer.quantize(notes, self.tempo)
        assert result[0].onset == 0.0
        assert result[0].offset == 0.5

    def test_snap_up_when_closer(self):
        """Notes closer to the next grid position should snap up."""
        # 0.07 should snap to 0.125 (closer to 0.125 than to 0.0)
        notes = [Note(pitch=60, onset=0.07, offset=0.57)]
        result = self.quantizer.quantize(notes, self.tempo)
        assert result[0].onset == 0.125
        assert result[0].offset == 0.625

    def test_minimum_duration(self):
        """Very short notes should get minimum duration of one grid unit."""
        # Both onset and offset snap to the same grid point
        notes = [Note(pitch=60, onset=0.01, offset=0.02)]
        result = self.quantizer.quantize(notes, self.tempo)
        # Both snap to 0.0, so offset becomes 0.0 + grid_interval = 0.125
        assert result[0].onset == 0.0
        assert result[0].offset == 0.125

    def test_preserves_pitch_and_velocity(self):
        """Quantization should not change pitch or velocity."""
        notes = [Note(pitch=72, onset=0.3, offset=0.8, velocity=110)]
        result = self.quantizer.quantize(notes, self.tempo)
        assert result[0].pitch == 72
        assert result[0].velocity == 110

    def test_multiple_notes(self):
        """Should handle multiple notes correctly."""
        notes = [
            Note(pitch=60, onset=0.0, offset=0.5),
            Note(pitch=64, onset=0.5, offset=1.0),
            Note(pitch=67, onset=1.0, offset=1.5),
        ]
        result = self.quantizer.quantize(notes, self.tempo)
        assert len(result) == 3
        assert result[0].onset == 0.0
        assert result[1].onset == 0.5
        assert result[2].onset == 1.0

    def test_empty_notes(self):
        """Empty input should return empty output."""
        result = self.quantizer.quantize([], self.tempo)
        assert result == []

    def test_different_tempo(self):
        """Grid interval changes with tempo."""
        tempo_fast = TempoInfo(bpm=240.0, time_signature_numerator=4, time_signature_denominator=4)
        # beat_duration = 0.25s, whole_note = 1.0s, grid = 0.0625s
        # 0.03 is closer to 0.0 than to 0.0625, so snaps to 0.0
        # 0.09 is closer to 0.0625 than to 0.125, so snaps to 0.0625
        # But then offset <= onset → min duration applies → offset = 0.0 + 0.0625
        notes = [Note(pitch=60, onset=0.03, offset=0.09)]
        result = self.quantizer.quantize(notes, tempo_fast)
        assert result[0].onset == 0.0
        assert result[0].offset == 0.0625

    def test_grid_interval_calculation(self):
        """Verify grid interval math is correct."""
        interval = self.quantizer._compute_grid_interval(self.tempo)
        # 120 BPM → 0.5s/beat, 4/4 → whole note = 2s, 16th = 0.0625 * 2 = 0.125s
        assert abs(interval - 0.125) < 1e-10
