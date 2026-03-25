import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.sync.remote_control import (  # noqa: E402
    build_machine_control_settings,
    build_machine_runtime_control_heartbeat_endpoint,
)


class RemoteControlTests(unittest.TestCase):
    def test_build_machine_runtime_control_heartbeat_endpoint_from_api_base(self):
        endpoint = build_machine_runtime_control_heartbeat_endpoint("http://172.23.32.148:4000/api", "pill-counter-pi")

        self.assertEqual(
            "http://172.23.32.148:4000/api/machine-runtime/pill-counter-pi/control/heartbeat",
            endpoint,
        )

    def test_build_machine_runtime_control_heartbeat_endpoint_accepts_full_control_prefix(self):
        endpoint = build_machine_runtime_control_heartbeat_endpoint(
            "http://localhost:4000/api/machine-runtime/pill-counter-pi/control",
            "pill-counter-pi",
        )

        self.assertEqual("http://localhost:4000/api/machine-runtime/pill-counter-pi/control/heartbeat", endpoint)

    def test_build_machine_control_settings_requires_url_key_and_machine_code(self):
        self.assertIsNone(build_machine_control_settings("", "key", "pill-counter-pi"))
        self.assertIsNone(build_machine_control_settings("http://localhost:4000/api", "", "pill-counter-pi"))
        self.assertIsNone(build_machine_control_settings("http://localhost:4000/api", "key", ""))


if __name__ == "__main__":
    unittest.main()
