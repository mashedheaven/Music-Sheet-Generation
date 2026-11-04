"""Pipeline orchestrator that coordinates all processing stages.

Runs the full audio-to-score pipeline in sequence, reporting *overall*
progress (monotonically increasing 0 → 1) at each step via a callback.
"""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Callable, Optional

from ml_pipeline.config import PipelineConfig
from ml_pipeline.data_models import (
    InstrumentFamily,
    InstrumentPart,
    PipelineProgress,
    PipelineResult,
    PipelineStage,
    StemResult,
    TempoInfo,
)
from ml_pipeline.interfaces import (
    AudioPreprocessor,
    AudioSeparator,
    AudioTranscriber,
    InstrumentDetector,
    NoteQuantizer,
    ScoreGenerator,
)

logger = logging.getLogger(__name__)

# Share of the overall progress bar allotted to each stage: (start, end).
STAGE_SPAN: dict[PipelineStage, tuple[float, float]] = {
    PipelineStage.PREPROCESSING: (0.00, 0.06),
    PipelineStage.SEPARATING: (0.06, 0.45),
    PipelineStage.DETECTING: (0.45, 0.50),
    PipelineStage.TRANSCRIBING: (0.50, 0.85),
    PipelineStage.QUANTIZING: (0.85, 0.88),
    PipelineStage.GENERATING_SCORES: (0.88, 0.99),
    PipelineStage.COMPLETE: (1.0, 1.0),
    PipelineStage.FAILED: (0.0, 0.0),
}

ProgressCallback = Callable[[PipelineProgress], None]


