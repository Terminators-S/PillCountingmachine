# Machine Runtime MVP

This folder is a clean, separate starting point for the Raspberry Pi pill counting machine MVP.

The goal here is not to rebuild the whole monorepo. The goal is to prove that the Raspberry Pi can:

1. detect a USB camera,
2. open the camera reliably,
3. capture stable frames,
4. save debug evidence locally,
5. prepare for ROI, tracking, and counting later.

If this camera pipeline is not stable, nothing else matters yet.

## 1. Machine MVP Restated In Clear Engineering Terms

The machine MVP is a single-lane pill counting runtime that runs locally on a Raspberry Pi with one USB camera and one controlled viewing area.

The MVP must do these things well:

1. use one Raspberry Pi,
2. use one USB camera,
3. use fixed lighting,
4. observe one controlled pill flow lane,
5. capture stable frames,
6. detect pills inside a predictable region,
7. track each pill through the lane,
8. count a pill exactly once when it crosses a virtual line,
9. save logs and debug evidence locally,
10. continue working without internet.

The MVP does not need these things yet:

1. dashboards,
2. inventory logic,
3. FEFO logic,
4. multi-camera support,
5. multi-pill classification,
6. cloud-first architecture,
7. complex deployment.

## 2. Full Build Roadmap

### Phase 1. Define The MVP Clearly
- Objective: Freeze the first machine scope so we stop mixing machine work with platform work.
- Deliverable: A written MVP definition with one pill lane, one camera, one counting rule, one target pill type.
- Tools needed: Markdown notes, camera measurements, machine sketch.
- Success criteria: You can explain in one paragraph what the first working machine does and what it does not do.
- Common risks: Trying to count mixed pills, trying to add dashboard work too early, unclear counting rule.
- Do not work on yet: UI polish, Firebase flows, backend sync.

### Phase 2. Hardware Checklist
- Objective: Confirm the physical parts needed for a stable test bench.
- Deliverable: A hardware list with Raspberry Pi, power supply, USB camera, mount, lights, lane, background.
- Tools needed: Pi 5, USB camera, stand, LED light, matte background.
- Success criteria: Every required hardware item is available and mounted in a stable way.
- Common risks: weak power supply, camera wobble, reflective background, uncontrolled pill overlap.
- Do not work on yet: model training.

### Phase 3. Raspberry Pi OS And Package Setup
- Objective: Prepare the Pi so it can run camera code reliably.
- Deliverable: Updated Raspberry Pi OS with Python, OpenCV, and camera utilities installed.
- Tools needed: Raspberry Pi OS 64-bit, terminal, internet for package install.
- Success criteria: `python3 --version`, `python3 -c "import cv2"` and `v4l2-ctl --version` all work.
- Common risks: wrong Python version assumptions, missing camera tools, partial apt install.
- Do not work on yet: backend integration.

### Phase 4. USB Camera Setup And Verification
- Objective: Prove the Pi can see the USB camera as a real Linux video device.
- Deliverable: Camera detected in `lsusb`, `/dev/video*`, and `v4l2-ctl --list-devices`.
- Tools needed: `lsusb`, `v4l2-ctl`.
- Success criteria: You know the camera device path and supported formats.
- Common risks: bad cable, power issues, wrong device index.
- Do not work on yet: counting logic.

### Phase 5. Basic Python Project Structure
- Objective: Create a small project for machine runtime only.
- Deliverable: This `machine-runtime-mvp/` folder structure.
- Tools needed: Python 3, venv, text editor.
- Success criteria: You can run the scripts in this folder without depending on the web app.
- Common risks: mixing monorepo dependencies into the machine runtime.
- Do not work on yet: API sync.

### Phase 6. OpenCV Camera Streaming Test
- Objective: Open the camera, read frames, print frame metadata, save a test frame.
- Deliverable: A Python capture script that opens the camera and writes one debug image.
- Tools needed: OpenCV, JSON config, local logs folder.
- Success criteria: A frame image and metadata JSON are saved after a successful run.
- Common risks: GUI preview fails on headless Pi, frame reads fail, unsupported resolution request.
- Do not work on yet: detection.

### Phase 7. Fixed Lighting And Viewing Zone Design
- Objective: Make the camera scene stable before using AI.
- Deliverable: A physically controlled lane with consistent lighting and a matte background.
- Tools needed: LED lights, diffuser, matte chute/background.
- Success criteria: Pills are clearly visible with low glare and low shadow movement.
- Common risks: reflections, shadows, overlapping pills, lane too wide.
- Do not work on yet: multi-lane flow.

