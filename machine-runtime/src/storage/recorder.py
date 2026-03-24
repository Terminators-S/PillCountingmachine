from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

import cv2

from ..config import RecordingConfig
from ..counting import CrossingEvent


class RunRecorder:
    def __init__(self, runs_root: Path, run_id: str, recording: RecordingConfig, session_metadata: dict[str, Any]):
        self.runs_root = runs_root
        self.run_id = run_id
        self.recording = recording
        self.session_metadata = session_metadata

        self.run_dir = self.runs_root / self.run_id
        self.debug_dir = self.run_dir / "debug_frames"
        self.event_dir = self.run_dir / "event_frames"
        self.session_path = self.run_dir / "session.json"
        self.summary_path = self.run_dir / "summary.json"
        self.event_log_path = self.run_dir / "events.csv"

        self.debug_frame_count = 0
        self.event_frame_count = 0
        self.debug_frame_paths: list[str] = []
        self.event_frame_paths: list[str] = []

    def initialize(self) -> None:
        self.run_dir.mkdir(parents=True, exist_ok=True)
        self.debug_dir.mkdir(parents=True, exist_ok=True)
        self.event_dir.mkdir(parents=True, exist_ok=True)
        self.session_path.write_text(json.dumps(self.session_metadata, indent=2), encoding="utf-8")
        with self.event_log_path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(
                handle,
                fieldnames=[
                    "timestamp_utc",
                    "frame_index",
                    "event_type",
                    "track_id",
                    "previous_centroid_x",
                    "previous_centroid_y",
                    "current_centroid_x",
                    "current_centroid_y",
                    "allowed_direction",
                    "total_count_after_event",
                    "line_start_x",
                    "line_start_y",
                    "line_end_x",
                    "line_end_y",
                ],
            )
            writer.writeheader()

    def maybe_save_debug_frame(self, frame, frame_index: int) -> None:
        if not self.recording.save_debug_overlay_frames:
            return
        if self.debug_frame_count >= self.recording.max_debug_frames:
            return
        if frame_index % self.recording.debug_frame_interval != 0:
            return

        path = self.debug_dir / f"frame_{frame_index:06d}.jpg"
        if cv2.imwrite(str(path), frame):
            self.debug_frame_count += 1
            self.debug_frame_paths.append(str(path))

    def save_crossing_event_frame(self, frame, frame_index: int, track_id: int) -> None:
        if not self.recording.save_crossing_event_frames:
            return

        path = self.event_dir / f"crossing_track_{track_id:04d}_frame_{frame_index:06d}.jpg"
        if cv2.imwrite(str(path), frame):
            self.event_frame_count += 1
            self.event_frame_paths.append(str(path))

    def append_event(self, event: CrossingEvent) -> None:
        with self.event_log_path.open("a", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(
                [
                    event.timestamp_utc,
                    event.frame_index,
                    event.event_type,
                    event.track_id,
                    event.previous_centroid[0],
                    event.previous_centroid[1],
                    event.current_centroid[0],
                    event.current_centroid[1],
                    event.allowed_direction,
                    event.total_count_after_event,
                    event.line_start[0],
                    event.line_start[1],
                    event.line_end[0],
                    event.line_end[1],
                ]
            )

    def finalize(self, summary: dict[str, Any]) -> dict[str, Any]:
        full_summary = {
            **summary,
            "run_directory": str(self.run_dir),
            "event_log_path": str(self.event_log_path),
            "debug_frame_count": self.debug_frame_count,
            "event_frame_count": self.event_frame_count,
            "debug_frame_paths": self.debug_frame_paths,
            "event_frame_paths": self.event_frame_paths,
        }
        self.summary_path.write_text(json.dumps(full_summary, indent=2), encoding="utf-8")
        return full_summary
