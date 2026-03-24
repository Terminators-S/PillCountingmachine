# Developer Workflow

## Default Working Rule

Start from the machine runtime unless the task is explicitly about the support API or dashboard.

## Machine Runtime Workflow

### Raspberry Pi bring-up

```bash
cd ~/pill-count-ui/machine-runtime
bash scripts/pi_setup.sh
bash scripts/setup_venv.sh
bash scripts/list_cameras.sh
bash scripts/run_camera_capture_test.sh
```

### Counting loop

```bash
cd ~/pill-count-ui/machine-runtime
bash scripts/run_machine_runtime.sh --max-frames 300
```

### Replay a saved clip

```bash
cd ~/pill-count-ui/machine-runtime
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