### Phase 8. ROI Selection And Preview Overlay
- Objective: Restrict analysis to the true viewing zone only.
- Deliverable: A visible ROI box and debug overlay in the preview.
- Tools needed: OpenCV drawing functions.
- Success criteria: Preview shows a fixed, correct ROI aligned to the physical lane.
- Common risks: ROI too large, ROI drifting, counting outside the lane.
- Do not work on yet: advanced model tuning.

### Phase 9. Collect Sample Images And Videos
- Objective: Build a realistic local dataset from the actual machine.
- Deliverable: Labeled folders of still frames and short videos from the real Pi camera setup.
- Tools needed: Camera, storage, naming convention.
- Success criteria: You have real examples of clean passes, overlaps, blur, glare, misses.
- Common risks: collecting random images not matching the machine lane.
- Do not work on yet: fancy augmentation.

### Phase 10. Choose Initial Detection Approach
- Objective: Pick the simplest reliable detector for the real setup.
- Deliverable: One chosen approach: classical CV first, or YOLO first if classical CV is clearly insufficient.
- Tools needed: OpenCV, sample frames, optionally Ultralytics later.
- Success criteria: A documented decision with a reason.
- Common risks: choosing a large model too early when physics is the real problem.
- Do not work on yet: many classes.

### Phase 11. Implement Pill Detection Inference
- Objective: Output pill candidates inside the ROI on each frame.
- Deliverable: Bounding boxes or contours per frame.
- Tools needed: chosen detector.
- Success criteria: Detections are visible and reasonably stable across consecutive frames.
- Common risks: false positives from highlights, missed pills from blur.
- Do not work on yet: API upload.

### Phase 12. Implement Tracking
- Objective: Keep the same pill identity across frames.
- Deliverable: Stable track IDs with centroid history.
- Tools needed: tracker logic, Kalman/SORT/simple centroid tracking.
- Success criteria: A single pill keeps one ID while moving through the lane.
- Common risks: ID swaps, broken tracks from motion blur.
- Do not work on yet: performance optimization.

### Phase 13. Implement Line-Crossing Counting Logic
- Objective: Count pills by a clear geometric rule.
- Deliverable: Virtual line crossing counter using track centroids.
- Tools needed: tracked centroids, direction check.
- Success criteria: Count increases only when a track crosses the line in the correct direction.
- Common risks: wrong direction logic, line placed badly.
- Do not work on yet: business workflow.

### Phase 14. Prevent Double Counting
- Objective: Guarantee one pill increments the counter once.
- Deliverable: Counted-track memory and duplicate prevention.
- Tools needed: track state store.
- Success criteria: A track cannot add count twice after one valid crossing.
- Common risks: track fragmentation, bounce-back counts.
- Do not work on yet: mixed pill type support.

### Phase 15. Save Logs, Frames, And Run Metadata
- Objective: Make every run debuggable.
- Deliverable: Local JSON/CSV logs, frame snapshots, run summaries.
- Tools needed: local filesystem, timestamps.
- Success criteria: After a run, you can inspect what the machine saw and what it counted.
- Common risks: no debug evidence, impossible root-cause analysis.
- Do not work on yet: cloud dashboards.

### Phase 16. Accuracy Testing With 10 / 50 / 100 / 200 Pill Trials
- Objective: Measure real counting performance.
- Deliverable: Structured trial records for each batch size.
- Tools needed: spreadsheet or CSV log, controlled repeated tests.
- Success criteria: You know actual error rate and failure modes.
- Common risks: changing lighting or camera between tests and invalidating comparisons.
- Do not work on yet: deployment polish.

### Phase 17. Error Analysis And Tuning
- Objective: Use test data to improve weak points.
- Deliverable: A ranked list of errors and fixes.
- Tools needed: saved logs, saved frames, trial notes.
- Success criteria: Misses and double-counts trend downward in repeat tests.
- Common risks: random tweaking without evidence.
- Do not work on yet: new features.

### Phase 18. Package Machine Runtime
- Objective: Make the runtime repeatable on the Pi.
- Deliverable: Start script, config file, and service definition later.
- Tools needed: shell scripts, systemd later.
- Success criteria: The runtime starts the same way every time.
- Common risks: hidden environment assumptions.
- Do not work on yet: UI deployment.

