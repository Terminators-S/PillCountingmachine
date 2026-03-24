from __future__ import annotations

import argparse
import json
import os
import time
from dataclasses import asdict
from datetime import datetime, timezone

import cv2
import numpy as np

from .capture import collect_camera_session_info, open_camera, read_frame_with_timeout, warmup_camera
from .config import CameraRuntimeConfig, load_camera_config, load_counting_config, project_root
from .counting import LineCounter
from .inference import ContourDetector
from .overlay_ui import absolute_line_points, draw_count_line, draw_roi_overlay, validate_count_line, validate_roi
from .storage import RunRecorder
from .tracking import CentroidTracker, TrackedObject


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the isolated machine MVP counting loop.")
    parser.add_argument("--camera-config", default="config/camera.default.json", help="Path to the camera config JSON file.")
    parser.add_argument("--counting-config", default="config/counting.default.json", help="Path to the counting config JSON file.")
    parser.add_argument("--camera-index", type=int, default=None, help="Override the camera index from the camera config.")
    parser.add_argument("--max-frames", type=int, default=0, help="Stop after this many frames. Use 0 to run until quit.")
    parser.add_argument("--no-preview", action="store_true", help="Disable the preview window.")
    return parser.parse_args()


def should_show_preview(no_preview: bool) -> bool:
    if no_preview:
        return False
    if os.name == "nt":
        return True
    return bool(os.environ.get("DISPLAY"))


