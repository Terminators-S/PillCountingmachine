from __future__ import annotations

from dataclasses import dataclass

import cv2

from .config import DetectorConfig, RoiConfig
from .roi import crop_to_roi, to_full_frame_bbox, to_full_frame_point


@dataclass(frozen=True)
class Detection:
    label: str
    confidence: float
    bbox: tuple[int, int, int, int]
    centroid: tuple[int, int]
    area: float


class ContourDetector:
    def __init__(self, config: DetectorConfig):
        self.config = config
        self.model_name = "contour-detector-mvp"

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
                )
            )

        detections.sort(key=lambda item: (item.centroid[1], item.centroid[0]))
        return detections, cleaned

    @staticmethod
    def _normalized_kernel_size(value: int) -> int:
        size = max(1, int(value))
        return size if size % 2 == 1 else size + 1
