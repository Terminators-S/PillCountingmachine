import json
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import RecordingConfig
from src.storage import RunRecorder


class RunRecorderTests(unittest.TestCase):
    def test_finalize_records_summary_and_evidence_locations(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runs_root = Path(temp_dir)
            recorder = RunRecorder(
                runs_root,
                "run_20260324_123000",
                RecordingConfig(),
                {"run_id": "run_20260324_123000", "detector": {"mode": "ml", "model_key": "local-train12"}},
            )
            recorder.initialize()
            recorder.debug_frame_count = 1
            recorder.event_frame_count = 1
            recorder.debug_frame_paths = [str(recorder.debug_dir / "frame_000030.jpg")]
            recorder.event_frame_paths = [str(recorder.event_dir / "crossing_track_0001_frame_000030.jpg")]

            summary = recorder.finalize(
                {
                    "detector": {
                        "backend": "ml",
                        "runtime_backend": "ncnn",
                        "model_key": "local-train12",
                        "model_path": "/tmp/best_ncnn_model",
                        "model_format": "ncnn",
                    },
                    "runtime_fps": 19.5,
                    "count_result": {"total_count": 1, "event_count": 1},
                    "total_count": 1,
                }
            )

            self.assertEqual(str(recorder.session_path), summary["session_path"])
            self.assertEqual(str(recorder.summary_path), summary["summary_path"])
            self.assertEqual(str(recorder.run_dir), summary["run_directory"])
            self.assertEqual(str(recorder.debug_dir), summary["debug_frames_dir"])
            self.assertEqual(str(recorder.event_dir), summary["event_frames_dir"])
            self.assertEqual(recorder.debug_frame_paths, summary["debug_frame_paths"])
            self.assertEqual(recorder.event_frame_paths, summary["event_frame_paths"])

            written_summary = json.loads(recorder.summary_path.read_text(encoding="utf-8"))
            self.assertEqual(summary, written_summary)


if __name__ == "__main__":
    unittest.main()
