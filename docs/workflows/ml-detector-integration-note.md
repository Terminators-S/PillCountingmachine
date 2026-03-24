# ML Detector Integration Note

## What Was Reused From Legacy

- the legacy model catalog format
- the local trained model artifacts under `legacy/old-machine-runtime/machine-learning/models/local/`
- the practical evidence that `local-train12` is the strongest first local candidate

## What Was Not Reused

- the old bridge runtime architecture
- the old runtime telemetry loop
- the old runtime tracker/counting ownership
- the old hosted and on-device Roboflow execution paths as the primary runtime

## Why The Active Runtime Stays Canonical

The active product is still:

`camera -> detector backend -> tracker -> exact-once counter -> overlay -> local evidence -> pending sync`

Only the detector stage became swappable. The counting-first runtime architecture did not change.

## First Integrated Model

- `local-train12`

Reason:

- strongest local metrics in the legacy catalog among the included offline models
- practical local `.pt` asset already present in the repository
- good enough for Raspberry Pi 5 MVP validation before export optimization work

## Deferred On Purpose

- ensemble execution in the active runtime
- hosted/on-device Roboflow backends inside `machine-runtime`
- ONNX/TensorRT-style optimization
- changes to dashboard/backend architecture

## Immediate Validation Step

Run the same short saved clip twice on the Raspberry Pi:

1. contour mode
2. ML mode with `local-train12`

Then compare:

- total count
- missed crossings
- double counts
- overlay readability
- event frame evidence
- effective FPS on the Pi
