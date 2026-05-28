# MuSheet — Music Sheet Generation

> **Transform any song into per-instrument sheet music.** Upload an audio file, and MuSheet separates it into individual instrument stems, transcribes each to musical notation, and generates downloadable scores.

[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green.svg)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/React-18+-61dafb.svg)](https://reactjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Features

- **Audio Source Separation** — Splits songs into stems: vocals, drums, bass, guitar, piano, and more
- **Instrument Detection** — Identifies instruments present in each stem
- **Automatic Transcription** — Converts audio to symbolic notation (notes, rhythms, dynamics)
- **Sheet Music Generation** — Produces MusicXML scores for each instrument
- **Ensemble Score** — Combined multi-staff conductor's score
- **In-Browser Rendering** — View sheet music directly in the browser (OSMD)
- **Downloads** — Export as MusicXML, MIDI, or PDF
- **Stem Playback** — Listen to individual instrument stems
- **Real-Time Progress** — SSE-powered live pipeline progress

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React)                     │
│  Dashboard │ Upload │ Transcription Detail │ Score View  │
└─────────────────────┬───────────────────────────────────┘
                      │ REST + SSE
┌─────────────────────┴───────────────────────────────────┐
│                   Backend (FastAPI)                       │
│  Job CRUD │ File Storage │ Progress Streaming │ Auth     │
└─────────────────────┬───────────────────────────────────┘
                      │ Python calls
┌─────────────────────┴───────────────────────────────────┐
│                   ML Pipeline (Python)                    │
│  Preprocess → Separate → Detect → Transcribe → Score    │
│  (librosa)   (Demucs)   (stem)   (Basic-Pitch) (music21)│
└─────────────────────────────────────────────────────────┘
```

## Project Structure

```
├── backend/                 # FastAPI REST API
│   ├── app/
│   │   ├── main.py          # App entry point
│   │   ├── models.py        # SQLAlchemy ORM models
│   │   ├── schemas.py       # Pydantic schemas
│   │   ├── routers/         # API endpoints
│   │   ├── services/        # Business logic
│   │   └── tasks/           # Background job runner
│   ├── tests/
│   └── storage/             # Local file storage
│
├── ml_pipeline/             # Audio → Sheet Music pipeline
│   ├── interfaces.py        # Abstract base classes
│   ├── data_models.py       # Internal data types
│   ├── separator.py         # Source separation (Demucs)
│   ├── transcriber.py       # Audio → Notes (Basic-Pitch)
│   ├── quantizer.py         # Tempo detection + quantization
│   ├── score_generator.py   # Notes → MusicXML (music21)
│   ├── orchestrator.py      # Pipeline coordinator
│   └── tests/
│
├── frontend/                # React + Vite + TypeScript
│   └── src/
│       ├── pages/           # Dashboard, Upload, Detail
│       ├── components/      # UI component library
│       ├── api/             # API client
│       └── hooks/           # Custom hooks (SSE, etc.)
│
└── scripts/                 # Setup & demo scripts
```

## Quick Start (macOS Apple Silicon)

### Prerequisites

- **Python 3.11+**: `brew install python@3.11`
- **Node.js 18+**: `brew install node`
- **ffmpeg**: `brew install ffmpeg`

### One-Command Setup

```bash
./scripts/setup.sh
```

### Manual Setup

```bash
# 1. Python environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
pip install music21 librosa soundfile numpy scipy pretty_midi

# 2. Frontend
cd frontend && npm install && cd ..

# 3. Storage
mkdir -p backend/storage/{uploads,stems,scores,exports}
```

### Run the Application

**Terminal 1 — Backend:**
```bash
source .venv/bin/activate
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

**Open:**
- Frontend: [http://localhost:5173](http://localhost:5173)
- API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/jobs` | Upload audio & create transcription job |
| `GET` | `/api/jobs` | List all jobs |
| `GET` | `/api/jobs/{id}` | Get job details with stems & scores |
| `DELETE` | `/api/jobs/{id}` | Delete job and files |
| `GET` | `/api/jobs/{id}/progress` | SSE stream for real-time progress |
| `GET` | `/api/files/stems/{id}/audio` | Stream stem audio |
| `GET` | `/api/files/scores/{id}/download` | Download score file |
| `GET` | `/api/health` | Health check |

## ML Pipeline Stages

1. **Pre-processing** — Normalize audio, resample to 44.1kHz
2. **Source Separation** — Split into stems via Demucs v4 (`htdemucs`)
3. **Instrument Detection** — Identify instruments per stem
4. **Transcription** — Convert audio → notes via Basic-Pitch
5. **Quantization** — Snap notes to musical grid (tempo-aware)
6. **Score Generation** — Produce MusicXML, MIDI, PDF via music21

### Extending with Real ML Models

```bash
# Install Demucs (source separation)
pip install demucs
# Or for 20-30x faster on Apple Silicon:
pip install demucs-mlx

# Install Basic-Pitch (transcription)
pip install basic-pitch
```

## 🛠️ Development

### Run Tests

```bash
# Backend
cd backend && python -m pytest tests/ -v

# ML Pipeline
cd ml_pipeline && python -m pytest tests/ -v

# Frontend
cd frontend && npm test
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 8, TypeScript, OSMD, WaveSurfer.js |
| Backend | FastAPI, SQLAlchemy, SQLite, SSE |
| ML Pipeline | Demucs, Basic-Pitch, librosa, music21 |
| Score Rendering | OpenSheetMusicDisplay (browser), music21 (server) |
| Audio | WaveSurfer.js (browser), librosa (server) |

## 📋 Current Status

**Iteration 1 (Skeleton)** — ✅ Complete
- Full backend with job CRUD, file upload, SSE progress
- ML pipeline with pluggable interfaces and mock implementations
- Premium dark-mode frontend with all core pages
- End-to-end flow with stub data

**Iteration 2 (Basic Pipeline)** — 🔜 Next
- Real source separation via Demucs
- Real transcription via Basic-Pitch
- Real score rendering via OSMD

## 📄 License

MIT
