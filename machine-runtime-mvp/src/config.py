from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CameraRuntimeConfig:
    camera_index: int = 0
    frame_width: int = 1280
    frame_height: int = 720
    fps: int = 30
    warmup_frames: int = 20
    capture_timeout_seconds: int = 10
    preview_seconds: int = 5
    save_preview_frame: bool = True
    capture_dir: str = "logs/captures"
    run_log_dir: str = "logs/runs"
    run_output_dir: str = "runs"


def project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def default_config_path() -> Path:
    return project_root() / "config" / "camera.default.json"


def load_camera_config(config_path: str | Path | None = None) -> CameraRuntimeConfig:
    path = Path(config_path) if config_path else default_config_path()
    if not path.is_absolute():
        path = project_root() / path
    raw_data = json.loads(path.read_text(encoding="utf-8"))
    return CameraRuntimeConfig(**raw_data)
