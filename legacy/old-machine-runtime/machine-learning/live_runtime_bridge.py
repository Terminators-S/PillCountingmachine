import argparse
import base64
import json
import os
import signal
import sys
import time
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import cv2
import cvzone
import numpy as np
from ultralytics import YOLO

from model_registry import list_models, resolve_model


ROOT = Path(__file__).resolve().parent
DEFAULT_MODEL_KEY = "local-train12"
MISSING_TIMEOUT = 30
ENSEMBLE_IOU_THRESHOLD = 0.45
TRACKER_IOU_THRESHOLD = 0.35

running = True


@dataclass
class Detection:
    label: str
    raw_label: str
    confidence: float
    xyxy: Tuple[int, int, int, int]
    track_id: Optional[int] = None
    source_model: str = ""


class GenericTracker:
    def __init__(self, iou_threshold: float = TRACKER_IOU_THRESHOLD, missing_timeout: int = MISSING_TIMEOUT):
        self.iou_threshold = iou_threshold
        self.missing_timeout = missing_timeout
        self.next_track_id = 1
        self.tracks: Dict[int, Dict[str, Any]] = {}

    def update(self, detections: List[Detection], frame_number: int) -> List[Detection]:
        assigned_track_ids = set()
        for detection in sorted(detections, key=lambda item: item.confidence, reverse=True):
            best_track_id = None
            best_iou = 0.0
            for track_id, track in self.tracks.items():
                if track_id in assigned_track_ids:
                    continue
                if track["label"] != detection.label:
                    continue
                iou_value = box_iou(track["xyxy"], detection.xyxy)
                if iou_value > best_iou:
                    best_iou = iou_value
                    best_track_id = track_id

            if best_track_id is not None and best_iou >= self.iou_threshold:
                detection.track_id = best_track_id
                self.tracks[best_track_id] = {
                    "label": detection.label,
                    "xyxy": detection.xyxy,
                    "last_seen": frame_number,
                }
                assigned_track_ids.add(best_track_id)
            else:
                detection.track_id = self.next_track_id
                self.tracks[self.next_track_id] = {
                    "label": detection.label,
                    "xyxy": detection.xyxy,
                    "last_seen": frame_number,
                }
                assigned_track_ids.add(self.next_track_id)
                self.next_track_id += 1

        stale_track_ids = [
            track_id for track_id, track in self.tracks.items() if frame_number - int(track["last_seen"]) > self.missing_timeout
        ]
        for track_id in stale_track_ids:
            self.tracks.pop(track_id, None)

        return detections


class LocalUltralyticsRunner:
    def __init__(self, model_entry: Dict[str, Any], confidence_threshold: float, iou_threshold: float, inference_size: int):
        self.model_entry = model_entry
        self.model = YOLO(model_entry["absolutePath"])
        self.class_names = self.model.names
        self.confidence_threshold = confidence_threshold
        self.iou_threshold = iou_threshold
        self.inference_size = inference_size
        self.tracker = GenericTracker()

    def infer(self, frame, frame_number: int) -> List[Detection]:
        results = self.model.predict(
            frame,
            conf=self.confidence_threshold,
            iou=self.iou_threshold,
            imgsz=self.inference_size,
            verbose=False,
        )
        detections: List[Detection] = []

        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue

            for box in boxes:
                confidence = float(box.conf[0])
                if confidence < self.confidence_threshold:
                    continue

                cls = int(box.cls[0])
                raw_label = self.class_names.get(cls, str(cls)) if isinstance(self.class_names, dict) else self.class_names[cls]
                x1, y1, x2, y2 = box.xyxy[0]
                detections.append(
                    Detection(
                        label=normalize_label(raw_label),
                        raw_label=str(raw_label),
                        confidence=confidence,
                        xyxy=(int(x1), int(y1), int(x2), int(y2)),
                        track_id=int(box.id[0]) if box.id is not None else None,
                        source_model=self.model_entry["key"],
                    )
                )

        return self.tracker.update(detections, frame_number)