class PipelineOrchestrator:
    """Coordinates the full audio transcription pipeline.

    Chains together preprocessing, separation, instrument detection,
    transcription, quantization, and score generation stages.
    """

    def __init__(
        self,
        preprocessor: AudioPreprocessor,
        separator: AudioSeparator,
        detector: InstrumentDetector,
        transcriber: AudioTranscriber,
        quantizer: NoteQuantizer,
        score_generator: ScoreGenerator,
        config: PipelineConfig | None = None,
        detect_tempo_from_audio: bool = True,
    ) -> None:
        self.preprocessor = preprocessor
        self.separator = separator
        self.detector = detector
        self.transcriber = transcriber
        self.quantizer = quantizer
        self.score_generator = score_generator
        self.config = config or PipelineConfig()
        self.detect_tempo_from_audio = detect_tempo_from_audio

    def run(
        self,
        audio_path: Path,
        progress_callback: Optional[ProgressCallback] = None,
        raise_errors: bool = False,
    ) -> PipelineResult:
        """Run the full pipeline on an audio file.

        Args:
            audio_path: Path to the input audio file.
            progress_callback: Receives PipelineProgress updates whose
                ``progress`` is the *overall* completion (0.0-1.0).
            raise_errors: Re-raise exceptions instead of returning an error result.

        Returns:
            PipelineResult with all outputs and metadata. On failure (and
            ``raise_errors=False``) ``metadata["error"]`` is set.
        """
        start_time = time.time()
        audio_path = Path(audio_path)
        last_overall = [0.0]

        def report(stage: PipelineStage, frac: float, message: str) -> None:
            lo, hi = STAGE_SPAN[stage]
            overall = lo + (hi - lo) * max(0.0, min(1.0, frac))
            overall = max(overall, last_overall[0]) if stage != PipelineStage.FAILED else last_overall[0]
            last_overall[0] = overall
            if progress_callback:
                progress_callback(PipelineProgress(stage=stage, progress=overall, message=message))
            logger.info("[%s] %3.0f%% — %s", stage.value, overall * 100, message)

        try:
            from ml_pipeline.audio_utils import load_audio, synthesize_notes, save_wav, write_peaks

            # 1. Preprocess -------------------------------------------------
            report(PipelineStage.PREPROCESSING, 0.0, "Reading and normalizing audio…")
            processed = self.preprocessor.process(audio_path)
            report(PipelineStage.PREPROCESSING, 0.6, f"Loaded {processed.duration:.0f}s of audio")

            assert self.config.stems_dir is not None
            mix_audio, mix_sr = load_audio(processed.file_path)
            mix_peaks = write_peaks(self.config.stems_dir / "mix.peaks.json", mix_audio, mix_sr)
            del mix_audio

            # Tempo / beat grid (from the full mix — drums + bass together give
            # the most reliable pulse).
            if self.detect_tempo_from_audio:
                from ml_pipeline.quantizer import detect_tempo

                report(PipelineStage.PREPROCESSING, 0.8, "Detecting tempo and beat grid…")
                tempo_info = detect_tempo(
                    processed.file_path,
                    bpm_override=self.config.bpm_override,
                    time_signature=self.config.time_signature,
                )
            else:
                tempo_info = TempoInfo(
                    bpm=self.config.bpm_override or 120.0,
                    time_signature_numerator=self.config.time_signature[0],
                    time_signature_denominator=self.config.time_signature[1],
                )
            report(PipelineStage.PREPROCESSING, 1.0, f"Tempo ≈ {tempo_info.bpm:.0f} BPM")

            # 2. Separate ---------------------------------------------------
            sep_name = getattr(self.separator, "name", type(self.separator).__name__)
            hint = " (this is the slowest step)" if sep_name == "demucs" else ""
            report(PipelineStage.SEPARATING, 0.02, f"Separating instruments with {sep_name}{hint}…")
            try:
                stems = self.separator.separate(processed.file_path)
            except Exception as exc:  # noqa: BLE001
                if sep_name != "demucs":
                    raise
                # e.g. model weights could not be downloaded, out of memory…
                from ml_pipeline.separator import HPSSSeparator

                logger.exception("Demucs failed; falling back to HPSS separation")
                report(PipelineStage.SEPARATING, 0.5, f"Demucs unavailable ({exc}); using fallback separator…")
                self.separator = HPSSSeparator(self.config)
                sep_name = self.separator.name
                stems = self.separator.separate(processed.file_path)
            if not self.config.transcribe_vocals:
                stems.pop("vocals", None)
            report(PipelineStage.SEPARATING, 1.0, f"Separated {len(stems)} stems: {', '.join(stems)}")

            # 3. Detect instruments ----------------------------------------
            report(PipelineStage.DETECTING, 0.0, "Identifying instruments…")
            instruments = self.detector.detect(stems)
            report(PipelineStage.DETECTING, 1.0, f"Found: {', '.join(i.name for i in instruments)}")

            # 4. Transcribe -------------------------------------------------
            stem_results: list[StemResult] = []
            raw_parts: list[InstrumentPart] = []
            n_stems = max(1, len(stems))
            for idx, ((stem_name, stem_path), instrument) in enumerate(zip(stems.items(), instruments)):
                report(PipelineStage.TRANSCRIBING, idx / n_stems, f"Transcribing {instrument.name}…")
                transcription = self.transcriber.transcribe(stem_path, instrument)
                transcription.tempo_info = tempo_info
                raw_parts.append(InstrumentPart(instrument, transcription.notes, stem_path))
                stem_results.append(StemResult(
                    instrument_info=instrument,
                    audio_path=stem_path,
                    transcription=transcription,
                    stem_name=stem_name,
                ))
                report(
                    PipelineStage.TRANSCRIBING,
                    (idx + 1) / n_stems,
                    f"{instrument.name}: {len(transcription.notes)} notes",
                )

            # 5. Quantize ---------------------------------------------------
            report(PipelineStage.QUANTIZING, 0.0, "Aligning notes to the beat grid…")
            onsets = [n.onset for p in raw_parts for n in p.notes]
            if onsets and len(tempo_info.beat_positions) >= 2:
                from ml_pipeline.quantizer import align_grid_to_onsets, refine_grid_with_drums, trim_leading_bars

                subdiv = (1.0 / tempo_info.time_signature_denominator) / self.config.quantization_grid
                drum_notes = [n for p in raw_parts if p.instrument_info.is_percussion for n in p.notes]
                if drum_notes:
                    tempo_info = refine_grid_with_drums(tempo_info, drum_notes)
                tempo_info = align_grid_to_onsets(tempo_info, onsets, subdiv)
                tempo_info = trim_leading_bars(tempo_info, min(onsets))

            instrument_parts: list[InstrumentPart] = []
            for part, sr in zip(raw_parts, stem_results):
                q = self.quantizer.quantize(part.notes, tempo_info)
                instrument_parts.append(InstrumentPart(part.instrument_info, q, part.stem_audio_path))
                sr.note_count = len(q)
            report(PipelineStage.QUANTIZING, 1.0, "Quantization complete")

            # 6. Scores + previews -----------------------------------------
            report(PipelineStage.GENERATING_SCORES, 0.0, "Engraving sheet music…")
            ensemble = self.score_generator.generate(instrument_parts, tempo_info)
            report(PipelineStage.GENERATING_SCORES, 0.7, "Rendering audio previews…")

            for i, (part, sr_) in enumerate(zip(instrument_parts, stem_results)):
                if i < len(ensemble.parts):
                    sr_.score = ensemble.parts[i]
                try:
                    stem_audio, stem_sr = load_audio(sr_.audio_path)
                    sr_.peaks_path = write_peaks(
                        sr_.audio_path.with_suffix(".peaks.json"), stem_audio, stem_sr
                    )
                    del stem_audio
                    timbre = {
                        InstrumentFamily.BASS: "bass",
                        InstrumentFamily.VOCALS: "voice",
                    }.get(part.instrument_info.family, "keys")
                    synth = synthesize_notes(
                        part.notes,
                        processed.duration,
                        sr=22050,
                        percussion=part.instrument_info.is_percussion,
                        timbre=timbre,
                    )
                    synth = synth[: int(processed.duration * 22050) + 1]
                    sr_.synth_path = save_wav(
                        sr_.audio_path.with_name(sr_.audio_path.stem + ".synth.wav"), synth, 22050
                    )
                except Exception as exc:  # noqa: BLE001 — previews are optional
                    logger.warning("Preview rendering failed for %s: %s", part.instrument_info.name, exc)

            elapsed = time.time() - start_time
            report(PipelineStage.COMPLETE, 1.0, f"Done in {elapsed:.0f}s")

            return PipelineResult(
                stems=stem_results,
                ensemble_score=ensemble,
                metadata={
                    "input_file": str(audio_path),
                    "duration_seconds": processed.duration,
                    "num_stems": len(stems),
                    "total_notes": sum(len(p.notes) for p in instrument_parts),
                    "processing_time_seconds": round(elapsed, 2),
                    "global_bpm": tempo_info.bpm,
                    "time_signature": f"{tempo_info.time_signature_numerator}/{tempo_info.time_signature_denominator}",
                    "key": ensemble.key_name,
                    "beat_times": tempo_info.beat_positions,
                    "beat_offset": tempo_info.beat_offset,
                    "separator": sep_name,
                    "transcriber": getattr(self.transcriber, "name", type(self.transcriber).__name__),
                    "mix_peaks_path": str(mix_peaks),
                },
            )

        except Exception as e:
            if raise_errors:
                raise
            report(PipelineStage.FAILED, 0.0, f"Pipeline failed: {e}")
            logger.exception("Pipeline failed for %s", audio_path)
            return PipelineResult(
                stems=[],
                ensemble_score=None,
                metadata={
                    "input_file": str(audio_path),
                    "error": str(e),
                    "error_type": type(e).__name__,
                },
            )

    @classmethod
    def create_default(
        cls,
        config: PipelineConfig | None = None,
    ) -> PipelineOrchestrator:
        """Create an orchestrator with mock separation/transcription.

        Suitable for end-to-end testing without ML models.
        """
        from ml_pipeline.instrument_detector import StemBasedDetector
        from ml_pipeline.preprocessor import BasicPreprocessor
        from ml_pipeline.quantizer import SimpleQuantizer
        from ml_pipeline.score_generator import Music21ScoreGenerator
        from ml_pipeline.separator import MockSeparator
        from ml_pipeline.transcriber import MockTranscriber

        config = config or PipelineConfig()

        return cls(
            preprocessor=BasicPreprocessor(config),
            separator=MockSeparator(config),
            detector=StemBasedDetector(indian_percussion_mode=config.indian_percussion_mode),
            transcriber=MockTranscriber(),
            quantizer=SimpleQuantizer(config),
            score_generator=Music21ScoreGenerator(config),
            config=config,
            detect_tempo_from_audio=False,
        )

    @classmethod
    def create_real(
        cls,
        config: PipelineConfig | None = None,
    ) -> PipelineOrchestrator:
        """Create an orchestrator with the best available real models.

        Uses Demucs + Basic Pitch when installed and falls back to DSP-based
        separation / pitch tracking otherwise, so it always produces output.
        """
        from ml_pipeline.instrument_detector import StemBasedDetector
        from ml_pipeline.preprocessor import BasicPreprocessor
        from ml_pipeline.quantizer import SimpleQuantizer
        from ml_pipeline.score_generator import Music21ScoreGenerator
        from ml_pipeline.separator import create_separator
        from ml_pipeline.transcriber import create_transcriber

        config = config or PipelineConfig()

        return cls(
            preprocessor=BasicPreprocessor(config),
            separator=create_separator(config),
            detector=StemBasedDetector(indian_percussion_mode=config.indian_percussion_mode),
            transcriber=create_transcriber(transcribe_lyrics=config.transcribe_lyrics),
            quantizer=SimpleQuantizer(config),
            score_generator=Music21ScoreGenerator(config),
            config=config,
        )


def capabilities(separator_backend: str = "auto") -> dict[str, object]:
    """Report which engines will be used, without importing heavy ML packages.

    Only checks that the packages are installed (fast); if one turns out to
    be broken at run time the pipeline still falls back gracefully.
    """
    import importlib.util

    def installed(*mods: str) -> bool:
        return all(importlib.util.find_spec(m) is not None for m in mods)

    has_demucs = installed("demucs", "torch")
    has_bp = installed("basic_pitch")
    backend = (separator_backend or "auto").lower()
    separator = "hpss" if backend == "hpss" or (backend == "auto" and not has_demucs) else "demucs"
    return {
        "separator": separator,
        "transcriber": "basic-pitch" if has_bp else "pyin",
        "lyrics": installed("whisper"),
        "demucs": has_demucs,
        "basic_pitch": has_bp,
    }
