from __future__ import annotations

import cv2

from ..config import CountLineConfig, RoiConfig


def validate_roi(roi: RoiConfig, frame_shape: tuple[int, ...]) -> None:
    frame_height, frame_width = frame_shape[:2]
    if roi.x < 0 or roi.y < 0:
        raise ValueError("ROI x and y must be non-negative.")
    if roi.width <= 0 or roi.height <= 0:
        raise ValueError("ROI width and height must be positive.")
    if roi.x + roi.width > frame_width or roi.y + roi.height > frame_height:
        raise ValueError(
            f"ROI {roi.x},{roi.y},{roi.width},{roi.height} does not fit inside frame {frame_width}x{frame_height}."
        )


def validate_count_line(roi: RoiConfig, count_line: CountLineConfig) -> None:
    start_x, start_y = count_line.start
    end_x, end_y = count_line.end

    if not (0 <= start_x <= roi.width and 0 <= end_x <= roi.width):
        raise ValueError("Count line x coordinates must stay inside the ROI width.")
    if not (0 <= start_y <= roi.height and 0 <= end_y <= roi.height):
        raise ValueError("Count line y coordinates must stay inside the ROI height.")

    orientation = count_line.orientation
    if orientation == "horizontal" and count_line.allowed_direction not in {"up", "down"}:
        raise ValueError("Horizontal count lines only support allowed_direction of 'up' or 'down'.")
    if orientation == "vertical" and count_line.allowed_direction not in {"left", "right"}:
        raise ValueError("Vertical count lines only support allowed_direction of 'left' or 'right'.")


def crop_to_roi(frame, roi: RoiConfig):
    return frame[roi.y : roi.y + roi.height, roi.x : roi.x + roi.width].copy()


def to_full_frame_bbox(roi: RoiConfig, bbox: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = bbox
    return (roi.x + x1, roi.y + y1, roi.x + x2, roi.y + y2)


def to_full_frame_point(roi: RoiConfig, point: tuple[int, int]) -> tuple[int, int]:
    px, py = point
    return (roi.x + px, roi.y + py)


def absolute_line_points(roi: RoiConfig, count_line: CountLineConfig) -> tuple[tuple[int, int], tuple[int, int]]:
    return (to_full_frame_point(roi, count_line.start), to_full_frame_point(roi, count_line.end))


def draw_roi_overlay(frame, roi: RoiConfig, color: tuple[int, int, int] = (0, 255, 255)) -> None:
    cv2.rectangle(frame, (roi.x, roi.y), (roi.x + roi.width, roi.y + roi.height), color, 2)
    cv2.putText(frame, "ROI", (roi.x + 8, max(24, roi.y - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)


def draw_count_line(
    frame, roi: RoiConfig, count_line: CountLineConfig, color: tuple[int, int, int] = (255, 120, 0)
) -> None:
    start_point, end_point = absolute_line_points(roi, count_line)
    cv2.line(frame, start_point, end_point, color, 2)
    label = f"Count line ({count_line.allowed_direction})"
    label_anchor = (start_point[0], max(30, start_point[1] - 12))
    cv2.putText(frame, label, label_anchor, cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)
