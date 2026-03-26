# Pill Counting Machine Startup Guide

This guide is the repeatable start-to-end flow for the current working system.

Use it when you want to:

- start the PC support stack
- start the Raspberry Pi remote-control agent
- log in to the web UI
- open the live page
- start and stop the machine safely

This guide is written for the active repo:

```text
C:\Users\ASUS\OneDrive - Cambodia Academy of Digital Technology\bestcodeintheworld\Pill_Counter_Machine_push
```

## Safe Start Order

Always use this order:

1. start the PC API and web
2. start the public API tunnel if using Firebase hosted UI
3. start the Raspberry Pi control agent
4. log in to the website
5. open `/live`
6. click `Start`

If you change the order, the website may load but Pi remote start may not work.

## One-Time Setup

### 1. PC setup

Run this once on the Windows PC:

```powershell
cd "C:\Users\ASUS\OneDrive - Cambodia Academy of Digital Technology\bestcodeintheworld\Pill_Counter_Machine_push"
npm install
npm run prisma:push -w @pillcount/api
npm run prisma:seed -w @pillcount/api
```

Default seeded login:

```text
Email: admin@pillcount.local
Password: Admin1234!
```

Default seeded machine API key:

```text
mch_live_seed_key_123456789
```

### 2. Raspberry Pi setup

Run this once on the Pi:

```bash
cd ~/PillCountingmachine/machine-runtime
bash scripts/pi_setup.sh
bash scripts/setup_venv.sh
cp config/pi-machine.env.example config/pi-machine.env
```

Then edit:

```bash
nano ~/PillCountingmachine/machine-runtime/config/pi-machine.env
```

Recommended working content:

```bash
PILLCOUNT_DISPLAY=:0
PILLCOUNT_XDG_RUNTIME_DIR=/run/user/1000
PILLCOUNT_WAYLAND_DISPLAY=wayland-0

PILLCOUNT_DETECTOR_MODE=ml
PILLCOUNT_MODEL_KEY=local-train12
PILLCOUNT_MODEL_PATH=../legacy/old-machine-runtime/machine-learning/models/local/train12/best_ncnn_model
PILLCOUNT_DEVICE=cpu
PILLCOUNT_MAX_FRAMES=0
PILLCOUNT_PREVIEW=1
PILLCOUNT_FULLSCREEN=1

PILLCOUNT_SYNC_API_URL=http://YOUR_PC_IP:4000/api
PILLCOUNT_SYNC_API_KEY=mch_live_seed_key_123456789
PILLCOUNT_SYNC_TIMEOUT_SECONDS=10

PILLCOUNT_MACHINE_CODE=pill-counter-pi
PILLCOUNT_CONTROL_POLL_INTERVAL_SECONDS=2.0
PILLCOUNT_CONTROL_TIMEOUT_SECONDS=5.0

PILLCOUNT_LIVE_PREVIEW_ENABLED=1
PILLCOUNT_LIVE_PREVIEW_INTERVAL_SECONDS=2.0
PILLCOUNT_LIVE_PREVIEW_TIMEOUT_SECONDS=15.0
PILLCOUNT_LIVE_PREVIEW_MAX_WIDTH=320
PILLCOUNT_LIVE_PREVIEW_JPEG_QUALITY=40

PILLCOUNT_SAVE_DEBUG_OVERLAY_FRAMES=0
PILLCOUNT_SAVE_CROSSING_EVENT_FRAMES=0
PILLCOUNT_MAX_DEBUG_FRAMES=0
```

Important:

- replace `YOUR_PC_IP` with your Windows PC IP
- do not override `PILLCOUNT_INFERENCE_SIZE` for the NCNN export
- if you want website remote start, run the Pi control agent, not the always-on runtime service

Optional one-time Pi agent service install:

```bash
cd ~/PillCountingmachine/machine-runtime
sudo bash scripts/install_pi_agent_service.sh --user "$USER"
sudo systemctl enable pillcount-machine-agent.service
```

## Daily Start: Local UI On The PC

This is the easiest daily workflow.

### 1. Start the PC support stack

On Windows:

```powershell
cd "C:\Users\ASUS\OneDrive - Cambodia Academy of Digital Technology\bestcodeintheworld\Pill_Counter_Machine_push"
npm run dev:machine
```

What this does:

- starts the API on port `4000`
- starts the web app on port `3100`
- opens the local live dashboard

If it does not open automatically, use:

```text
http://localhost:3100/login
```

### 2. Start the Raspberry Pi control agent

Recommended daily Pi command:

```bash
cd ~/PillCountingmachine/machine-runtime
sudo systemctl restart pillcount-machine-agent.service
sudo systemctl status pillcount-machine-agent.service --no-pager
sudo journalctl -u pillcount-machine-agent.service -f
```

Manual alternative:

```bash
cd ~/PillCountingmachine/machine-runtime
source .venv/bin/activate
bash scripts/start_machine_agent.sh
```

Power-on automatic mode:

If you want the Raspberry Pi to start the ML runtime immediately after boot and
still remain controllable from the website later, enable boot autostart in the
Pi env file:

