from __future__ import annotations

from dataclasses import dataclass, field
from math import hypot

from ..config import TrackerConfig
from ..inference import Detection


@dataclass
class TrackedObject:
    track_id: int
    label: str
    bbox: tuple[int, int, int, int]
    centroid: tuple[int, int]
    area: float
    confidence: float = 1.0
    class_id: int | None = None
    source_model: str = ""
    source_backend: str = ""
    centroid_history: list[tuple[int, int]] = field(default_factory=list)
    frames_seen: int = 1
    missing_frames: int = 0
    last_frame_index: int = 0


class CentroidTracker:
    def __init__(self, config: TrackerConfig):
        self.config = config
        self.next_track_id = 1
        self.tracks: dict[int, TrackedObject] = {}

    def update(self, detections: list[Detection], frame_index: int) -> list[TrackedObject]:
        unmatched_detection_indexes = set(range(len(detections)))

        for track_id in sorted(list(self.tracks.keys())):
            track = self.tracks[track_id]
            best_index = None
            best_distance = None

            for detection_index in list(unmatched_detection_indexes):
                detection = detections[detection_index]
                distance = hypot(track.centroid[0] - detection.centroid[0], track.centroid[1] - detection.centroid[1])
                if distance > self.config.max_distance:
                    continue
                if best_distance is None or distance < best_distance:
                    best_distance = distance
                    best_index = detection_index

            if best_index is None:
                track.missing_frames += 1
                continue

            detection = detections[best_index]
            track.bbox = detection.bbox
            track.centroid = detection.centroid
            track.area = detection.area
            track.label = detection.label
            track.confidence = detection.confidence
            track.class_id = detection.class_id
            track.source_model = detection.source_model
            track.source_backend = detection.source_backend
            track.frames_seen += 1
            track.missing_frames = 0
            track.last_frame_index = frame_index
            track.centroid_history.append(detection.centroid)
            track.centroid_history = track.centroid_history[-self.config.max_trace_points :]
            unmatched_detection_indexes.remove(best_index)

        stale_track_ids = [
            track_id for track_id, track in self.tracks.items() if track.missing_frames > self.config.max_missing_frames
        ]
        for track_id in stale_track_ids:
            self.tracks.pop(track_id, None)

        for detection_index in sorted(unmatched_detection_indexes):
            detection = detections[detection_index]
            self.tracks[self.next_track_id] = TrackedObject(
                track_id=self.next_track_id,
                label=detection.label,
                bbox=detection.bbox,
                centroid=detection.centroid,
                area=detection.area,
                confidence=detection.confidence,
                class_id=detection.class_id,
                source_model=detection.source_model,
                source_backend=detection.source_backend,
                centroid_history=[detection.centroid],
                frames_seen=1,
                missing_frames=0,
                last_frame_index=frame_index,
            )
            self.next_track_id += 1

        return [track for track in self.tracks.values() if track.missing_frames == 0]
