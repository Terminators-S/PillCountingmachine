#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_ENV_FILE="${PROJECT_ROOT}/config/pi-machine.env"
ENV_FILE="${PILLCOUNT_ENV_FILE:-${DEFAULT_ENV_FILE}}"

cd "${PROJECT_ROOT}"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi

if [[ ! -x ".venv/bin/python" ]]; then
  echo "Missing .venv or Python executable. Run bash scripts/setup_venv.sh first."
  exit 1
fi

echo "Starting PillCountingMachine remote control agent with:"
echo "  env_file=${ENV_FILE}"
echo "  machine_code=${PILLCOUNT_MACHINE_CODE:-pill-counter-pi}"
echo "  sync_api_url=${PILLCOUNT_SYNC_API_URL:-<none>}"
echo "  control_poll_interval=${PILLCOUNT_CONTROL_POLL_INTERVAL_SECONDS:-2.0}"

exec .venv/bin/python scripts/run_machine_agent.py "$@"
