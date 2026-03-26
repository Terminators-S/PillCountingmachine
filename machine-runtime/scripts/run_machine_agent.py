from __future__ import annotations

import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.sync.remote_control import build_machine_control_settings, run_remote_machine_agent  # noqa: E402


def env_truthy(name: str, default: bool = False) -> bool:
    raw_value = os.environ.get(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def main() -> int:
    api_base_url = (os.environ.get("PILLCOUNT_SYNC_API_URL") or "").strip()
    api_key = (os.environ.get("PILLCOUNT_SYNC_API_KEY") or "").strip()
    machine_code = (os.environ.get("PILLCOUNT_MACHINE_CODE") or os.environ.get("PILLCOUNT_MACHINE_NAME") or "pill-counter-pi").strip()
    poll_interval_seconds = float(os.environ.get("PILLCOUNT_CONTROL_POLL_INTERVAL_SECONDS") or 2.0)
    timeout_seconds = float(os.environ.get("PILLCOUNT_CONTROL_TIMEOUT_SECONDS") or 5.0)
    autostart_on_launch = env_truthy("PILLCOUNT_AUTOSTART_ON_BOOT", False)

    settings = build_machine_control_settings(
        api_base_url,
        api_key,
        machine_code,
        timeout_seconds=timeout_seconds,
        poll_interval_seconds=poll_interval_seconds,
        autostart_on_launch=autostart_on_launch,
    )
    if settings is None:
        print("Missing control settings. Set PILLCOUNT_SYNC_API_URL, PILLCOUNT_SYNC_API_KEY, and PILLCOUNT_MACHINE_CODE.")
        return 1

    start_command = ["bash", str(PROJECT_ROOT / "scripts" / "start_machine.sh")]
    return run_remote_machine_agent(settings, start_command=start_command, workdir=PROJECT_ROOT)


if __name__ == "__main__":
    raise SystemExit(main())
