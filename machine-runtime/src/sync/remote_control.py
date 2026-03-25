from __future__ import annotations

import json
import os
import signal
import subprocess
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib import error, parse, request


def build_machine_runtime_control_heartbeat_endpoint(api_base_url: str, machine_code: str) -> str:
    normalized = str(api_base_url or "").strip().rstrip("/")
    if not normalized:
        raise ValueError("Backend API base URL is required.")

    if normalized.endswith("/control/heartbeat"):
        return normalized

    normalized_machine_code = parse.quote(str(machine_code or "").strip() or "pill-counter-pi", safe="")
    control_prefix = f"/machine-runtime/{normalized_machine_code}/control"
    if normalized.endswith(control_prefix):
        return f"{normalized}/heartbeat"
    return f"{normalized}{control_prefix}/heartbeat"


@dataclass(frozen=True)
class MachineControlSettings:
    api_base_url: str
    api_key: str
    machine_code: str
    timeout_seconds: float = 5.0
    poll_interval_seconds: float = 2.0

    @property
    def heartbeat_endpoint(self) -> str:
        return build_machine_runtime_control_heartbeat_endpoint(self.api_base_url, self.machine_code)


def post_machine_runtime_control_heartbeat(payload: dict[str, Any], settings: MachineControlSettings) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        settings.heartbeat_endpoint,
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
            if not raw_body:
                return {}
            parsed_body = json.loads(raw_body)
            return parsed_body if isinstance(parsed_body, dict) else {}
    except error.HTTPError as exc:
        raw_body = exc.read().decode("utf-8")
        detail = raw_body
        if raw_body:
            try:
                parsed = json.loads(raw_body)
                detail = str(parsed.get("message") or parsed)
            except json.JSONDecodeError:
                detail = raw_body
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Network error: {exc.reason}") from exc


