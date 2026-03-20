#!/usr/bin/env bash
# GPU Integration Test — Environment Setup & Service Launcher
#
# Usage:
#   ./run.sh              # start services, wait for readiness
#   ./run.sh --stop       # stop services started by this script
#   ./run.sh --status     # check if services are running
#
# This script is idempotent: if services are already listening, it skips startup.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Paths — adjust if your workspace layout differs
ACE_STEP_API_DIR="${ACE_STEP_API_DIR:-$(cd "$REPO_ROOT/../ACE-Step-1.5" 2>/dev/null && pwd || echo "")}"
ACE_STEP_DAW_DIR="$REPO_ROOT"

API_PORT="${API_PORT:-8001}"
DAW_PORT="${DAW_PORT:-5174}"
API_URL="http://127.0.0.1:$API_PORT"
DAW_URL="http://127.0.0.1:$DAW_PORT"

PID_DIR="$SCRIPT_DIR/.pids"
LOG_DIR="$SCRIPT_DIR/.logs"

# ── Helpers ─────────────────────────────────────────────────────────────────

log()  { echo "[gpu-qa] $*"; }
die()  { echo "[gpu-qa] ERROR: $*" >&2; exit 1; }

is_listening() {
  local port=$1
  ss -tlnp 2>/dev/null | grep -q ":${port} " && return 0
  return 1
}

wait_for_http() {
  local url=$1 timeout=$2 label=$3
  log "Waiting for $label at $url (timeout ${timeout}s)..."
  for i in $(seq 1 "$timeout"); do
    local code
    code=$(curl -sS -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    if [ "$code" = "200" ]; then
      log "$label ready (${i}s)"
      return 0
    fi
    sleep 1
  done
  die "$label did not become ready within ${timeout}s"
}

ensure_nvm() {
  if command -v node >/dev/null 2>&1; then
    local ver
    ver=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$ver" -ge 18 ]; then return 0; fi
  fi
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    log "Loaded nvm: node $(node -v), npm $(npm -v)"
  else
    die "Node.js 18+ required but not found. Install nvm or Node.js."
  fi
}

# ── Commands ────────────────────────────────────────────────────────────────

cmd_status() {
  echo "API  ($API_URL): $(is_listening $API_PORT && echo 'UP' || echo 'DOWN')"
  echo "DAW  ($DAW_URL): $(is_listening $DAW_PORT && echo 'UP' || echo 'DOWN')"
}

cmd_stop() {
  for pidfile in "$PID_DIR"/*.pid; do
    [ -f "$pidfile" ] || continue
    local pid
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      log "Stopping PID $pid ($(basename "$pidfile" .pid))..."
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
  done
  log "Services stopped."
}

cmd_start() {
  mkdir -p "$PID_DIR" "$LOG_DIR"

  # ── GPU check ──
  if command -v nvidia-smi >/dev/null 2>&1; then
    log "GPU: $(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null || echo 'unknown')"
  else
    log "WARNING: nvidia-smi not found. Generation will be slow or fail without GPU."
  fi

  # ── Node.js check ──
  ensure_nvm
  local npm_major
  npm_major=$(npm -v | cut -d. -f1)
  if [ "$npm_major" -lt 9 ]; then
    die "npm 9+ required (found $(npm -v)). Run: nvm use 22"
  fi

  # ── Start API server ──
  if is_listening "$API_PORT"; then
    log "API already listening on port $API_PORT, skipping startup."
  else
    if [ -z "$ACE_STEP_API_DIR" ] || [ ! -d "$ACE_STEP_API_DIR" ]; then
      die "ACE-Step-1.5 directory not found. Set ACE_STEP_API_DIR env var."
    fi
    if [ ! -x "$ACE_STEP_API_DIR/.venv/bin/acestep-api" ]; then
      die "acestep-api not found in $ACE_STEP_API_DIR/.venv/bin/. Run 'uv sync' first."
    fi
    log "Starting ACE-Step-1.5 API server..."
    cd "$ACE_STEP_API_DIR"
    ./.venv/bin/acestep-api > "$LOG_DIR/api.log" 2>&1 &
    echo $! > "$PID_DIR/api.pid"
    cd "$SCRIPT_DIR"
    wait_for_http "$API_URL/docs" 120 "ACE-Step API"
  fi

  # ── Start DAW dev server ──
  if is_listening "$DAW_PORT"; then
    log "DAW already listening on port $DAW_PORT, skipping startup."
  else
    log "Starting ACE-Step-DAW dev server..."
    cd "$ACE_STEP_DAW_DIR"
    VITE_PORT=$DAW_PORT npm run dev > "$LOG_DIR/daw.log" 2>&1 &
    echo $! > "$PID_DIR/daw.pid"
    cd "$SCRIPT_DIR"
    wait_for_http "$DAW_URL" 30 "ACE-Step DAW"
  fi

  # ── Verify end-to-end ──
  log "Verifying end-to-end connectivity..."
  local health
  health=$(curl -sS "$API_URL/health" 2>/dev/null || echo "FAIL")
  if echo "$health" | grep -qi "error\|FAIL"; then
    die "API health check returned unexpected response: $health"
  fi

  echo ""
  log "═══════════════════════════════════════════════════"
  log "  Services ready"
  log "  API:  $API_URL      (docs: $API_URL/docs)"
  log "  DAW:  $DAW_URL"
  log "  Logs: $LOG_DIR/"
  log "═══════════════════════════════════════════════════"
}

# ── Main ────────────────────────────────────────────────────────────────────

case "${1:-}" in
  --stop)   cmd_stop   ;;
  --status) cmd_status ;;
  *)        cmd_start  ;;
esac
