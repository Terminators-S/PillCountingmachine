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


if __name__ == "__main__":
    unittest.main()
