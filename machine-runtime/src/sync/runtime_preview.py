from __future__ import annotations

import base64
import json
import threading
import time
from collections import Counter
from dataclasses import dataclass
from typing import Any
from urllib import error, parse, request

import cv2

from .client import utc_now_iso

LABEL_ALIASES = {
    "capsule": "pill",
    "pill": "pill",
    "tablet": "tablet",
    "medicine": "medicine",
}


def build_machine_runtime_telemetry_endpoint(api_base_url: str, machine_code: str) -> str:
    normalized = str(api_base_url or "").strip().rstrip("/")
    if not normalized:
        raise ValueError("Backend API base URL is required.")

    if normalized.endswith("/telemetry"):
        return normalized

    normalized_machine_code = parse.quote(str(machine_code or "").strip() or "pill-counter-pi", safe="")
    machine_prefix = f"/machine-runtime/{normalized_machine_code}"
    if normalized.endswith(machine_prefix):
        return f"{normalized}/telemetry"
    return f"{normalized}{machine_prefix}/telemetry"


def build_runtime_counts_payload(counts_by_label: dict[str, int] | Counter[str]) -> dict[str, Any]:
    canonical_by_label: Counter[str] = Counter()
    total = 0

    for raw_label, raw_count in dict(counts_by_label or {}).items():
        count = max(0, int(raw_count or 0))
        if count <= 0:
            continue
        total += count
        normalized_label = LABEL_ALIASES.get(str(raw_label or "").strip().lower(), "other")
        canonical_by_label[normalized_label] += count

    return {
        "total": total,
        "pill": canonical_by_label.get("pill", 0),
        "tablet": canonical_by_label.get("tablet", 0),
        "medicine": canonical_by_label.get("medicine", 0),
        "other": canonical_by_label.get("other", 0),
        "byLabel": dict(canonical_by_label),
    }


def encode_preview_frame_as_data_url(frame, max_width: int = 640, jpeg_quality: int = 60) -> str | None:
    if frame is None:
        return None

    preview = frame
    width = int(frame.shape[1]) if len(frame.shape) >= 2 else 0
    height = int(frame.shape[0]) if len(frame.shape) >= 1 else 0
    if max_width > 0 and width > max_width and width > 0 and height > 0:
        scale = max_width / float(width)
        preview = cv2.resize(frame, (max_width, max(1, int(round(height * scale)))))

    quality = max(20, min(95, int(jpeg_quality)))
    ok, encoded = cv2.imencode(".jpg", preview, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        return None

    return f"data:image/jpeg;base64,{base64.b64encode(encoded.tobytes()).decode('ascii')}"


def build_runtime_telemetry_payload(
    *,
    machine_code: str,
    machine_name: str,
    session_id: str,
    emitted_at_utc: str,
    started_at_utc: str | None,
    ended_at_utc: str | None,
    control_state: str,
    camera_state: str,
    camera_index: int | None,
    frame_width: int | None,
    frame_height: int | None,
    frame_number: int,
    tracked_object_count: int,
    fps: float | None,
    average_confidence: float | None,
    detector_info: dict[str, Any],
    visible_counts_by_label: dict[str, int] | Counter[str],
    cumulative_counts_by_label: dict[str, int] | Counter[str],
    message: str,
    latest_error: str | None,
    snapshot_data_url: str | None,
) -> dict[str, Any]:
    return {
        "session_id": session_id,
        "machine_name": machine_name,
        "display_name": machine_name,
        "control_state": control_state,
        "camera_state": camera_state,
        "started_at_utc": started_at_utc,
        "ended_at_utc": ended_at_utc,
        "emitted_at_utc": emitted_at_utc,
        "camera_index": camera_index,
        "frame_width": frame_width,
        "frame_height": frame_height,
        "frame_number": frame_number,
        "tracked_object_count": tracked_object_count,
        "fps": round(float(fps or 0.0), 2) if fps is not None else None,
        "average_confidence": round(float(average_confidence or 0.0), 4) if average_confidence is not None else None,
        "model_key": detector_info.get("model_key"),
        "model_name": detector_info.get("model_name") or detector_info.get("model_key"),
        "model_provider": detector_info.get("provider") or "local",
        "model_path": detector_info.get("model_path"),
        "visible_counts": build_runtime_counts_payload(visible_counts_by_label),
        "cumulative_counts": build_runtime_counts_payload(cumulative_counts_by_label),
        "message": message,
        "latest_error": latest_error,
        "snapshot_data_url": snapshot_data_url,
        "machine_code": machine_code,
    }


@dataclass(frozen=True)
class RuntimePreviewSettings:
    api_base_url: str
    api_key: str
    machine_code: str
    timeout_seconds: float = 1.5
    publish_interval_seconds: float = 1.5

    @property
    def telemetry_endpoint(self) -> str:
        return build_machine_runtime_telemetry_endpoint(self.api_base_url, self.machine_code)


def post_machine_runtime_telemetry(payload: dict[str, Any], settings: RuntimePreviewSettings) -> tuple[int, dict[str, Any] | str | None]:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        settings.telemetry_endpoint,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-api-key": settings.api_key,
        },
    )

    try:
        with request.urlopen(req, timeout=settings.timeout_seconds) as response:
            raw_body = response.read().decode("utf-8")
            if not raw_body:
                parsed_body = None
            else:
                try:
                    parsed_body = json.loads(raw_body)
                except json.JSONDecodeError:
                    parsed_body = raw_body
            return int(response.getcode()), parsed_body
    except error.HTTPError as exc:
        raw_body = exc.read().decode("utf-8")
        detail = raw_body
        if raw_body:
            try:
                detail_json = json.loads(raw_body)
                detail = str(detail_json.get("message") or detail_json)
            except json.JSONDecodeError:
                detail = raw_body
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Network error: {exc.reason}") from exc


