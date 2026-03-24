# MVP Scope

## In Scope Now

- Raspberry Pi 5 local runtime
- one USB camera
- one fixed display with overlay output
- fixed lighting and one constrained pill lane
- camera preview
- ROI overlay
- detection inside ROI
- tracking
- exact-once line crossing count logic
- local run logs and evidence
- minimal backend support for later result sync
- minimal dashboard support for later result visibility

## Out Of Scope Now

- enterprise inventory workflows
- FEFO-heavy operational features
- advanced admin/product management
- broad analytics
- multi-machine orchestration beyond basic support
- mixed pill classification in the first MVP
- large-scale model training programs
- cloud-first operation

## Product Decision

The first real success condition is not a polished platform.

The first success condition is:

`a Raspberry Pi counting machine that can reliably see, track, and count pills locally in a controlled lane`

Everything else is secondary until that is stable.
