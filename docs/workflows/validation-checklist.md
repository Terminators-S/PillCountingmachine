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

## Evidence And Results

- `session.json` is written
- `summary.json` is written
- `pending_sync.json` is written
- `events.csv` is written when crossings occur
- debug frames are saved
- crossing event frames are saved

## Replay Path

- a recorded clip can be replayed with `bash scripts/run_replay_clip.sh <clip>`
- replay mode finishes cleanly at end-of-file
- replay mode still writes structured run outputs
