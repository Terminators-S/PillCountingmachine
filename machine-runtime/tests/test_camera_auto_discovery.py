import sys
import unittest
from pathlib import Path
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.capture.camera import open_live_camera_source, resolve_camera_candidate_indexes  # noqa: E402
from src.config import CameraRuntimeConfig  # noqa: E402


class FakeCapture:
    def __init__(self, camera_index: int, opened: bool) -> None:
        self.camera_index = camera_index
        self._opened = opened
        self.released = False

    def isOpened(self) -> bool:
        return self._opened

    def release(self) -> None:
        self.released = True


class CameraAutoDiscoveryTests(unittest.TestCase):
    def test_resolve_camera_candidate_indexes_keeps_preferred_first(self):
        candidates = resolve_camera_candidate_indexes(2, max_scan_index=4)

        self.assertGreaterEqual(len(candidates), 1)
        self.assertEqual(2, candidates[0])
        self.assertIn(0, candidates)
        self.assertIn(4, candidates)

    def test_resolve_camera_candidate_indexes_ignores_large_linux_device_indexes(self):
        class FakeDevicePath:
            def __init__(self, name: str) -> None:
                self.name = name

        with (
            patch("src.capture.camera.sys.platform", "linux"),
            patch(
                "src.capture.camera.Path.glob",
                return_value=[FakeDevicePath("video0"), FakeDevicePath("video1"), FakeDevicePath("video23")],
            ),
        ):
            candidates = resolve_camera_candidate_indexes(0, max_scan_index=4)

        self.assertIn(0, candidates)
        self.assertIn(1, candidates)
        self.assertNotIn(23, candidates)

    def test_open_live_camera_source_falls_back_to_next_available_camera(self):
        config = CameraRuntimeConfig(camera_index=0)

        def fake_open_camera(candidate_config: CameraRuntimeConfig):
            return FakeCapture(candidate_config.camera_index, opened=candidate_config.camera_index == 1)

        def fake_read_frame(capture: FakeCapture, timeout_seconds: int):
            del timeout_seconds
            if capture.camera_index == 1:
                return object()
            return None

        with (
            patch("src.capture.camera.resolve_camera_candidate_indexes", return_value=[0, 1]),
            patch("src.capture.camera.open_camera", side_effect=fake_open_camera),
            patch("src.capture.camera.warmup_camera"),
            patch("src.capture.camera.read_frame_with_timeout", side_effect=fake_read_frame),
        ):
            result = open_live_camera_source(config, explicit_camera_index=False)

        self.assertIsNotNone(result.capture)
        self.assertEqual(1, result.config.camera_index)
        self.assertEqual((0, 1), result.attempted_indexes)
        self.assertIsNotNone(result.first_frame)

    def test_open_live_camera_source_does_not_scan_when_camera_is_explicit(self):
        config = CameraRuntimeConfig(camera_index=3)

        with (
            patch("src.capture.camera.open_camera", return_value=FakeCapture(3, opened=False)),
            patch("src.capture.camera.read_frame_with_timeout"),
            patch("src.capture.camera.warmup_camera"),
        ):
            result = open_live_camera_source(config, explicit_camera_index=True)

        self.assertIsNone(result.capture)
        self.assertEqual(3, result.config.camera_index)
        self.assertEqual((3,), result.attempted_indexes)


if __name__ == "__main__":
    unittest.main()
