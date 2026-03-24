# Machine Runtime

Primary Raspberry Pi runtime for the PillCountingMachine MVP.

This folder is the active path for machine-side work. It is designed for one Raspberry Pi 5, one USB camera, fixed lighting, a constrained single-lane pill path, and local-first processing.

## Runtime Responsibilities

- open the webcam reliably on Raspberry Pi
- show a local preview with overlays on the Pi display
- detect pill candidates inside a fixed ROI
- track pills across frames
- count each pill exactly once using a virtual count line
- save local debug evidence and run summaries
- prepare clean handoff points for future backend sync

## Current Runtime Layout

```text
machine-runtime/
  assets/                      Reserved for machine-side UI assets
  config/
    camera.default.json
    counting.default.json
  logs/
    captures/
    runs/
  runs/                        Per-run summary folders and event evidence
  models/                      Reserved for future model artifacts
  samples/                     Reserved for real machine samples
  scripts/
    list_cameras.sh
    pi_setup.sh
    run_camera_capture_test.sh
    run_counting_mvp.sh
    run_machine_runtime.sh
    setup_venv.sh
  src/
    capture/
    config/
    counting/
    inference/
    overlay_ui/
    storage/
    sync/
    tracking/
    utils/
    main.py
  tests/
```

## What Is Active Today

### Capture

- `src/capture/camera.py`
- `src/capture/camera_capture_test.py`

Opens the USB camera, warms it up, reads stable frames, and writes a debug capture plus metadata.

### Inference

- `src/inference/contour_detector.py`

Uses a simple contour detector inside the ROI. This is intentional for the first MVP because the physical setup matters more than large-model complexity.

### Tracking

- `src/tracking/centroid_tracker.py`

Tracks pill candidates by centroid distance and keeps stable track IDs long enough for line crossing decisions.

### Counting

- `src/counting/line_counter.py`

Counts only when a tracked centroid crosses the virtual line in the allowed direction, and prevents double counting by remembering counted track IDs.

### Overlay UI

- `src/overlay_ui/roi_overlay.py`

Draws the ROI, count line, labels, and status overlays onto the live preview.

### Storage

- `src/storage/recorder.py`

Writes `session.json`, `summary.json`, `events.csv`, debug frames, and crossing-event frames for every run.

## Deferred In This Runtime

- backend sync implementation
- remote orchestration
- multi-pill classification
- mixed-lane or multi-camera support
- advanced model serving inside this package

The empty `src/sync/` and `src/utils/` packages are intentional reserved seams, not active feature areas yet.

## Raspberry Pi Bring-Up

### 1. Install Raspberry Pi packages

```bash
cd ~/pill-count-ui/machine-runtime
bash scripts/pi_setup.sh
```

Verifies:

- `python3`
- `python3-opencv`
- `v4l2-ctl`
- `lsusb`
- `ffmpeg`

### 2. Create the venv

```bash
bash scripts/setup_venv.sh
source .venv/bin/activate
```

The venv uses `--system-site-packages` so the Pi can reuse the apt-installed OpenCV package.

### 3. Detect the camera

```bash
bash scripts/list_cameras.sh
```

Confirm:

- the camera shows up in `lsusb`
- `/dev/video*` exists
- `v4l2-ctl --list-devices` names the camera

### 4. Run the first capture test

```bash
bash scripts/run_camera_capture_test.sh
```

Expected outputs:

- `logs/captures/camera_test_<timestamp>.jpg`
- `logs/runs/camera_test_<timestamp>.json`
- `runs/camera_test_<timestamp>.summary.json`

### 5. Run the counting loop

```bash
bash scripts/run_machine_runtime.sh --max-frames 300
```

Compatibility alias:

```bash
bash scripts/run_counting_mvp.sh --max-frames 300
```

## Verification Checklist

The runtime milestone is only valid when all of these are true:

- the camera opens reliably
- the saved capture frame is clear and usable
- the ROI fits the physical lane
- the count line is visible and placed correctly
- one real crossing increments the count exactly once
- debug frames and event evidence are saved locally

## Local Test Command

From the repo root:

```bash
npm run check:machine-runtime
```

Or from inside `machine-runtime/`:

```bash
python -m compileall src tests
python -m unittest discover -s tests -p "test_*.py"
```

## Run Outputs

Per run, inspect:

- `runs/run_<timestamp>/session.json`
- `runs/run_<timestamp>/summary.json`
- `runs/run_<timestamp>/events.csv`
- `runs/run_<timestamp>/debug_frames/`
- `runs/run_<timestamp>/event_frames/`

These files are the primary debugging evidence for the MVP.
