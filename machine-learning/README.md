# Machine Learning Runtime

This folder is the deployable ML runtime that belongs with the main application repository.

Included here:

- `live_runtime_bridge.py`
- `model_registry.py`
- `benchmark_models.py`
- `model_catalog.json`
- the three local runtime weights used by the default local ensemble

Not included here:

- full training archives
- large Roboflow dataset export zip files
- old `runs/` experiment folders
- local caches or generated runtime catalogs

Those larger training artifacts stay outside Git because they would bloat the repository and some exceed GitHub's file size limits.

## Included local models

- `local-train12`
- `local-train10`
- `local-train7`

## Raspberry Pi path recommendation

If this repository is cloned to:

`/home/pi/pill-count-ui`

then set:

- `ML_PROJECT_PATH=/home/pi/pill-count-ui/machine-learning`
- `ML_BRIDGE_SCRIPT_PATH=/home/pi/pill-count-ui/machine-learning/live_runtime_bridge.py`
- `ML_MODEL_CATALOG_PATH=/home/pi/pill-count-ui/machine-learning/model_catalog.json`

## Python packages

Use the runtime requirements in `requirements.pi.txt`.
