import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.counting import CrossingEvent
from src.sync import build_pending_sync_payload


class PendingSyncPayloadTests(unittest.TestCase):
    def test_builds_payload_with_serialized_events(self):
        session_metadata = {
            "machine_name": "pill-counter-pi",
            "run_id": "run_20260324_123000",
            "timestamp_utc": "2026-03-24T12:30:00+00:00",
            "camera_index": 0,
            "resolution": {"width": 1280, "height": 720},
            "fps": 30.0,
            "backend_name": "V4L2",
        }
        final_summary = {
            "source_mode": "live_camera",
            "source_label": "camera:0",
            "completed_at_utc": "2026-03-24T12:35:00+00:00",
            "total_count": 1,
            "event_count": 1,
            "detector": {"mode": "ml", "model_key": "local-train12"},
            "roi": {"x": 0, "y": 0, "width": 100, "height": 100},
            "line": {"start": [0, 50], "end": [100, 50], "allowed_direction": "down", "orientation": "horizontal"},
            "run_directory": "runs/run_20260324_123000",
            "event_log_path": "runs/run_20260324_123000/events.csv",
            "debug_frame_paths": ["runs/run_20260324_123000/debug_frames/frame_000030.jpg"],
            "event_frame_paths": ["runs/run_20260324_123000/event_frames/crossing_track_0001_frame_000030.jpg"],
        }
        events = [
            CrossingEvent(
                event_type="counted_crossing",
                timestamp_utc="2026-03-24T12:34:59+00:00",
                frame_index=30,
                track_id=1,
                object_label="tablet",
                class_id=1,
                confidence=0.94,
                source_model="local-train12",
                source_backend="ml",
                previous_centroid=(10, 40),
                current_centroid=(10, 60),
                allowed_direction="down",
                total_count_after_event=1,
                line_start=(0, 50),
                line_end=(100, 50),
            )
        ]

        payload = build_pending_sync_payload(session_metadata, final_summary, events)

        self.assertEqual("pending_sync", payload["status"])
        self.assertEqual("pending_sync", payload["sync"]["status"])
        self.assertEqual(0, payload["sync"]["attempts"])
        self.assertEqual(1, payload["total_count"])
        self.assertEqual(1, len(payload["events"]))
        self.assertEqual([10, 40], payload["events"][0]["previous_centroid"])
        self.assertEqual("tablet", payload["events"][0]["object_label"])
        self.assertEqual("ml", payload["detector"]["mode"])
        self.assertEqual("live_camera", payload["source_mode"])
        self.assertEqual("runs/run_20260324_123000", payload["evidence"]["run_directory"])


if __name__ == "__main__":
    unittest.main()
