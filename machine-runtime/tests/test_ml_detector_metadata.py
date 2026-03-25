import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.inference.ml_detector import load_export_metadata, resolve_input_size  # noqa: E402


class MlDetectorMetadataTests(unittest.TestCase):
    def test_load_export_metadata_parses_top_level_imgsz_list(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            model_dir = Path(temp_dir)
            (model_dir / "metadata.yaml").write_text(
                "\n".join(
                    [
                        "description: Test model",
                        "imgsz:",
                        "- 640",
                        "- 640",
                        "names:",
                        "  0: capsule",
                        "  1: tablet",
                    ]
                ),
                encoding="utf-8",
            )

            metadata = load_export_metadata(model_dir)

        self.assertEqual([640, 640], metadata["imgsz"])
        self.assertEqual({0: "capsule", 1: "tablet"}, metadata["names"])
        self.assertEqual((640, 640), resolve_input_size(metadata, 512))


if __name__ == "__main__":
    unittest.main()