class RemoteMachineAgent:
    def __init__(self, settings: MachineControlSettings, start_command: list[str], workdir: Path) -> None:
        self.settings = settings
        self.start_command = list(start_command)
        self.workdir = Path(workdir)
        self.agent_session_id = str(uuid.uuid4())
        self.process: subprocess.Popen[str] | None = None
        self.applied_command_version = 0
        self.runtime_state = "IDLE"
        self.current_message = "Remote control agent is online."
        self.last_error = ""

    def is_running(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def refresh_process_state(self) -> None:
        if not self.process:
            if self.runtime_state == "STOPPING":
                self.runtime_state = "IDLE"
            return

        return_code = self.process.poll()
        if return_code is None:
            if self.runtime_state == "STARTING":
                self.runtime_state = "RUNNING"
            return

        self.process = None
        if return_code == 0:
            self.runtime_state = "IDLE"
            self.current_message = "Machine runtime exited."
            self.last_error = ""
        else:
            self.runtime_state = "ERROR"
            self.last_error = f"Machine runtime exited with code {return_code}."
            self.current_message = self.last_error

    def build_payload(self) -> dict[str, Any]:
        return {
            "agent_session_id": self.agent_session_id,
            "runtime_state": self.runtime_state,
            "runtime_running": self.is_running(),
            "active_pid": self.process.pid if self.is_running() else None,
            "applied_command_version": self.applied_command_version,
            "current_message": self.current_message,
            "last_error": self.last_error or None,
        }

    def apply_command(self, desired_state: str, command_version: int, config: dict[str, Any] | None) -> None:
        if desired_state == "RUNNING":
            self.start_runtime(command_version, config or {})
            return

        self.stop_runtime(command_version)

    def start_runtime(self, command_version: int, config: dict[str, Any]) -> None:
        if self.is_running():
            self.stop_runtime(command_version)
            if self.is_running():
                return

        env = os.environ.copy()
        self._apply_runtime_overrides(env, config)
        try:
            self.process = subprocess.Popen(
                self.start_command,
                cwd=str(self.workdir),
                env=env,
                start_new_session=True,
            )
            self.applied_command_version = command_version
            self.runtime_state = "STARTING"
            self.current_message = "Starting machine runtime from remote command."
            self.last_error = ""
        except Exception as exc:
            self.process = None
            self.applied_command_version = command_version
            self.runtime_state = "ERROR"
            self.last_error = f"Failed to start machine runtime: {exc}"
            self.current_message = self.last_error

    def stop_runtime(self, command_version: int) -> None:
        try:
            if self.is_running() and self.process is not None:
                self.runtime_state = "STOPPING"
                os.killpg(self.process.pid, signal.SIGINT)
                deadline = time.monotonic() + 15.0
                while time.monotonic() < deadline:
                    if self.process.poll() is not None:
                        break
                    time.sleep(0.2)

                if self.process.poll() is None:
                    os.killpg(self.process.pid, signal.SIGTERM)
                    deadline = time.monotonic() + 5.0
                    while time.monotonic() < deadline:
                        if self.process.poll() is not None:
                            break
                        time.sleep(0.2)

                if self.process.poll() is None:
                    os.killpg(self.process.pid, signal.SIGKILL)
                    self.process.wait(timeout=5.0)
        except Exception as exc:
            self.applied_command_version = command_version
            self.runtime_state = "ERROR"
            self.last_error = f"Failed to stop machine runtime: {exc}"
            self.current_message = self.last_error
            return

        self.process = None
        self.applied_command_version = command_version
        self.runtime_state = "IDLE"
        self.current_message = "Stopped machine runtime from remote command."
        self.last_error = ""

    def shutdown(self, reason: str = "Stopping remote machine agent.") -> None:
        self.current_message = reason
        if self.is_running():
            self.stop_runtime(self.applied_command_version)

    def _apply_runtime_overrides(self, env: dict[str, str], config: dict[str, Any]) -> None:
        camera_index = config.get("cameraIndex")
        model_key = config.get("modelKey")
        if camera_index is None:
            env.pop("PILLCOUNT_CAMERA_INDEX", None)
        else:
            env["PILLCOUNT_CAMERA_INDEX"] = str(camera_index)

        if model_key:
            env["PILLCOUNT_MODEL_KEY"] = str(model_key)
        else:
            env.pop("PILLCOUNT_MODEL_KEY", None)


def build_machine_control_settings(
    api_base_url: str,
    api_key: str,
    machine_code: str,
    *,
    timeout_seconds: float = 5.0,
    poll_interval_seconds: float = 2.0,
) -> MachineControlSettings | None:
    normalized_url = str(api_base_url or "").strip()
    normalized_key = str(api_key or "").strip()
    normalized_machine_code = str(machine_code or "").strip()
    if not normalized_url or not normalized_key or not normalized_machine_code:
        return None

    return MachineControlSettings(
        api_base_url=normalized_url,
        api_key=normalized_key,
        machine_code=normalized_machine_code,
        timeout_seconds=float(timeout_seconds),
        poll_interval_seconds=float(poll_interval_seconds),
    )


def run_remote_machine_agent(settings: MachineControlSettings, *, start_command: list[str], workdir: Path) -> int:
    agent = RemoteMachineAgent(settings, start_command=start_command, workdir=workdir)
    print(f"Remote machine agent online for {settings.machine_code}")
    print(f"Heartbeat endpoint: {settings.heartbeat_endpoint}")

    try:
        while True:
            agent.refresh_process_state()

            try:
                response = post_machine_runtime_control_heartbeat(agent.build_payload(), settings)
            except KeyboardInterrupt:
                raise
            except Exception as exc:
                print(f"WARNING: Remote control heartbeat failed: {exc}")
                time.sleep(max(0.5, float(settings.poll_interval_seconds)))
                continue

            desired_state = str(response.get("desiredState") or "IDLE").strip().upper()
            command_version = int(response.get("commandVersion") or 0)
            config = response.get("config")
            config_dict = config if isinstance(config, dict) else {}

            if command_version > agent.applied_command_version:
                agent.apply_command(desired_state, command_version, config_dict)

            time.sleep(max(0.5, float(settings.poll_interval_seconds)))
    except KeyboardInterrupt:
        print("Stopping remote machine agent...")
        agent.shutdown("Agent interrupted by operator.")
        return 130
