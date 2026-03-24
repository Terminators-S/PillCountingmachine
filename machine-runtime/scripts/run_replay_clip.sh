#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/run_replay_clip.sh <video-path> [extra-runtime-args]"
  exit 1
fi

if [[ ! -d ".venv" ]]; then
  echo "Missing .venv. Run bash scripts/setup_venv.sh first."
  exit 1
fi

VIDEO_PATH="$1"
shift

source .venv/bin/activate
python -m src.main --input-video "${VIDEO_PATH}" "$@"
