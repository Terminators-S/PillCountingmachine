# Repository Refactor Summary

## What Changed

- Promoted the isolated Pi MVP into the new active `machine-runtime/` path.
- Reorganized the runtime code into clearer package boundaries:
  - `capture`
  - `config`
  - `inference`
  - `tracking`
  - `counting`
  - `overlay_ui`
  - `storage`
- Rewrote the root README to present the repo as a hardware-first MVP.
- Added machine-focused architecture, hardware, workflow, and milestone docs.
- Added root validation scripts for the machine runtime.

## What Moved

### Active runtime

- `machine-runtime-mvp/` content was copied into `machine-runtime/` and reorganized there.

### Legacy runtime

- `machine-learning/` moved to `legacy/old-machine-runtime/machine-learning/`

### Legacy platform prototypes

- `apps/web/src/` moved to `legacy/old-platform-experiments/web-spa-prototype/src/`
- `legacy/*.legacy.*` moved to `legacy/old-platform-experiments/static-prototype/`

### Documentation

- `docs/sample-event-payloads.json` moved to `docs/workflows/sample-event-payloads.json`

## What Was Deferred

- backend-controlled machine start/stop integration against the new `machine-runtime/`
- production result sync implementation
- deeper dashboard/history productization
- advanced model training and multi-medicine classification
- multi-machine orchestration

## Tradeoffs

- `machine-runtime-mvp/` still exists temporarily as a breadcrumb because the original folder was locked by the local IDE during refactor.
- The old bridge runtime was preserved under `legacy/` instead of being deleted so model/catalog work is still recoverable.
- The support API and dashboard remain in place, but the docs now describe them as support services instead of the main product.

## What Should Be Built Next

1. verify the camera and first capture on the Raspberry Pi using `machine-runtime/`
2. validate ROI placement and count-line placement on the real bench
3. run 10, 50, and 100 pill tests with saved evidence
4. only after count stability is acceptable, add result sync from machine runtime to API
5. then keep the dashboard focused on result history and machine visibility