class RoboflowHostedRunner:
    def __init__(self, model_entry: Dict[str, Any], confidence_threshold: float, snapshot_quality: int):
        self.model_entry = model_entry
        self.api_key = os.getenv("ROBOFLOW_API_KEY", "").strip()
        if not self.api_key:
            raise RuntimeError("ROBOFLOW_API_KEY is required for hosted Roboflow models.")
        self.confidence_threshold = confidence_threshold
        self.snapshot_quality = snapshot_quality
        self.tracker = GenericTracker()

    def infer(self, frame, frame_number: int) -> List[Detection]:
        encoded_frame = encode_frame_base64(frame, quality=self.snapshot_quality, max_width=960)
        params = {
            "api_key": self.api_key,
            "confidence": f"{self.confidence_threshold:.2f}",
        }
        endpoint = f"https://serverless.roboflow.com/{self.model_entry['modelId']}?{urlparse.urlencode(params)}"
        request = urlrequest.Request(
            endpoint,
            data=encoded_frame.encode("ascii"),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )

        try:
            with urlrequest.urlopen(request, timeout=60) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urlerror.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Roboflow inference failed for {self.model_entry['modelId']}: {exc.code} {detail}") from exc

        detections: List[Detection] = []
        for prediction in payload.get("predictions", []):
            confidence = float(prediction.get("confidence", 0.0))
            if confidence < self.confidence_threshold:
                continue

            x = float(prediction.get("x", 0.0))
            y = float(prediction.get("y", 0.0))
            width = float(prediction.get("width", 0.0))
            height = float(prediction.get("height", 0.0))
            raw_label = str(prediction.get("class", "medicine"))
            xyxy = (
                int(x - width / 2),
                int(y - height / 2),
                int(x + width / 2),
                int(y + height / 2),
            )
            detections.append(
                Detection(
                    label=normalize_label(raw_label),
                    raw_label=raw_label,
                    confidence=confidence,
                    xyxy=xyxy,
                    source_model=self.model_entry["key"],
                )
            )

        return self.tracker.update(detections, frame_number)


