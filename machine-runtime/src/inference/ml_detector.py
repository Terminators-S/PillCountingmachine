from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from ..config import DetectorConfig, RoiConfig, project_root
from ..overlay_ui import crop_to_roi, to_full_frame_bbox, to_full_frame_point
from .detection_types import Detection


DEFAULT_LEGACY_MODEL_CATALOG = "../legacy/old-machine-runtime/machine-learning/model_catalog.json"


def resolve_legacy_catalog_path(catalog_path: str | None) -> Path:
    candidate = Path(catalog_path or DEFAULT_LEGACY_MODEL_CATALOG)
    if not candidate.is_absolute():
        candidate = (project_root() / candidate).resolve()
    return candidate


def resolve_override_model_path(model_path: str) -> Path:
    candidate = Path(model_path)
    if not candidate.is_absolute():
        candidate = (project_root() / candidate).resolve()
    return candidate


def detect_model_format(model_path: Path) -> str:
    if model_path.is_dir():
        if (model_path / "model.ncnn.param").exists() and (model_path / "model.ncnn.bin").exists():
            return "ncnn"
        return "directory"

    suffix = model_path.suffix.lower()
    if suffix == ".pt":
        return "pytorch"
    if suffix == ".onnx":
        return "onnx"
    if suffix == ".engine":
        return "tensorrt"
    if suffix == ".torchscript":
        return "torchscript"
    if suffix == ".tflite":
        return "tflite"
    if suffix:
        return suffix.lstrip(".")
    return "unknown"


def resolve_legacy_model_entry(config: DetectorConfig) -> dict[str, Any]:
    catalog_path = resolve_legacy_catalog_path(config.model_catalog_path)
    catalog = _load_catalog(catalog_path) if catalog_path.exists() else None
    selected_key = str(config.model_key or (catalog or {}).get("defaultModelKey") or "")
    selected_model = _find_catalog_model(catalog, selected_key)

    if config.model_path:
        resolved_key = str(selected_model.get("key") or selected_key or Path(str(config.model_path)).stem)
        resolved_name = str(selected_model.get("name") or resolved_key)
        resolved = dict(selected_model)
        resolved.update(
            {
                "key": resolved_key,
                "name": resolved_name,
                "provider": "local",
                "absolutePath": str(resolve_override_model_path(str(config.model_path))),
                "catalogPath": str(catalog_path),
            }
        )
        return resolved

    if catalog is None:
        raise RuntimeError(f"Legacy model catalog not found: {catalog_path}")
    if not selected_model:
        raise RuntimeError(f"Model key '{selected_key}' was not found in legacy catalog {catalog_path}.")
    if selected_model.get("provider") != "local":
        raise RuntimeError(
            f"Active ML runtime currently supports only local legacy models. "
            f"Selected model '{selected_key}' uses provider '{selected_model.get('provider')}'."
        )

    resolved = dict(selected_model)
    resolved["catalogPath"] = str(catalog_path)
    resolved["absolutePath"] = str((catalog_path.parent / str(selected_model["path"])).resolve())
    return resolved


def _load_catalog(catalog_path: Path) -> dict[str, Any]:
    return json.loads(catalog_path.read_text(encoding="utf-8"))


def _find_catalog_model(catalog: dict[str, Any] | None, model_key: str) -> dict[str, Any]:
    if not catalog or not model_key:
        return {}
    for model in catalog.get("models", []):
        if model.get("key") == model_key:
            return dict(model)
    return {}


def load_export_metadata(model_path: Path) -> dict[str, Any]:
    metadata_path = model_path / "metadata.yaml" if model_path.is_dir() else model_path.with_name("metadata.yaml")
    if not metadata_path.exists():
        return {}

    metadata: dict[str, Any] = {"metadata_path": str(metadata_path)}
    current_section: str | None = None
    names: dict[int, str] = {}
    imgsz: list[int] = []

    for raw_line in metadata_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if not line.startswith(" "):
            current_section = stripped[:-1] if stripped.endswith(":") else None
            continue
        if current_section == "names":
            match = re.match(r"\s*(\d+):\s*(.+)\s*$", line)
            if match:
                names[int(match.group(1))] = match.group(2).strip().strip("'\"")
            continue
        if current_section == "imgsz":
            match = re.match(r"\s*-\s*(\d+)\s*$", line)
            if match:
                imgsz.append(int(match.group(1)))

    if names:
        metadata["names"] = names
    if imgsz:
        metadata["imgsz"] = imgsz
    return metadata


