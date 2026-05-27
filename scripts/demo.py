#!/usr/bin/env python3
"""
Demo script for the Music Sheet Generation pipeline.

Runs the full pipeline (with mock implementations) on a synthetic test audio file.
This demonstrates the end-to-end flow without needing a web server.

Usage:
    cd <project_root>
    source .venv/bin/activate
    python scripts/demo.py
"""
from __future__ import annotations

import sys
import os
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


def create_test_audio(output_path: Path) -> Path:
    """Create a short synthetic test audio file (sine wave)."""
    try:
        import numpy as np
        import soundfile as sf
    except ImportError:
        print("⚠️  numpy/soundfile not installed. Creating empty WAV file.")
        # Create minimal WAV file manually
        import struct
        import wave

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(output_path), "w") as wav:
            wav.setnchannels(2)
            wav.setsampwidth(2)
            wav.setframerate(44100)
            # 5 seconds of silence
            frames = b"\x00\x00" * 2 * 44100 * 5
            wav.writeframes(frames)
        return output_path

    sample_rate = 44100
    duration = 10  # seconds
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)

    # Create a simple multi-instrument mix
    # Bass: Low frequency sine (110 Hz = A2)
    bass = 0.3 * np.sin(2 * np.pi * 110 * t)

    # Melody: Higher frequency (440 Hz = A4, with some variation)
    melody_freq = 440 + 100 * np.sin(2 * np.pi * 0.5 * t)  # vibrato
    melody = 0.2 * np.sin(2 * np.pi * melody_freq * t)

    # Chords: Stacked sines (C major: C4=261, E4=329, G4=392)
    chords = 0.15 * (
        np.sin(2 * np.pi * 261.63 * t)
        + np.sin(2 * np.pi * 329.63 * t)
        + np.sin(2 * np.pi * 392.00 * t)
    )

    # Simple "drums": Noise bursts every beat (120 BPM = every 0.5s)
    drums = np.zeros_like(t)
    beat_interval = int(0.5 * sample_rate)  # 120 BPM
    for i in range(0, len(t), beat_interval):
        burst_len = min(int(0.05 * sample_rate), len(t) - i)
        drums[i : i + burst_len] = 0.4 * np.random.randn(burst_len)

    # Mix
    mix = bass + melody + chords + drums
    mix = mix / np.max(np.abs(mix))  # Normalize

    # Stereo
    stereo = np.column_stack([mix, mix])

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), stereo, sample_rate)
    print(f"  ✓ Created test audio: {output_path} ({duration}s, {sample_rate}Hz)")
    return output_path


def main():
    print()
    print("🎵 Music Sheet Generation — Pipeline Demo")
    print("=" * 50)
    print()

    # Create output directory
    output_dir = project_root / "demo_output"
    output_dir.mkdir(exist_ok=True)

    # Step 1: Create test audio
    print("[1/2] Creating test audio file...")
    test_audio = output_dir / "test_song.wav"
    create_test_audio(test_audio)
    print()

    # Step 2: Run the pipeline
    print("[2/2] Running ML pipeline...")
    print()

    try:
        from ml_pipeline.config import PipelineConfig
        from ml_pipeline.orchestrator import PipelineOrchestrator
        from ml_pipeline.data_models import PipelineProgress

        def progress_callback(prog: PipelineProgress):
            bar_len = 30
            filled = int(bar_len * prog.progress)
            bar = "█" * filled + "░" * (bar_len - filled)
            print(f"  [{bar}] {prog.progress*100:5.1f}% | {prog.stage.value}: {prog.message}")

        # Create pipeline with default (mock) implementations
        config = PipelineConfig(output_dir=output_dir / "pipeline_output")
        pipeline = PipelineOrchestrator.create_default(config=config)

        # Run
        result = pipeline.run(
            audio_path=test_audio,
            progress_callback=progress_callback,
        )

        print()
        print("=" * 50)
        print("✅ Pipeline complete!")
        print()
        print("Results:")
        print(f"  Stems found: {len(result.stems)}")
        for stem in result.stems:
            print(f"    • {stem.instrument_info.name} ({stem.instrument_info.family.value})")
            if stem.transcription:
                print(f"      Notes: {len(stem.transcription.notes)}")
            if stem.score:
                print(f"      Score: {stem.score.musicxml_path}")
        if result.ensemble_score:
            print(f"\n  Ensemble score: {result.ensemble_score.musicxml_path}")

        print()
        print(f"Output directory: {output_dir / 'pipeline_output'}")

    except ImportError as e:
        print(f"  ⚠️  Import error: {e}")
        print("  Make sure you've activated the virtual environment:")
        print("    source .venv/bin/activate")
        print("    pip install -r backend/requirements.txt")
    except Exception as e:
        print(f"  ❌ Pipeline error: {e}")
        import traceback
        traceback.print_exc()

    print()


if __name__ == "__main__":
    main()
