#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer with sudo."
  echo "Example: sudo bash scripts/install_pi_agent_service.sh --user ${SUDO_USER:-$USER}"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PI_USER="${SUDO_USER:-${USER}}"
SERVICE_NAME="pillcount-machine-agent"
RUNTIME_DIR=""
ENV_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user)
      PI_USER="${2:?Missing value for --user}"
      shift 2
      ;;
    --service-name)
      SERVICE_NAME="${2:?Missing value for --service-name}"
      shift 2
      ;;
    --runtime-dir)
      RUNTIME_DIR="${2:?Missing value for --runtime-dir}"
      shift 2
      ;;
    --env-file)
      ENV_FILE="${2:?Missing value for --env-file}"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: sudo bash scripts/install_pi_agent_service.sh [--user <pi-user>] [--service-name <name>] [--runtime-dir <dir>] [--env-file <file>]"
      exit 1
      ;;
  esac
done

PI_HOME="$(getent passwd "${PI_USER}" | cut -d: -f6)"
if [[ -z "${PI_HOME}" ]]; then
  echo "Unable to resolve home directory for user ${PI_USER}."
  exit 1
fi

if [[ -z "${RUNTIME_DIR}" ]]; then
  RUNTIME_DIR="${PI_HOME}/PillCountingmachine/machine-runtime"
fi

if [[ -z "${ENV_FILE}" ]]; then
  ENV_FILE="${RUNTIME_DIR}/config/pi-machine.env"
fi

SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

cat > "${SERVICE_PATH}" <<EOF
[Unit]
Description=PillCountingMachine Raspberry Pi remote control agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${PI_USER}
Group=${PI_USER}
WorkingDirectory=${RUNTIME_DIR}
Environment=HOME=${PI_HOME}
EnvironmentFile=-${ENV_FILE}
ExecStart=/usr/bin/env bash ${RUNTIME_DIR}/scripts/start_machine_agent.sh
Restart=always
RestartSec=3
KillSignal=SIGINT
TimeoutStopSec=15
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service"

echo "Installed ${SERVICE_PATH}"
echo "Next steps:"
echo "  1. Copy config/pi-machine.env.example to ${ENV_FILE}"
echo "  2. Fill in PILLCOUNT_SYNC_API_URL, PILLCOUNT_SYNC_API_KEY, and PILLCOUNT_MACHINE_CODE"
echo "  3. Start the agent with: sudo systemctl start ${SERVICE_NAME}.service"
echo "  4. Watch logs with: sudo journalctl -u ${SERVICE_NAME}.service -f"
