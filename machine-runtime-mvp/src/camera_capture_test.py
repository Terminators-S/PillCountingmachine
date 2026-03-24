from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import cv2

from .config import CameraRuntimeConfig, load_camera_config, project_root


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Open the USB camera, save one debug frame, and write a run log.")
    parser.add_argument("--config", default="config/camera.default.json", help="Path to the camera JSON config file.")
    parser.add_argument("--camera-index", type=int, default=None, help="Override the camera index from the config.")
    parser.add_argument("--no-preview", action="store_true", help="Disable the OpenCV preview window.")
    return parser.parse_args()


def build_capture_paths(config: CameraRuntimeConfig, run_stamp: str) -> tuple[Path, Path]:
    root = project_root()
    capture_dir = root / config.capture_dir
    run_log_dir = root / config.run_log_dir
    capture_dir.mkdir(parents=True, exist_ok=True)
    run_log_dir.mkdir(parents=True, exist_ok=True)
    return (
        capture_dir / f"camera_test_{run_stamp}.jpg",
        run_log_dir / f"camera_test_{run_stamp}.json",
    )


def open_camera(config: CameraRuntimeConfig) -> cv2.VideoCapture:
    backend = cv2.CAP_V4L2 if sys.platform.startswith("linux") else cv2.CAP_ANY
    capture = cv2.VideoCapture(config.camera_index, backend)
    capture.set(cv2.CAP_PROP_FRAME_WIDTH, config.frame_width)
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, config.frame_height)
    capture.set(cv2.CAP_PROP_FPS, config.fps)
    capture.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
    return capture


def collect_runtime_metadata(capture: cv2.VideoCapture, config: CameraRuntimeConfig, image_path: Path) -> dict[str, object]:
    return {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "camera_index": config.camera_index,
        "requested_width": config.frame_width,
        "requested_height": config.frame_height,
        "requested_fps": config.fps,
        "actual_width": int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)),
        "actual_height": int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)),
        "actual_fps": float(capture.get(cv2.CAP_PROP_FPS)),
        "backend_name": capture.getBackendName() if hasattr(capture, "getBackendName") else "unknown",
        "saved_image": str(image_path),
        "hostname": os.uname().nodename if hasattr(os, "uname") else "unknown",
    }


def save_run_log(log_path: Path, metadata: dict[str, object]) -> None:
    log_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def try_preview(frame, config: CameraRuntimeConfig, disabled: bool) -> None:
    if disabled:
        print("Preview disabled by flag.")
        return

    if not os.environ.get("DISPLAY") and sys.platform.startswith("linux"):
        print("DISPLAY is not set. Skipping preview window and relying on saved frame.")
        return

    try:
        preview_end = time.time() + config.preview_seconds
        while time.time() < preview_end:
            cv2.imshow("Machine MVP Camera Test", frame)
            if cv2.waitKey(30) & 0xFF in (27, ord("q")):
                break
        cv2.destroyAllWindows()
    except cv2.error as exc:
        print(f"Preview skipped because OpenCV GUI is unavailable: {exc}")


def main() -> int:
    args = parse_args()
    config = load_camera_config(args.config)
    if args.camera_index is not None:
        config = CameraRuntimeConfig(**{**config.__dict__, "camera_index": args.camera_index})

    run_stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    image_path, log_path = build_capture_paths(config, run_stamp)

    print("Opening camera with config:")
    print(json.dumps(config.__dict__, indent=2))
    capture = open_camera(config)

    if not capture.isOpened():
        print(f"ERROR: Could not open camera index {config.camera_index}.")
        print("Tip: run `bash scripts/list_cameras.sh` and try a different --camera-index.")
        return 1

    deadline = time.time() + config.capture_timeout_seconds
    frame = None

    for _ in range(config.warmup_frames):
        capture.read()
        time.sleep(0.03)

    while time.time() < deadline:
        ok, current_frame = capture.read()
        if ok and current_frame is not None and current_frame.size > 0:
            frame = current_frame
            break
        time.sleep(0.05)

    if frame is None:
        capture.release()
        print("ERROR: Camera opened but no valid frame was captured before timeout.")
        return 1

    if config.save_preview_frame:
        if not cv2.imwrite(str(image_path), frame):
            capture.release()
            print(f"ERROR: Failed to save frame to {image_path}")
            return 1

    metadata = collect_runtime_metadata(capture, config, image_path)
    save_run_log(log_path, metadata)
    capture.release()

    print("Camera test succeeded.")
    print(f"Saved frame: {image_path}")
    print(f"Saved run log: {log_path}")
    print(json.dumps(metadata, indent=2))

    try_preview(frame, config, args.no_preview)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