def resolve_runtime_backend(model_format: str) -> str:
    if model_format == "pytorch":
        return "pt"
    if model_format in {"onnx", "ncnn"}:
        return model_format
    raise RuntimeError(
        f"Unsupported ML model format '{model_format}'. "
        f"Supported formats are .pt, .onnx, or an NCNN directory containing model.ncnn.param and model.ncnn.bin."
    )


def resolve_class_names(model_entry: dict[str, Any], export_metadata: dict[str, Any]) -> dict[int, str]:
    raw_names = export_metadata.get("names")
    if isinstance(raw_names, dict) and raw_names:
        return {int(index): str(name) for index, name in raw_names.items()}

    raw_classes = model_entry.get("classes")
    if isinstance(raw_classes, list):
        return {index: str(name) for index, name in enumerate(raw_classes)}
    if isinstance(raw_classes, dict):
        return {int(index): str(name) for index, name in raw_classes.items()}
    return {}


def resolve_input_size(
    export_metadata: dict[str, Any], fallback_size: int, width: int | None = None, height: int | None = None
) -> tuple[int, int]:
    if width and height:
        return int(width), int(height)

    metadata_size = export_metadata.get("imgsz")
    if isinstance(metadata_size, list) and len(metadata_size) >= 2:
        return int(metadata_size[1]), int(metadata_size[0])
    if isinstance(metadata_size, list) and len(metadata_size) == 1:
        return int(metadata_size[0]), int(metadata_size[0])
    return int(fallback_size), int(fallback_size)


def letterbox_frame(frame, target_width: int, target_height: int) -> tuple[np.ndarray, float, float, float]:
    original_height, original_width = frame.shape[:2]
    scale = min(target_width / max(original_width, 1), target_height / max(original_height, 1))
    resized_width = max(1, int(round(original_width * scale)))
    resized_height = max(1, int(round(original_height * scale)))

    resized = cv2.resize(frame, (resized_width, resized_height), interpolation=cv2.INTER_LINEAR)
    canvas = np.full((target_height, target_width, 3), 114, dtype=np.uint8)
    pad_left = (target_width - resized_width) // 2
    pad_top = (target_height - resized_height) // 2
    canvas[pad_top : pad_top + resized_height, pad_left : pad_left + resized_width] = resized

    tensor = canvas[:, :, ::-1].transpose(2, 0, 1).astype(np.float32) / 255.0
    return np.expand_dims(tensor, axis=0), scale, float(pad_left), float(pad_top)


def scale_bbox_from_letterbox(
    bbox: tuple[float, float, float, float], scale: float, pad_x: float, pad_y: float, width: int, height: int
) -> tuple[int, int, int, int]:
    x1 = (bbox[0] - pad_x) / scale
    y1 = (bbox[1] - pad_y) / scale
    x2 = (bbox[2] - pad_x) / scale
    y2 = (bbox[3] - pad_y) / scale

    return (
        int(np.clip(round(x1), 0, width)),
        int(np.clip(round(y1), 0, height)),
        int(np.clip(round(x2), 0, width)),
        int(np.clip(round(y2), 0, height)),
    )


def apply_classwise_nms(predictions: list["BackendPrediction"], iou_threshold: float) -> list["BackendPrediction"]:
    if len(predictions) <= 1:
        return predictions

    kept_predictions: list[BackendPrediction] = []
    for class_id in sorted({prediction.class_id for prediction in predictions}):
        class_predictions = [prediction for prediction in predictions if prediction.class_id == class_id]
        class_predictions.sort(key=lambda prediction: prediction.confidence, reverse=True)

        while class_predictions:
            current = class_predictions.pop(0)
            kept_predictions.append(current)
            class_predictions = [
                candidate
                for candidate in class_predictions
                if intersection_over_union(current.bbox, candidate.bbox) <= iou_threshold
            ]

    kept_predictions.sort(key=lambda prediction: prediction.confidence, reverse=True)
    return kept_predictions


