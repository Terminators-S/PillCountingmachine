from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class CameraRuntimeConfig:
    camera_index: int = 0
    machine_name: str = "pill-counter-pi"
    frame_width: int = 1280
    frame_height: int = 720
    fps: int = 30
    warmup_frames: int = 20
    capture_timeout_seconds: int = 10
    preview_seconds: int = 5
    show_preview: bool = True
    display_window_name: str = "PillCountingMachine Runtime"
    display_fullscreen: bool = True
    save_preview_frame: bool = True
    capture_dir: str = "logs/captures"
    run_log_dir: str = "logs/runs"
    run_output_dir: str = "runs"


@dataclass(frozen=True)
class RoiConfig:
    x: int
    y: int
    width: int
    height: int


@dataclass(frozen=True)
class CountLineConfig:
    start: tuple[int, int]
    end: tuple[int, int]
    allowed_direction: str

    @property
    def orientation(self) -> str:
        if self.start[1] == self.end[1]:
            return "horizontal"
        if self.start[0] == self.end[0]:
            return "vertical"
        raise ValueError("Count line must be exactly horizontal or vertical for the MVP.")


@dataclass(frozen=True)
class DetectorConfig:
    mode: str = "contour"
    threshold_type: str = "binary_inverse"
    binary_threshold: int = 145
    blur_kernel_size: int = 5
    morph_kernel_size: int = 5
    min_area: int = 250
    max_area: int = 14000
    min_width: int = 12
    min_height: int = 12


@dataclass(frozen=True)
class TrackerConfig:
    max_distance: int = 90
    max_missing_frames: int = 8
    max_trace_points: int = 20


@dataclass(frozen=True)
class RecordingConfig:
    save_debug_overlay_frames: bool = True
    debug_frame_interval: int = 30
    max_debug_frames: int = 100
    save_crossing_event_frames: bool = True


@dataclass(frozen=True)
class CountingRuntimeConfig:
    roi: RoiConfig
    count_line: CountLineConfig
    detector: DetectorConfig
    tracker: TrackerConfig
    recording: RecordingConfig


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def default_camera_config_path() -> Path:
    return project_root() / "config" / "camera.default.json"


def default_counting_config_path() -> Path:
    return project_root() / "config" / "counting.default.json"


def load_json_file(config_path: str | Path) -> dict[str, Any]:
    path = Path(config_path)
    if not path.is_absolute():
        path = project_root() / path
    return json.loads(path.read_text(encoding="utf-8"))


def load_camera_config(config_path: str | Path | None = None) -> CameraRuntimeConfig:
    raw_data = load_json_file(config_path or default_camera_config_path())
    return CameraRuntimeConfig(**raw_data)


def load_counting_config(config_path: str | Path | None = None) -> CountingRuntimeConfig:
    raw_data = load_json_file(config_path or default_counting_config_path())
    return CountingRuntimeConfig(
        roi=RoiConfig(**raw_data["roi"]),
        count_line=CountLineConfig(
            start=tuple(raw_data["count_line"]["start"]),
            end=tuple(raw_data["count_line"]["end"]),
            allowed_direction=raw_data["count_line"]["allowed_direction"],
        ),
        detector=DetectorConfig(**raw_data.get("detector", {})),
        tracker=TrackerConfig(**raw_data.get("tracker", {})),
        recording=RecordingConfig(**raw_data.get("recording", {})),
    )
