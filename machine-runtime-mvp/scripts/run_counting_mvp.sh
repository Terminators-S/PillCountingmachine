#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

if [[ ! -d ".venv" ]]; then
  echo "Missing .venv. Run bash scripts/setup_venv.sh first."
  exit 1
fi

source .venv/bin/activate
python -m src.main "$@"
