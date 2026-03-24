import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import CameraRuntimeConfig, CountLineConfig, DetectorConfig, RecordingConfig, RoiConfig, TrackerConfig
from src.main import build_final_summary, build_session_metadata


class BuildFinalSummaryTests(unittest.TestCase):
    def test_session_metadata_records_explicit_backend_fields(self):
        counting_config = SimpleNamespace(
            roi=RoiConfig(x=10, y=20, width=200, height=120),
            count_line=CountLineConfig(start=(0, 60), end=(200, 60), allowed_direction="down"),
            detector=DetectorConfig(mode="ml", model_key="local-train12"),
            tracker=TrackerConfig(),
            recording=RecordingConfig(),
        )
        camera_info = SimpleNamespace(camera_index=0, actual_width=1280, actual_height=720, actual_fps=30.0, backend_name="V4L2")
        camera_config = CameraRuntimeConfig(machine_name="pill-counter-pi")
        detector_info = {
            "backend": "ml",
            "detector_backend": "ml",
            "runtime_backend": "ncnn",
            "ml_runtime_backend": "ncnn",
            "model_key": "local-train12",
            "model_name": "Local train12 best",
            "model_path": "/tmp/best_ncnn_model",
            "model_format": "ncnn",
        }

        session = build_session_metadata(
            run_id="run_20260324_123000",
            camera_info=camera_info,
            camera_config=camera_config,
            counting_config=counting_config,
            line_points=((10, 80), (210, 80)),
            detector_info=detector_info,
            source_mode="live_camera",
            source_label="camera:0",
        )

        self.assertEqual("ml", session["detector_backend"])
        self.assertEqual("ncnn", session["ml_runtime_backend"])
        self.assertEqual("local-train12", session["model_key"])
        self.assertEqual("/tmp/best_ncnn_model", session["model_path"])
        self.assertEqual("ncnn", session["model_format"])

    def test_summary_records_detector_metadata_runtime_fps_and_count_result(self):
        counting_config = SimpleNamespace(
            roi=RoiConfig(x=10, y=20, width=200, height=120),
            count_line=CountLineConfig(start=(0, 60), end=(200, 60), allowed_direction="down"),
            detector=DetectorConfig(mode="ml", model_key="local-train12"),
            tracker=TrackerConfig(),
            recording=RecordingConfig(),
        )
        camera_info = SimpleNamespace(camera_index=0, actual_width=1280, actual_height=720, actual_fps=30.0)
        line_counter = SimpleNamespace(
            total_count=3,
            counted_track_ids={4, 8, 9},
            events=[
                SimpleNamespace(object_label="tablet"),
                SimpleNamespace(object_label="tablet"),
                SimpleNamespace(object_label="capsule"),
            ],
        )
        detector_info = {
            "backend": "ml",
            "detector_backend": "ml",
            "runtime_backend": "ncnn",
            "ml_runtime_backend": "ncnn",
            "model_key": "local-train12",
            "model_name": "Local train12 best",
            "model_path": "/tmp/best_ncnn_model",
            "model_format": "ncnn",
        }

        summary = build_final_summary(
            run_id="run_20260324_123000",
            started_at_utc="2026-03-24T12:30:00+00:00",
            camera_info=camera_info,
            machine_name="pill-counter-pi",
            counting_config=counting_config,
            line_points=((10, 80), (210, 80)),
            detector_info=detector_info,
            line_counter=line_counter,
            frame_index=180,
            average_fps=17.276,
            duration_seconds=10.4321,
            source_mode="live_camera",
            source_label="camera:0",
            runtime_status="COMPLETED",
            exit_reason="max_frames_reached",
            camera_state="frame budget reached",
            status_text="Reached max frame limit (180).",
        )

        self.assertEqual("ml", summary["detector_backend"])
        self.assertEqual("ncnn", summary["ml_runtime_backend"])
        self.assertEqual("local-train12", summary["model_key"])
        self.assertEqual("/tmp/best_ncnn_model", summary["model_path"])
        self.assertEqual("ncnn", summary["model_format"])
        self.assertEqual("ml", summary["detector"]["backend"])
        self.assertEqual("ncnn", summary["detector"]["runtime_backend"])
        self.assertEqual("local-train12", summary["detector"]["model_key"])
        self.assertEqual("/tmp/best_ncnn_model", summary["detector"]["model_path"])
        self.assertEqual("ncnn", summary["detector"]["model_format"])
        self.assertEqual(17.28, summary["runtime_fps"])
        self.assertEqual(17.28, summary["average_fps"])
        self.assertEqual(3, summary["count_result"]["total_count"])
        self.assertEqual(3, summary["count_result"]["event_count"])
        self.assertEqual({"tablet": 2, "capsule": 1}, summary["count_result"]["counted_by_label"])
        self.assertEqual([4, 8, 9], summary["count_result"]["counted_track_ids"])


if __name__ == "__main__":
    unittest.main()
