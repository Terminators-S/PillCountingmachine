# Hardware-First MVP Architecture

## Intent

The repository is organized around a single principle:

the Raspberry Pi machine runtime is the product core, and every other service exists to support that machine.

## Active Architecture

```text
USB Camera
   ->
machine-runtime/capture
   ->
machine-runtime/inference
   ->
machine-runtime/tracking
   ->
machine-runtime/counting
   ->
machine-runtime/overlay_ui
   ->
machine-runtime/storage
   ->
optional backend sync later
   ->
apps/api
   ->
apps/web
```

## Active Components

### `machine-runtime/`

Primary MVP runtime. Responsibilities:

- camera capture
- ROI-bound detection
- centroid tracking
- exact-once counting
- overlay rendering on the Pi display
- local logs and evidence

### `apps/api/`

Support API only. Responsibilities now:

- receive machine results when sync is introduced
- store result history and machine status
- support a minimal dashboard view

### `apps/web/`

Support dashboard only. Responsibilities now:

- show recent runs and machine status
- provide lightweight operator visibility
- avoid driving machine-side design decisions

## Legacy Components

### `legacy/old-machine-runtime/machine-learning/`

Previous bridge-style runtime and local model catalog. Preserved for reference, not the active path.

### `legacy/old-platform-experiments/`

Older UI and server experiments. Preserved so prior work is not lost, but intentionally separated from the active machine runtime.

## Design Rules

1. The Pi runtime must work without the internet.
2. Local evidence comes before remote sync.
3. One constrained physical lane is better than broad scene complexity.
4. Stable lighting and geometry matter more than early model complexity.
5. Backend and dashboard work must not force machine-side architecture before the local loop is reliable.

## Upgrade Path

The machine runtime is organized so later work can replace one layer at a time:

- contour detector -> lightweight object detector
- centroid tracker -> stronger tracker
- local summary only -> summary plus API sync
- static overlay -> richer machine UI

That upgrade path should happen without reworking the entire runtime package layout.
