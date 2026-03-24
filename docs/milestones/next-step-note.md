# Next Step After This Milestone

The next recommended milestone is not platform expansion.

It is harder machine validation.

## Do Next

1. run repeated 10, 50, and 100 object trials on the real Pi
2. compare contour mode against exported-model ML mode on the same lane and replay clips
3. validate the recommended NCNN path first, then ONNX only if needed
4. review saved debug frames and crossing event frames
5. tune ROI, line placement, contour thresholds, and ML confidence threshold
6. capture representative sample images and short clips into `datasets/`
7. only after local count stability is acceptable, wire `pending_sync.json` into the support API

## Defer Until After That

- broader export/accelerator work beyond the current NCNN and ONNX path
- broader multi-medicine model work
- deep dashboard work
- admin/reporting/inventory expansion
- multi-machine orchestration
