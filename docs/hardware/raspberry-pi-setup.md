# Raspberry Pi 5 Setup

## Target Hardware

- Raspberry Pi 5
- Raspberry Pi OS 64-bit
- one USB webcam
- one fixed camera mount
- one fixed pill lane
- one 3.4-inch display connected to the Pi
- stable lighting

## Operating Assumptions

- the camera view is fixed
- the background is matte and controlled
- pills move through one constrained path
- local processing is the first priority

## Package Setup

Run on the Raspberry Pi:

```bash
cd ~/PillCountingmachine/machine-runtime
bash scripts/pi_setup.sh
```

This installs:

- `python3`
- `python3-venv`
- `python3-pip`
- `python3-opencv`
- `v4l-utils`
- `usbutils`
- `ffmpeg`

## Python Setup

```bash
cd ~/PillCountingmachine/machine-runtime
bash scripts/setup_venv.sh
source .venv/bin/activate
```

## Pi GUI Preview Environment

If you want the preview window on the attached Pi display, export:

```bash
export DISPLAY=:0
export XDG_RUNTIME_DIR=/run/user/1000
export WAYLAND_DISPLAY=wayland-0
```

If you do not have the desktop session available, run headless with `--no-preview`.

## Recommended ML Path

Recommended Raspberry Pi ML deployment order:

1. contour mode as the baseline and fallback
2. exported NCNN model as the first ML path
3. exported ONNX model as the secondary portable path
4. raw `.pt` loading only for development and debugging

If you plan to run exported ONNX models:

```bash
python -m pip install onnxruntime
```

If you plan to run exported NCNN models:

```bash
python -m pip install ncnn
```

## Camera Detection

```bash
bash scripts/list_cameras.sh
```

You should see:

- the camera in `lsusb`
- at least one `/dev/video*`
- the device listed by `v4l2-ctl --list-devices`

## First Capture Test

```bash
bash scripts/run_camera_capture_test.sh
```

Review the saved JPG before you discuss models or backend sync. If the frame is blurry, dark, reflective, or poorly framed, fix the physical bench first.

## Counting Loop

```bash
bash scripts/run_machine_runtime.sh --max-frames 300
```

If you are headless:

```bash
bash scripts/run_machine_runtime.sh --no-preview --max-frames 300
```

## Optional ML Runtime Paths

Use the contour baseline first:

```bash
export DISPLAY=:0
export XDG_RUNTIME_DIR=/run/user/1000
export WAYLAND_DISPLAY=wayland-0
bash scripts/run_machine_runtime.sh --detector-mode contour --max-frames 300
```

Use the legacy local `.pt` detector inside the active runtime only for development:

```bash
bash scripts/setup_venv.sh --with-ml
source .venv/bin/activate
bash scripts/run_machine_runtime.sh --detector-mode ml --detector-model-key local-train12 --max-frames 300
```

Export the recommended first candidate on a stronger development machine:

```bash
cd ~/PillCountingmachine/machine-runtime
source .venv/bin/activate
python scripts/export_ml_model.py --model-key local-train12 --formats ncnn onnx --imgsz 640
```

Copy the preferred NCNN artifact to the Pi:

```bash
scp -r ../legacy/old-machine-runtime/machine-learning/models/local/train12/best_ncnn_model pi@raspberrypi:~/PillCountingmachine/machine-runtime/models/
scp ../legacy/old-machine-runtime/machine-learning/models/local/train12/best.onnx pi@raspberrypi:~/PillCountingmachine/machine-runtime/models/
```

Use the recommended exported NCNN detector:

```bash
bash scripts/run_machine_runtime.sh --detector-mode ml --detector-model-path models/best_ncnn_model --detector-device cpu --max-frames 300
```

Use an exported ONNX detector only when you want the secondary portable path:

```bash
bash scripts/run_machine_runtime.sh --detector-mode ml --detector-model-path models/best.onnx --max-frames 300
```

If NCNN Vulkan is available on the Pi, try:

```bash
bash scripts/run_machine_runtime.sh --detector-mode ml --detector-model-path models/best_ncnn_model --detector-device vulkan:0 --max-frames 300
```

## Pi ML Validation Checklist

- preview opens on the Pi display
- contour mode still works as fallback
- the exported model loads successfully
- detections appear in the ROI
- line crossing increments count correctly
- `summary.json` records detector backend and model
- debug frames and event evidence are saved
- contour and ML runs can be compared on the same lane or replay clip

## Physical Bench Guidance

- mount the camera rigidly
- avoid a wide field of view
- keep one controlled lane
- reduce shadows and reflections
- use consistent LED lighting
- do not let pills overlap heavily in the MVP

## Failure Order

If something is wrong, debug in this order:

1. power
2. USB connection
3. `/dev/video*`
4. capture test
5. saved frame quality
6. ROI and line placement
7. counting behavior
