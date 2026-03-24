# Implementation Roadmap

## Phase Order

1. Raspberry Pi package setup
2. USB camera detection
3. first OpenCV capture test
4. fixed lighting and viewing lane
5. ROI overlay and count line placement
6. detection stability
7. tracking stability
8. exact-once count validation
9. local persistence and debug evidence review
10. backend sync of final run summaries
11. dashboard view of results/history

## Immediate Next Milestone

Run the active `machine-runtime/` on the Raspberry Pi and verify:

- the camera opens
- the saved capture is usable
- the ROI is aligned
- one pill crossing is counted once
- evidence files are written

## Later Phases

### Backend sync

- post run summaries from the Pi to `apps/api`
- store result history and machine health

### Dashboard support

- show machine online/offline state
- show latest run summaries
- show event history and evidence links

### Model upgrades

- replace contour detection with a lightweight detector only when the physical bench is stable
- add medicine classification later if the MVP proves reliable