def intersection_over_union(
    left: tuple[float, float, float, float], right: tuple[float, float, float, float]
) -> float:
    x1 = max(left[0], right[0])
    y1 = max(left[1], right[1])
    x2 = min(left[2], right[2])
    y2 = min(left[3], right[3])

    intersection_width = max(0.0, x2 - x1)
    intersection_height = max(0.0, y2 - y1)
    intersection_area = intersection_width * intersection_height
    if intersection_area <= 0:
        return 0.0

    left_area = max(0.0, left[2] - left[0]) * max(0.0, left[3] - left[1])
    right_area = max(0.0, right[2] - right[0]) * max(0.0, right[3] - right[1])
    union_area = left_area + right_area - intersection_area
    if union_area <= 0:
        return 0.0
    return intersection_area / union_area


@dataclass(frozen=True)
class BackendPrediction:
    bbox: tuple[float, float, float, float]
    confidence: float
    class_id: int


class UltralyticsPtBackend:
    def __init__(self, model_path: Path):
        try:
            from ultralytics import YOLO
        except ImportError as exc:
            raise RuntimeError(
                "Ultralytics is required for ML detector mode. "
                "Install it with: bash scripts/setup_venv.sh --with-ml"
            ) from exc

        self.runtime_backend = "pt"
        self.model = YOLO(str(model_path))
        self.class_names = self.model.names

    def infer(self, roi_frame, config: DetectorConfig) -> list[BackendPrediction]:
        prediction_kwargs: dict[str, Any] = {
            "conf": config.confidence_threshold,
            "iou": config.nms_iou_threshold,
            "imgsz": config.inference_size,
            "verbose": False,
        }
        if config.device:
            prediction_kwargs["device"] = config.device

        predictions: list[BackendPrediction] = []
        for result in self.model.predict(roi_frame, **prediction_kwargs):
            boxes = result.boxes
            if boxes is None:
                continue
            for box in boxes:
                confidence = float(box.conf[0])
                if confidence < config.confidence_threshold:
                    continue
                x1, y1, x2, y2 = box.xyxy[0]
                predictions.append(
                    BackendPrediction(
                        bbox=(float(x1), float(y1), float(x2), float(y2)),
                        confidence=confidence,
                        class_id=int(box.cls[0]),
                    )
                )
        return predictions


class OnnxRuntimeBackend:
    def __init__(self, model_path: Path, config: DetectorConfig, class_names: dict[int, str], export_metadata: dict[str, Any]):
        try:
            import onnxruntime as ort
        except ImportError as exc:
            raise RuntimeError(
                "onnxruntime is required for ONNX ML detector mode. "
                "Install it with: python -m pip install onnxruntime"
            ) from exc

        device = str(config.device or "cpu").strip().lower()
        if device not in {"", "cpu", "cpu:0"}:
            raise RuntimeError(
                f"ONNX ML detector mode currently supports only CPU execution. Received device '{config.device}'."
            )

        self.runtime_backend = "onnx"
        self.class_names = class_names
        self.session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        self.output_names = [output.name for output in self.session.get_outputs()]
        input_shape = self.session.get_inputs()[0].shape
        input_height = input_shape[2] if len(input_shape) >= 4 and isinstance(input_shape[2], int) else None
        input_width = input_shape[3] if len(input_shape) >= 4 and isinstance(input_shape[3], int) else None
        self.input_width, self.input_height = resolve_input_size(export_metadata, config.inference_size, input_width, input_height)

    def infer(self, roi_frame, config: DetectorConfig) -> list[BackendPrediction]:
        tensor, scale, pad_x, pad_y = letterbox_frame(roi_frame, self.input_width, self.input_height)
        outputs = self.session.run(self.output_names, {self.input_name: tensor})
        raw_output = np.asarray(outputs[0], dtype=np.float32)
        return decode_onnx_output(
            raw_output,
            scale=scale,
            pad_x=pad_x,
            pad_y=pad_y,
            original_width=roi_frame.shape[1],
            original_height=roi_frame.shape[0],
            confidence_threshold=config.confidence_threshold,
            iou_threshold=config.nms_iou_threshold,
        )


