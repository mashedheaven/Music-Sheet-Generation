# MuSheet: song to sheet music

> Upload a song and get sheet music for every instrument. MuSheet separates the recording into stems
> (vocals, drums, bass, other), transcribes each one, aligns everything to the song's real beat grid, and
> engraves notation you can play along with, transpose, print, or open in MuseScore / Sibelius / Dorico.

[![Python 3.10+](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green.svg)](https://fastapi.tiangolo.com/)
[![React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)

## Features

- **Stem separation**: Demucs (`htdemucs`) when installed, otherwise a built-in lightweight DSP separator.
  If Demucs fails at run time (e.g. its weights can't be downloaded), the job falls back automatically.
- **Transcription**: Spotify Basic Pitch (runs on its bundled ONNX model, no TensorFlow needed), a pYIN
  pitch-tracking fallback, and a dedicated drum classifier for kick, snare and hi-hat/crash.
- **Musical analysis**:
  - Tempo comes from a regression fit over the tracked beats.
  - Kick and snare hits fix off-beat locks and place the bar lines.
  - The key is detected (Krumhansl–Schmuckler) and accidentals are spelled for that key (B♭, not A♯, in F major).
- **Readable engraving**:
  - Notes snap to a 16th or 8th grid laid over the detected beats, with ghost notes, overtone duplicates and
    overlaps cleaned up.
  - Notes are tied across bar lines.
  - Wide keyboard parts get a grand staff, and low voices get octave clefs.
  - Drums use real kit notation.
- **Studio view**:
  - The mixer plays all stems in sync, with mute, solo and volume per track.
  - An A/B switch plays either the recording or a synth rendering of the transcription.
  - The score cursor follows playback.
  - Zoom, transpose and print/PDF are built in.
- **Exports**: MusicXML and MIDI per part, plus a full score and a multi-track MIDI file.
- **Lyrics** (optional): with `openai-whisper` installed, words are placed under the vocal line.
- **Robust jobs**: a queue, live progress over SSE, retry, rename, recovery after a server restart, and HTTP
  range requests so audio seeking works.

## Quick start

Prerequisites: **Python 3.10+**, **Node.js 18+** and, optionally, **ffmpeg** (needed for M4A/AAC).

```bash
./scripts/setup.sh            # SKIP_DEMUCS=1 ./scripts/setup.sh to skip the large Demucs/torch install
```

<details><summary>Manual setup</summary>

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
pip install --no-deps basic-pitch          # its own pins require an old TensorFlow; we use ONNX
pip install -r backend/requirements-ml.txt # optional: Demucs (best separation quality)
cd frontend && npm install
```
</details>

Run it in two terminals:

```bash
# Terminal 1 — API
source .venv/bin/activate
cd backend && uvicorn app.main:app --reload --port 8000
```

```bash
# Terminal 2 — Web app
cd frontend && npm run dev
```

Open <http://localhost:5173>. The dev server proxies `/api` to port 8000, so you never hit CORS problems.
API docs are at <http://localhost:8000/docs>.

To try it without a real song, generate a test track with a known answer (98 BPM, F major, 4/4):

```bash
python scripts/make_test_song.py test_song.wav
```

## Configuration

Set these as environment variables or in `backend/.env`:

| Variable | Default | Meaning |
|---|---|---|
| `SEPARATOR_BACKEND` | `auto` | `auto` (Demucs if installed), `demucs`, or `hpss` (lightweight) |
| `SEPARATOR_MODEL` | `htdemucs` | Any Demucs model, e.g. `htdemucs_6s` (adds guitar and piano stems) |
| `USE_GPU` | `true` | Use CUDA or Apple MPS for Demucs when available |
| `TRANSCRIBE_LYRICS` | `true` | Use Whisper for lyrics if it is installed |
| `MAX_FILE_SIZE_MB` / `MAX_DURATION_SECONDS` | `100` / `600` | Upload limits |
| `MAX_CONCURRENT_JOBS` | `1` | Jobs processed in parallel (the models are memory hungry) |
| `STORAGE_BASE_PATH` / `DATABASE_URL` | `backend/storage`, `backend/music_transcription.db` | Data locations |

For the frontend, `VITE_PROXY_TARGET` sets where the dev proxy points, and `VITE_API_URL` makes the app call
a remote API directly.

## How the pipeline works

```
upload ─► preprocess ─► separate ─► detect ─► transcribe ─► align & quantize ─► engrave
          decode any    Demucs /    stem →     Basic Pitch / pYIN  beat grid from   MusicXML (music21)
          format, 44.1k HPSS        instrument + drum classifier   drums + onsets,   MIDI (mido), peaks,
          normalize                                               trim silence      synth previews
```

| Module | Role |
|---|---|
| `ml_pipeline/preprocessor.py` | Validation and decoding (soundfile, then ffmpeg as a fallback) |
| `ml_pipeline/separator.py` | `DemucsSeparator`, `HPSSSeparator`, `MockSeparator` |
| `ml_pipeline/transcriber.py` | `BasicPitchTranscriber`, `PitchTrackTranscriber`, `DrumTranscriber`, lyrics |
| `ml_pipeline/note_cleanup.py` | Per-instrument cleanup (ranges, ghost notes, harmonics, monophony) |
| `ml_pipeline/quantizer.py` | Tempo and beat detection, drum-based grid refinement, quantization |
| `ml_pipeline/music_theory.py` | Key estimation and enharmonic spelling |
| `ml_pipeline/score_generator.py` | Engraving (chord lines, rests, ties, clefs, grand staff, drums) and MIDI |
| `ml_pipeline/orchestrator.py` | Runs the stages and reports progress |

## API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/jobs` | Upload audio (`file`, optional `title`, `bpm`, `time_signature`, `quantization`, `transcribe_vocals`, `indian_percussion_mode`) |
| `GET` | `/api/jobs` · `/api/jobs/{id}` | List jobs, or get one job with its stems, scores, tempo, key and beat grid |
| `PATCH` | `/api/jobs/{id}` | Rename |
| `POST` | `/api/jobs/{id}/retry` | Re-run the pipeline |
| `DELETE` | `/api/jobs/{id}` | Delete a job and its files |
| `GET` | `/api/jobs/{id}/progress` | Server-Sent Events progress stream |
| `GET` | `/api/files/stems/{id}/audio` · `/preview` · `/peaks` | Stem audio, transcription preview, waveform |
| `GET` | `/api/files/jobs/{id}/original` · `/peaks` | Original upload and its waveform |
| `GET` | `/api/files/scores/{id}/download` | MusicXML or MIDI (`?inline=true` to view in the browser) |
| `GET` | `/api/health` | Status plus the available engines |

## Development

```bash
python -m pytest                 # backend + ML pipeline (from the repo root)
```

```bash
cd frontend && npm test          # unit tests
```

```bash
cd frontend && npm run lint && npm run build
```

The backend tests include an end-to-end run of the real pipeline on a short generated melody.

## Limitations

Automatic transcription is a strong starting point, not a finished engraving. Expect to touch up the result,
especially for dense "other" stems such as full band arrangements. Demucs separation quality has the biggest
effect on the result, so install it if you can.

## License

MIT
