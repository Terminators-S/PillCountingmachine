# Machine Runtime MVP Redirect

The active Raspberry Pi runtime now lives in [`/machine-runtime`](../machine-runtime).

This older `machine-runtime-mvp/` path is being kept temporarily so open IDE tabs and older notes do not break mid-refactor. Do not continue new work here.

Use this path instead:

```text
pill-count-ui/
  machine-runtime/
```

Start with:

```bash
cd ~/pill-count-ui/machine-runtime
bash scripts/pi_setup.sh
bash scripts/setup_venv.sh
bash scripts/list_cameras.sh
bash scripts/run_camera_capture_test.sh
bash scripts/run_machine_runtime.sh --max-frames 300
```

For the current active documentation, use:

- `/README.md`
- `/machine-runtime/README.md`
- `/docs/architecture/hardware-first-mvp.md`
- `/docs/hardware/raspberry-pi-setup.md`
- `/docs/workflows/developer-workflow.md`
- `/docs/milestones/mvp-scope.md`
