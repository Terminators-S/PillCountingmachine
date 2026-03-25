from __future__ import annotations

import argparse
import json
import os
import time
from collections import Counter
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

from .capture import (
    collect_camera_session_info,
    open_camera,
    open_video_file,
    read_frame_from_replay,
    read_frame_with_timeout,
    warmup_camera,
)
from .config import CameraRuntimeConfig, CountingRuntimeConfig, DetectorConfig, load_camera_config, load_counting_config, project_root
from .counting import LineCounter
from .inference import build_detector
from .overlay_ui import (
    absolute_line_points,
    close_preview_window,
    draw_count_line,
    draw_roi_overlay,
    prepare_preview_window,
    validate_count_line,
    validate_roi,
)
from .sync import SyncSettings, build_machine_runs_endpoint, build_pending_sync_payload, sync_pending_payload, utc_now_iso, write_pending_sync_payload
from .sync import (
    LiveRuntimePublisher,
    build_runtime_preview_settings,
    build_runtime_telemetry_payload,
    encode_preview_frame_as_data_url,
)
from .storage import RunRecorder
from .tracking import CentroidTracker, TrackedObject


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the isolated machine MVP counting loop.")
    parser.add_argument("--camera-config", default="config/camera.default.json", help="Path to the camera config JSON file.")
    parser.add_argument("--counting-config", default="config/counting.default.json", help="Path to the counting config JSON file.")
    parser.add_argument("--camera-index", type=int, default=None, help="Override the camera index from the camera config.")
    parser.add_argument("--input-video", default=None, help="Replay a saved clip instead of using the live camera.")
    parser.add_argument("--max-frames", type=int, default=0, help="Stop after this many frames. Use 0 to run until quit.")
    parser.add_argument("--no-preview", action="store_true", help="Disable the preview window.")
    parser.add_argument("--fullscreen", action="store_true", help="Force fullscreen preview mode.")
    parser.add_argument("--windowed", action="store_true", help="Force windowed preview mode.")
    parser.add_argument("--detector-mode", choices=["contour", "ml"], default=None, help="Override detector mode.")
    parser.add_argument("--detector-model-key", default=None, help="Override the ML model key.")
    parser.add_argument(
        "--detector-model-path",
        default=None,
        help="Override the ML model path. Supports .pt, .onnx, or an exported NCNN model directory.",
    )
    parser.add_argument("--detector-catalog-path", default=None, help="Override the legacy ML model catalog path.")
    parser.add_argument("--detector-device", default=None, help="Override detector device, for example cpu or vulkan:0.")
    parser.add_argument("--detector-inference-size", type=int, default=None, help="Override detector inference image size.")
    parser.add_argument("--sync-api-url", default=None, help="Backend API base URL, for example http://localhost:4000/api.")
    parser.add_argument("--sync-api-key", default=None, help="API key used for backend machine-run sync.")
    parser.add_argument(
        "--sync-timeout-seconds",
        type=float,
        default=None,
        help="HTTP timeout for backend sync attempts. Defaults to PILLCOUNT_SYNC_TIMEOUT_SECONDS or 10.",
    )
    parser.add_argument("--no-sync", action="store_true", help="Disable backend sync and leave pending_sync.json for later retry.")
    return parser.parse_args()


def resolve_show_preview(config: CameraRuntimeConfig, no_preview: bool) -> bool:
    if no_preview:
        return False
    if not config.show_preview:
        return False
    if os.name == "nt":
        return True
    return bool(os.environ.get("DISPLAY"))


def resolve_fullscreen(config: CameraRuntimeConfig, force_fullscreen: bool, force_windowed: bool) -> bool:
    if force_fullscreen:
        return True
    if force_windowed:
        return False
    return config.display_fullscreen


