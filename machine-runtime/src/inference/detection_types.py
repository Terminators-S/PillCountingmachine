from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Detection:
    label: str
    confidence: float
    bbox: tuple[int, int, int, int]
    centroid: tuple[int, int]
    area: float
    class_id: int | None = None
    source_model: str = ""
    source_backend: str = ""
    raw_label: str = ""
