#!/usr/bin/env bash
set -euo pipefail

echo "[1/3] Updating package index..."
sudo apt update

echo "[2/3] Installing Raspberry Pi machine MVP packages..."
sudo apt install -y \
  python3 \
  python3-venv \
  python3-pip \
  python3-opencv \
  v4l-utils \
  usbutils \
  ffmpeg

echo "[3/3] Verifying key tools..."
python3 --version
python3 -c "import cv2; print('OpenCV version:', cv2.__version__)"
v4l2-ctl --version

echo "Pi setup completed."