### Phase 19. Optional Backend/API Integration
- Objective: Send final run summaries after local counting is stable.
- Deliverable: Optional POST of final count and metadata.
- Tools needed: `requests`, API endpoint, retry policy.
- Success criteria: Local counting still works if the network is down.
- Common risks: making the machine depend on the cloud.
- Do not work on yet: live dashboard streaming.

### Phase 20. Future Improvements
- Objective: Plan scale-up only after MVP is proven.
- Deliverable: Improvement backlog.
- Tools needed: test results and operator feedback.
- Success criteria: Improvements are grounded in MVP evidence.
- Common risks: adding complexity before reliability.
- Do not work on yet: anything that hides unresolved counting errors.

## 3. Exact Folder Structure

```text
machine-runtime-mvp/
├── README.md
├── .gitignore
├── .env.example
├── requirements.txt
├── config/
│   ├── camera.default.json
│   └── counting.default.json
├── logs/
│   ├── captures/
│   │   └── .gitkeep
│   └── runs/
│       └── .gitkeep
├── runs/
│   └── .gitkeep
├── models/
│   └── .gitkeep
├── samples/
│   └── .gitkeep
├── scripts/
│   ├── list_cameras.sh
│   ├── pi_setup.sh
│   ├── run_camera_capture_test.sh
│   ├── run_counting_mvp.sh
│   └── setup_venv.sh
├── src/
│   ├── __init__.py
│   ├── camera.py
│   ├── camera_capture_test.py
│   ├── config.py
│   ├── detector.py
│   ├── line_counter.py
│   ├── main.py
│   ├── recorder.py
│   ├── roi.py
│   └── tracker.py
└── tests/
    ├── test_config.py
    └── test_line_counter.py
```

### Why each folder exists
- `.env.example`: a future-safe place for Pi-specific runtime values without hardcoding them.
- `config/`: runtime settings that should change without editing Python code.
- `logs/captures/`: saved debug frames from camera tests and later debug runs.
- `logs/runs/`: metadata JSON and later counting logs.
- `runs/`: one-file run summaries that are easy to inspect or send to a backend later.
- `models/`: future detection models, not used yet.
- `samples/`: short real videos and images captured from the actual machine.
- `scripts/`: Pi helper scripts for setup and repeatable commands.
- `src/`: Python runtime code.
- `tests/`: small sanity checks for config loading and later logic tests.

## 3A. Current Counting Milestone Files

The current next-step counting milestone is implemented with these files:

- `config/counting.default.json`: fixed ROI, virtual count line, allowed direction, contour detector settings, tracker settings, and recording settings.
- `src/camera.py`: shared camera open, warmup, read, and metadata helpers.
- `src/roi.py`: ROI validation, ROI cropping, and line coordinate helpers.
- `src/detector.py`: simple contour-based pill candidate detector for a controlled lane.
- `src/tracker.py`: centroid tracker with stable track IDs.
- `src/line_counter.py`: one-direction line crossing counter with duplicate prevention.
- `src/recorder.py`: local run folder creation, debug frame saving, event CSV logging, and summary JSON output.
- `src/main.py`: local counting loop that ties everything together.
- `scripts/run_counting_mvp.sh`: Pi entry point for the counting loop.
- `tests/test_line_counter.py`: simulated crossing and duplicate-prevention tests.

## 4. First Implementation Milestone

This milestone stops at one goal: prove the Raspberry Pi can detect the USB camera and save a valid frame locally.

### Step 1. Prepare Raspberry Pi OS packages

