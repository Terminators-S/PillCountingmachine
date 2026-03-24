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
    run_replay_clip.sh
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
- `src/inference/ml_detector.py`

Two detector backends are now available:

- `contour`
  - built-in fallback for quick bench debugging
  - zero extra ML dependency beyond OpenCV
- `ml`
  - loads raw `.pt` checkpoints through Ultralytics only when the selected model is actually a `.pt`
  - loads exported `.onnx` files through `onnxruntime` without requiring Ultralytics
  - loads exported NCNN model directories through `ncnn` without requiring Ultralytics
  - defaults to `local-train12` as the first export candidate unless you have fresher comparison data
  - keeps the active machine-runtime in control of overlay, tracking, and counting

The active machine runtime remains canonical. Only the trained model assets and the model-catalog format were reused from legacy.

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
cd ~/PillCountingmachine/machine-runtime
bash scripts/pi_setup.sh
```

Verifies:

- `python3`
- `python3-opencv`
- `v4l2-ctl`
- `lsusb`
- `ffmpeg`

### 1a. Preview environment on the Pi desktop

If you want the preview window on the attached Pi display, launch from the logged-in desktop session and export:

```bash
export DISPLAY=:0
export XDG_RUNTIME_DIR=/run/user/1000
export WAYLAND_DISPLAY=wayland-0
```

If you are validating headless over SSH, use `--no-preview` instead of trying to force the GUI path.

### 2. Create the venv

```bash
bash scripts/setup_venv.sh
source .venv/bin/activate
```

The venv uses `--system-site-packages` so the Pi can reuse the apt-installed OpenCV package.

### 2a. Install optional ML detector dependencies

Only required when you want raw `.pt` model loading in `detector.mode=ml`:

```bash
bash scripts/setup_venv.sh --with-ml
source .venv/bin/activate
```

This installs `ultralytics` into the venv while keeping the contour-only path lightweight. Exported NCNN and ONNX paths do not need Ultralytics.

Recommended Raspberry Pi ML runtime dependency order:

1. contour-only runtime for baseline validation
2. `ncnn` for the preferred exported-model path
3. `onnxruntime` only when you want the secondary ONNX path
4. `ultralytics` only when you need raw `.pt` debugging on the Pi

If you want to run exported NCNN models, also install:

```bash
python -m pip install ncnn
```

If you want to run exported ONNX models, also install:

```bash
python -m pip install onnxruntime
```

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

By default, the runtime uses the configured preview window and will go fullscreen on the Pi display. Use `--windowed` if you want to calibrate on a development desktop.

Compatibility alias:

```bash
bash scripts/run_counting_mvp.sh --max-frames 300
```

### 5a. Run with the ML detector

Use the legacy local checkpoint directly only for development-only checks:

```bash
bash scripts/setup_venv.sh --with-ml
source .venv/bin/activate
bash scripts/run_machine_runtime.sh --detector-mode ml --detector-model-key local-train12 --max-frames 300
```

Replay comparison example:

```bash
bash scripts/run_replay_clip.sh datasets/test-clips/example.mp4 --windowed --detector-mode ml --detector-model-key local-train12
```

### 5b. Export a local model to ONNX or NCNN for Raspberry Pi

Recommended validation order:

1. contour baseline on the Pi
2. export `local-train12` on a stronger development machine
3. copy the exported artifact to the Pi
4. run ML mode with the exported path
5. compare counts, misses, double-counts, and FPS against the contour baseline

Recommended source model for the first export pass:

- `local-train12`
- only switch to `local-train10` or `local-train7` after comparing them on the same lane or replay clip

Preferred export format for Raspberry Pi:

- `NCNN` first
- `ONNX` second
- raw `.pt` on the Pi only for debugging

Export from the repo copy on a stronger development machine:

```bash
cd ~/PillCountingmachine/machine-runtime
source .venv/bin/activate
python scripts/export_ml_model.py --model-key local-train12 --formats ncnn onnx --imgsz 640
```

Predictable output locations for `local-train12`:

- `../legacy/old-machine-runtime/machine-learning/models/local/train12/best_ncnn_model/`
- `../legacy/old-machine-runtime/machine-learning/models/local/train12/best.onnx`

Copy the exported artifact to the Pi:

```bash
scp -r ../legacy/old-machine-runtime/machine-learning/models/local/train12/best_ncnn_model pi@raspberrypi:~/PillCountingmachine/machine-runtime/models/
scp ../legacy/old-machine-runtime/machine-learning/models/local/train12/best.onnx pi@raspberrypi:~/PillCountingmachine/machine-runtime/models/
```

Run the contour baseline first on the Pi:

```bash
export DISPLAY=:0
export XDG_RUNTIME_DIR=/run/user/1000
export WAYLAND_DISPLAY=wayland-0
bash scripts/run_machine_runtime.sh --detector-mode contour --max-frames 300
```

Run the recommended NCNN path on the Pi CPU:

```bash
source .venv/bin/activate
python -m pip install ncnn
bash scripts/run_machine_runtime.sh --detector-mode ml --detector-model-path models/best_ncnn_model --detector-device cpu --max-frames 300
```

This exported NCNN path does not require Ultralytics.

If your Pi image and graphics stack support Vulkan through NCNN, you can try:

```bash
bash scripts/run_machine_runtime.sh --detector-mode ml --detector-model-path models/best_ncnn_model --detector-device vulkan:0 --max-frames 300
```

Run the secondary ONNX path on the Pi:

```bash
source .venv/bin/activate
python -m pip install onnxruntime
bash scripts/run_machine_runtime.sh --detector-mode ml --detector-model-path models/best.onnx --detector-device cpu --max-frames 300
```

This exported ONNX path does not require Ultralytics.

Contour comparison example:

```bash
bash scripts/run_replay_clip.sh datasets/test-clips/example.mp4 --windowed --detector-mode contour
```

### 6. Replay a saved test clip

```bash
bash scripts/run_replay_clip.sh datasets/test-clips/example.mp4 --windowed
```

This is useful for debugging misses and double-counts without needing live hardware for every iteration.

## ROI And Count Line Calibration

Edit [`config/counting.default.json`](config/counting.default.json):

- `roi.x`
- `roi.y`
- `roi.width`
- `roi.height`
- `count_line.start`
- `count_line.end`
- `count_line.allowed_direction`
- `detector.mode`
- `detector.model_key`
- `detector.model_path`
- `detector.model_catalog_path`

`detector.model_catalog_path` is the canonical config key. `detector.catalog_path` is also accepted as a compatibility alias when you load JSON config files.

Calibration workflow:

1. run `bash scripts/run_machine_runtime.sh --windowed`
2. adjust the ROI so it covers only the physical lane
3. place the count line where every valid pill crossing is clearly visible
4. confirm the allowed direction matches the real pill travel direction
5. rerun until one crossing increments the count exactly once

## Verification Checklist

The runtime milestone is only valid when all of these are true:

- the camera opens reliably
- the saved capture frame is clear and usable
- the ROI fits the physical lane
- the count line is visible and placed correctly
- one real crossing increments the count exactly once
- detector mode and selected model are recorded in `summary.json`
- ML mode shows label and confidence on detections when enabled
- debug frames and event evidence are saved locally

### Pi ML validation checklist

- preview opens on the Pi display when the GUI environment exports are set
- contour mode runs cleanly as the baseline
- the exported model loads successfully through `--detector-model-path`
- detections appear inside the ROI
- the line-crossing count increments correctly
- `summary.json` records detector backend and model metadata
- debug and event evidence is saved
- contour and ML mode can be compared on the same lane or replay clip

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
- `runs/run_<timestamp>/pending_sync.json`
- `runs/run_<timestamp>/events.csv`
- `runs/run_<timestamp>/debug_frames/`
- `runs/run_<timestamp>/event_frames/`

These files are the primary debugging evidence for the MVP.

When ML mode is active, the event and summary files also include:

- `detector_backend`, `ml_runtime_backend`, `model_format`, `model_path`, and `model_key`
- ML runtime backend (`pytorch`, `onnx`, or `ncnn`)
- counted object labels
- counted event confidence and source model fields
- runtime FPS and count result summary
- session, summary, debug-frame, and event-frame evidence paths

## Validation And Next Step

- Acceptance checklist: [`../docs/workflows/validation-checklist.md`](../docs/workflows/validation-checklist.md)
- Next-step note: [`../docs/milestones/next-step-note.md`](../docs/milestones/next-step-note.md)
- ML integration note: [`../docs/workflows/ml-detector-integration-note.md`](../docs/workflows/ml-detector-integration-note.md)

## Known Limitations

- ML mode supports local legacy checkpoints and exported local artifacts, but not the old ensemble or hosted Roboflow paths inside the active runtime
- `local-train12` is still the default first export candidate; `local-train10` and `local-train7` remain available for manual comparison
- exported ONNX and NCNN runtime paths are available, but generated exports stay local and should be copied onto the Pi as deployment artifacts
- raw `.pt` loading on the Pi is acceptable for debugging, but exported NCNN is the recommended first validation and deployment path
- the runtime assumes one stable lane and one dominant direction of motion
- replay mode is intended for debugging, not for benchmarking real-time camera behavior
- backend sync is intentionally stubbed as `pending_sync.json` for now
