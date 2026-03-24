from __future__ import annotations

import json
from pathlib import Path
from typing import Any

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


def resolve_legacy_model_entry(config: DetectorConfig) -> dict[str, Any]:
    catalog_path = resolve_legacy_catalog_path(config.model_catalog_path)
    if config.model_path:
        return {
            "key": config.model_key or Path(str(config.model_path)).stem,
            "name": config.model_key or Path(str(config.model_path)).stem,
            "provider": "local",
            "absolutePath": str(resolve_override_model_path(str(config.model_path))),
            "catalogPath": str(catalog_path),
        }

    if not catalog_path.exists():
        raise RuntimeError(f"Legacy model catalog not found: {catalog_path}")

    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    selected_key = config.model_key or catalog.get("defaultModelKey")
    for model in catalog.get("models", []):
        if model.get("key") != selected_key:
            continue
        if model.get("provider") != "local":
            raise RuntimeError(
                f"Active ML runtime currently supports only local legacy models. "
                f"Selected model '{selected_key}' uses provider '{model.get('provider')}'."
            )
        resolved = dict(model)
        resolved["catalogPath"] = str(catalog_path)
        resolved["absolutePath"] = str((catalog_path.parent / str(model["path"])).resolve())
        return resolved

    raise RuntimeError(f"Model key '{selected_key}' was not found in legacy catalog {catalog_path}.")


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
        self.model = self._load_model()
        self.class_names = self.model.names

    def infer(self, frame, roi: RoiConfig) -> tuple[list[Detection], None]:
        roi_frame = crop_to_roi(frame, roi)
        prediction_kwargs: dict[str, Any] = {
            "conf": self.config.confidence_threshold,
            "iou": self.config.nms_iou_threshold,
            "imgsz": self.config.inference_size,
            "verbose": False,
        }
        if self.config.device:
            prediction_kwargs["device"] = self.config.device

        results = self.model.predict(roi_frame, **prediction_kwargs)
        detections: list[Detection] = []

        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue

            for box in boxes:
                confidence = float(box.conf[0])
                if confidence < self.config.confidence_threshold:
                    continue

                class_id = int(box.cls[0])
                raw_label = self._resolve_class_name(class_id)
                label = self._normalize_label(raw_label)
                x1, y1, x2, y2 = box.xyxy[0]
                local_bbox = (
                    max(0, int(x1)),
                    max(0, int(y1)),
                    min(roi.width, int(x2)),
                    min(roi.height, int(y2)),
                )
                width = max(0, local_bbox[2] - local_bbox[0])
                height = max(0, local_bbox[3] - local_bbox[1])
                if width <= 0 or height <= 0:
                    continue

                centroid_local = (local_bbox[0] + width // 2, local_bbox[1] + height // 2)
                detections.append(
                    Detection(
                        label=label,
                        confidence=confidence,
                        bbox=to_full_frame_bbox(roi, local_bbox),
                        centroid=to_full_frame_point(roi, centroid_local),
                        area=float(width * height),
                        class_id=class_id,
                        source_model=self.model_key,
                        source_backend=self.backend_name,
                        raw_label=raw_label,
                    )
                )

        detections.sort(key=lambda item: (item.centroid[1], item.centroid[0]))
        return detections, None

    def describe(self) -> dict[str, Any]:
        return {
            "mode": "ml",
            "backend": self.backend_name,
            "provider": self.model_provider,
            "model_key": self.model_key,
            "model_name": self.model_name,
            "model_path": str(self.model_path),
            "catalog_path": str(self.catalog_path),
        }

    def _resolve_model_path(self) -> Path:
        candidate = Path(str(self.model_entry["absolutePath"]))
        if not candidate.exists():
            raise RuntimeError(f"ML model file not found: {candidate}")
        return candidate

    def _load_model(self):
        try:
            from ultralytics import YOLO
        except ImportError as exc:
            raise RuntimeError(
                "Ultralytics is required for ML detector mode. "
                "Install it with: bash scripts/setup_venv.sh --with-ml"
            ) from exc

        return YOLO(str(self.model_path))

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
