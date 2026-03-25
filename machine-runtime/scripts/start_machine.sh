#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_ENV_FILE="${PROJECT_ROOT}/config/pi-machine.env"
ENV_FILE="${PILLCOUNT_ENV_FILE:-${DEFAULT_ENV_FILE}}"

cd "${PROJECT_ROOT}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

if [[ ! -d ".venv" ]]; then
  echo "Missing .venv. Run bash scripts/setup_venv.sh first."
  exit 1
fi

is_truthy() {
  local value="${1:-}"
  value="$(printf '%s' "${value}" | tr '[:upper:]' '[:lower:]')"
  [[ "${value}" == "1" || "${value}" == "true" || "${value}" == "yes" || "${value}" == "on" ]]
}

if [[ -n "${PILLCOUNT_DISPLAY:-}" && -z "${DISPLAY:-}" ]]; then
  export DISPLAY="${PILLCOUNT_DISPLAY}"
fi

if [[ -n "${PILLCOUNT_XDG_RUNTIME_DIR:-}" && -z "${XDG_RUNTIME_DIR:-}" ]]; then
  export XDG_RUNTIME_DIR="${PILLCOUNT_XDG_RUNTIME_DIR}"
fi

if [[ -n "${PILLCOUNT_WAYLAND_DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
  export WAYLAND_DISPLAY="${PILLCOUNT_WAYLAND_DISPLAY}"
fi

resolved_model_path="${PILLCOUNT_MODEL_PATH:-}"
if [[ -z "${resolved_model_path}" ]]; then
  if [[ -d "models/best_ncnn_model" ]]; then
    resolved_model_path="models/best_ncnn_model"
  elif [[ -d "../legacy/old-machine-runtime/machine-learning/models/local/train12/best_ncnn_model" ]]; then
    resolved_model_path="../legacy/old-machine-runtime/machine-learning/models/local/train12/best_ncnn_model"
  fi
fi

detector_mode="${PILLCOUNT_DETECTOR_MODE:-}"
if [[ -z "${detector_mode}" ]]; then
  if [[ -n "${resolved_model_path}" || -n "${PILLCOUNT_MODEL_KEY:-}" ]]; then
    detector_mode="ml"
  else
    detector_mode="contour"
  fi
fi

preview_enabled=1
if is_truthy "${PILLCOUNT_PREVIEW:-1}"; then
  preview_enabled=1
else
  preview_enabled=0
fi

if is_truthy "${PILLCOUNT_FULLSCREEN:-0}" && is_truthy "${PILLCOUNT_WINDOWED:-0}"; then
  echo "PILLCOUNT_FULLSCREEN and PILLCOUNT_WINDOWED cannot both be enabled."
  exit 1
fi

declare -a args
args+=(--camera-config "${PILLCOUNT_CAMERA_CONFIG:-config/camera.default.json}")
args+=(--counting-config "${PILLCOUNT_COUNTING_CONFIG:-config/counting.default.json}")
args+=(--detector-mode "${detector_mode}")

if [[ -n "${PILLCOUNT_CAMERA_INDEX:-}" ]]; then
  args+=(--camera-index "${PILLCOUNT_CAMERA_INDEX}")
fi

if [[ -n "${PILLCOUNT_INPUT_VIDEO:-}" ]]; then
  args+=(--input-video "${PILLCOUNT_INPUT_VIDEO}")
fi

if [[ -n "${PILLCOUNT_MAX_FRAMES:-}" ]]; then
  args+=(--max-frames "${PILLCOUNT_MAX_FRAMES}")
fi

if [[ "${preview_enabled}" -eq 0 ]]; then
  args+=(--no-preview)
fi

if is_truthy "${PILLCOUNT_FULLSCREEN:-0}"; then
  args+=(--fullscreen)
fi

if is_truthy "${PILLCOUNT_WINDOWED:-0}"; then
  args+=(--windowed)
fi

if [[ -n "${PILLCOUNT_MODEL_KEY:-}" ]]; then
  args+=(--detector-model-key "${PILLCOUNT_MODEL_KEY}")
fi

if [[ -n "${resolved_model_path}" ]]; then
  args+=(--detector-model-path "${resolved_model_path}")
fi

if [[ -n "${PILLCOUNT_CATALOG_PATH:-}" ]]; then
  args+=(--detector-catalog-path "${PILLCOUNT_CATALOG_PATH}")
fi

if [[ -n "${PILLCOUNT_DEVICE:-}" ]]; then
  args+=(--detector-device "${PILLCOUNT_DEVICE}")
fi

if [[ -n "${PILLCOUNT_INFERENCE_SIZE:-}" ]]; then
  args+=(--detector-inference-size "${PILLCOUNT_INFERENCE_SIZE}")
fi

if [[ -n "${PILLCOUNT_SYNC_API_URL:-}" ]]; then
  args+=(--sync-api-url "${PILLCOUNT_SYNC_API_URL}")
fi

if [[ -n "${PILLCOUNT_SYNC_API_KEY:-}" ]]; then
  args+=(--sync-api-key "${PILLCOUNT_SYNC_API_KEY}")
fi

if [[ -n "${PILLCOUNT_SYNC_TIMEOUT_SECONDS:-}" ]]; then
  args+=(--sync-timeout-seconds "${PILLCOUNT_SYNC_TIMEOUT_SECONDS}")
fi

if is_truthy "${PILLCOUNT_NO_SYNC:-0}"; then
  args+=(--no-sync)
fi

echo "Starting PillCountingMachine launcher with:"
echo "  env_file=${ENV_FILE}"
echo "  detector_mode=${detector_mode}"
echo "  model_path=${resolved_model_path:-<none>}"
echo "  model_key=${PILLCOUNT_MODEL_KEY:-<none>}"
echo "  detector_device=${PILLCOUNT_DEVICE:-<default>}"
echo "  preview_enabled=${preview_enabled}"
echo "  sync_api_url=${PILLCOUNT_SYNC_API_URL:-<none>}"
echo "  machine_code=${PILLCOUNT_MACHINE_CODE:-${PILLCOUNT_MACHINE_NAME:-pill-counter-pi}}"
echo "  live_preview_enabled=${PILLCOUNT_LIVE_PREVIEW_ENABLED:-1}"

exec bash "${SCRIPT_DIR}/run_machine_runtime.sh" "${args[@]}" "$@"
