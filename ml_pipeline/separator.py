"""Audio source separation implementations.

* ``DemucsSeparator`` — high quality separation with Meta's Demucs (needs torch).
* ``HPSSSeparator``   — lightweight DSP fallback (harmonic/percussive + filters)
  used automatically when Demucs is not installed, so the app always works.
* ``MockSeparator``   — silent placeholders for tests.
"""
from __future__ import annotations

import importlib.util
import logging
import wave
from pathlib import Path
from typing import Callable, Dict, Optional

import numpy as np

from ml_pipeline.config import PipelineConfig
from ml_pipeline.interfaces import AudioSeparator

logger = logging.getLogger(__name__)

ProgressFn = Optional[Callable[[float, str], None]]


def demucs_available() -> bool:
    """True when torch + demucs can be imported."""
    if importlib.util.find_spec("demucs") is None or importlib.util.find_spec("torch") is None:
        return False
    try:
        import torch  # noqa: F401
        from demucs.pretrained import get_model  # noqa: F401
    except Exception as exc:  # noqa: BLE001 — broken installs should fall back
        logger.warning("Demucs is installed but failed to import: %s", exc)
        return False
    return True


def create_separator(config: PipelineConfig) -> AudioSeparator:
    """Pick the best available separator for the configured backend."""
    backend = (config.separator_backend or "auto").lower()
    if backend == "hpss":
        return HPSSSeparator(config)
    if backend == "demucs" or demucs_available():
        return DemucsSeparator(config)
    logger.warning("Demucs not available — using the HPSS fallback separator")
    return HPSSSeparator(config)


class MockSeparator(AudioSeparator):
    """Mock separator that creates silent WAV placeholder stems.

    Useful for testing the pipeline end-to-end without requiring
    an actual source separation model.
    """

    DEFAULT_STEMS = ("vocals", "drums", "bass", "other")
    name = "mock"

    def __init__(
        self,
        config: PipelineConfig | None = None,
        stem_names: tuple[str, ...] | None = None,
    ) -> None:
        self.config = config or PipelineConfig()
        self.stem_names = stem_names or self.DEFAULT_STEMS

    def separate(self, audio_path: Path) -> Dict[str, Path]:
        audio_path = Path(audio_path)
        if not audio_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        self.config.ensure_directories()
        assert self.config.stems_dir is not None

        stems: Dict[str, Path] = {}
        for stem_name in self.stem_names:
            stem_path = self.config.stems_dir / f"{audio_path.stem}_{stem_name}.wav"
            self._create_silent_wav(stem_path, duration_seconds=16.0)
            stems[stem_name] = stem_path

        return stems

    @staticmethod
    def _create_silent_wav(
        path: Path,
        duration_seconds: float = 16.0,
        sample_rate: int = 44100,
        num_channels: int = 1,
    ) -> None:
        num_frames = int(sample_rate * duration_seconds)
        silent_data = b"\x00\x00" * num_frames * num_channels  # 16-bit silence

        with wave.open(str(path), "wb") as wf:
            wf.setnchannels(num_channels)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(sample_rate)
            wf.writeframes(silent_data)


