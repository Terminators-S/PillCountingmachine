#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_ROOT}"

WITH_ML="false"
if [[ "${1:-}" == "--with-ml" ]]; then
  WITH_ML="true"
fi

echo "[1/4] Creating virtual environment..."
python3 -m venv --system-site-packages .venv

echo "[2/4] Activating virtual environment..."
source .venv/bin/activate

echo "[3/4] Upgrading pip..."
python -m pip install --upgrade pip

echo "[4/4] Installing Python requirements..."
python -m pip install -r requirements.txt

if [[ "${WITH_ML}" == "true" ]]; then
  echo "[5/5] Installing optional ML detector requirements..."
  python -m pip install -r requirements.ml.txt
fi

echo "Virtual environment setup completed."
