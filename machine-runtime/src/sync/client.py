from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, request

SYNCABLE_STATUSES = {"pending_sync", "sync_failed"}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_machine_runs_endpoint(api_base_url: str) -> str:
    normalized = str(api_base_url or "").strip().rstrip("/")
    if not normalized:
        raise ValueError("Backend API base URL is required.")
    if normalized.endswith("/machine-runs"):
        return normalized
    return f"{normalized}/machine-runs"


@dataclass(frozen=True)
class SyncSettings:
    api_base_url: str
    api_key: str
    timeout_seconds: float = 10.0

    @property
    def machine_runs_endpoint(self) -> str:
        return build_machine_runs_endpoint(self.api_base_url)


def load_sync_payload(payload_path: Path) -> dict[str, Any]:
    return json.loads(payload_path.read_text(encoding="utf-8"))


def write_sync_payload(payload_path: Path, payload: dict[str, Any]) -> None:
    payload_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def update_summary_sync_metadata(run_dir: Path, payload: dict[str, Any], sync_enabled: bool, api_base_url: str | None) -> dict[str, Any]:
    summary_path = run_dir / "summary.json"
    if not summary_path.exists():
        return {}

    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    sync_state = payload.get("sync") or {}
    summary["pending_sync_path"] = str(run_dir / "pending_sync.json")
    summary["sync"] = {
        "enabled": sync_enabled,
        "configured": bool(api_base_url),
        "ready": sync_enabled,
        "status": sync_state.get("status") or payload.get("status"),
        "attempts": int(sync_state.get("attempts") or 0),
        "last_attempt_at_utc": sync_state.get("last_attempt_at_utc"),
        "last_synced_at_utc": sync_state.get("last_synced_at_utc"),
        "last_error": sync_state.get("last_error"),
        "disabled_reason": None,
        "api_base_url": api_base_url,
        "endpoint": build_machine_runs_endpoint(api_base_url) if api_base_url else None,
    }
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary["sync"]


def discover_pending_sync_payloads(run_root: Path) -> list[Path]:
    if run_root.is_file():
        return [run_root] if run_root.name == "pending_sync.json" else []
    return sorted(run_root.rglob("pending_sync.json"))


def build_sync_result(payload: dict[str, Any], ok: bool, message: str, http_status: int | None = None) -> dict[str, Any]:
    sync_state = payload.get("sync") or {}
    return {
        "ok": ok,
        "status": sync_state.get("status") or payload.get("status"),
        "attempts": int(sync_state.get("attempts") or 0),
        "http_status": http_status,
        "message": message,
        "run_id": payload.get("run_id"),
        "machine_name": payload.get("machine_name"),
    }


def post_machine_run(payload: dict[str, Any], settings: SyncSettings) -> tuple[int, dict[str, Any] | str | None]:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        settings.machine_runs_endpoint,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-api-key": settings.api_key,
        },
    )

    try:
        with request.urlopen(req, timeout=settings.timeout_seconds) as response:
            raw_body = response.read().decode("utf-8")
            parsed_body: dict[str, Any] | str | None
            if not raw_body:
                parsed_body = None
            else:
                try:
                    parsed_body = json.loads(raw_body)
                except json.JSONDecodeError:
                    parsed_body = raw_body
            return int(response.getcode()), parsed_body
    except error.HTTPError as exc:
        raw_body = exc.read().decode("utf-8")
        detail = raw_body
        if raw_body:
            try:
                detail_json = json.loads(raw_body)
                detail = str(detail_json.get("message") or detail_json)
            except json.JSONDecodeError:
                detail = raw_body
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Network error: {exc.reason}") from exc


def sync_pending_payload(payload_path: Path, settings: SyncSettings) -> dict[str, Any]:
    payload = load_sync_payload(payload_path)
    run_dir = payload_path.parent
    if str(payload.get("status") or "") == "synced":
        update_summary_sync_metadata(run_dir, payload, sync_enabled=True, api_base_url=settings.api_base_url)
        return build_sync_result(payload, ok=True, message="Already synced.")

    now_utc = utc_now_iso()
    sync_state = dict(payload.get("sync") or {})
    attempts = int(sync_state.get("attempts") or 0) + 1

    try:
        http_status, response_body = post_machine_run(payload, settings)
        payload["status"] = "synced"
        payload["sync"] = {
            "status": "synced",
            "attempts": attempts,
            "last_attempt_at_utc": now_utc,
            "last_synced_at_utc": now_utc,
            "last_error": None,
            "last_response": response_body,
            "http_status": http_status,
        }
        write_sync_payload(payload_path, payload)
        update_summary_sync_metadata(run_dir, payload, sync_enabled=True, api_base_url=settings.api_base_url)
        return build_sync_result(payload, ok=True, message="Synced successfully.", http_status=http_status)
    except Exception as exc:
        payload["status"] = "sync_failed"
        payload["sync"] = {
            "status": "sync_failed",
            "attempts": attempts,
            "last_attempt_at_utc": now_utc,
            "last_synced_at_utc": sync_state.get("last_synced_at_utc"),
            "last_error": str(exc),
            "last_response": sync_state.get("last_response"),
        }
        write_sync_payload(payload_path, payload)
        update_summary_sync_metadata(run_dir, payload, sync_enabled=True, api_base_url=settings.api_base_url)
        return build_sync_result(payload, ok=False, message=str(exc))


def sync_pending_payloads(run_root: Path, settings: SyncSettings, limit: int = 0) -> dict[str, Any]:
    payload_paths = discover_pending_sync_payloads(run_root)
    if limit > 0:
        payload_paths = payload_paths[:limit]

    results: list[dict[str, Any]] = []
    synced = 0
    failed = 0
    skipped = 0

    for payload_path in payload_paths:
        payload = load_sync_payload(payload_path)
        status = str(payload.get("status") or "")
        if status not in SYNCABLE_STATUSES:
            skipped += 1
            results.append(build_sync_result(payload, ok=True, message=f"Skipped payload with status '{status}'."))
            continue

        result = sync_pending_payload(payload_path, settings)
        results.append(result)
        if result["ok"]:
            synced += 1
        else:
            failed += 1

    return {
        "api_base_url": settings.api_base_url,
        "endpoint": settings.machine_runs_endpoint,
        "scanned": len(payload_paths),
        "synced": synced,
        "failed": failed,
        "skipped": skipped,
        "results": results,
    }
