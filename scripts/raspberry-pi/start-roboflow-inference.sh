#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required. Install it first, for example: sudo apt install -y docker.io" >&2
  exit 1
fi

mkdir -p "${HOME}/.inference/cache"
docker rm -f inference-server >/dev/null 2>&1 || true

docker_args=(
  run
  --rm
  --name inference-server
  --read-only
  -p 9001:9001
  --volume "${HOME}/.inference/cache:/tmp:rw"
  --security-opt=no-new-privileges
  --cap-drop=ALL
  --cap-add=NET_BIND_SERVICE
)

if [[ -n "${ROBOFLOW_API_KEY:-}" ]]; then
  docker_args+=(-e "ROBOFLOW_API_KEY=${ROBOFLOW_API_KEY}")
fi

exec docker "${docker_args[@]}" roboflow/roboflow-inference-server-cpu:latest
