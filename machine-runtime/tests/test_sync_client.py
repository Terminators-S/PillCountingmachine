import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.sync import SyncSettings, build_machine_runs_endpoint, sync_pending_payload, sync_pending_payloads


class _FakeResponse:
    def __init__(self, status: int, payload: dict[str, object]) -> None:
        self._status = status
        self._payload = json.dumps(payload).encode("utf-8")

    def read(self) -> bytes:
        return self._payload

    def getcode(self) -> int:
        return self._status

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def build_payload(run_dir: Path) -> dict[str, object]:
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
        "machine_name": "pill-counter-pi",
        "run_id": "run_20260325_101500",
        "source_mode": "live_camera",
        "source_label": "camera:0",
        "started_at_utc": "2026-03-25T10:15:00+00:00",
        "completed_at_utc": "2026-03-25T10:16:00+00:00",
        "total_count": 42,
        "event_count": 42,
        "runtime_status": "COMPLETED",
        "detector_backend": "ml",
        "ml_runtime_backend": "ncnn",
        "model_key": "local-train12",
        "model_path": "models/best_ncnn_model",
        "model_format": "ncnn",
        "runtime_fps": 21.3,
        "average_fps": 21.3,
        "count_result": {"total_count": 42, "event_count": 42},
        "camera": {"camera_index": 0, "resolution": {"width": 1280, "height": 720}, "fps": 30.0, "backend_name": "V4L2"},
        "detector": {"backend": "ml", "runtime_backend": "ncnn"},
        "roi": {"x": 0, "y": 0, "width": 100, "height": 100},
        "line": {"start": [0, 50], "end": [100, 50], "allowed_direction": "down", "orientation": "horizontal"},
        "events": [{"event_type": "counted_crossing", "frame_index": 10}],
        "evidence": {
            "run_directory": str(run_dir),
            "summary_path": str(run_dir / "summary.json"),
            "event_log_path": str(run_dir / "events.csv"),
            "debug_frame_paths": [],
            "event_frame_paths": [],
        },
    }


class SyncClientTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.run_dir = Path(self.temp_dir.name) / "runs" / "run_20260325_101500"
        self.run_dir.mkdir(parents=True, exist_ok=True)
        self.summary_path = self.run_dir / "summary.json"
        self.summary_path.write_text(json.dumps({"run_id": "run_20260325_101500"}), encoding="utf-8")
        self.payload_path = self.run_dir / "pending_sync.json"
        self.payload_path.write_text(json.dumps(build_payload(self.run_dir), indent=2), encoding="utf-8")
        self.settings = SyncSettings(api_base_url="http://localhost:4000/api", api_key="pc_demo_key")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_sync_pending_payload_marks_payload_and_summary_synced(self):
        with mock.patch("src.sync.client.request.urlopen", return_value=_FakeResponse(201, {"accepted": True, "deduped": False})):
            result = sync_pending_payload(self.payload_path, self.settings)

        self.assertTrue(result["ok"])
        payload = json.loads(self.payload_path.read_text(encoding="utf-8"))
        summary = json.loads(self.summary_path.read_text(encoding="utf-8"))
        self.assertEqual("synced", payload["status"])
        self.assertEqual("synced", payload["sync"]["status"])
        self.assertEqual(1, payload["sync"]["attempts"])
        self.assertEqual("synced", summary["sync"]["status"])
        self.assertTrue(summary["sync"]["configured"])
        self.assertTrue(summary["sync"]["ready"])
        self.assertIsNone(summary["sync"]["disabled_reason"])
        self.assertEqual("http://localhost:4000/api/machine-runs", summary["sync"]["endpoint"])

    def test_sync_pending_payload_failure_preserves_retry_state(self):
        with mock.patch("src.sync.client.request.urlopen", side_effect=OSError("connection refused")):
            result = sync_pending_payload(self.payload_path, self.settings)

        self.assertFalse(result["ok"])
        payload = json.loads(self.payload_path.read_text(encoding="utf-8"))
        summary = json.loads(self.summary_path.read_text(encoding="utf-8"))
        self.assertEqual("sync_failed", payload["status"])
        self.assertEqual("sync_failed", payload["sync"]["status"])
        self.assertEqual(1, payload["sync"]["attempts"])
        self.assertIn("connection refused", payload["sync"]["last_error"])
        self.assertEqual("sync_failed", summary["sync"]["status"])
        self.assertTrue(summary["sync"]["configured"])
        self.assertTrue(summary["sync"]["ready"])

    def test_sync_pending_payloads_skips_already_synced_payloads(self):
        payload = json.loads(self.payload_path.read_text(encoding="utf-8"))
        payload["status"] = "synced"
        payload["sync"]["status"] = "synced"
        self.payload_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

        result = sync_pending_payloads(self.run_dir.parent.parent, self.settings)

        self.assertEqual(0, result["synced"])
        self.assertEqual(1, result["skipped"])

    def test_build_machine_runs_endpoint_accepts_base_api_url(self):
        self.assertEqual("http://localhost:4000/api/machine-runs", build_machine_runs_endpoint("http://localhost:4000/api"))

    def test_build_machine_runs_endpoint_accepts_full_machine_runs_url(self):
        self.assertEqual(
            "http://172.23.0.168:4000/api/machine-runs",
            build_machine_runs_endpoint("http://172.23.0.168:4000/api/machine-runs"),
        )


if __name__ == "__main__":
    unittest.main()
