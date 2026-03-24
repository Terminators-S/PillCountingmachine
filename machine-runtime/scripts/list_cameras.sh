#!/usr/bin/env bash
set -euo pipefail

echo "==== lsusb ===="
lsusb || true
echo

echo "==== /dev/video* ===="
ls -l /dev/video* || true
echo

echo "==== v4l2-ctl --list-devices ===="
v4l2-ctl --list-devices || true
echo

first_camera=""
if ls /dev/video* >/dev/null 2>&1; then
  first_camera="$(ls /dev/video* | head -n 1)"
fi

if [[ -n "${first_camera}" ]]; then
  echo "==== v4l2-ctl --device=${first_camera} --all ===="
  v4l2-ctl --device="${first_camera}" --all || true
  echo

  echo "==== v4l2-ctl --device=${first_camera} --list-formats-ext ===="
  v4l2-ctl --device="${first_camera}" --list-formats-ext || true
fi

