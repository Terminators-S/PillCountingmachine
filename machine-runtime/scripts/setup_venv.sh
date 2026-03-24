#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_ROOT}"

echo "[1/4] Creating virtual environment..."
python3 -m venv --system-site-packages .venv

echo "[2/4] Activating virtual environment..."
source .venv/bin/activate

echo "[3/4] Upgrading pip..."
python -m pip install --upgrade pip

echo "[4/4] Installing Python requirements..."
python -m pip install -r requirements.txt

echo "Virtual environment setup completed."
