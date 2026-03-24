import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import CameraRuntimeConfig, load_camera_config


class CameraConfigTests(unittest.TestCase):
    def test_default_config_loads(self):
        config = load_camera_config()
        self.assertIsInstance(config, CameraRuntimeConfig)
        self.assertGreater(config.frame_width, 0)
        self.assertGreater(config.frame_height, 0)
        self.assertGreaterEqual(config.camera_index, 0)


if __name__ == "__main__":
    unittest.main()
