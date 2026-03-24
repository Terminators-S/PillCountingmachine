import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PROJECT_ROOT.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import DetectorConfig, RoiConfig
from src.inference.ml_detector import MlDetector, decode_ncnn_output


class DummyBackend:
    def __init__(self, runtime_backend: str):
        self.runtime_backend = runtime_backend
        self.class_names = {0: "capsules", 1: "tablets"}

    def infer(self, roi_frame, config):
        return []


class MlDetectorBackendSelectionTests(unittest.TestCase):
    def test_decodes_ncnn_raw_output_matrix(self):
        raw_output = np.array([[320.0], [240.0], [100.0], [80.0], [0.9], [0.1]], dtype=np.float32)
        predictions = decode_ncnn_output(
            raw_output,
            scale=1.0,
            pad_x=0.0,
            pad_y=0.0,
            original_width=640,
            original_height=640,
            confidence_threshold=0.25,
            iou_threshold=0.45,
        )

        self.assertEqual(1, len(predictions))
        self.assertEqual((270.0, 200.0, 370.0, 280.0), predictions[0].bbox)
        self.assertEqual(0, predictions[0].class_id)
        self.assertAlmostEqual(0.9, predictions[0].confidence, places=6)

    def test_pt_path_keeps_ultralytics_requirement(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            model_path = Path(temp_dir) / "pill-model.pt"
            model_path.write_text("placeholder", encoding="utf-8")
            with patch.dict(sys.modules, {"ultralytics": None}):
                with self.assertRaises(RuntimeError) as context:
                    MlDetector(DetectorConfig(mode="ml", model_key="local-train12", model_path=str(model_path)))
            self.assertIn("Ultralytics is required for ML detector mode", str(context.exception))

    def test_onnx_path_selects_onnx_backend(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            model_path = Path(temp_dir) / "pill-model.onnx"
            model_path.write_text("placeholder", encoding="utf-8")
            with patch.object(MlDetector, "_load_onnx_backend", return_value=DummyBackend("onnx")) as load_onnx:
                with patch.object(MlDetector, "_load_pytorch_backend", side_effect=AssertionError("pt backend should not load")):
                    with patch.object(MlDetector, "_load_ncnn_backend", side_effect=AssertionError("ncnn backend should not load")):
                        detector = MlDetector(DetectorConfig(mode="ml", model_key="local-train12", model_path=str(model_path)))

            self.assertEqual("onnx", detector.runtime_backend)
            self.assertEqual("onnx", detector.describe()["runtime_backend"])
            self.assertEqual("onnx", detector.describe()["ml_runtime_backend"])
            self.assertEqual("ml", detector.describe()["detector_backend"])
            self.assertEqual("Local train12 best", detector.model_name)
            load_onnx.assert_called_once()

    def test_ncnn_path_selects_ncnn_backend(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            model_dir = Path(temp_dir) / "pill-model_ncnn_model"
            model_dir.mkdir()
            (model_dir / "model.ncnn.param").write_text("param", encoding="utf-8")
            (model_dir / "model.ncnn.bin").write_text("bin", encoding="utf-8")
            with patch.object(MlDetector, "_load_ncnn_backend", return_value=DummyBackend("ncnn")) as load_ncnn:
                with patch.object(MlDetector, "_load_pytorch_backend", side_effect=AssertionError("pt backend should not load")):
                    with patch.object(MlDetector, "_load_onnx_backend", side_effect=AssertionError("onnx backend should not load")):
                        detector = MlDetector(DetectorConfig(mode="ml", model_key="local-train12", model_path=str(model_dir)))

            self.assertEqual("ncnn", detector.runtime_backend)
            self.assertEqual("ncnn", detector.describe()["runtime_backend"])
            self.assertEqual("ncnn", detector.describe()["ml_runtime_backend"])
            self.assertEqual("ml", detector.describe()["detector_backend"])
            self.assertEqual("Local train12 best", detector.model_name)
            load_ncnn.assert_called_once()

    def test_pt_path_selects_pytorch_backend(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            model_path = Path(temp_dir) / "pill-model.pt"
            model_path.write_text("placeholder", encoding="utf-8")
            with patch.object(MlDetector, "_load_pytorch_backend", return_value=DummyBackend("pytorch")) as load_pytorch:
                with patch.object(MlDetector, "_load_onnx_backend", side_effect=AssertionError("onnx backend should not load")):
                    with patch.object(MlDetector, "_load_ncnn_backend", side_effect=AssertionError("ncnn backend should not load")):
                        detector = MlDetector(DetectorConfig(mode="ml", model_key="local-train12", model_path=str(model_path)))

            self.assertEqual("pytorch", detector.runtime_backend)
            self.assertEqual("pytorch", detector.describe()["runtime_backend"])
            self.assertEqual("pytorch", detector.describe()["ml_runtime_backend"])
            self.assertEqual("ml", detector.describe()["detector_backend"])
            load_pytorch.assert_called_once()

    def test_missing_ncnn_files_fails_clearly(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            model_dir = Path(temp_dir) / "pill-model_ncnn_model"
            model_dir.mkdir()
            (model_dir / "model.ncnn.param").write_text("param", encoding="utf-8")

            with self.assertRaises(RuntimeError) as context:
                MlDetector(DetectorConfig(mode="ml", model_key="local-train12", model_path=str(model_dir)))

        self.assertIn("NCNN model directory is missing model.ncnn.param or model.ncnn.bin", str(context.exception))


@unittest.skipUnless(importlib.util.find_spec("onnxruntime"), "onnxruntime is not installed")
class OnnxBackendSmokeTests(unittest.TestCase):
    def test_exported_onnx_runs_without_ultralytics(self):
        model_path = REPO_ROOT / "legacy" / "old-machine-runtime" / "machine-learning" / "models" / "local" / "train12" / "best.onnx"
        frame = np.full((640, 640, 3), 114, dtype=np.uint8)
        roi = RoiConfig(x=0, y=0, width=640, height=640)

        with patch.dict(sys.modules, {"ultralytics": None}):
            detector = MlDetector(DetectorConfig(mode="ml", model_key="local-train12", model_path=str(model_path)))
            detections, _ = detector.infer(frame, roi)

        self.assertEqual("onnx", detector.runtime_backend)
        self.assertEqual("onnx", detector.describe()["ml_runtime_backend"])
        self.assertIsInstance(detections, list)


@unittest.skipUnless(importlib.util.find_spec("ncnn"), "ncnn is not installed")
class NcnnBackendSmokeTests(unittest.TestCase):
    def test_exported_ncnn_runs_without_ultralytics(self):
        model_path = (
            REPO_ROOT
            / "legacy"
            / "old-machine-runtime"
            / "machine-learning"
            / "models"
            / "local"
            / "train12"
            / "best_ncnn_model"
        )
        frame = np.full((640, 640, 3), 114, dtype=np.uint8)
        roi = RoiConfig(x=0, y=0, width=640, height=640)

        with patch.dict(sys.modules, {"ultralytics": None}):
            detector = MlDetector(DetectorConfig(mode="ml", model_key="local-train12", model_path=str(model_path)))
            detections, _ = detector.infer(frame, roi)

        self.assertEqual("ncnn", detector.runtime_backend)
        self.assertEqual("ncnn", detector.describe()["ml_runtime_backend"])
        self.assertIsInstance(detections, list)


if __name__ == "__main__":
    unittest.main()