Run these commands on the Raspberry Pi terminal from any folder:

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip python3-opencv v4l-utils usbutils ffmpeg
```

What this does:
- installs Python 3,
- installs virtual environment tools,
- installs OpenCV from the Debian package manager,
- installs `v4l2-ctl` to inspect video devices,
- installs `lsusb`,
- installs `ffmpeg` for later camera/video debugging.

Expected result:
- installation completes without package errors.

How to verify this worked:

```bash
python3 --version
python3 -c "import cv2; print(cv2.__version__)"
v4l2-ctl --version
lsusb
```

If this fails, check this:
- internet connection on the Pi,
- `sudo apt update` succeeded,
- Raspberry Pi OS package sources are healthy.

### Step 2. Copy this project to the Raspberry Pi

If you are using Git on the Pi, run:

```bash
cd ~
git clone <YOUR_REPO_URL> pill-count-ui
cd ~/pill-count-ui/machine-runtime-mvp
```

If the repo is already on the Pi, run:

```bash
cd ~/pill-count-ui
git pull
cd machine-runtime-mvp
```

Expected result:
- you are inside `~/pill-count-ui/machine-runtime-mvp`.

How to verify this worked:

```bash
pwd
ls
```

You should see:
- `README.md`
- `.env.example`
- `config`
- `scripts`
- `src`

### Step 3. Create the Python environment

Run these commands inside `machine-runtime-mvp/`:

```bash
bash scripts/setup_venv.sh
```

Why `--system-site-packages` is used:
- OpenCV was installed by `apt` as `python3-opencv`,
- this makes the venv able to use the stable system OpenCV package.

Expected result:
- the prompt shows `(.venv)`,
- no install errors appear,
- `python -c "import cv2"` works.

How to verify this worked:

```bash
source .venv/bin/activate
python -c "import cv2; print('OpenCV OK:', cv2.__version__)"
```

If this fails, check this:
- you created the venv with `--system-site-packages`,
- `python3-opencv` is installed,
- you activated the venv.

### Step 4. Detect the USB camera at Linux device level

Run:

```bash
bash scripts/list_cameras.sh
```

What this does:
- lists USB devices,
- lists `/dev/video*`,
- shows `v4l2` camera devices and supported formats.

Expected result:
- one or more `/dev/video` entries appear,
- your USB camera appears in `v4l2-ctl --list-devices`.

How to verify this worked:
- note the likely camera index,
- usually `/dev/video0` means camera index `0`.

If this fails, check this:
- unplug and reconnect the camera,
- use a known-good USB cable,
- avoid unpowered USB hubs,
- re-run `lsusb`,
- reboot the Pi.

### Step 5. Run the first OpenCV capture test

Stay inside `machine-runtime-mvp/`, activate the venv, then run:

```bash
source .venv/bin/activate
bash scripts/run_camera_capture_test.sh
```

If your camera is not index `0`, run:

```bash
source .venv/bin/activate
python -m src.camera_capture_test --camera-index 1
```

What this script does:
- loads `config/camera.default.json`,
- opens the camera,
- requests width, height, and FPS,
- warms up the camera,
- reads frames,
- saves one debug frame,
- saves one metadata JSON file,
- optionally shows a preview window if a desktop session is available.

Expected output:
- printed requested settings,
- printed actual camera settings,
- path to saved image,
- path to saved metadata JSON.

Expected generated files:
- `logs/captures/camera_test_<timestamp>.jpg`
- `logs/runs/camera_test_<timestamp>.json`
- `runs/camera_test_<timestamp>.summary.json`

### Step 6. Review the saved frame

Open the saved image file on the Pi or copy it to your laptop.

You are checking:
- is the image sharp,
- is the viewing area centered,
- is the lighting stable,
- are there glare hotspots,
- is the background clean,
- would a pill be clearly visible here.

This visual review matters more than model discussion right now.

## 5. Common Mistakes In This First Milestone

### Mistake: `No module named cv2`
- Cause: venv was created without `--system-site-packages`, or `python3-opencv` is missing.
- Fix:

```bash
rm -rf .venv
sudo apt install -y python3-opencv
python3 -m venv --system-site-packages .venv
source .venv/bin/activate
python -c "import cv2; print(cv2.__version__)"
```

### Mistake: camera opens but frame is black
- Cause: unsupported camera mode, low power, or warmup not complete.
- Fix:
  - re-run with default settings,
  - reduce requested resolution in `config/camera.default.json`,
  - try direct USB connection to the Pi,
  - unplug and reconnect the camera.

### Mistake: `Cannot open camera index 0`
- Cause: wrong camera index or device conflict.
- Fix:

```bash
bash scripts/list_cameras.sh
python -m src.camera_capture_test --camera-index 1
```

### Mistake: preview window does not appear
- Cause: headless Pi session or no desktop environment.
- Fix:
  - this is not fatal,
  - use the saved frame and metadata files instead,
  - optionally run with `--no-preview`.

## 6. What We Do Next

Do not jump to dashboards or backend sync after this.

After this milestone works, the next correct steps are:

1. lock the camera mount,
2. design the single-lane viewing zone,
3. add ROI overlay,
4. capture sample pill videos,
5. choose the first detection method,
6. only then move toward tracking and counting.
