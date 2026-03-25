import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.sync.runtime_preview import (  # noqa: E402
    build_machine_runtime_telemetry_endpoint,
    build_runtime_counts_payload,
    build_runtime_preview_settings,
    build_runtime_telemetry_payload,
)


class RuntimePreviewTests(unittest.TestCase):
    def test_build_machine_runtime_telemetry_endpoint_from_api_base(self):
        endpoint = build_machine_runtime_telemetry_endpoint("http://172.23.32.148:4000/api", "pill-counter-pi")

        self.assertEqual(
            "http://172.23.32.148:4000/api/machine-runtime/pill-counter-pi/telemetry",
            endpoint,
        )

    def test_build_machine_runtime_telemetry_endpoint_accepts_full_endpoint(self):
        endpoint = build_machine_runtime_telemetry_endpoint(
            "http://localhost:4000/api/machine-runtime/pill-counter-pi/telemetry",
            "pill-counter-pi",
        )

        self.assertEqual("http://localhost:4000/api/machine-runtime/pill-counter-pi/telemetry", endpoint)

    def test_build_runtime_counts_payload_normalizes_capsules_into_pills(self):
        payload = build_runtime_counts_payload({"capsule": 7, "tablet": 1, "unknown": 2})

        self.assertEqual(10, payload["total"])
        self.assertEqual(7, payload["pill"])
        self.assertEqual(1, payload["tablet"])
        self.assertEqual(2, payload["other"])
        self.assertEqual({"pill": 7, "tablet": 1, "other": 2}, payload["byLabel"])

    def test_build_runtime_preview_settings_requires_url_key_and_machine_code(self):
        self.assertIsNone(build_runtime_preview_settings("", "key", "pill-counter-pi"))
        self.assertIsNone(build_runtime_preview_settings("http://localhost:4000/api", "", "pill-counter-pi"))
        self.assertIsNone(build_runtime_preview_settings("http://localhost:4000/api", "key", ""))

    def test_build_runtime_telemetry_payload_uses_machine_code_in_url_not_body(self):
        payload = build_runtime_telemetry_payload(
            machine_name="pill-counter-pi",
            session_id="run_1",
            emitted_at_utc="2026-03-25T16:00:00Z",
            started_at_utc="2026-03-25T15:59:00Z",
            ended_at_utc=None,
            control_state="RUNNING",
            camera_state="OPEN",
            camera_index=0,
            frame_width=1280,
            frame_height=720,
            frame_number=12,
            tracked_object_count=3,
            fps=5.4,
            average_confidence=0.8,
            detector_info={"model_key": "local-train12"},
            visible_counts_by_label={"tablet": 2},
            cumulative_counts_by_label={"tablet": 2},
            message="Visible 2 item(s)",
            latest_error=None,
            snapshot_data_url="data:image/jpeg;base64,abc",
        )

        self.assertNotIn("machine_code", payload)
        self.assertEqual("pill-counter-pi", payload["machine_name"])


if __name__ == "__main__":
    unittest.main()
