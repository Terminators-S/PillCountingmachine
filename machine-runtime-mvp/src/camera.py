from __future__ import annotations

import sys
import time
from dataclasses import dataclass

import cv2

from .config import CameraRuntimeConfig


@dataclass(frozen=True)
class CameraSessionInfo:
    camera_index: int
    actual_width: int
    actual_height: int
    actual_fps: float
    backend_name: str


def open_camera(config: CameraRuntimeConfig) -> cv2.VideoCapture:
    backend = cv2.CAP_V4L2 if sys.platform.startswith("linux") else cv2.CAP_ANY
    capture = cv2.VideoCapture(config.camera_index, backend)
    capture.set(cv2.CAP_PROP_FRAME_WIDTH, config.frame_width)
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, config.frame_height)
    capture.set(cv2.CAP_PROP_FPS, config.fps)
    capture.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
    return capture


def warmup_camera(capture: cv2.VideoCapture, warmup_frames: int) -> None:
    for _ in range(max(0, warmup_frames)):
        capture.read()
        time.sleep(0.03)


def read_frame_with_timeout(capture: cv2.VideoCapture, timeout_seconds: int):
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        ok, frame = capture.read()
        if ok and frame is not None and frame.size > 0:
            return frame
        time.sleep(0.05)
    return None


def collect_camera_session_info(capture: cv2.VideoCapture, config: CameraRuntimeConfig) -> CameraSessionInfo:
    backend_name = capture.getBackendName() if hasattr(capture, "getBackendName") else "unknown"
    return CameraSessionInfo(
        camera_index=config.camera_index,
        actual_width=int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or config.frame_width),
        actual_height=int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or config.frame_height),
        actual_fps=float(capture.get(cv2.CAP_PROP_FPS) or config.fps),
        backend_name=backend_name,
    )
