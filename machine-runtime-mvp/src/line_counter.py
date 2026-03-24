from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from .config import CountLineConfig, RoiConfig
from .roi import absolute_line_points
from .tracker import TrackedObject


@dataclass(frozen=True)
class CrossingEvent:
    event_type: str
    timestamp_utc: str
    frame_index: int
    track_id: int
    previous_centroid: tuple[int, int]
    current_centroid: tuple[int, int]
    allowed_direction: str
    total_count_after_event: int
    line_start: tuple[int, int]
    line_end: tuple[int, int]


class LineCounter:
    def __init__(self, roi: RoiConfig, count_line: CountLineConfig):
        self.roi = roi
        self.count_line = count_line
        self.counted_track_ids: set[int] = set()
        self.total_count = 0
        self.events: list[CrossingEvent] = []
        self.line_start, self.line_end = absolute_line_points(roi, count_line)

    def update(self, tracks: list[TrackedObject], frame_index: int) -> list[CrossingEvent]:
        emitted_events: list[CrossingEvent] = []

        for track in tracks:
            if track.track_id in self.counted_track_ids:
                continue
            if len(track.centroid_history) < 2:
                continue

            previous_centroid = track.centroid_history[-2]
            current_centroid = track.centroid_history[-1]
            if not self._crossed_in_allowed_direction(previous_centroid, current_centroid):
                continue

            self.counted_track_ids.add(track.track_id)
            self.total_count += 1
            event = CrossingEvent(
                event_type="counted_crossing",
                timestamp_utc=datetime.now(timezone.utc).isoformat(),
                frame_index=frame_index,
                track_id=track.track_id,
                previous_centroid=previous_centroid,
                current_centroid=current_centroid,
                allowed_direction=self.count_line.allowed_direction,
                total_count_after_event=self.total_count,
                line_start=self.line_start,
                line_end=self.line_end,
            )
            self.events.append(event)
            emitted_events.append(event)

        return emitted_events

    def _crossed_in_allowed_direction(
        self, previous_centroid: tuple[int, int], current_centroid: tuple[int, int]
    ) -> bool:
        if self.count_line.orientation == "horizontal":
            line_y = self.line_start[1]
            if self.count_line.allowed_direction == "down":
                return previous_centroid[1] < line_y <= current_centroid[1]
            return previous_centroid[1] > line_y >= current_centroid[1]

        line_x = self.line_start[0]
        if self.count_line.allowed_direction == "right":
            return previous_centroid[0] < line_x <= current_centroid[0]
        return previous_centroid[0] > line_x >= current_centroid[0]
