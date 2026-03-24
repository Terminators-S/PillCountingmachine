import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import CountLineConfig, RoiConfig
from src.counting import LineCounter
from src.tracking import TrackedObject


def build_track(track_id: int, history: list[tuple[int, int]]) -> TrackedObject:
    return TrackedObject(
        track_id=track_id,
        label="pill",
        bbox=(0, 0, 10, 10),
        centroid=history[-1],
        area=100.0,
        centroid_history=history,
        frames_seen=len(history),
        missing_frames=0,
        last_frame_index=len(history),
    )


class LineCounterTests(unittest.TestCase):
    def setUp(self):
        roi = RoiConfig(x=0, y=0, width=400, height=300)
        count_line = CountLineConfig(start=(50, 150), end=(350, 150), allowed_direction="down")
        self.line_counter = LineCounter(roi, count_line)

    def test_counts_single_downward_crossing(self):
        track = build_track(1, [(100, 120), (100, 160)])
        events = self.line_counter.update([track], frame_index=2)
        self.assertEqual(1, self.line_counter.total_count)
        self.assertEqual(1, len(events))
        self.assertEqual({1}, self.line_counter.counted_track_ids)

    def test_wrong_direction_is_not_counted(self):
        track = build_track(2, [(100, 180), (100, 120)])
        events = self.line_counter.update([track], frame_index=2)
        self.assertEqual(0, self.line_counter.total_count)
        self.assertEqual(0, len(events))

    def test_duplicate_track_is_not_counted_twice(self):
        first_track = build_track(3, [(120, 130), (120, 170)])
        self.line_counter.update([first_track], frame_index=2)
        second_track = build_track(3, [(120, 170), (120, 210)])
        events = self.line_counter.update([second_track], frame_index=3)
        self.assertEqual(1, self.line_counter.total_count)
        self.assertEqual(0, len(events))

    def test_track_appearing_after_line_is_not_counted(self):
        track = build_track(4, [(140, 170), (140, 190)])
        events = self.line_counter.update([track], frame_index=2)
        self.assertEqual(0, self.line_counter.total_count)
        self.assertEqual(0, len(events))


if __name__ == "__main__":
    unittest.main()
