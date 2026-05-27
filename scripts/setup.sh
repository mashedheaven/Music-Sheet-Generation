#!/bin/bash
set -e

# =============================================================================
# Music Sheet Generation MVP — Local Setup Script (macOS Apple Silicon)
# =============================================================================

echo ""
echo "🎵 Music Sheet Generation MVP — Setup"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# ---- Check Python ----
echo -e "${BLUE}[1/6]${NC} Checking Python installation..."
if command -v python3 &> /dev/null; then
    PY_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
    PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
    if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 10 ]; then
        echo -e "  ${GREEN}✓${NC} Python $PY_VERSION found"
    else
        echo -e "  ${RED}✗${NC} Python 3.10+ required (found $PY_VERSION)"
        echo "  Install via: brew install python@3.11"
        exit 1
    fi
else
    echo -e "  ${RED}✗${NC} Python 3 not found"
    echo "  Install via: brew install python@3.11"
    exit 1
fi

# ---- Check Node.js ----
echo -e "${BLUE}[2/6]${NC} Checking Node.js installation..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 18 ]; then
        echo -e "  ${GREEN}✓${NC} Node.js v$NODE_VERSION found"
    else
        echo -e "  ${RED}✗${NC} Node.js 18+ required (found v$NODE_VERSION)"
        echo "  Install via: brew install node"
        exit 1
    fi
else
    echo -e "  ${RED}✗${NC} Node.js not found"
    echo "  Install via: brew install node"
    exit 1
fi

# ---- Check ffmpeg ----
echo -e "${BLUE}[3/6]${NC} Checking ffmpeg..."
if command -v ffmpeg &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} ffmpeg found"
else
    echo -e "  ${YELLOW}!${NC} ffmpeg not found (required for audio processing)"
    echo "  Installing via Homebrew..."
    brew install ffmpeg
    echo -e "  ${GREEN}✓${NC} ffmpeg installed"
fi

# ---- Python Virtual Environment ----
echo -e "${BLUE}[4/6]${NC} Setting up Python virtual environment..."
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
    echo -e "  ${GREEN}✓${NC} Virtual environment created at .venv/"
else
    echo -e "  ${GREEN}✓${NC} Virtual environment already exists"
fi

source .venv/bin/activate
echo -e "  ${GREEN}✓${NC} Activated virtual environment"

# Install Python dependencies
echo "  Installing Python dependencies..."
pip install --upgrade pip -q
pip install -r backend/requirements.txt -q
echo -e "  ${GREEN}✓${NC} Backend dependencies installed"

# Install ML pipeline dependencies (basic set for stubs)
pip install music21 librosa soundfile numpy scipy pretty_midi -q
echo -e "  ${GREEN}✓${NC} ML pipeline dependencies installed"

# ---- Frontend Setup ----
echo -e "${BLUE}[5/6]${NC} Setting up frontend..."
cd "$PROJECT_ROOT/frontend"
if [ ! -d "node_modules" ]; then
    npm install -q 2>/dev/null
    echo -e "  ${GREEN}✓${NC} Frontend dependencies installed"
else
    echo -e "  ${GREEN}✓${NC} Frontend dependencies already installed"
fi
cd "$PROJECT_ROOT"

# ---- Storage Directories ----
echo -e "${BLUE}[6/6]${NC} Ensuring storage directories..."
mkdir -p backend/storage/{uploads,stems,scores,exports}
echo -e "  ${GREEN}✓${NC} Storage directories ready"

# ---- Summary ----
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  ✓ Setup complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "To start the application:"
echo ""
echo -e "  ${YELLOW}Terminal 1 — Backend:${NC}"
echo "    source .venv/bin/activate"
echo "    cd backend && python -m uvicorn app.main:app --reload --port 8000"
echo ""
echo -e "  ${YELLOW}Terminal 2 — Frontend:${NC}"
echo "    cd frontend && npm run dev"
echo ""
echo -e "  ${BLUE}API Docs:${NC}    http://localhost:8000/docs"
echo -e "  ${BLUE}Frontend:${NC}    http://localhost:5173"
echo ""
echo -e "${YELLOW}Optional — Install real ML models later:${NC}"
echo "    pip install demucs basic-pitch"
echo "    # Or for faster Apple Silicon performance:"
echo "    pip install demucs-mlx"
echo ""
