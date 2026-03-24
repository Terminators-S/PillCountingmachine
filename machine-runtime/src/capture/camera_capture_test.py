from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import cv2

from .camera import collect_camera_session_info, open_camera, read_frame_with_timeout, warmup_camera
from ..config import CameraRuntimeConfig, load_camera_config, project_root
from ..overlay_ui import close_preview_window, prepare_preview_window


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Open the USB camera, save one debug frame, and write a run log.")
    parser.add_argument("--config", default="config/camera.default.json", help="Path to the camera JSON config file.")
    parser.add_argument("--camera-index", type=int, default=None, help="Override the camera index from the config.")
    parser.add_argument("--no-preview", action="store_true", help="Disable the OpenCV preview window.")
    return parser.parse_args()


def build_capture_paths(config: CameraRuntimeConfig, run_stamp: str) -> tuple[Path, Path, Path]:
    root = project_root()
    capture_dir = root / config.capture_dir
    run_log_dir = root / config.run_log_dir
    run_output_dir = root / config.run_output_dir
    capture_dir.mkdir(parents=True, exist_ok=True)
    run_log_dir.mkdir(parents=True, exist_ok=True)
    run_output_dir.mkdir(parents=True, exist_ok=True)
    return (
        capture_dir / f"camera_test_{run_stamp}.jpg",
        run_log_dir / f"camera_test_{run_stamp}.json",
        run_output_dir / f"camera_test_{run_stamp}.summary.json",
    )


def collect_runtime_metadata(camera_info, config: CameraRuntimeConfig, image_path: Path) -> dict[str, object]:
    return {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "camera_index": config.camera_index,
        "requested_width": config.frame_width,
        "requested_height": config.frame_height,
        "requested_fps": config.fps,
        "actual_width": camera_info.actual_width,
        "actual_height": camera_info.actual_height,
        "actual_fps": camera_info.actual_fps,
        "backend_name": camera_info.backend_name,
        "saved_image": str(image_path),
        "hostname": os.uname().nodename if hasattr(os, "uname") else "unknown",
    }


def save_run_log(log_path: Path, metadata: dict[str, object]) -> None:
    log_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def save_run_summary(summary_path: Path, metadata: dict[str, object]) -> None:
    summary = {
        "run_type": "camera_test",
        "timestamp_utc": metadata["timestamp_utc"],
        "camera_index": metadata["camera_index"],
        "actual_width": metadata["actual_width"],
        "actual_height": metadata["actual_height"],
        "actual_fps": metadata["actual_fps"],
        "saved_image": metadata["saved_image"],
        "status": "success",
    }
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")


def try_preview(frame, config: CameraRuntimeConfig, disabled: bool) -> None:
    if disabled:
        print("Preview disabled by flag.")
        return
    if not config.show_preview:
        print("Preview disabled by config.")
        return

    if not os.environ.get("DISPLAY") and sys.platform.startswith("linux"):
        print("DISPLAY is not set. Skipping preview window and relying on saved frame.")
        return

    try:
        prepare_preview_window(config.display_window_name, config.display_fullscreen)
        preview_end = time.time() + config.preview_seconds
        while time.time() < preview_end:
            cv2.imshow(config.display_window_name, frame)
            if cv2.waitKey(30) & 0xFF in (27, ord("q")):
                break
        close_preview_window(config.display_window_name)
    except cv2.error as exc:
        print(f"Preview skipped because OpenCV GUI is unavailable: {exc}")


def main() -> int:
    args = parse_args()
    config = load_camera_config(args.config)
    if args.camera_index is not None:
        config = CameraRuntimeConfig(**{**config.__dict__, "camera_index": args.camera_index})

    run_stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    image_path, log_path, summary_path = build_capture_paths(config, run_stamp)

    print("Opening camera with config:")
    print(json.dumps(config.__dict__, indent=2))
    capture = open_camera(config)

    if not capture.isOpened():
        print(f"ERROR: Could not open camera index {config.camera_index}.")
        print("Tip: run `bash scripts/list_cameras.sh` and try a different --camera-index.")
        return 1

    warmup_camera(capture, config.warmup_frames)
    camera_info = collect_camera_session_info(capture, config)
    frame = read_frame_with_timeout(capture, config.capture_timeout_seconds)

    if frame is None:
        capture.release()
        print("ERROR: Camera opened but no valid frame was captured before timeout.")
        return 1

    if config.save_preview_frame:
        if not cv2.imwrite(str(image_path), frame):
            capture.release()
            print(f"ERROR: Failed to save frame to {image_path}")
            return 1

    metadata = collect_runtime_metadata(camera_info, config, image_path)
    save_run_log(log_path, metadata)
    save_run_summary(summary_path, metadata)
    capture.release()

    print("Camera test succeeded.")
    print(f"Saved frame: {image_path}")
    print(f"Saved run log: {log_path}")
    print(f"Saved run summary: {summary_path}")
    print(json.dumps(metadata, indent=2))

    try_preview(frame, config, args.no_preview)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
