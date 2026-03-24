# PillCountingMachine

Hardware-first MVP repository for a Raspberry Pi 5 pill counting machine.

The primary product is the physical counting machine:

`Pi camera -> local detection -> local tracking -> exact-once counting -> on-device overlay -> local evidence -> optional backend sync`

The repo now centers on that flow. The backend and dashboard remain in the repo as support services for the MVP, not as the primary product.

## Active Areas

| Area | Purpose | Status |
| --- | --- | --- |
| `machine-runtime/` | Primary Raspberry Pi runtime for camera preview, overlay, detection, tracking, counting, and local evidence | Active |
| `apps/api/` | Minimal support API for future machine result sync and result history | Active support |
| `apps/web/` | Minimal dashboard and authentication surface | Active support |
| `docs/` | Architecture, hardware, workflow, and milestone docs for the MVP | Active |
| `legacy/` | Preserved older runtime and platform experiments that are no longer the active path | Preserved only |

## Repository Structure

```text
apps/
  api/                         NestJS support API
  web/                         Next.js dashboard/auth surface
datasets/
  annotations/                 Reserved for future labeling work
  samples/                     Reserved for representative stills
  test-clips/                  Reserved for representative short videos
docs/
  architecture/                Hardware-first architecture docs
  hardware/                    Raspberry Pi and bench setup docs
  milestones/                  MVP scope and roadmap docs
  workflows/                   Developer workflow and summary docs
legacy/
  old-machine-runtime/         Previous bridge-style runtime and local models
  old-platform-experiments/    Earlier web and static platform prototypes
machine-runtime/
  config/                      Camera and counting JSON configs
  scripts/                     Raspberry Pi setup and run scripts
  src/                         Runtime code by capture/inference/tracking/counting/storage
  tests/                       Runtime sanity tests
packages/
  shared/
  ui/
scripts/
  raspberry-pi/
```

## What Is In Scope Right Now

- Raspberry Pi 5 bring-up
- USB webcam detection
- Local preview and overlay on the Pi display
- Fixed-ROI detection inside a constrained single-lane scene
- Tracking and exact-once line crossing count logic
- Local evidence saving and run summaries
- Minimal API and dashboard support for later sync and history display

## What Is Deferred

- Broad pharmacy operations workflows
- Deep inventory and FEFO productization
- Enterprise administration features
- Multi-machine orchestration beyond basic support
- Advanced analytics and reporting
- Large-scale model training and classifier expansion

The detailed scope split lives in [docs/milestones/mvp-scope.md](docs/milestones/mvp-scope.md).

## Quick Start

### 1. Raspberry Pi machine runtime

Run this on the Raspberry Pi:

```bash
cd ~/pill-count-ui/machine-runtime
bash scripts/pi_setup.sh
bash scripts/setup_venv.sh
bash scripts/list_cameras.sh
bash scripts/run_camera_capture_test.sh
bash scripts/run_machine_runtime.sh --max-frames 300
```

This is the first path to debug if anything is failing. Do not start from the dashboard or backend.

If you want to validate the integrated legacy local detector inside the active runtime:

```bash
cd ~/pill-count-ui/machine-runtime
bash scripts/setup_venv.sh --with-ml
bash scripts/run_machine_runtime.sh --detector-mode ml --detector-model-key local-train12 --max-frames 300
```

### 2. Support API and dashboard

Run this on the development machine when you need the support stack:

```bash
npm install
npm run dev:api
npm run dev:web
```

Or together:

```bash
npm run dev:support
```

### 3. Machine runtime validation

From the repo root:

```bash
npm run check:machine-runtime
```

That validates the Python runtime package structure and the line-counting tests.

## Machine Runtime First

The canonical runtime path is:

```text
machine-runtime/
```

The older `machine-runtime-mvp/` folder remains only as a temporary breadcrumb for open IDE tabs. Do not continue development there.

## Active Vs Legacy

### Active

- `machine-runtime/`
- `apps/api/`
- `apps/web/`
- `docs/architecture/`
- `docs/hardware/`
- `docs/milestones/`
- `docs/workflows/`

### Legacy

- `legacy/old-machine-runtime/machine-learning/`
  - previous bridge-style runtime, local model registry, and Roboflow-era support code
- `legacy/old-platform-experiments/web-spa-prototype/`
  - earlier React SPA prototype that is no longer the active dashboard path
- `legacy/old-platform-experiments/static-prototype/`
  - early static/node prototype files

## Documentation Index

- [Machine runtime guide](machine-runtime/README.md)
- [Hardware-first architecture](docs/architecture/hardware-first-mvp.md)
- [Raspberry Pi setup](docs/hardware/raspberry-pi-setup.md)
- [Developer workflow](docs/workflows/developer-workflow.md)
- [Validation checklist](docs/workflows/validation-checklist.md)
- [ML detector integration note](docs/workflows/ml-detector-integration-note.md)
- [MVP scope and deferred scope](docs/milestones/mvp-scope.md)
- [Implementation roadmap](docs/milestones/implementation-roadmap.md)
- [Next-step note](docs/milestones/next-step-note.md)
- [Repository refactor summary](docs/workflows/refactor-summary.md)

## Current Engineering Rule

If a problem exists on the machine, fix the machine first:

1. camera detection
2. frame stability
3. ROI correctness
4. line crossing correctness
5. local evidence
6. only then backend sync and dashboard display

That priority is intentional and should guide future work.
