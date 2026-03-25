import sys
import unittest
from pathlib import Path
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.sync.remote_control import (  # noqa: E402
    MachineControlSettings,
    RemoteMachineAgent,
    build_machine_control_settings,
    build_machine_runtime_control_heartbeat_endpoint,
    run_remote_machine_agent,
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

    def test_run_remote_machine_agent_stops_child_when_interrupted(self):
        settings = MachineControlSettings(
            api_base_url="http://localhost:4000/api",
            api_key="key",
            machine_code="pill-counter-pi",
            timeout_seconds=0.1,
            poll_interval_seconds=0.1,
        )

        with (
            patch("src.sync.remote_control.post_machine_runtime_control_heartbeat", side_effect=KeyboardInterrupt),
            patch.object(RemoteMachineAgent, "shutdown") as shutdown_mock,
        ):
            exit_code = run_remote_machine_agent(settings, start_command=["bash", "scripts/start_machine.sh"], workdir=PROJECT_ROOT)

        self.assertEqual(130, exit_code)
        shutdown_mock.assert_called_once_with("Agent interrupted by operator.")


if __name__ == "__main__":
    unittest.main()