class RoboflowOnDeviceRunner:
    def __init__(self, model_entry: Dict[str, Any], confidence_threshold: float, iou_threshold: float, snapshot_quality: int):
        self.model_entry = model_entry
        self.api_key = os.getenv("ROBOFLOW_API_KEY", "").strip()
        if not self.api_key:
            raise RuntimeError("ROBOFLOW_API_KEY is required for Roboflow on-device models.")

        self.api_url = str(model_entry.get("inferenceServerUrl") or os.getenv("ROBOFLOW_INFERENCE_SERVER_URL", "http://127.0.0.1:9001")).strip()
        if not self.api_url:
            raise RuntimeError("A Roboflow inference server URL is required for on-device models.")

        self.endpoint = f"{self.api_url.rstrip('/')}/infer/object_detection"
        self.confidence_threshold = confidence_threshold
        self.iou_threshold = iou_threshold
        self.snapshot_quality = snapshot_quality
        self.tracker = GenericTracker()

    def infer(self, frame, frame_number: int) -> List[Detection]:
        encoded_frame = encode_frame_base64(frame, quality=self.snapshot_quality, max_width=960)
        payload = {
            "api_key": self.api_key,
            "model_id": self.model_entry["modelId"],
            "image": {"type": "base64", "value": encoded_frame},
            "confidence": round(self.confidence_threshold, 2),
            "iou_threshold": round(self.iou_threshold, 2),
        }
        request = urlrequest.Request(
            self.endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urlrequest.urlopen(request, timeout=60) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urlerror.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Roboflow on-device inference failed for {self.model_entry['modelId']}: {exc.code} {detail}") from exc
        except urlerror.URLError as exc:
            raise RuntimeError(f"Unable to reach Roboflow Inference Server at {self.endpoint}: {exc.reason}") from exc

        if isinstance(payload, list):
            payload = payload[0] if payload else {}
        if not isinstance(payload, dict):
            raise RuntimeError("Unexpected Roboflow on-device response format.")

        detections: List[Detection] = []
        for prediction in payload.get("predictions", []):
            confidence = float(prediction.get("confidence", 0.0))
            if confidence < self.confidence_threshold:
                continue

            x = float(prediction.get("x", 0.0))
            y = float(prediction.get("y", 0.0))
            width = float(prediction.get("width", 0.0))
            height = float(prediction.get("height", 0.0))
            raw_label = str(prediction.get("class", "medicine"))
            xyxy = (
                int(x - width / 2),
                int(y - height / 2),
                int(x + width / 2),
                int(y + height / 2),
            )
            detections.append(
                Detection(
                    label=normalize_label(raw_label),
                    raw_label=raw_label,
                    confidence=confidence,
                    xyxy=xyxy,
                    source_model=self.model_entry["key"],
                )
            )

        return self.tracker.update(detections, frame_number)


class EnsembleRunner:
    def __init__(self, model_entry: Dict[str, Any], confidence_threshold: float, iou_threshold: float, inference_size: int, snapshot_quality: int):
        self.model_entry = model_entry
        self.runners: List[Tuple[float, Any, Dict[str, Any]]] = []
        self.tracker = GenericTracker()
        for component in model_entry.get("componentsResolved", []):
            try:
                runner = build_runner(component, confidence_threshold, iou_threshold, inference_size, snapshot_quality)
            except Exception as exc:
                emit(
                    "warning",
                    {
                        "message": f"Skipping ensemble component {component.get('key')}: {exc}",
                        "modelKey": component.get("key"),
                    },
                )
                continue
            weight = float(component.get("metrics", {}).get("map50", 1.0) or 1.0)
            self.runners.append((weight, runner, component))

        if not self.runners:
            raise RuntimeError("No ensemble components are available.")

    def infer(self, frame, frame_number: int) -> List[Detection]:
        weighted_detections: List[Tuple[Detection, float]] = []
        for weight, runner, component in self.runners:
            detections = runner.infer(frame, frame_number)
            for detection in detections:
                weighted_detections.append((detection, weight))

        combined = weighted_box_merge(weighted_detections)
        return self.tracker.update(combined, frame_number)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def emit(message_type: str, payload: Optional[Dict[str, object]] = None) -> None:
    print(json.dumps({"type": message_type, "payload": payload or {}, "emittedAt": utc_now()}), flush=True)


def handle_signal(_signum, _frame) -> None:
    global running
    running = False


def normalize_label(name: str) -> str:
    cleaned = name.strip().lower().replace("-", " ").replace("_", " ")

    if any(token in cleaned for token in {"tablet", "tablets", "caplet"}):
        return "tablet"

    if any(token in cleaned for token in {"pill", "pills", "capsule", "capsules", "softgel"}):
        return "pill"

    if any(token in cleaned for token in {"medicine", "medication", "drug", "pharma", "med"}):
        return "medicine"

    return cleaned or "medicine"


def create_counts(labels: Dict[str, int]) -> Dict[str, object]:
    pill = int(labels.get("pill", 0))
    tablet = int(labels.get("tablet", 0))
    medicine = int(labels.get("medicine", 0))
    total = int(sum(labels.values()))
    other = max(total - pill - tablet - medicine, 0)
    return {
        "total": total,
        "pill": pill,
        "tablet": tablet,
        "medicine": medicine,
        "other": other,
        "byLabel": {key: int(value) for key, value in labels.items()},
    }


def encode_frame_base64(frame, quality: int = 72, max_width: Optional[int] = None) -> str:
    target_frame = frame
    if max_width and frame.shape[1] > max_width:
        scale = max_width / float(frame.shape[1])
        target_frame = cv2.resize(frame, (max_width, int(frame.shape[0] * scale)), interpolation=cv2.INTER_AREA)

    ok, buffer = cv2.imencode(".jpg", target_frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise RuntimeError("Failed to encode frame.")
    return base64.b64encode(buffer).decode("ascii")


def set_camera_property(cap, property_id: int, value: Optional[float]) -> Optional[float]:
    if value is None:
        return None

    try:
        cap.set(property_id, float(value))
        current = float(cap.get(property_id))
        return current if current == current else None
    except Exception:
        return None


def apply_image_tuning(
    frame,
    brightness: float = 0.0,
    contrast: float = 1.0,
    gamma: float = 1.0,
    sharpness: float = 0.0,
):
    tuned = frame

    if abs(contrast - 1.0) > 0.01 or abs(brightness) > 0.01:
        tuned = cv2.convertScaleAbs(tuned, alpha=max(contrast, 0.1), beta=brightness)

    if abs(gamma - 1.0) > 0.01:
        safe_gamma = max(gamma, 0.05)
        lookup = np.array([((index / 255.0) ** (1.0 / safe_gamma)) * 255 for index in range(256)], dtype="uint8")
        tuned = cv2.LUT(tuned, lookup)

    if sharpness > 0.01:
        blurred = cv2.GaussianBlur(tuned, (0, 0), 3)
        tuned = cv2.addWeighted(tuned, 1.0 + sharpness, blurred, -sharpness, 0)

    return tuned


def box_iou(box_a: Tuple[int, int, int, int], box_b: Tuple[int, int, int, int]) -> float:
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    inter_width = max(0, inter_x2 - inter_x1)
    inter_height = max(0, inter_y2 - inter_y1)
    inter_area = inter_width * inter_height

    if inter_area <= 0:
        return 0.0

    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
    union_area = area_a + area_b - inter_area
    if union_area <= 0:
        return 0.0

    return inter_area / union_area


def weighted_box_merge(weighted_detections: List[Tuple[Detection, float]]) -> List[Detection]:
    merged: List[Detection] = []
    used_indexes = set()

    for index, (detection, weight) in enumerate(weighted_detections):
        if index in used_indexes:
            continue

        cluster = [(detection, weight)]
        used_indexes.add(index)

        for candidate_index, (candidate, candidate_weight) in enumerate(weighted_detections[index + 1 :], start=index + 1):
            if candidate_index in used_indexes:
                continue
            if candidate.label != detection.label:
                continue
            if box_iou(detection.xyxy, candidate.xyxy) < ENSEMBLE_IOU_THRESHOLD:
                continue
            cluster.append((candidate, candidate_weight))
            used_indexes.add(candidate_index)

        total_weight = sum(entry.confidence * entry_weight for entry, entry_weight in cluster)
        if total_weight <= 0:
            total_weight = float(len(cluster))

        x1 = int(round(sum(entry.xyxy[0] * entry.confidence * entry_weight for entry, entry_weight in cluster) / total_weight))
        y1 = int(round(sum(entry.xyxy[1] * entry.confidence * entry_weight for entry, entry_weight in cluster) / total_weight))
        x2 = int(round(sum(entry.xyxy[2] * entry.confidence * entry_weight for entry, entry_weight in cluster) / total_weight))
        y2 = int(round(sum(entry.xyxy[3] * entry.confidence * entry_weight for entry, entry_weight in cluster) / total_weight))
        average_confidence = min(
            0.995,
            sum(entry.confidence * entry_weight for entry, entry_weight in cluster) / max(sum(entry_weight for _, entry_weight in cluster), 1.0),
        )
        raw_label = Counter(entry.raw_label for entry, _ in cluster).most_common(1)[0][0]
        source_model = "+".join(sorted({entry.source_model for entry, _ in cluster}))

        merged.append(
            Detection(
                label=detection.label,
                raw_label=raw_label,
                confidence=average_confidence,
                xyxy=(x1, y1, x2, y2),
                source_model=source_model,
            )
        )

    return merged


def open_camera(camera_index: int):
    backend_candidates = []
    if sys.platform.startswith("win") and hasattr(cv2, "CAP_DSHOW"):
        backend_candidates.append(cv2.CAP_DSHOW)
    backend_candidates.append(None)

    for backend in backend_candidates:
        cap = cv2.VideoCapture(camera_index, backend) if backend is not None else cv2.VideoCapture(camera_index)
        if cap.isOpened():
            return cap
        cap.release()

    return None


def list_available_cameras(max_camera_index: int) -> List[Dict[str, Any]]:
    cameras: List[Dict[str, Any]] = []
    for index in range(0, max_camera_index + 1):
        cap = open_camera(index)
        if cap is None:
            continue

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        cameras.append(
            {
                "index": index,
                "name": f"Camera {index}",
                "width": width or None,
                "height": height or None,
            }
        )
        cap.release()

    return cameras


def select_camera(camera_index: int):
    candidates = [camera_index] if camera_index >= 0 else [0, 1, 2, 3]
    for index in candidates:
        cap = open_camera(index)
        if cap is not None:
            return cap, index
    return None, None


def build_runner(
    model_entry: Dict[str, Any],
    confidence_threshold: float,
    iou_threshold: float,
    inference_size: int,
    snapshot_quality: int,
):
    provider = model_entry.get("provider")
    if provider == "local":
        absolute_path = Path(model_entry["absolutePath"])
        if not absolute_path.exists():
            raise RuntimeError(f"Local model not found: {absolute_path}")
        return LocalUltralyticsRunner(model_entry, confidence_threshold, iou_threshold, inference_size)
    if provider == "roboflow":
        if model_entry.get("deploymentTarget") == "ondevice":
            return RoboflowOnDeviceRunner(model_entry, confidence_threshold, iou_threshold, snapshot_quality)
        return RoboflowHostedRunner(model_entry, confidence_threshold, snapshot_quality)
    if provider == "ensemble":
        return EnsembleRunner(model_entry, confidence_threshold, iou_threshold, inference_size, snapshot_quality)
    raise RuntimeError(f"Unsupported provider: {provider}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run live pill counting bridge")
    parser.add_argument("--machine-code", default="MCH-ML-01")
    parser.add_argument("--location", default="Vision Counter Line")
    parser.add_argument("--display-name", default="")
    parser.add_argument("--firmware-version", default="ml-vision-1.0.0")
    parser.add_argument("--camera-index", type=int, default=-1)
    parser.add_argument("--confidence-threshold", type=float, default=0.20)
    parser.add_argument("--iou-threshold", type=float, default=0.45)
    parser.add_argument("--brightness", type=float, default=10.0)
    parser.add_argument("--contrast", type=float, default=1.10)
    parser.add_argument("--gamma", type=float, default=1.10)
    parser.add_argument("--sharpness", type=float, default=0.25)
    parser.add_argument("--exposure", type=float, default=None)
    parser.add_argument("--gain", type=float, default=None)
    parser.add_argument("--telemetry-interval-ms", type=int, default=1000)
    parser.add_argument("--snapshot-interval-ms", type=int, default=1500)
    parser.add_argument("--frame-width", type=int, default=960)
    parser.add_argument("--frame-height", type=int, default=540)
    parser.add_argument("--inference-size", type=int, default=640)
    parser.add_argument("--snapshot-quality", type=int, default=58)
    parser.add_argument("--show-window", action="store_true")
    parser.add_argument("--model-key", default=DEFAULT_MODEL_KEY)
    parser.add_argument("--catalog-path", default="")
    parser.add_argument("--list-models", action="store_true")
    parser.add_argument("--list-cameras", action="store_true")
    parser.add_argument("--max-camera-index", type=int, default=5)
    return parser.parse_args()


def main() -> int:
    global running
    signal.signal(signal.SIGINT, handle_signal)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, handle_signal)

    args = parse_args()
    if args.list_models:
        print(json.dumps(list_models(args.catalog_path or None), indent=2))
        return 0

    if args.list_cameras:
        print(json.dumps(list_available_cameras(max(args.max_camera_index, 0)), indent=2))
        return 0

    model_entry = resolve_model(args.model_key, args.catalog_path or None)
    try:
        runner = build_runner(
            model_entry,
            args.confidence_threshold,
            args.iou_threshold,
            max(int(args.inference_size), 320),
            min(max(int(args.snapshot_quality), 30), 90),
        )
    except Exception as exc:
        emit("error", {"message": str(exc), "modelKey": model_entry.get("key")})
        return 1

    emit(
        "bridge.ready",
        {
            "message": "Vision bridge initialized.",
            "machineCode": args.machine_code,
            "modelKey": model_entry.get("key"),
            "modelName": model_entry.get("name"),
            "modelProvider": model_entry.get("provider"),
            "modelDeploymentTarget": model_entry.get("deploymentTarget"),
            "modelPath": model_entry.get("absolutePath") or model_entry.get("modelId") or model_entry.get("key"),
            "catalogPath": model_entry.get("catalogPath"),
            "recommendedForCounting": bool(model_entry.get("recommendedForCounting", False)),
        },
    )

    cap, active_camera_index = select_camera(args.camera_index)
    if cap is None:
        emit("error", {"message": "Could not open camera. Close other camera apps and try again."})
        return 1

    try:
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    except Exception:
        pass

    cap.set(3, max(int(args.frame_width), 320))
    cap.set(4, max(int(args.frame_height), 240))
    if args.exposure is not None:
        try:
            cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.25)
        except Exception:
            pass
        set_camera_property(cap, cv2.CAP_PROP_EXPOSURE, args.exposure)
    if args.gain is not None:
        set_camera_property(cap, cv2.CAP_PROP_GAIN, args.gain)

    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)

    emit(
        "camera.opened",
        {
            "message": "Camera opened.",
            "cameraIndex": active_camera_index,
            "frameWidth": frame_width,
            "frameHeight": frame_height,
            "confidenceThreshold": args.confidence_threshold,
            "iouThreshold": args.iou_threshold,
            "brightness": args.brightness,
            "contrast": args.contrast,
            "gamma": args.gamma,
            "sharpness": args.sharpness,
            "exposure": args.exposure,
            "gain": args.gain,
            "modelKey": model_entry.get("key"),
            "modelName": model_entry.get("name"),
            "modelProvider": model_entry.get("provider"),
            "modelDeploymentTarget": model_entry.get("deploymentTarget"),
            "modelPath": model_entry.get("absolutePath") or model_entry.get("modelId") or model_entry.get("key"),
        },
    )

    counted_track_ids: Dict[int, str] = {}
    cumulative_by_label: Counter[str] = Counter()
    frame_number = 0
    last_emit_at = 0.0
    last_snapshot_at = 0.0
    last_frame_started_at = time.perf_counter()
    window_title = f"Pill Counter - {args.machine_code}"

    while running:
        success, frame = cap.read()
        if not success:
            emit("error", {"message": "Camera frame read failed."})
            break

        frame = apply_image_tuning(
            frame,
            brightness=args.brightness,
            contrast=args.contrast,
            gamma=args.gamma,
            sharpness=args.sharpness,
        )

        frame_number += 1
        now = time.perf_counter()
        frame_elapsed = now - last_frame_started_at
        last_frame_started_at = now
        fps = 0.0 if frame_elapsed <= 0 else 1.0 / frame_elapsed

        detections = runner.infer(frame, frame_number)
        visible_by_label: Counter[str] = Counter()
        confidences: List[float] = []
        active_track_ids = set()

        for detection in detections:
            confidences.append(detection.confidence)
            visible_by_label[detection.label] += 1

            if detection.track_id is not None:
                active_track_ids.add(detection.track_id)
                if detection.track_id not in counted_track_ids:
                    counted_track_ids[detection.track_id] = detection.label
                    cumulative_by_label[detection.label] += 1

            if detection.label == "pill":
                color = (0, 255, 0)
            elif detection.label == "tablet":
                color = (255, 0, 0)
            elif detection.label == "medicine":
                color = (255, 191, 0)
            else:
                color = (0, 0, 255)

            x1, y1, x2, y2 = detection.xyxy
            cvzone.cornerRect(frame, (x1, y1, x2 - x1, y2 - y1), l=9, rt=2, colorR=color)
            cvzone.putTextRect(
                frame,
                f"{detection.label} {detection.confidence:.2f}",
                (max(0, x1), max(35, y1)),
                scale=1,
                thickness=1,
                colorR=color,
            )

        visible_counts = create_counts(dict(visible_by_label))
        cumulative_counts = create_counts(dict(cumulative_by_label))
        average_confidence = 0.0 if not confidences else sum(confidences) / len(confidences)

        cvzone.putTextRect(frame, f"Visible pills: {visible_counts['pill']}", (30, 40), scale=1.4, thickness=2, colorR=(0, 255, 0))
        cvzone.putTextRect(frame, f"Visible tablets: {visible_counts['tablet']}", (30, 88), scale=1.4, thickness=2, colorR=(255, 0, 0))
        cvzone.putTextRect(frame, f"Visible medicine: {visible_counts['medicine']}", (30, 136), scale=1.4, thickness=2, colorR=(255, 191, 0))
        cvzone.putTextRect(frame, f"Session total: {cumulative_counts['total']}", (30, 184), scale=1.4, thickness=2, colorR=(255, 255, 255))
        cvzone.putTextRect(frame, f"Model: {model_entry.get('name', model_entry.get('key'))}", (30, 232), scale=1.0, thickness=1, colorR=(64, 224, 208))

        if args.show_window:
            cv2.imshow(window_title, frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                running = False
                break

        if now - last_emit_at >= args.telemetry_interval_ms / 1000:
            snapshot_data_url = None
            if now - last_snapshot_at >= args.snapshot_interval_ms / 1000:
                snapshot_data_url = f"data:image/jpeg;base64,{encode_frame_base64(frame, quality=args.snapshot_quality, max_width=960)}"
                last_snapshot_at = now

            emit(
                "telemetry",
                {
                    "message": f"Visible {visible_counts['total']} object(s)",
                    "machineCode": args.machine_code,
                    "location": args.location,
                    "firmwareVersion": args.firmware_version,
                    "cameraIndex": active_camera_index,
                    "frameWidth": frame_width,
                    "frameHeight": frame_height,
                    "frameNumber": frame_number,
                    "trackedObjectCount": len(active_track_ids),
                    "fps": round(fps, 2),
                    "averageConfidence": round(average_confidence, 4),
                    "confidenceThreshold": args.confidence_threshold,
                    "iouThreshold": args.iou_threshold,
                    "brightness": args.brightness,
                    "contrast": args.contrast,
                    "gamma": args.gamma,
                    "sharpness": args.sharpness,
                    "exposure": args.exposure,
                    "gain": args.gain,
                    "visibleCounts": visible_counts,
                    "cumulativeCounts": cumulative_counts,
                    "snapshotDataUrl": snapshot_data_url,
                    "modelKey": model_entry.get("key"),
                    "modelName": model_entry.get("name"),
                    "modelProvider": model_entry.get("provider"),
                    "modelDeploymentTarget": model_entry.get("deploymentTarget"),
                    "modelPath": model_entry.get("absolutePath") or model_entry.get("modelId") or model_entry.get("key"),
                },
            )
            last_emit_at = now

    cap.release()
    if args.show_window:
        cv2.destroyAllWindows()
    emit("session.stopped", {"message": "Vision runtime stopped.", "reason": "manual-stop"})
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        emit("error", {"message": str(exc)})
        raise
