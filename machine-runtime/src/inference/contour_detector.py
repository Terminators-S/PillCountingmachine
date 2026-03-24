from __future__ import annotations

from typing import Any

import cv2

from ..config import DetectorConfig, RoiConfig
from ..overlay_ui import crop_to_roi, to_full_frame_bbox, to_full_frame_point
from .detection_types import Detection


class ContourDetector:
    def __init__(self, config: DetectorConfig):
        self.config = config
        self.backend_name = "contour"
        self.model_key = "contour-detector-mvp"
        self.model_name = "Contour detector MVP"

    def infer(self, frame, roi: RoiConfig) -> tuple[list[Detection], any]:
        roi_frame = crop_to_roi(frame, roi)
        gray = cv2.cvtColor(roi_frame, cv2.COLOR_BGR2GRAY)

        blur_size = self._normalized_kernel_size(self.config.blur_kernel_size)
        morph_size = self._normalized_kernel_size(self.config.morph_kernel_size)
        blurred = cv2.GaussianBlur(gray, (blur_size, blur_size), 0)

        threshold_flag = cv2.THRESH_BINARY_INV if self.config.threshold_type == "binary_inverse" else cv2.THRESH_BINARY
        _, mask = cv2.threshold(blurred, self.config.binary_threshold, 255, threshold_flag)

        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (morph_size, morph_size))
        cleaned = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        detections: list[Detection] = []

        for contour in contours:
            area = float(cv2.contourArea(contour))
            if area < self.config.min_area or area > self.config.max_area:
                continue

            x, y, width, height = cv2.boundingRect(contour)
            if width < self.config.min_width or height < self.config.min_height:
                continue

            local_bbox = (x, y, x + width, y + height)
            centroid_local = (x + width // 2, y + height // 2)
            detections.append(
                Detection(
                    label="pill",
                    confidence=1.0,
                    bbox=to_full_frame_bbox(roi, local_bbox),
                    centroid=to_full_frame_point(roi, centroid_local),
                    area=area,
                    class_id=None,
                    source_model=self.model_key,
                    source_backend=self.backend_name,
                    raw_label="pill",
                )
            )

        detections.sort(key=lambda item: (item.centroid[1], item.centroid[0]))
        return detections, cleaned

    def describe(self) -> dict[str, Any]:
        return {
            "mode": "contour",
            "backend": self.backend_name,
            "provider": "built_in",
            "model_key": self.model_key,
            "model_name": self.model_name,
            "model_path": None,
            "catalog_path": None,
        }

    @staticmethod
    def _normalized_kernel_size(value: int) -> int:
        size = max(1, int(value))
        return size if size % 2 == 1 else size + 1
