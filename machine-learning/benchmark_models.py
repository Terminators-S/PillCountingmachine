import argparse
import base64
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest

import cv2
from ultralytics import YOLO

from model_registry import list_models, resolve_model


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
ROOT = Path(__file__).resolve().parent


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def iter_images(source: Path) -> List[Path]:
    if source.is_file():
        return [source]
    return sorted(path for path in source.rglob("*") if path.suffix.lower() in IMAGE_EXTENSIONS)


def frame_to_base64(frame) -> str:
    ok, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ok:
        raise RuntimeError("Failed to encode image for inference.")
    return base64.b64encode(buffer).decode("ascii")


def roboflow_infer(frame, model_id: str, api_key: str) -> Dict[str, Any]:
    endpoint = f"https://serverless.roboflow.com/{model_id}?{urlparse.urlencode({'api_key': api_key})}"
    payload = frame_to_base64(frame).encode("ascii")
    request = urlrequest.Request(
        endpoint,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urlrequest.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urlerror.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Roboflow request failed for {model_id}: {exc.code} {detail}") from exc


def benchmark_local(model_entry: Dict[str, Any], images: List[Path], confidence_threshold: float) -> Dict[str, Any]:
    model = YOLO(model_entry["absolutePath"])
    per_image = []
    total_detections = 0
    confidence_sum = 0.0

    for image_path in images:
        results = model.predict(source=str(image_path), conf=confidence_threshold, verbose=False)
        prediction_count = 0
        labels: Dict[str, int] = {}

        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue
            for box in boxes:
                prediction_count += 1
                cls = int(box.cls[0])
                confidence = float(box.conf[0])
                label = model.names.get(cls, str(cls)) if isinstance(model.names, dict) else model.names[cls]
                labels[label] = labels.get(label, 0) + 1
                total_detections += 1
                confidence_sum += confidence

        per_image.append(
            {
                "image": str(image_path),
                "predictionCount": prediction_count,
                "labels": labels,
            }
        )

    average_confidence = 0.0 if total_detections == 0 else confidence_sum / total_detections
    return {
        "modelKey": model_entry["key"],
        "modelName": model_entry["name"],
        "provider": model_entry["provider"],
        "averageConfidence": round(average_confidence, 4),
        "totalDetections": total_detections,
        "imagesProcessed": len(images),
        "perImage": per_image,
    }


def benchmark_roboflow(model_entry: Dict[str, Any], images: List[Path], api_key: str) -> Dict[str, Any]:
    per_image = []
    total_detections = 0
    confidence_sum = 0.0

    for image_path in images:
        frame = cv2.imread(str(image_path))
        if frame is None:
            raise RuntimeError(f"Failed to read image: {image_path}")

        result = roboflow_infer(frame, model_entry["modelId"], api_key)
        predictions = result.get("predictions", [])
        labels: Dict[str, int] = {}

        for prediction in predictions:
            label = str(prediction.get("class", "unknown"))
            confidence = float(prediction.get("confidence", 0.0))
            labels[label] = labels.get(label, 0) + 1
            total_detections += 1
            confidence_sum += confidence

        per_image.append(
            {
                "image": str(image_path),
                "predictionCount": len(predictions),
                "labels": labels,
            }
        )

    average_confidence = 0.0 if total_detections == 0 else confidence_sum / total_detections
    return {
        "modelKey": model_entry["key"],
        "modelName": model_entry["name"],
        "provider": model_entry["provider"],
        "averageConfidence": round(average_confidence, 4),
        "totalDetections": total_detections,
        "imagesProcessed": len(images),
        "perImage": per_image,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark local and hosted pill/medicine models.")
    parser.add_argument("--source", required=True, help="Image file or folder of images.")
    parser.add_argument("--model-key", default="", help="Optional single model key to benchmark.")
    parser.add_argument("--confidence-threshold", type=float, default=0.35)
    parser.add_argument("--output", default="")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source = Path(args.source).resolve()
    if not source.exists():
        raise RuntimeError(f"Source path not found: {source}")

    images = iter_images(source)
    if not images:
        raise RuntimeError(f"No images found at {source}")

    models = [resolve_model(args.model_key)] if args.model_key else list_models()
    roboflow_api_key = os.getenv("ROBOFLOW_API_KEY", "").strip()
    report_models = []

    for model_entry in models:
        if model_entry.get("provider") == "local":
            if not Path(model_entry["absolutePath"]).exists():
                continue
            report_models.append(benchmark_local(model_entry, images, args.confidence_threshold))
        elif model_entry.get("provider") == "roboflow":
            if not roboflow_api_key:
                report_models.append(
                    {
                        "modelKey": model_entry["key"],
                        "modelName": model_entry["name"],
                        "provider": model_entry["provider"],
                        "skipped": True,
                        "reason": "ROBOFLOW_API_KEY is not set"
                    }
                )
            else:
                report_models.append(benchmark_roboflow(model_entry, images, roboflow_api_key))
        elif model_entry.get("provider") == "ensemble":
            report_models.append(
                {
                    "modelKey": model_entry["key"],
                    "modelName": model_entry["name"],
                    "provider": model_entry["provider"],
                    "skipped": True,
                    "reason": "Benchmark single models first, then run the live ensemble."
                }
            )

    output_path = Path(args.output).resolve() if args.output else ROOT / "benchmark_reports" / f"benchmark-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    report = {
        "generatedAt": utc_now(),
        "source": str(source),
        "imageCount": len(images),
        "models": report_models,
    }

    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"reportPath": str(output_path), "modelCount": len(report_models)}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        raise