class LiveRuntimePublisher:
    def __init__(self, settings: RuntimePreviewSettings) -> None:
        self.settings = settings
        self._condition = threading.Condition()
        self._latest_payload: dict[str, Any] | None = None
        self._stop_requested = False
        self._flush_on_close = False
        self._next_capture_at = 0.0
        self._thread = threading.Thread(target=self._worker, name="pillcount-live-runtime-publisher", daemon=True)
        self._thread.start()

    def should_publish(self, now_monotonic: float | None = None) -> bool:
        return (now_monotonic or time.monotonic()) >= self._next_capture_at

    def publish(self, payload: dict[str, Any], force: bool = False) -> None:
        if force:
            self._next_capture_at = 0.0
        else:
            self._next_capture_at = time.monotonic() + max(0.1, float(self.settings.publish_interval_seconds))

        with self._condition:
            self._latest_payload = payload
            self._condition.notify()

    def close(self, flush: bool = False) -> None:
        with self._condition:
            self._stop_requested = True
            self._flush_on_close = flush
            self._condition.notify()
        self._thread.join(timeout=max(2.0, float(self.settings.timeout_seconds) + 1.0))

    def _worker(self) -> None:
        while True:
            payload: dict[str, Any] | None = None
            with self._condition:
                while self._latest_payload is None and not self._stop_requested:
                    self._condition.wait()

                if self._stop_requested and self._latest_payload is None:
                    return

                payload = self._latest_payload
                self._latest_payload = None
                should_exit_after_send = self._stop_requested and self._flush_on_close

            if payload is not None:
                try:
                    post_machine_runtime_telemetry(payload, self.settings)
                except Exception:
                    # Preview sync must never block or break the counting loop.
                    pass

            if should_exit_after_send:
                return


def build_runtime_preview_settings(
    api_base_url: str,
    api_key: str,
    machine_code: str,
    *,
    timeout_seconds: float = 1.5,
    publish_interval_seconds: float = 1.5,
) -> RuntimePreviewSettings | None:
    normalized_url = str(api_base_url or "").strip()
    normalized_key = str(api_key or "").strip()
    normalized_machine_code = str(machine_code or "").strip()
    if not normalized_url or not normalized_key or not normalized_machine_code:
        return None

    return RuntimePreviewSettings(
        api_base_url=normalized_url,
        api_key=normalized_key,
        machine_code=normalized_machine_code,
        timeout_seconds=float(timeout_seconds),
        publish_interval_seconds=float(publish_interval_seconds),
    )

