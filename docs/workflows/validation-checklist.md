# Validation Checklist

Use this checklist for the first real machine-runtime milestone.

## Camera And Display

- camera opens reliably on the Raspberry Pi
- live preview appears on the Pi display
- fullscreen preview works when desired
- runtime can also run headless with `--no-preview`
- runtime exits cleanly with `q`, `Esc`, or `Ctrl+C`

## Overlay

- ROI is visible and correctly aligned to the lane
- count line is visible and correctly placed
- count value is readable on the 3.4-inch display
- runtime status and run ID are visible
- tracked object IDs are readable when debugging

## Counting Logic

- one object crossing in the valid direction increments count once
- wrong-direction movement does not increment count
- a counted object is not counted again on the same track
- short-lived missed frames do not immediately break counting
- ML mode detections show label and confidence when enabled
- contour mode still runs cleanly as fallback

## Pi ML Validation

- contour mode is run first as the baseline
- the Pi preview opens after exporting `DISPLAY=:0`, `XDG_RUNTIME_DIR=/run/user/1000`, and `WAYLAND_DISPLAY=wayland-0`
- the exported NCNN model loads successfully through `--detector-model-path`
- detections appear inside the configured ROI
- line crossing increments count correctly in ML mode
- `summary.json` records detector backend, model path, and model format
- debug frames and event frames are saved for ML runs
- contour and ML runs can be compared on the same lane or replay clip

## Evidence And Results

- `session.json` is written
- `summary.json` is written
- `pending_sync.json` is written
- `events.csv` is written when crossings occur
- debug frames are saved
- crossing event frames are saved
- summary notes detector mode and model used
- counted events include object label metadata

## Replay Path

- a recorded clip can be replayed with `bash scripts/run_replay_clip.sh <clip>`
- replay mode finishes cleanly at end-of-file
- replay mode still writes structured run outputs
- replay comparison between contour and ML mode is straightforward
