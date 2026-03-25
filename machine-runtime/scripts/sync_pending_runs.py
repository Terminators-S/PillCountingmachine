from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.sync import SyncSettings, sync_pending_payloads


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Retry pending machine-run sync payloads against the backend API.")
    parser.add_argument(
        "--api-url",
        default=os.environ.get("PILLCOUNT_SYNC_API_URL"),
        help="Backend API base URL, for example http://localhost:4000/api.",
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("PILLCOUNT_SYNC_API_KEY"),
        help="API key used for backend machine-run sync.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=float(os.environ.get("PILLCOUNT_SYNC_TIMEOUT_SECONDS") or 10.0),
        help="HTTP timeout for each sync request.",
    )
    parser.add_argument(
        "--runs-path",
        default="runs",
        help="Runs directory or specific pending_sync.json path to scan.",
    )
    parser.add_argument("--limit", type=int, default=0, help="Optional max number of pending payloads to attempt.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    api_url = str(args.api_url or "").strip()
    api_key = str(args.api_key or "").strip()
    if not api_url:
        print("ERROR: --api-url or PILLCOUNT_SYNC_API_URL is required.")
        return 1
    if not api_key:
        print("ERROR: --api-key or PILLCOUNT_SYNC_API_KEY is required.")
        return 1

    run_root = Path(args.runs_path)
    if not run_root.is_absolute():
        run_root = PROJECT_ROOT / run_root

    result = sync_pending_payloads(
        run_root,
        SyncSettings(api_base_url=api_url, api_key=api_key, timeout_seconds=float(args.timeout_seconds)),
        limit=max(0, int(args.limit)),
    )
    print(json.dumps(result, indent=2))
    return 0 if result["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
