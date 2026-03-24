# Developer Workflow

## Default Working Rule

Start from the machine runtime unless the task is explicitly about the support API or dashboard.

## Machine Runtime Workflow

### Raspberry Pi bring-up

```bash
cd ~/PillCountingmachine/machine-runtime
bash scripts/pi_setup.sh
bash scripts/setup_venv.sh
bash scripts/list_cameras.sh
bash scripts/run_camera_capture_test.sh
```

If you want the preview window on the Pi display:

```bash
export DISPLAY=:0
export XDG_RUNTIME_DIR=/run/user/1000
export WAYLAND_DISPLAY=wayland-0
```

Recommended detector validation order:

1. contour baseline
2. export `local-train12` on a stronger development machine
3. copy exported NCNN artifact to the Pi
4. run ML mode with the exported path
5. compare counts, misses, double-counts, and FPS against contour mode

If you need the legacy local `.pt` detector in the active runtime for development-only checks:

```bash
cd ~/PillCountingmachine/machine-runtime
bash scripts/setup_venv.sh --with-ml
source .venv/bin/activate
```

### Counting loop

```bash
cd ~/PillCountingmachine/machine-runtime
bash scripts/run_machine_runtime.sh --detector-mode contour --max-frames 300
```

### Exported ML detector comparison

```bash
cd ~/PillCountingmachine/machine-runtime
python scripts/export_ml_model.py --model-key local-train12 --formats ncnn onnx --imgsz 640
scp -r ../legacy/old-machine-runtime/machine-learning/models/local/train12/best_ncnn_model pi@raspberrypi:~/PillCountingmachine/machine-runtime/models/
scp ../legacy/old-machine-runtime/machine-learning/models/local/train12/best.onnx pi@raspberrypi:~/PillCountingmachine/machine-runtime/models/
bash scripts/run_machine_runtime.sh --detector-mode ml --detector-model-path models/best_ncnn_model --detector-device cpu --max-frames 300
```

Replay comparison:

```bash
cd ~/PillCountingmachine/machine-runtime
bash scripts/run_replay_clip.sh datasets/test-clips/example.mp4 --windowed --detector-mode contour
bash scripts/run_replay_clip.sh datasets/test-clips/example.mp4 --windowed --detector-mode ml --detector-model-path models/best_ncnn_model --detector-device cpu
```

### Replay a saved clip

```bash
cd ~/PillCountingmachine/machine-runtime
bash scripts/run_replay_clip.sh datasets/test-clips/example.mp4 --windowed
```

### Local validation

From the repo root:

```bash
npm run check:machine-runtime
```

## Support Stack Workflow

Only use this when you actually need the API or dashboard:

```bash
npm run dev:api
npm run dev:web
```

Or both:

```bash
npm run dev:support
```

## Firebase Dashboard Workflow

Only for hosted UI demos:

```bash
npm run deploy:web:firebase
```

This is a support path, not the core machine runtime.

## Legacy Code Policy

- do not add new features in `legacy/`
- only reference legacy code when you need an older implementation detail
- if you borrow logic from legacy, move the needed part into the active path cleanly instead of reviving the whole legacy module

## Preferred Order For New Work

1. physical bench and lighting
2. camera preview
3. overlay correctness
4. detection stability
5. tracking stability
6. exact-once count logic
7. local run evidence
8. backend sync
9. dashboard display

## Avoid

- mixing hardware debugging with platform feature work
- editing the old bridge runtime before checking the active `machine-runtime/`
- pushing dashboard-driven requirements into the Pi runtime too early

Use [`validation-checklist.md`](validation-checklist.md) when you want a quick acceptance review after a run.