class NcnnRuntimeBackend:
    def __init__(self, model_path: Path, config: DetectorConfig, class_names: dict[int, str], export_metadata: dict[str, Any]):
        try:
            import ncnn
        except ImportError as exc:
            raise RuntimeError(
                "ncnn is required for NCNN ML detector mode. "
                "Install it with: python -m pip install ncnn"
            ) from exc

        param_path = model_path / "model.ncnn.param"
        bin_path = model_path / "model.ncnn.bin"
        if not param_path.exists() or not bin_path.exists():
            raise RuntimeError(f"NCNN model directory is missing model.ncnn.param or model.ncnn.bin: {model_path}")

        self.runtime_backend = "ncnn"
        self.class_names = class_names
        self.ncnn = ncnn
        self.net = ncnn.Net()
        self._configure_device(config.device)
        self.net.load_param(str(param_path))
        self.net.load_model(str(bin_path))
        self.input_name = self.net.input_names()[0]
        self.output_name = self.net.output_names()[0]
        self.input_width, self.input_height = resolve_input_size(export_metadata, config.inference_size)

    def infer(self, roi_frame, config: DetectorConfig) -> list[BackendPrediction]:
        tensor, scale, pad_x, pad_y = letterbox_frame(roi_frame, self.input_width, self.input_height)
        input_tensor = np.ascontiguousarray(tensor[0], dtype=np.float32)

        with self.net.create_extractor() as extractor:
            extractor.input(self.input_name, self.ncnn.Mat(input_tensor).clone())
            _, output = extractor.extract(self.output_name)

        raw_output = np.asarray(output, dtype=np.float32)
        return decode_ncnn_output(
            raw_output,
            scale=scale,
            pad_x=pad_x,
            pad_y=pad_y,
            original_width=roi_frame.shape[1],
            original_height=roi_frame.shape[0],
            confidence_threshold=config.confidence_threshold,
            iou_threshold=config.nms_iou_threshold,
        )

    def _configure_device(self, device_value: str) -> None:
        device = str(device_value or "cpu").strip().lower()
        if device in {"", "cpu", "cpu:0"}:
            return
        if not device.startswith("vulkan"):
            raise RuntimeError(
                f"NCNN ML detector mode supports device='cpu' or 'vulkan:<index>'. Received '{device_value}'."
            )

        gpu_index = 0
        if ":" in device:
            _, index_text = device.split(":", 1)
            gpu_index = int(index_text or "0")

        self.ncnn.create_gpu_instance()
        gpu_count = int(self.ncnn.get_gpu_count())
        if gpu_count <= 0:
            raise RuntimeError("NCNN Vulkan device requested, but no NCNN GPU devices are available.")
        if gpu_index < 0 or gpu_index >= gpu_count:
            raise RuntimeError(
                f"NCNN Vulkan device index {gpu_index} is out of range. Available GPU count: {gpu_count}."
            )

        self.net.opt.use_vulkan_compute = True
        self.net.set_vulkan_device(self.ncnn.get_gpu_device(gpu_index))


def normalize_prediction_matrix(raw_output: np.ndarray) -> np.ndarray:
    predictions = np.asarray(raw_output, dtype=np.float32)
    if predictions.ndim == 3:
        predictions = predictions[0]

    if predictions.ndim != 2:
        raise RuntimeError(f"Unsupported exported-model output shape: {predictions.shape}")

    should_transpose = (predictions.shape[0] <= 10 and predictions.shape[1] != 6) or (
        predictions.shape[0] <= 128 and predictions.shape[1] > 100 and predictions.shape[0] < predictions.shape[1]
    )
    if should_transpose:
        predictions = predictions.T
    return predictions