```bash
nano ~/PillCountingmachine/machine-runtime/config/pi-machine.env
```

Add:

```bash
PILLCOUNT_AUTOSTART_ON_BOOT=1
```

Then enable the Pi agent service once:

```bash
cd ~/PillCountingmachine/machine-runtime
sudo bash scripts/install_pi_agent_service.sh --user "$USER"
sudo systemctl enable pillcount-machine-agent.service
sudo systemctl restart pillcount-machine-agent.service
sudo systemctl status pillcount-machine-agent.service --no-pager
```

After that, the daily flow becomes:

- power on the Raspberry Pi
- the Pi agent starts automatically
- the ML runtime starts automatically
- the website `/live` page can still monitor, stop, and restart the machine

Do not enable `pillcount-machine.service` at the same time in this mode.

Important:

- if you use the website `/live` page to start and stop the Pi, do not separately run `pillcount-machine.service`
- one Pi should have one active controller path

### 3. Log in to the website

Use either:

```text
admin@pillcount.local / Admin1234!
```

or your real Google login if the API and Firebase auth are configured.

### 4. Open the live page

Open:

```text
http://localhost:3100/live
```

Then:

1. select `pill-counter-pi`
2. leave camera on `Auto / first available`
3. click `Start`

Expected result:

- preview appears on the Pi
- preview appears on the website
- counts update on the website

### 5. Stop the machine safely

Use the website first:

1. click `Stop` on `/live`
2. wait until the runtime closes

If needed on the Pi:

```bash
sudo journalctl -u pillcount-machine-agent.service -f
```

## Daily Start: Firebase Hosted UI

Use this only when you want the hosted UI:

```text
https://pillcountingmachine.web.app
```

### 1. Start the local machine stack and public API tunnel

On Windows:

```powershell
cd "C:\Users\ASUS\OneDrive - Cambodia Academy of Digital Technology\bestcodeintheworld\Pill_Counter_Machine_push"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-live-machine-public.ps1 -HostedWebUrl https://pillcountingmachine.web.app/login
```

This starts:

- local API
- local web
- public Cloudflare tunnel for the API

Look for a line like:

```text
SHARE_URL=https://xxxx.trycloudflare.com
```

Your public API URL is:

```text
https://xxxx.trycloudflare.com/api
```

### 2. Start the Raspberry Pi control agent

On the Pi:

```bash
cd ~/PillCountingmachine/machine-runtime
sudo systemctl restart pillcount-machine-agent.service
sudo journalctl -u pillcount-machine-agent.service -f
```

### 3. Log in to the hosted website

Open:

```text
https://pillcountingmachine.web.app/login
```

In `Advanced connection`, enter:

```text
https://xxxx.trycloudflare.com/api
```

Important:

- it must end with `/api`
- if you enter only the tunnel root, login will fail

Click `Test`, then log in.

### 4. Open the live page

Open:

```text
https://pillcountingmachine.web.app/live
```

Then:

1. select `pill-counter-pi`
2. click `Start`

## Incoming Stock And Expiry

To add new stock with expiry:

1. open `/jobs`
2. go to `Stock snapshot`
3. click `Add incoming stock`
4. fill:
   - pill type
   - quantity
   - location
   - lot number
   - received date
   - expiry date
   - unit cost
5. submit

Use this like supermarket incoming stock recording.

## Daily Stop

### Stop from the website

1. open `/live`
2. click `Stop`

### Stop the Pi agent service

```bash
sudo systemctl stop pillcount-machine-agent.service
```

### Stop the manual Pi agent

Press:

```text
Ctrl+C
```

### Stop the Windows local stack

In the Windows PowerShell windows that were opened for the API, web, and public tunnel:

```text
Ctrl+C
```

## Quick Troubleshooting

### Hosted UI says it cannot reach the support API

Cause:

- the hosted site is missing the real API URL
- or the tunnel URL does not end with `/api`

Fix:

```text
https://YOUR_TUNNEL.trycloudflare.com/api
```

### Website says the remote agent is offline

On the Pi:

```bash
sudo systemctl restart pillcount-machine-agent.service
sudo journalctl -u pillcount-machine-agent.service -f
```

### Pi preview works but website preview is blank

Check:

- `PILLCOUNT_LIVE_PREVIEW_ENABLED=1`
- `PILLCOUNT_SYNC_API_URL` is correct
- `PILLCOUNT_SYNC_API_KEY` is correct
- Pi agent is running

### Remote start does not work

Make sure:

- the website is connected to the correct API
- the Pi agent service is running
- you are not separately running `pillcount-machine.service`

## Recommended Daily Shortcut

If you want the safest daily habit:

### Windows PC

```powershell
cd "C:\Users\ASUS\OneDrive - Cambodia Academy of Digital Technology\bestcodeintheworld\Pill_Counter_Machine_push"
npm run dev:machine
```

### Raspberry Pi

```bash
cd ~/PillCountingmachine/machine-runtime
sudo systemctl restart pillcount-machine-agent.service
sudo journalctl -u pillcount-machine-agent.service -f
```

### Browser

```text
http://localhost:3100/live
```

Then log in and click `Start`.
