"""Note quantization to rhythmic grids.

Snaps continuous-time note events to discrete rhythmic positions
based on tempo information and a configurable grid resolution.
"""
from __future__ import annotations

from typing import List

from ml_pipeline.config import PipelineConfig
from ml_pipeline.data_models import Note, TempoInfo
from ml_pipeline.interfaces import NoteQuantizer


class SimpleQuantizer(NoteQuantizer):
    """Quantizes notes by snapping onsets and offsets to the nearest grid position.

    The grid is defined by the tempo (BPM) and the quantization resolution
    (e.g. 16th notes). Each grid position is a multiple of the grid interval.

    Attributes:
        config: Pipeline configuration containing quantization_grid.
    """

    def __init__(self, config: PipelineConfig | None = None) -> None:
        self.config = config or PipelineConfig()

    def quantize(self, notes: List[Note], tempo_info: TempoInfo) -> List[Note]:
        """Snap all note onsets and offsets to the nearest grid position.

        The grid interval is calculated as:
            grid_interval = quantization_grid * whole_note_duration
        where whole_note_duration = beat_duration * time_sig_denominator.

        For 120 BPM, 4/4 time, 16th note grid:
            beat_duration = 0.5s
            whole_note = 0.5 * 4 = 2.0s
            grid_interval = 0.0625 * 2.0 = 0.125s

        Args:
            notes: Raw note events with continuous timing.
            tempo_info: Tempo and time signature information.

        Returns:
            New list of Note objects with quantized onsets/offsets.
            Notes with zero duration after quantization get a minimum
            duration of one grid unit.
        """
        grid_interval = self._compute_grid_interval(tempo_info)

        quantized: List[Note] = []
        for note in notes:
            q_onset = self._snap_to_grid(note.onset, grid_interval)
            q_offset = self._snap_to_grid(note.offset, grid_interval)

            # Ensure minimum duration of one grid unit
            if q_offset <= q_onset:
                q_offset = q_onset + grid_interval

            quantized.append(Note(
                pitch=note.pitch,
                onset=round(q_onset, 10),  # Avoid float precision artifacts
                offset=round(q_offset, 10),
                velocity=note.velocity,
                channel=note.channel,
            ))

        return quantized

    def _compute_grid_interval(self, tempo_info: TempoInfo) -> float:
        """Calculate the time duration of one grid unit in seconds.

        Args:
            tempo_info: Tempo and time signature information.

        Returns:
            Grid interval in seconds.
        """
        beat_duration = 60.0 / tempo_info.bpm
        # A whole note = beat_duration * denominator
        # (e.g. in 4/4 time, a whole note = 4 beats)
        whole_note_duration = beat_duration * tempo_info.time_signature_denominator
        return self.config.quantization_grid * whole_note_duration

    @staticmethod
    def _snap_to_grid(time_value: float, grid_interval: float) -> float:
        """Snap a time value to the nearest grid position.

        Args:
            time_value: The time to quantize, in seconds.
            grid_interval: The grid spacing in seconds.

        Returns:
            The nearest grid position in seconds.
        """
        if grid_interval <= 0:
            return time_value
        return round(time_value / grid_interval) * grid_interval


def detect_tempo_stub() -> TempoInfo:
    """Return a default tempo estimation.

    This is a placeholder for real tempo detection (e.g. using librosa.beat).
    Returns 120 BPM, 4/4 time.

    Returns:
        TempoInfo with default values.
    """
    return TempoInfo(
        bpm=120.0,
        time_signature_numerator=4,
        time_signature_denominator=4,
        beat_positions=[i * 0.5 for i in range(64)],  # 16 bars of beats
    )
