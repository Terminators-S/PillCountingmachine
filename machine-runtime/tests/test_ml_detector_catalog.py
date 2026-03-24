import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import DetectorConfig
from src.inference.ml_detector import resolve_legacy_model_entry


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


if __name__ == "__main__":
    unittest.main()
