"""Pipeline orchestrator that coordinates all processing stages.

Runs the full audio-to-score pipeline in sequence, reporting
progress at each stage via an optional callback.
"""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Callable, Optional

from ml_pipeline.config import PipelineConfig
from ml_pipeline.data_models import (
    InstrumentPart,
    PipelineProgress,
    PipelineResult,
    PipelineStage,
    ScoreOutput,
    StemResult,
    TranscriptionResult,
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


class PipelineOrchestrator:
    """Coordinates the full audio transcription pipeline.

    Chains together preprocessing, separation, instrument detection,
    transcription, quantization, and score generation stages.

    Attributes:
        preprocessor: Audio file validator and normalizer.
        separator: Source separation model.
        detector: Instrument classifier.
        transcriber: Audio-to-note transcriber.
        quantizer: Note timing quantizer.
        score_generator: Score notation generator.
        config: Pipeline configuration.
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
    ) -> None:
        self.preprocessor = preprocessor
        self.separator = separator
        self.detector = detector
        self.transcriber = transcriber
        self.quantizer = quantizer
        self.score_generator = score_generator
        self.config = config or PipelineConfig()

    def run(
        self,
        audio_path: Path,
        progress_callback: Optional[Callable[[PipelineProgress], None]] = None,
    ) -> PipelineResult:
        """Run the full pipeline on an audio file.

        Processes through all stages sequentially:
        1. Preprocessing — validate and prepare audio
        2. Separation — split into instrument stems
        3. Detection — identify instruments in each stem
        4. Transcription — convert audio to note events
        5. Quantization — snap notes to rhythmic grid
        6. Score Generation — produce MusicXML/MIDI output

        Args:
            audio_path: Path to the input audio file.
            progress_callback: Optional callable receiving PipelineProgress updates.

        Returns:
            PipelineResult with all outputs and metadata.
        """
        start_time = time.time()
        audio_path = Path(audio_path)

        def _report(stage: PipelineStage, progress: float, message: str) -> None:
            if progress_callback:
                progress_callback(PipelineProgress(
                    stage=stage, progress=progress, message=message,
                ))
            logger.info("[%s] %.0f%% — %s", stage.value, progress * 100, message)

        try:
            # Stage 1: Preprocessing
            _report(PipelineStage.PREPROCESSING, 0.0, "Validating audio file...")
            processed = self.preprocessor.process(audio_path)
            _report(PipelineStage.PREPROCESSING, 1.0,
                    f"Preprocessed: {processed.duration:.1f}s, "
                    f"{processed.sample_rate}Hz, {processed.num_channels}ch")

            # Stage 2: Source Separation
            _report(PipelineStage.SEPARATING, 0.0, "Separating audio into stems...")
            stems = self.separator.separate(processed.file_path)
            _report(PipelineStage.SEPARATING, 1.0,
                    f"Separated into {len(stems)} stems: {list(stems.keys())}")

            # Stage 3: Instrument Detection
            _report(PipelineStage.DETECTING, 0.0, "Detecting instruments...")
            instruments = self.detector.detect(stems)
            _report(PipelineStage.DETECTING, 1.0,
                    f"Detected: {[i.name for i in instruments]}")

            # Stage 4 & 5: Transcription + Quantization per stem
            stem_results: list[StemResult] = []
            instrument_parts: list[InstrumentPart] = []
            stem_names = list(stems.keys())

            for idx, (stem_name, stem_path) in enumerate(stems.items()):
                instrument = instruments[idx]
                frac = idx / len(stems)

                # Transcribe
                _report(PipelineStage.TRANSCRIBING, frac,
                        f"Transcribing {instrument.name}...")
                transcription = self.transcriber.transcribe(stem_path, instrument)

                # Quantize
                _report(PipelineStage.QUANTIZING, frac,
                        f"Quantizing {instrument.name} ({len(transcription.notes)} notes)...")
                quantized_notes = self.quantizer.quantize(
                    transcription.notes, transcription.tempo_info
                )

                part = InstrumentPart(
                    instrument_info=instrument,
                    notes=quantized_notes,
                    stem_audio_path=stem_path,
                )
                instrument_parts.append(part)

                stem_results.append(StemResult(
                    instrument_info=instrument,
                    audio_path=stem_path,
                    transcription=transcription,
                ))

            _report(PipelineStage.TRANSCRIBING, 1.0,
                    f"Transcription complete for all {len(stems)} stems")
            _report(PipelineStage.QUANTIZING, 1.0, "Quantization complete")

            # Stage 6: Score Generation
            _report(PipelineStage.GENERATING_SCORES, 0.0,
                    "Generating music scores...")
            ensemble_score = self.score_generator.generate(instrument_parts)

            # Update stem results with score info
            for i, sr in enumerate(stem_results):
                sr.score = ensemble_score  # All stems reference the ensemble

            _report(PipelineStage.GENERATING_SCORES, 1.0,
                    f"Scores written to {self.config.output_dir}")

            # Complete
            elapsed = time.time() - start_time
            _report(PipelineStage.COMPLETE, 1.0,
                    f"Pipeline complete in {elapsed:.1f}s")

            return PipelineResult(
                stems=stem_results,
                ensemble_score=ensemble_score,
                metadata={
                    "input_file": str(audio_path),
                    "duration_seconds": processed.duration,
                    "num_stems": len(stems),
                    "total_notes": sum(len(p.notes) for p in instrument_parts),
                    "processing_time_seconds": round(elapsed, 2),
                },
            )

        except Exception as e:
            _report(PipelineStage.FAILED, 0.0, f"Pipeline failed: {e}")
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
        """Create an orchestrator with all mock/default implementations.

        This factory method wires up the pipeline with stubs suitable
        for end-to-end testing without ML models.

        Args:
            config: Optional pipeline configuration override.

        Returns:
            A fully configured PipelineOrchestrator.
        """
        from ml_pipeline.preprocessor import BasicPreprocessor
        from ml_pipeline.separator import MockSeparator
        from ml_pipeline.instrument_detector import StemBasedDetector
        from ml_pipeline.transcriber import MockTranscriber
        from ml_pipeline.quantizer import SimpleQuantizer
        from ml_pipeline.score_generator import Music21ScoreGenerator

        config = config or PipelineConfig()

        return cls(
            preprocessor=BasicPreprocessor(config),
            separator=MockSeparator(config),
            detector=StemBasedDetector(),
            transcriber=MockTranscriber(),
            quantizer=SimpleQuantizer(config),
            score_generator=Music21ScoreGenerator(config),
            config=config,
        )