def decode_onnx_output(
    raw_output: np.ndarray,
    *,
    scale: float,
    pad_x: float,
    pad_y: float,
    original_width: int,
    original_height: int,
    confidence_threshold: float,
    iou_threshold: float,
) -> list[BackendPrediction]:
    predictions = normalize_prediction_matrix(raw_output)
    if predictions.shape[1] == 6:
        return decode_postprocessed_predictions(
            predictions,
            scale=scale,
            pad_x=pad_x,
            pad_y=pad_y,
            original_width=original_width,
            original_height=original_height,
            confidence_threshold=confidence_threshold,
            iou_threshold=iou_threshold,
        )
    if predictions.shape[1] > 5:
        return decode_raw_xywh_predictions(
            predictions,
            scale=scale,
            pad_x=pad_x,
            pad_y=pad_y,
            original_width=original_width,
            original_height=original_height,
            confidence_threshold=confidence_threshold,
            iou_threshold=iou_threshold,
        )
    raise RuntimeError(f"Unsupported exported-model output shape: {predictions.shape}")


def decode_ncnn_output(
    raw_output: np.ndarray,
    *,
    scale: float,
    pad_x: float,
    pad_y: float,
    original_width: int,
    original_height: int,
    confidence_threshold: float,
    iou_threshold: float,
) -> list[BackendPrediction]:
    predictions = normalize_prediction_matrix(raw_output)
    return decode_raw_xywh_predictions(
        predictions,
        scale=scale,
        pad_x=pad_x,
        pad_y=pad_y,
        original_width=original_width,
        original_height=original_height,
        confidence_threshold=confidence_threshold,
        iou_threshold=iou_threshold,
    )


def decode_postprocessed_predictions(
    predictions: np.ndarray,
    *,
    scale: float,
    pad_x: float,
    pad_y: float,
    original_width: int,
    original_height: int,
    confidence_threshold: float,
    iou_threshold: float,
) -> list[BackendPrediction]:
    decoded: list[BackendPrediction] = []
    for prediction in predictions:
        confidence = float(prediction[4])
        if confidence < confidence_threshold:
            continue
        bbox = scale_bbox_from_letterbox(
            (float(prediction[0]), float(prediction[1]), float(prediction[2]), float(prediction[3])),
            scale,
            pad_x,
            pad_y,
            original_width,
            original_height,
        )
        if bbox[2] <= bbox[0] or bbox[3] <= bbox[1]:
            continue
        decoded.append(
            BackendPrediction(
                bbox=(float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])),
                confidence=confidence,
                class_id=int(prediction[5]),
            )
        )
    return apply_classwise_nms(decoded, iou_threshold)


def decode_raw_xywh_predictions(
    predictions: np.ndarray,
    *,
    scale: float,
    pad_x: float,
    pad_y: float,
    original_width: int,
    original_height: int,
    confidence_threshold: float,
    iou_threshold: float,
) -> list[BackendPrediction]:
    if predictions.shape[1] < 6:
        raise RuntimeError(f"Unsupported raw exported-model output shape: {predictions.shape}")

    class_scores = predictions[:, 4:]
    if class_scores.shape[1] == 0:
        raise RuntimeError(f"Raw exported-model output is missing class score columns: {predictions.shape}")

    class_ids = np.argmax(class_scores, axis=1)
    confidences = class_scores[np.arange(class_scores.shape[0]), class_ids]

    decoded: list[BackendPrediction] = []
    for index, confidence in enumerate(confidences):
        if float(confidence) < confidence_threshold:
            continue

        cx, cy, width, height = predictions[index, :4]
        x1 = float(cx - (width / 2.0))
        y1 = float(cy - (height / 2.0))
        x2 = float(cx + (width / 2.0))
        y2 = float(cy + (height / 2.0))
        bbox = scale_bbox_from_letterbox(
            (x1, y1, x2, y2),
            scale,
            pad_x,
            pad_y,
            original_width,
            original_height,
        )
        if bbox[2] <= bbox[0] or bbox[3] <= bbox[1]:
            continue
        decoded.append(
            BackendPrediction(
                bbox=(float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])),
                confidence=float(confidence),
                class_id=int(class_ids[index]),
            )
        )
    return apply_classwise_nms(decoded, iou_threshold)


