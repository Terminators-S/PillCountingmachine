"""Inference stage for the hardware-first MVP."""

from .contour_detector import ContourDetector
from .detection_types import Detection
from .ml_detector import MlDetector


def build_detector(config):
    mode = str(config.mode).strip().lower()
    if mode == "contour":
        return ContourDetector(config)
    if mode == "ml":
        return MlDetector(config)
    raise ValueError(f"Unsupported detector mode: {config.mode}")


__all__ = ["ContourDetector", "Detection", "MlDetector", "build_detector"]
