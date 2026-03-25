from __future__ import annotations

import sys
import time
from dataclasses import dataclass
from pathlib import Path

import cv2

from ..config import CameraRuntimeConfig


@dataclass(frozen=True)
class CameraSessionInfo:
    camera_index: int
    actual_width: int
    actual_height: int
    actual_fps: float
    backend_name: str


@dataclass(frozen=True)
class LiveCameraOpenResult:
    capture: cv2.VideoCapture | None
    config: CameraRuntimeConfig
    first_frame: object | None
    attempted_indexes: tuple[int, ...]


def open_camera(config: CameraRuntimeConfig) -> cv2.VideoCapture:
    backend = cv2.CAP_V4L2 if sys.platform.startswith("linux") else cv2.CAP_ANY
    capture = cv2.VideoCapture(config.camera_index, backend)
    capture.set(cv2.CAP_PROP_FRAME_WIDTH, config.frame_width)
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, config.frame_height)
    capture.set(cv2.CAP_PROP_FPS, config.fps)
    capture.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
    return capture


def open_video_file(video_path: str) -> cv2.VideoCapture:
    return cv2.VideoCapture(video_path)


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


def read_frame_from_replay(capture: cv2.VideoCapture):
    ok, frame = capture.read()
    if ok and frame is not None and frame.size > 0:
        return frame
    return None


def resolve_camera_candidate_indexes(preferred_index: int, max_scan_index: int = 4) -> list[int]:
    candidates = [preferred_index]

    if sys.platform.startswith("linux"):
        for device_path in sorted(Path("/dev").glob("video*"), key=lambda path: getattr(path, "name", str(path))):
            suffix = device_path.name.removeprefix("video")
            if suffix.isdigit():
                candidate_index = int(suffix)
                if candidate_index <= max(0, max_scan_index):
                    candidates.append(candidate_index)

    for index in range(max(0, max_scan_index) + 1):
        candidates.append(index)

    seen: set[int] = set()
    unique_candidates: list[int] = []
    for index in candidates:
        if index < 0 or index in seen:
            continue
        seen.add(index)
        unique_candidates.append(index)
    return unique_candidates


def open_live_camera_source(
    config: CameraRuntimeConfig,
    *,
    explicit_camera_index: bool,
    max_scan_index: int = 4,
) -> LiveCameraOpenResult:
    candidate_indexes = (
        [config.camera_index]
        if explicit_camera_index
        else resolve_camera_candidate_indexes(config.camera_index, max_scan_index=max_scan_index)
    )

    for index in candidate_indexes:
        candidate_config = CameraRuntimeConfig(**{**config.__dict__, "camera_index": index})
        capture = open_camera(candidate_config)
        if not capture.isOpened():
            capture.release()
            continue

        warmup_camera(capture, candidate_config.warmup_frames)
        first_frame = read_frame_with_timeout(capture, candidate_config.capture_timeout_seconds)
        if first_frame is not None:
            return LiveCameraOpenResult(
                capture=capture,
                config=candidate_config,
                first_frame=first_frame,
                attempted_indexes=tuple(candidate_indexes),
            )

        capture.release()

    return LiveCameraOpenResult(
        capture=None,
        config=config,
        first_frame=None,
        attempted_indexes=tuple(candidate_indexes),
    )


def collect_camera_session_info(capture: cv2.VideoCapture, config: CameraRuntimeConfig) -> CameraSessionInfo:
    backend_name = capture.getBackendName() if hasattr(capture, "getBackendName") else "unknown"
    return CameraSessionInfo(
        camera_index=config.camera_index,
        actual_width=int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or config.frame_width),
        actual_height=int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or config.frame_height),
        actual_fps=float(capture.get(cv2.CAP_PROP_FPS) or config.fps),
        backend_name=backend_name,
    )
