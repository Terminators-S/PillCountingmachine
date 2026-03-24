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
cd ~/pill-count-ui/machine-runtime
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
cd ~/pill-count-ui/machine-runtime
bash scripts/setup_venv.sh
source .venv/bin/activate
```

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

Use the legacy local `.pt` detector inside the active runtime:

```bash
bash scripts/setup_venv.sh --with-ml
source .venv/bin/activate
bash scripts/run_machine_runtime.sh --detector-mode ml --detector-model-key local-train12 --max-frames 300
```

Use an exported ONNX detector:

```bash
bash scripts/run_machine_runtime.sh --detector-mode ml --detector-model-path ../legacy/old-machine-runtime/machine-learning/models/local/train12/best.onnx --max-frames 300
```

Use an exported NCNN detector:

```bash
bash scripts/run_machine_runtime.sh --detector-mode ml --detector-model-path ../legacy/old-machine-runtime/machine-learning/models/local/train12/best_ncnn_model --detector-device cpu --max-frames 300
```

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