def draw_detections(frame, detections) -> None:
    for detection in detections:
        x1, y1, x2, y2 = detection.bbox
        cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 215, 0), 2)
        label_text = f"{detection.label} {detection.confidence:.2f}"
        if detection.source_backend == "contour":
            label_text = f"{detection.label} area={int(detection.area)}"
        cv2.putText(
            frame,
            label_text,
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
            f"ID {track.track_id} {track.label}",
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
    run_id: str,
    source_mode: str,
    camera_state: str,
    total_count: int,
    fps: float,
    tracks_count: int,
    event_count: int,
    runtime_status: str,
    status_text: str,
) -> None:
    lines = [
        f"Run: {run_id}",
        f"Source: {source_mode} | {camera_state}",
        f"Count: {total_count} | Events: {event_count}",
        f"FPS: {fps:.2f} | Tracks: {tracks_count}",
        f"Runtime: {runtime_status}",
        f"Status: {status_text}",
    ]
    font_scale = 0.58
    line_height = 24
    panel_width = 420
    panel_height = 18 + (line_height * len(lines))
    panel = frame.copy()
    cv2.rectangle(panel, (14, 14), (14 + panel_width, 14 + panel_height), (0, 0, 0), -1)
    cv2.addWeighted(panel, 0.42, frame, 0.58, 0, frame)

    for index, line in enumerate(lines):
        y = 38 + (index * line_height)
        cv2.putText(frame, line, (24, y), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (16, 16, 16), 4)
        cv2.putText(frame, line, (24, y), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), 1)


