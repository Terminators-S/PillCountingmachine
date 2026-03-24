#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import DetectorConfig
from src.inference.ml_detector import resolve_legacy_model_entry


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export machine-runtime ML checkpoints to ONNX or NCNN for Raspberry Pi.")
    parser.add_argument("--model-key", default="local-train12", help="Legacy local model key to export.")
    parser.add_argument("--model-path", default=None, help="Override checkpoint path instead of using the legacy catalog.")
    parser.add_argument(
        "--catalog-path",
        default="../legacy/old-machine-runtime/machine-learning/model_catalog.json",
        help="Legacy catalog path used when --model-path is not provided.",
    )
    parser.add_argument(
        "--formats",
        nargs="+",
        choices=("onnx", "ncnn"),
        default=["onnx", "ncnn"],
        help="Export formats to generate.",
    )
    parser.add_argument("--imgsz", type=int, default=640, help="Export image size.")
    parser.add_argument("--batch", type=int, default=1, help="Static export batch size.")
    parser.add_argument("--device", default="cpu", help="Export device, for example cpu or 0.")
    parser.add_argument("--dynamic", action="store_true", help="Enable dynamic shapes for ONNX export.")
    parser.add_argument("--opset", type=int, default=19, help="ONNX opset version.")
    parser.add_argument("--nms", action="store_true", help="Embed NMS when supported by the export format.")
    return parser.parse_args()


def resolve_source_checkpoint(args: argparse.Namespace) -> tuple[str, Path]:
    config = DetectorConfig(
        mode="ml",
        model_key=args.model_key,
        model_catalog_path=args.catalog_path,
        model_path=args.model_path,
    )
    model_entry = resolve_legacy_model_entry(config)
    model_key = str(model_entry.get("key") or args.model_key)
    model_path = Path(str(model_entry["absolutePath"]))
    if model_path.suffix.lower() != ".pt":
        raise RuntimeError(
            f"Export expects a PyTorch checkpoint (.pt). Received '{model_path}'. "
            f"Use a .pt source model, then run the runtime with the exported .onnx file or NCNN directory."
        )
    if not model_path.exists():
        raise RuntimeError(f"Model checkpoint not found: {model_path}")
    return model_key, model_path


def expected_output_path(model_path: Path, fmt: str) -> Path:
    if fmt == "onnx":
        return model_path.with_suffix(".onnx")
    if fmt == "ncnn":
        return model_path.with_name(f"{model_path.stem}_ncnn_model")
    raise ValueError(f"Unsupported format: {fmt}")


def export_format(model_path: Path, fmt: str, args: argparse.Namespace) -> Path:
    from ultralytics import YOLO

    model = YOLO(str(model_path))
    export_kwargs = {
        "format": fmt,
        "imgsz": args.imgsz,
        "batch": args.batch,
        "device": args.device,
    }
    if fmt == "onnx":
        export_kwargs["dynamic"] = args.dynamic
        export_kwargs["simplify"] = True
        export_kwargs["opset"] = args.opset
        export_kwargs["nms"] = args.nms
    else:
        export_kwargs["nms"] = args.nms

    print(f"\nExporting {model_path.name} -> {fmt.upper()} with {export_kwargs}")
    model.export(**export_kwargs)
    return expected_output_path(model_path, fmt)


def main() -> int:
    args = parse_args()
    model_key, model_path = resolve_source_checkpoint(args)
    print(f"Resolved model '{model_key}' to {model_path}")

    generated_outputs: list[Path] = []
    for fmt in args.formats:
        generated_outputs.append(export_format(model_path, fmt, args))

    print("\nGenerated outputs:")
    for output_path in generated_outputs:
        print(f"- {output_path}")
    print("\nThese sidecar exports are gitignored. Copy the generated .onnx file or *_ncnn_model directory onto the Pi as needed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