def draw_detections(frame, detections) -> None:
    for detection in detections:
        x1, y1, x2, y2 = detection.bbox
        cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 215, 0), 2)
        cv2.putText(
            frame,
            f"{detection.label} area={int(detection.area)}",
            (x1, max(20, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (255, 215, 0),
            2,
        )


def draw_tracks(frame, tracks: list[TrackedObject], counted_track_ids: set[int]) -> None:
    for track in tracks:
        color = (0, 220, 0) if track.track_id not in counted_track_ids else (255, 0, 255)
        cv2.circle(frame, track.centroid, 4, color, -1)
        cv2.putText(
            frame,
            f"ID {track.track_id}",
            (track.centroid[0] + 8, max(20, track.centroid[1] - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            color,
            2,
        )
        if len(track.centroid_history) >= 2:
            points = np.array(track.centroid_history, dtype=np.int32).reshape((-1, 1, 2))
            cv2.polylines(frame, [points], False, color, 1)


def draw_status_panel(
    frame,
    total_count: int,
    frame_index: int,
    fps: float,
    detections_count: int,
    tracks_count: int,
    allowed_direction: str,
    status_text: str,
) -> None:
    lines = [
        f"Total count: {total_count}",
        f"Frame: {frame_index}",
        f"FPS: {fps:.2f}",
        f"Detections: {detections_count}",
        f"Tracks: {tracks_count}",
        f"Allowed direction: {allowed_direction}",
        f"Status: {status_text}",
    ]
    for index, line in enumerate(lines):
        y = 28 + (index * 28)
        cv2.putText(frame, line, (20, y), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (20, 20, 20), 4)
        cv2.putText(frame, line, (20, y), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)


def build_session_metadata(run_id: str, camera_info, camera_config, counting_config, line_points, detector_name: str) -> dict[str, object]:
    return {
        "run_id": run_id,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "machine_name": os.getenv("MACHINE_NAME", "pill-counter-pi"),
        "camera_index": camera_info.camera_index,
        "resolution": {
            "width": camera_info.actual_width,
            "height": camera_info.actual_height,
        },
        "fps": camera_info.actual_fps,
        "backend_name": camera_info.backend_name,
        "camera_config": asdict(camera_config),
        "roi": asdict(counting_config.roi),
        "line": {
            "start": list(line_points[0]),
            "end": list(line_points[1]),
            "allowed_direction": counting_config.count_line.allowed_direction,
            "orientation": counting_config.count_line.orientation,
        },
        "detector": {
            "model_used": detector_name,
            "confidence_threshold": None,
            **asdict(counting_config.detector),
        },
        "tracker": asdict(counting_config.tracker),
        "recording": asdict(counting_config.recording),
    }


def build_final_summary(
    run_id: str,
    started_at_utc: str,
    camera_info,
    counting_config,
    line_points,
    detector_name: str,
    line_counter: LineCounter,
    frame_index: int,
    average_fps: float,
    duration_seconds: float,
) -> dict[str, object]:
    return {
        "run_id": run_id,
        "timestamp_utc": started_at_utc,
        "camera_index": camera_info.camera_index,
        "resolution": {
            "width": camera_info.actual_width,
            "height": camera_info.actual_height,
        },
        "fps": camera_info.actual_fps,
        "average_fps": round(average_fps, 2),
        "roi": asdict(counting_config.roi),
        "line": {
            "start": list(line_points[0]),
            "end": list(line_points[1]),
            "allowed_direction": counting_config.count_line.allowed_direction,
            "orientation": counting_config.count_line.orientation,
        },
        "model_used": detector_name,
        "confidence_threshold": None,
        "binary_threshold": counting_config.detector.binary_threshold,
        "total_count": line_counter.total_count,
        "counted_track_ids": sorted(line_counter.counted_track_ids),
        "duration_seconds": round(duration_seconds, 3),
        "frames_processed": frame_index,
        "event_count": len(line_counter.events),
    }


def run() -> int:
    args = parse_args()
    camera_config = load_camera_config(args.camera_config)
    counting_config = load_counting_config(args.counting_config)

    if args.camera_index is not None:
        camera_config = CameraRuntimeConfig(**{**asdict(camera_config), "camera_index": args.camera_index})

    capture = open_camera(camera_config)
    if not capture.isOpened():
        print(f"ERROR: Could not open camera index {camera_config.camera_index}.")
        print("Run bash scripts/list_cameras.sh and try a different --camera-index.")
        return 1

    show_preview = should_show_preview(args.no_preview)
    if not show_preview and not args.no_preview:
        print("Preview window disabled because DISPLAY is not available. Saved debug frames will be used instead.")

    try:
        warmup_camera(capture, camera_config.warmup_frames)
        first_frame = read_frame_with_timeout(capture, camera_config.capture_timeout_seconds)
        if first_frame is None:
            print("ERROR: Camera opened but no valid frame was captured.")
            return 1

        validate_roi(counting_config.roi, first_frame.shape)
        validate_count_line(counting_config.roi, counting_config.count_line)

        camera_info = collect_camera_session_info(capture, camera_config)
        detector = ContourDetector(counting_config.detector)
        tracker = CentroidTracker(counting_config.tracker)
        line_counter = LineCounter(counting_config.roi, counting_config.count_line)
        line_points = absolute_line_points(counting_config.roi, counting_config.count_line)

        run_id = datetime.now().strftime("run_%Y%m%d_%H%M%S")
        session_metadata = build_session_metadata(run_id, camera_info, camera_config, counting_config, line_points, detector.model_name)
        recorder = RunRecorder(project_root() / camera_config.run_output_dir, run_id, counting_config.recording, session_metadata)
        recorder.initialize()

        print("Starting isolated machine MVP counting loop with configuration:")
        print(json.dumps(session_metadata, indent=2))

        frame_index = 0
        fps_samples: list[float] = []
        started_at = time.perf_counter()
        started_at_utc = session_metadata["timestamp_utc"]
        last_status = "Watching count line."
        pending_frame = first_frame

        while True:
            frame = pending_frame
            if frame is None:
                frame = read_frame_with_timeout(capture, camera_config.capture_timeout_seconds)
                if frame is None:
                    print("ERROR: Frame capture timed out during counting loop.")
                    break
            pending_frame = None

            frame_index += 1
            frame_started_at = time.perf_counter()

            detections, _ = detector.infer(frame, counting_config.roi)
            tracks = tracker.update(detections, frame_index)
            events = line_counter.update(tracks, frame_index)

            overlay = frame.copy()
            draw_roi_overlay(overlay, counting_config.roi)
            draw_count_line(overlay, counting_config.roi, counting_config.count_line)
            draw_detections(overlay, detections)
            draw_tracks(overlay, tracks, line_counter.counted_track_ids)

            if events:
                last_event = events[-1]
                last_status = f"Counted track {last_event.track_id} at frame {last_event.frame_index}"
                for event in events:
                    recorder.append_event(event)
                    recorder.save_crossing_event_frame(overlay, event.frame_index, event.track_id)
            else:
                last_status = "Watching count line."

            frame_elapsed = time.perf_counter() - frame_started_at
            fps = 0.0 if frame_elapsed <= 0 else 1.0 / frame_elapsed
            fps_samples.append(fps)

            draw_status_panel(
                overlay,
                total_count=line_counter.total_count,
                frame_index=frame_index,
                fps=fps,
                detections_count=len(detections),
                tracks_count=len(tracks),
                allowed_direction=counting_config.count_line.allowed_direction,
                status_text=last_status,
            )

            recorder.maybe_save_debug_frame(overlay, frame_index)

            if show_preview:
                cv2.imshow("Machine MVP Counting Loop", overlay)
                key = cv2.waitKey(1) & 0xFF
                if key in (ord("q"), 27):
                    break

            if args.max_frames > 0 and frame_index >= args.max_frames:
                break

        duration_seconds = time.perf_counter() - started_at
        average_fps = 0.0 if not fps_samples else sum(fps_samples) / len(fps_samples)
        final_summary = build_final_summary(
            run_id=run_id,
            started_at_utc=started_at_utc,
            camera_info=camera_info,
            counting_config=counting_config,
            line_points=line_points,
            detector_name=detector.model_name,
            line_counter=line_counter,
            frame_index=frame_index,
            average_fps=average_fps,
            duration_seconds=duration_seconds,
        )
        recorder.finalize(final_summary)
        print("Counting loop finished.")
        print(json.dumps(final_summary, indent=2))
        return 0
    finally:
        capture.release()
        if show_preview:
            cv2.destroyAllWindows()


if __name__ == "__main__":
    raise SystemExit(run())
