from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..counting import CrossingEvent


def serialize_crossing_event(event: CrossingEvent) -> dict[str, Any]:
    return {
        "event_type": event.event_type,
        "timestamp_utc": event.timestamp_utc,
        "frame_index": event.frame_index,
        "track_id": event.track_id,
        "object_label": event.object_label,
        "class_id": event.class_id,
        "confidence": event.confidence,
        "source_model": event.source_model,
        "source_backend": event.source_backend,
        "previous_centroid": list(event.previous_centroid),
        "current_centroid": list(event.current_centroid),
        "allowed_direction": event.allowed_direction,
        "total_count_after_event": event.total_count_after_event,
        "line_start": list(event.line_start),
        "line_end": list(event.line_end),
    }


def build_pending_sync_payload(
    session_metadata: dict[str, Any], final_summary: dict[str, Any], events: list[CrossingEvent]
) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "status": "pending_sync",
        "sync": {
            "status": "pending_sync",
            "attempts": 0,
            "last_attempt_at_utc": None,
            "last_synced_at_utc": None,
            "last_error": None,
            "last_response": None,
        },
        "machine_name": session_metadata["machine_name"],
        "run_id": session_metadata["run_id"],
        "source_mode": final_summary["source_mode"],
        "source_label": final_summary["source_label"],
        "started_at_utc": session_metadata["timestamp_utc"],
        "completed_at_utc": final_summary["completed_at_utc"],
        "total_count": final_summary["total_count"],
        "event_count": final_summary["event_count"],
        "runtime_status": final_summary.get("runtime_status"),
        "detector_backend": final_summary.get("detector_backend"),
        "ml_runtime_backend": final_summary.get("ml_runtime_backend"),
        "model_key": final_summary.get("model_key"),
        "model_path": final_summary.get("model_path"),
        "model_format": final_summary.get("model_format"),
        "runtime_fps": final_summary.get("runtime_fps"),
        "average_fps": final_summary.get("average_fps"),
        "count_result": final_summary.get("count_result"),
        "camera": {
            "camera_index": session_metadata["camera_index"],
            "resolution": session_metadata["resolution"],
            "fps": session_metadata["fps"],
            "backend_name": session_metadata["backend_name"],
        },
        "detector": final_summary.get("detector", session_metadata.get("detector")),
        "roi": final_summary["roi"],
        "line": final_summary["line"],
        "events": [serialize_crossing_event(event) for event in events],
        "evidence": {
            "session_path": final_summary.get("session_path"),
            "summary_path": final_summary.get("summary_path"),
            "run_directory": final_summary["run_directory"],
            "event_log_path": final_summary["event_log_path"],
            "debug_frame_paths": final_summary["debug_frame_paths"],
            "event_frame_paths": final_summary["event_frame_paths"],
        },
    }


def write_pending_sync_payload(run_dir: Path, payload: dict[str, Any]) -> Path:
    payload_path = run_dir / "pending_sync.json"
    payload_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload_path