def env_truthy(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def runtime_status_to_control_state(runtime_status: str) -> str:
    normalized = str(runtime_status or "").strip().upper()
    if normalized in {"RUNNING", "REPLAYING"}:
        return "RUNNING"
    if normalized == "STOPPING":
        return "STOPPING"
    if normalized == "ERROR":
        return "ERROR"
    return "IDLE"


def camera_state_to_runtime_camera_state(control_state: str) -> str:
    if control_state == "ERROR":
        return "ERROR"
    if control_state in {"RUNNING", "STARTING", "STOPPING"}:
        return "OPEN"
    return "CLOSED"


def build_session_metadata(
    run_id: str,
    camera_info,
    camera_config,
    counting_config,
    line_points,
    detector_info: dict[str, object],
    source_mode: str,
    source_label: str,
) -> dict[str, object]:
    detector_backend = str(detector_info.get("backend") or counting_config.detector.mode)
    ml_runtime_backend = detector_info.get("runtime_backend")
    return {
        "run_id": run_id,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "machine_name": camera_config.machine_name,
        "camera_index": camera_info.camera_index,
        "source_mode": source_mode,
        "source_label": source_label,
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
        "detector_backend": detector_backend,
        "ml_runtime_backend": ml_runtime_backend,
        "model_key": detector_info.get("model_key"),
        "model_path": detector_info.get("model_path"),
        "model_format": detector_info.get("model_format"),
        "detector": {**asdict(counting_config.detector), **detector_info},
        "tracker": asdict(counting_config.tracker),
        "recording": asdict(counting_config.recording),
    }


def build_final_summary(
    run_id: str,
    started_at_utc: str,
    camera_info,
    machine_name: str,
    counting_config,
    line_points,
    detector_info: dict[str, object],
    line_counter: LineCounter,
    frame_index: int,
    average_fps: float,
    duration_seconds: float,
    source_mode: str,
    source_label: str,
    runtime_status: str,
    exit_reason: str,
    camera_state: str,
    status_text: str,
) -> dict[str, object]:
    counted_by_label = Counter(event.object_label for event in line_counter.events)
    counted_by_label_dict = dict(counted_by_label)
    counted_track_ids = sorted(line_counter.counted_track_ids)
    runtime_fps = round(average_fps, 2)
    detector_backend = str(detector_info.get("backend") or counting_config.detector.mode)
    ml_runtime_backend = detector_info.get("runtime_backend")
    return {
        "run_id": run_id,
        "timestamp_utc": started_at_utc,
        "completed_at_utc": datetime.now(timezone.utc).isoformat(),
        "machine_name": machine_name,
        "camera_index": camera_info.camera_index,
        "source_mode": source_mode,
        "source_label": source_label,
        "resolution": {
            "width": camera_info.actual_width,
            "height": camera_info.actual_height,
        },
        "fps": camera_info.actual_fps,
        "average_fps": runtime_fps,
        "runtime_fps": runtime_fps,
        "roi": asdict(counting_config.roi),
        "line": {
            "start": list(line_points[0]),
            "end": list(line_points[1]),
            "allowed_direction": counting_config.count_line.allowed_direction,
            "orientation": counting_config.count_line.orientation,
        },
        "detector_backend": detector_backend,
        "ml_runtime_backend": ml_runtime_backend,
        "model_key": detector_info.get("model_key"),
        "model_path": detector_info.get("model_path"),
        "model_format": detector_info.get("model_format"),
        "model_used": detector_info.get("model_name") or detector_info.get("model_key"),
        "detector": {**asdict(counting_config.detector), **detector_info},
        "count_result": {
            "total_count": line_counter.total_count,
            "event_count": len(line_counter.events),
            "counted_by_label": counted_by_label_dict,
            "counted_track_ids": counted_track_ids,
        },
        "counted_by_label": counted_by_label_dict,
        "total_count": line_counter.total_count,
        "counted_track_ids": counted_track_ids,
        "duration_seconds": round(duration_seconds, 3),
        "frames_processed": frame_index,
        "event_count": len(line_counter.events),
        "runtime_status": runtime_status,
        "exit_reason": exit_reason,
        "camera_state": camera_state,
        "status_text": status_text,
    }


def override_counting_config(counting_config: CountingRuntimeConfig, args: argparse.Namespace) -> CountingRuntimeConfig:
    detector_config = {**asdict(counting_config.detector)}
    if args.detector_mode:
        detector_config["mode"] = args.detector_mode
    if args.detector_model_key:
        detector_config["model_key"] = args.detector_model_key
    if args.detector_model_path:
        detector_config["model_path"] = args.detector_model_path
    if args.detector_catalog_path:
        detector_config["model_catalog_path"] = args.detector_catalog_path
    if args.detector_device:
        detector_config["device"] = args.detector_device
    if args.detector_inference_size:
        detector_config["inference_size"] = args.detector_inference_size

    return CountingRuntimeConfig(
        roi=counting_config.roi,
        count_line=counting_config.count_line,
        detector=DetectorConfig(**detector_config),
        tracker=counting_config.tracker,
        recording=counting_config.recording,
    )


def build_preflight_sync_metadata(sync_api_url: str, sync_api_key: str, sync_disabled: bool) -> dict[str, object]:
    api_base_url = sync_api_url or None
    endpoint = build_machine_runs_endpoint(sync_api_url) if sync_api_url else None
    configured = bool(sync_api_url or sync_api_key)
    ready = bool(sync_api_url and sync_api_key and not sync_disabled)
    status = "pending_sync"
    disabled_reason = None

    if sync_disabled:
        status = "disabled"
        disabled_reason = "disabled_by_flag"
    elif sync_api_url and not sync_api_key:
        status = "config_missing_api_key"
        disabled_reason = "missing_api_key"
    elif sync_api_key and not sync_api_url:
        status = "config_missing_api_url"
        disabled_reason = "missing_api_url"
    elif not configured:
        status = "not_configured"
        disabled_reason = "not_configured"

    return {
        "enabled": ready,
        "configured": configured,
        "ready": ready,
        "status": status,
        "attempts": 0,
        "last_attempt_at_utc": None,
        "last_synced_at_utc": None,
        "last_error": None,
        "disabled_reason": disabled_reason,
        "api_base_url": api_base_url,
        "endpoint": endpoint,
    }


def run() -> int:
    args = parse_args()
    camera_config = load_camera_config(args.camera_config)
    counting_config = override_counting_config(load_counting_config(args.counting_config), args)
    if args.fullscreen and args.windowed:
        print("ERROR: Use only one of --fullscreen or --windowed.")
        return 1

    if args.camera_index is not None:
        camera_config = CameraRuntimeConfig(**{**asdict(camera_config), "camera_index": args.camera_index})

    source_mode = "live_camera"
    source_label = f"camera:{camera_config.camera_index}"
    runtime_status = "INITIALIZING"
    exit_reason = "completed"
    camera_state = "camera connected"

    if args.input_video:
        input_video = Path(args.input_video)
        if not input_video.exists():
            print(f"ERROR: Replay clip not found: {input_video}")
            return 1
        source_mode = "replay"
        source_label = str(input_video)
        camera_state = "replay loaded"
        camera_config = CameraRuntimeConfig(**{**asdict(camera_config), "camera_index": -1})
        capture = open_video_file(str(input_video))
    else:
        capture = open_camera(camera_config)

    if not capture.isOpened():
        if source_mode == "replay":
            print(f"ERROR: Could not open replay clip: {source_label}")
        else:
            print(f"ERROR: Could not open camera index {camera_config.camera_index}.")
            print("Run bash scripts/list_cameras.sh and try a different --camera-index.")
        return 1

    show_preview = resolve_show_preview(camera_config, args.no_preview)
    fullscreen_preview = resolve_fullscreen(camera_config, args.fullscreen, args.windowed)
    if not show_preview and not args.no_preview:
        print("Preview window disabled because DISPLAY is not available. Saved debug frames will be used instead.")

    window_name = camera_config.display_window_name
    try:
        if source_mode == "live_camera":
            warmup_camera(capture, camera_config.warmup_frames)
            first_frame = read_frame_with_timeout(capture, camera_config.capture_timeout_seconds)
        else:
            first_frame = read_frame_from_replay(capture)

        if first_frame is None:
            if source_mode == "replay":
                print("ERROR: Replay clip opened but no frame was read.")
            else:
                print("ERROR: Camera opened but no valid frame was captured.")
            return 1

        validate_roi(counting_config.roi, first_frame.shape)
        validate_count_line(counting_config.roi, counting_config.count_line)

        if show_preview:
            try:
                prepare_preview_window(window_name, fullscreen_preview)
            except cv2.error as exc:
                print(f"Preview window unavailable. Falling back to headless mode: {exc}")
                show_preview = False

        camera_info = collect_camera_session_info(capture, camera_config)
        try:
            detector = build_detector(counting_config.detector)
        except Exception as exc:
            print(f"ERROR: Failed to initialize detector mode '{counting_config.detector.mode}': {exc}")
            return 1
        detector_info = detector.describe()
        tracker = CentroidTracker(counting_config.tracker)
        line_counter = LineCounter(counting_config.roi, counting_config.count_line)
        line_points = absolute_line_points(counting_config.roi, counting_config.count_line)

        run_id = datetime.now().strftime("run_%Y%m%d_%H%M%S")
        session_metadata = build_session_metadata(
            run_id, camera_info, camera_config, counting_config, line_points, detector_info, source_mode, source_label
        )
        recorder = RunRecorder(project_root() / camera_config.run_output_dir, run_id, counting_config.recording, session_metadata)
        recorder.initialize()

        sync_api_url = (args.sync_api_url or os.environ.get("PILLCOUNT_SYNC_API_URL") or "").strip()
        sync_api_key = (args.sync_api_key or os.environ.get("PILLCOUNT_SYNC_API_KEY") or "").strip()
        sync_timeout_value = args.sync_timeout_seconds or float(os.environ.get("PILLCOUNT_SYNC_TIMEOUT_SECONDS") or 10.0)
        live_preview_enabled = env_truthy("PILLCOUNT_LIVE_PREVIEW_ENABLED", True)
        live_preview_interval = float(os.environ.get("PILLCOUNT_LIVE_PREVIEW_INTERVAL_SECONDS") or 1.5)
        live_preview_timeout = float(os.environ.get("PILLCOUNT_LIVE_PREVIEW_TIMEOUT_SECONDS") or min(sync_timeout_value, 1.5))
        live_preview_max_width = int(os.environ.get("PILLCOUNT_LIVE_PREVIEW_MAX_WIDTH") or 640)
        live_preview_quality = int(os.environ.get("PILLCOUNT_LIVE_PREVIEW_JPEG_QUALITY") or 60)
        runtime_machine_code = (os.environ.get("PILLCOUNT_MACHINE_CODE") or camera_config.machine_name).strip()
        live_preview_settings = None
        if not args.no_sync and live_preview_enabled:
            live_preview_settings = build_runtime_preview_settings(
                sync_api_url,
                sync_api_key,
                runtime_machine_code,
                timeout_seconds=live_preview_timeout,
                publish_interval_seconds=live_preview_interval,
            )
        live_runtime_publisher = LiveRuntimePublisher(live_preview_settings) if live_preview_settings else None

        print("Starting isolated machine MVP counting loop with configuration:")
        print(json.dumps(session_metadata, indent=2))

        frame_index = 0
        fps_samples: list[float] = []
        started_at = time.perf_counter()
        started_at_utc = session_metadata["timestamp_utc"]
        last_status = "Watching count line."
        pending_frame = first_frame
        runtime_status = "RUNNING" if source_mode == "live_camera" else "REPLAYING"

        try:
            while True:
                frame = pending_frame
                if frame is None:
                    if source_mode == "replay":
                        frame = read_frame_from_replay(capture)
                        if frame is None:
                            runtime_status = "COMPLETED"
                            last_status = "Replay finished."
                            exit_reason = "replay_completed"
                            camera_state = "replay completed"
                            break
                    else:
                        frame = read_frame_with_timeout(capture, camera_config.capture_timeout_seconds)
                        if frame is None:
                            runtime_status = "ERROR"
                            last_status = "Frame capture timeout."
                            exit_reason = "capture_timeout"
                            camera_state = "camera timeout"
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
                    run_id=run_id,
                    source_mode=source_mode,
                    camera_state=camera_state,
                    total_count=line_counter.total_count,
                    fps=fps,
                    tracks_count=len(tracks),
                    event_count=len(line_counter.events),
                    runtime_status=runtime_status,
                    status_text=last_status,
                )

                recorder.maybe_save_debug_frame(overlay, frame_index)

                if live_runtime_publisher and live_runtime_publisher.should_publish():
                    visible_counts_by_label = Counter(detection.label for detection in detections)
                    cumulative_counts_by_label = Counter(event.object_label for event in line_counter.events)
                    average_confidence = 0.0 if not detections else sum(float(detection.confidence) for detection in detections) / len(detections)
                    snapshot_data_url = encode_preview_frame_as_data_url(
                        overlay,
                        max_width=live_preview_max_width,
                        jpeg_quality=live_preview_quality,
                    )
                    live_runtime_publisher.publish(
                        build_runtime_telemetry_payload(
                            machine_code=runtime_machine_code,
                            machine_name=camera_config.machine_name,
                            session_id=run_id,
                            emitted_at_utc=utc_now_iso(),
                            started_at_utc=started_at_utc,
                            ended_at_utc=None,
                            control_state=runtime_status_to_control_state(runtime_status),
                            camera_state=camera_state_to_runtime_camera_state(runtime_status_to_control_state(runtime_status)),
                            camera_index=camera_info.camera_index,
                            frame_width=camera_info.actual_width,
                            frame_height=camera_info.actual_height,
                            frame_number=frame_index,
                            tracked_object_count=len(tracks),
                            fps=fps,
                            average_confidence=average_confidence,
                            detector_info=detector_info,
                            visible_counts_by_label=visible_counts_by_label,
                            cumulative_counts_by_label=cumulative_counts_by_label,
                            message=last_status,
                            latest_error=None,
                            snapshot_data_url=snapshot_data_url,
                        )
                    )

                if show_preview:
                    cv2.imshow(window_name, overlay)
                    key = cv2.waitKey(1) & 0xFF
                    if key in (ord("q"), 27):
                        runtime_status = "STOPPING"
                        last_status = "Stopped by operator."
                        exit_reason = "operator_stop"
                        camera_state = "operator stop"
                        break

                if args.max_frames > 0 and frame_index >= args.max_frames:
                    runtime_status = "COMPLETED"
                    last_status = f"Reached max frame limit ({args.max_frames})."
                    exit_reason = "max_frames_reached"
                    camera_state = "frame budget reached"
                    break
        except KeyboardInterrupt:
            runtime_status = "INTERRUPTED"
            last_status = "Interrupted by operator."
            exit_reason = "keyboard_interrupt"
            camera_state = "keyboard interrupt"
            print("Interrupted by operator.")
        except Exception as exc:
            runtime_status = "ERROR"
            last_status = f"Runtime error: {exc}"
            exit_reason = "runtime_exception"
            camera_state = "runtime error"
            print(f"ERROR: Runtime exception: {exc}")

        duration_seconds = time.perf_counter() - started_at
        average_fps = 0.0 if not fps_samples else sum(fps_samples) / len(fps_samples)
        final_summary = build_final_summary(
            run_id=run_id,
            started_at_utc=started_at_utc,
            camera_info=camera_info,
            machine_name=camera_config.machine_name,
            counting_config=counting_config,
            line_points=line_points,
            detector_info=detector_info,
            line_counter=line_counter,
            frame_index=frame_index,
            average_fps=average_fps,
            duration_seconds=duration_seconds,
            source_mode=source_mode,
            source_label=source_label,
            runtime_status=runtime_status,
            exit_reason=exit_reason,
            camera_state=camera_state,
            status_text=last_status,
        )
        saved_summary = recorder.finalize(final_summary)
        sync_payload = build_pending_sync_payload(session_metadata, saved_summary, line_counter.events)
        pending_sync_path = write_pending_sync_payload(recorder.run_dir, sync_payload)

        if live_runtime_publisher:
            final_control_state = runtime_status_to_control_state(runtime_status)
            final_snapshot_url = None
            latest_debug_frame = saved_summary.get("debug_frame_paths") or []
            if latest_debug_frame:
                try:
                    final_debug_frame = cv2.imread(str(latest_debug_frame[-1]))
                    final_snapshot_url = encode_preview_frame_as_data_url(
                        final_debug_frame,
                        max_width=live_preview_max_width,
                        jpeg_quality=live_preview_quality,
                    )
                except Exception:
                    final_snapshot_url = None

            live_runtime_publisher.publish(
                build_runtime_telemetry_payload(
                    machine_code=runtime_machine_code,
                    machine_name=camera_config.machine_name,
                    session_id=run_id,
                    emitted_at_utc=utc_now_iso(),
                    started_at_utc=started_at_utc,
                    ended_at_utc=saved_summary.get("completed_at_utc"),
                    control_state=final_control_state,
                    camera_state=camera_state_to_runtime_camera_state(final_control_state),
                    camera_index=camera_info.camera_index,
                    frame_width=camera_info.actual_width,
                    frame_height=camera_info.actual_height,
                    frame_number=frame_index,
                    tracked_object_count=0,
                    fps=average_fps,
                    average_confidence=None,
                    detector_info=detector_info,
                    visible_counts_by_label={},
                    cumulative_counts_by_label=saved_summary.get("counted_by_label") or {},
                    message=saved_summary.get("status_text") or last_status,
                    latest_error=saved_summary.get("status_text") if runtime_status == "ERROR" else None,
                    snapshot_data_url=final_snapshot_url,
                ),
                force=True,
            )
            live_runtime_publisher.close(flush=True)

        sync_metadata = build_preflight_sync_metadata(sync_api_url, sync_api_key, args.no_sync)
        if not args.no_sync and sync_api_url and sync_api_key:
            sync_result = sync_pending_payload(
                pending_sync_path,
                SyncSettings(api_base_url=sync_api_url, api_key=sync_api_key, timeout_seconds=sync_timeout_value),
            )
            sync_payload = json.loads(pending_sync_path.read_text(encoding="utf-8"))
            sync_state = sync_payload.get("sync") or {}
            sync_metadata = {
                "enabled": True,
                "configured": True,
                "ready": True,
                "status": sync_state.get("status") or sync_payload.get("status"),
                "attempts": int(sync_state.get("attempts") or 0),
                "last_attempt_at_utc": sync_state.get("last_attempt_at_utc"),
                "last_synced_at_utc": sync_state.get("last_synced_at_utc"),
                "last_error": sync_state.get("last_error"),
                "disabled_reason": None,
                "api_base_url": sync_api_url,
                "endpoint": build_machine_runs_endpoint(sync_api_url),
                "last_result": sync_result,
            }
            if sync_result["ok"]:
                print(f"Synced machine run to backend: {build_machine_runs_endpoint(sync_api_url)}")
            else:
                print(f"WARNING: Backend sync failed, pending payload kept for retry: {sync_result['message']}")
        elif args.no_sync:
            print("Backend sync disabled for this run. Leaving pending_sync.json for later retry.")
        elif sync_api_url and not sync_api_key:
            print(
                "Backend sync URL is set but PILLCOUNT_SYNC_API_KEY/--sync-api-key is missing. "
                "Leaving pending_sync.json for later retry."
            )
        elif sync_api_key and not sync_api_url:
            print(
                "Backend sync API key is set but PILLCOUNT_SYNC_API_URL/--sync-api-url is missing. "
                "Leaving pending_sync.json for later retry."
            )
        else:
            print("Backend sync not configured. Leaving pending_sync.json for later retry.")

        saved_summary = {**saved_summary, "pending_sync_path": str(pending_sync_path), "sync": sync_metadata}
        recorder.summary_path.write_text(json.dumps(saved_summary, indent=2), encoding="utf-8")
        print("Counting loop finished.")
        print(json.dumps(saved_summary, indent=2))
        print(f"Saved pending sync payload: {pending_sync_path}")
        return 1 if runtime_status == "ERROR" else 0
    finally:
        capture.release()
        if show_preview:
            close_preview_window(window_name)


if __name__ == "__main__":
    raise SystemExit(run())
