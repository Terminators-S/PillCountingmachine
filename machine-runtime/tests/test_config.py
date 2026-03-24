import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import CameraRuntimeConfig, CountingRuntimeConfig, load_camera_config, load_counting_config


class CameraConfigTests(unittest.TestCase):
    def test_default_config_loads(self):
        config = load_camera_config()
        self.assertIsInstance(config, CameraRuntimeConfig)
        self.assertGreater(config.frame_width, 0)
        self.assertGreater(config.frame_height, 0)
        self.assertGreaterEqual(config.camera_index, 0)
        self.assertTrue(config.machine_name)
        self.assertTrue(config.display_window_name)

    def test_counting_config_loads(self):
        config = load_counting_config()
        self.assertIsInstance(config, CountingRuntimeConfig)
        self.assertGreater(config.roi.width, 0)
        self.assertGreater(config.roi.height, 0)
        self.assertIn(config.count_line.allowed_direction, {"up", "down", "left", "right"})
        self.assertIn(config.detector.mode, {"contour", "ml"})
        self.assertTrue(config.detector.model_key)
        self.assertTrue(config.detector.model_catalog_path)


if __name__ == "__main__":
    unittest.main()