class DemucsSeparator(AudioSeparator):
    """Source separator using Meta's Demucs model.

    Audio is decoded by our own loader (not torchaudio), which avoids the
    codec problems recent torchaudio releases have, and the model is run with
    ``demucs.apply.apply_model`` which is stable across Demucs versions.
    """

    name = "demucs"
    _model_cache: dict[str, object] = {}

    def __init__(self, config: PipelineConfig | None = None, progress: ProgressFn = None) -> None:
        self.config = config or PipelineConfig()
        self.model_name = self.config.separator_model
        self.progress = progress

    def _device(self) -> str:
        import torch

        if self.config.use_gpu:
            if torch.cuda.is_available():
                return "cuda"
            if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
                return "mps"
        return "cpu"

    def _load_model(self):
        if self.model_name not in self._model_cache:
            from demucs.pretrained import get_model

            logger.info("Loading Demucs model '%s' (first run downloads weights)...", self.model_name)
            model = get_model(self.model_name)
            model.eval()
            self._model_cache[self.model_name] = model
        return self._model_cache[self.model_name]

    def separate(self, audio_path: Path) -> Dict[str, Path]:
        import torch
        from demucs.apply import apply_model

        from ml_pipeline.audio_utils import load_audio, save_wav

        audio_path = Path(audio_path)
        if not audio_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        self.config.ensure_directories()
        assert self.config.stems_dir is not None

        model = self._load_model()
        sr = int(model.samplerate)
        audio, _ = load_audio(audio_path, sr=sr)
        if audio.shape[0] == 1:
            audio = np.vstack([audio, audio])
        audio = audio[: model.audio_channels]

        wav = torch.from_numpy(audio)
        ref = wav.mean(0)
        mean, std = ref.mean(), ref.std() + 1e-8
        wav = (wav - mean) / std

        device = self._device()
        logger.info("Running Demucs on %s (%s)", device, audio_path.name)
        with torch.no_grad():
            sources = apply_model(
                model,
                wav[None],
                device=device,
                shifts=1,
                split=True,
                overlap=0.25,
                progress=False,
                num_workers=0,
            )[0]
        sources = sources * std + mean

        stems: Dict[str, Path] = {}
        for name, source in zip(model.sources, sources):
            stem_path = self.config.stems_dir / f"{name}.wav"
            save_wav(stem_path, source.cpu().numpy(), sr)
            stems[name] = stem_path
        return stems


class HPSSSeparator(AudioSeparator):
    """Lightweight DSP separator used when Demucs is unavailable.

    Splits the mix into:
      * ``drums`` — percussive component (median-filter HPSS)
      * ``bass``  — harmonic component below ~220 Hz
      * ``other`` — harmonic component above ~220 Hz (melody + harmony)

    It is far less clean than Demucs, but it produces real, playable stems
    derived from the actual recording, and transcribable material.
    """

    name = "hpss"
    BASS_CUTOFF_HZ = 220.0

    def __init__(self, config: PipelineConfig | None = None) -> None:
        self.config = config or PipelineConfig()

    def separate(self, audio_path: Path) -> Dict[str, Path]:
        import librosa

        from ml_pipeline.audio_utils import load_audio, save_wav

        audio_path = Path(audio_path)
        if not audio_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        self.config.ensure_directories()
        assert self.config.stems_dir is not None

        audio, sr = load_audio(audio_path)
        n_fft = 4096
        hop = 1024
        harmonic_ch, percussive_ch, bass_ch, other_ch = [], [], [], []
        freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
        low_mask = (freqs < self.BASS_CUTOFF_HZ).astype(np.float32)[:, None]
        # Smooth crossover (one-octave fade) to avoid a brick-wall filter.
        fade = (freqs >= self.BASS_CUTOFF_HZ) & (freqs < self.BASS_CUTOFF_HZ * 2)
        low_mask[fade, 0] = 1.0 - np.log2(freqs[fade] / self.BASS_CUTOFF_HZ)

        for channel in audio:
            spec = librosa.stft(channel, n_fft=n_fft, hop_length=hop)
            harm, perc = librosa.decompose.hpss(spec, margin=(1.0, 2.0))
            percussive_ch.append(librosa.istft(perc, hop_length=hop, length=channel.size))
            bass_ch.append(librosa.istft(harm * low_mask, hop_length=hop, length=channel.size))
            other_ch.append(librosa.istft(harm * (1.0 - low_mask), hop_length=hop, length=channel.size))

        stems: Dict[str, Path] = {}
        for name, channels in (("drums", percussive_ch), ("bass", bass_ch), ("other", other_ch)):
            path = self.config.stems_dir / f"{name}.wav"
            save_wav(path, np.stack(channels), sr)
            stems[name] = path
        return stems
