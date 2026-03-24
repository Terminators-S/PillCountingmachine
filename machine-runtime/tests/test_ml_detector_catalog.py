import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import DetectorConfig
from src.inference.ml_detector import detect_model_format, resolve_legacy_model_entry


class MlDetectorCatalogTests(unittest.TestCase):
    def test_resolves_local_train12_from_legacy_catalog(self):
        config = DetectorConfig(mode="ml", model_key="local-train12")
        model_entry = resolve_legacy_model_entry(config)
        self.assertEqual("local-train12", model_entry["key"])
        self.assertTrue(str(model_entry["absolutePath"]).endswith("train12\\best.pt") or str(model_entry["absolutePath"]).endswith("train12/best.pt"))

    def test_rejects_non_local_provider(self):
        config = DetectorConfig(mode="ml", model_key="ensemble-local-best")
        with self.assertRaises(RuntimeError):
            resolve_legacy_model_entry(config)

    def test_override_model_path_resolves_absolute_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            model_path = Path(temp_dir) / "pill-model.onnx"
            model_path.write_text("placeholder", encoding="utf-8")
            config = DetectorConfig(mode="ml", model_path=str(model_path), model_key="override-model")
            model_entry = resolve_legacy_model_entry(config)
            self.assertEqual("override-model", model_entry["key"])
            self.assertEqual(str(model_path), model_entry["absolutePath"])

    def test_detects_ncnn_directory_format(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            model_dir = Path(temp_dir) / "pill-model_ncnn_model"
            model_dir.mkdir()
            (model_dir / "model.ncnn.param").write_text("param", encoding="utf-8")
            (model_dir / "model.ncnn.bin").write_text("bin", encoding="utf-8")
            self.assertEqual("ncnn", detect_model_format(model_dir))


if __name__ == "__main__":
    unittest.main()
