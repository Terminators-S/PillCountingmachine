import argparse
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import CountLineConfig, CountingRuntimeConfig, DetectorConfig, RecordingConfig, RoiConfig, TrackerConfig  # noqa: E402
from src.main import override_counting_config  # noqa: E402


class RuntimeTuningTests(unittest.TestCase):
    def test_override_counting_config_allows_safe_recording_overrides_from_env(self):
        config = CountingRuntimeConfig(
            roi=RoiConfig(x=10, y=20, width=100, height=80),
            count_line=CountLineConfig(start=(0, 40), end=(100, 40), allowed_direction="down"),
            detector=DetectorConfig(mode="ml", inference_size=640),
            tracker=TrackerConfig(),
            recording=RecordingConfig(
                save_debug_overlay_frames=True,
                debug_frame_interval=30,
                max_debug_frames=100,
                save_crossing_event_frames=True,
            ),
        )
        args = argparse.Namespace(
            detector_mode=None,
            detector_model_key=None,
            detector_model_path=None,
            detector_catalog_path=None,
            detector_device=None,
            detector_inference_size=512,
        )

        with patch.dict(
            os.environ,
            {
                "PILLCOUNT_SAVE_DEBUG_OVERLAY_FRAMES": "0",
                "PILLCOUNT_SAVE_CROSSING_EVENT_FRAMES": "0",
                "PILLCOUNT_MAX_DEBUG_FRAMES": "0",
            },
            clear=False,
        ):
            updated = override_counting_config(config, args)

        self.assertEqual(512, updated.detector.inference_size)
        self.assertFalse(updated.recording.save_debug_overlay_frames)
        self.assertFalse(updated.recording.save_crossing_event_frames)
        self.assertEqual(0, updated.recording.max_debug_frames)


if __name__ == "__main__":
    unittest.main()