class MlDetector:
    def __init__(self, config: DetectorConfig):
        self.config = config
        self.backend_name = "ml"
        self.catalog_path = resolve_legacy_catalog_path(config.model_catalog_path)
        self.model_entry = resolve_legacy_model_entry(config)
        self.model_key = str(self.model_entry.get("key") or config.model_key or "legacy-local-model")
        self.model_name = str(self.model_entry.get("name") or self.model_key)
        self.model_provider = str(self.model_entry.get("provider") or "local")
        self.model_path = self._resolve_model_path()
        self.model_format = detect_model_format(self.model_path)
        self.export_metadata = load_export_metadata(self.model_path)
        self.runtime_backend = resolve_runtime_backend(self.model_format)
        self.runtime = self._load_runtime_backend()
        self.class_names = getattr(self.runtime, "class_names", {}) or {}

    def infer(self, frame, roi: RoiConfig) -> tuple[list[Detection], None]:
        roi_frame = crop_to_roi(frame, roi)
        predictions = self.runtime.infer(roi_frame, self.config)
        detections: list[Detection] = []

        for prediction in predictions:
            local_bbox = (
                max(0, int(prediction.bbox[0])),
                max(0, int(prediction.bbox[1])),
                min(roi.width, int(prediction.bbox[2])),
                min(roi.height, int(prediction.bbox[3])),
            )
            width = max(0, local_bbox[2] - local_bbox[0])
            height = max(0, local_bbox[3] - local_bbox[1])
            if width <= 0 or height <= 0:
                continue

            raw_label = self._resolve_class_name(prediction.class_id)
            label = self._normalize_label(raw_label)
            centroid_local = (local_bbox[0] + width // 2, local_bbox[1] + height // 2)
            detections.append(
                Detection(
                    label=label,
                    confidence=prediction.confidence,
                    bbox=to_full_frame_bbox(roi, local_bbox),
                    centroid=to_full_frame_point(roi, centroid_local),
                    area=float(width * height),
                    class_id=prediction.class_id,
                    source_model=self.model_key,
                    source_backend=self.runtime_backend,
                    raw_label=raw_label,
                )
            )

        detections.sort(key=lambda item: (item.centroid[1], item.centroid[0]))
        return detections, None

    def describe(self) -> dict[str, Any]:
        return {
            "mode": "ml",
            "backend": self.backend_name,
            "runtime_backend": self.runtime_backend,
            "provider": self.model_provider,
            "model_key": self.model_key,
            "model_name": self.model_name,
            "model_path": str(self.model_path),
            "model_format": self.model_format,
            "catalog_path": str(self.catalog_path),
        }

    def _resolve_model_path(self) -> Path:
        candidate = Path(str(self.model_entry["absolutePath"]))
        if not candidate.exists():
            raise RuntimeError(f"ML model file not found: {candidate}")
        return candidate

    def _load_runtime_backend(self):
        if self.runtime_backend == "pt":
            return self._load_pytorch_backend()
        if self.runtime_backend == "onnx":
            return self._load_onnx_backend()
        if self.runtime_backend == "ncnn":
            return self._load_ncnn_backend()
        raise RuntimeError(f"Unsupported ML runtime backend: {self.runtime_backend}")

    def _load_pytorch_backend(self) -> UltralyticsPtBackend:
        return UltralyticsPtBackend(self.model_path)

    def _load_onnx_backend(self) -> OnnxRuntimeBackend:
        return OnnxRuntimeBackend(
            self.model_path,
            self.config,
            resolve_class_names(self.model_entry, self.export_metadata),
            self.export_metadata,
        )

    def _load_ncnn_backend(self) -> NcnnRuntimeBackend:
        return NcnnRuntimeBackend(
            self.model_path,
            self.config,
            resolve_class_names(self.model_entry, self.export_metadata),
            self.export_metadata,
        )

    def _resolve_class_name(self, class_id: int) -> str:
        if isinstance(self.class_names, dict):
            return str(self.class_names.get(class_id, class_id))
        if 0 <= class_id < len(self.class_names):
            return str(self.class_names[class_id])
        return str(class_id)

    @staticmethod
    def _normalize_label(raw_label: str) -> str:
        cleaned = raw_label.strip().lower().replace("_", " ").replace("-", " ")
        alias_map = {
            "capsules": "capsule",
            "capsule": "capsule",
            "tablets": "tablet",
            "tablet": "tablet",
            "pills": "pill",
            "pill": "pill",
        }
        return alias_map.get(cleaned, cleaned or "pill")
