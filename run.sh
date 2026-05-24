#!/usr/bin/env bash
# run-demo.sh — Primary startup script for the AI Demo.
# Runs on api.ping.demo (HTTPS).
#
# Port layout:
#   Demo API Server  → https://api.ping.demo:3001
#   Demo UI          → https://api.ping.demo:4000
#   Demo MCP Server  → localhost:8080
#   LangChain Agent     → localhost:8888 (uvicorn) + 8889 (chat WS) + 8890 (health/inspector)
#
# One-time setup (run once each, requires sudo for /etc/hosts):
#   echo '127.0.0.1  api.ping.demo' | sudo tee -a /etc/hosts
#   mkcert -install   # install local CA (once per machine)
#
# Usage:
#   ./run-demo.sh              # start all services (optional: tail prompt at end if TTY)
#   ./run-demo.sh stop         # stop all services (process trees + listeners)
#   ./run-demo.sh restart      # stop then start
#   ./run-demo.sh status       # live service health check
#   ./run-demo.sh tail         # pick a log by number or 'all' (all logs at once)
#   ./run-demo.sh tail 2       # tail UI log directly (no prompt)
#   ./run-demo.sh tail all     # tail -f all log files together (interleaved)
#   ./run-demo.sh test         # run full test suite
#   ./run-demo.sh help         # show this help message

set -euo pipefail

BASEDIR="$(cd "$(dirname "$0")" && pwd)"

API_HOST="api.ping.demo"
API_PORT=3001
UI_PORT=4000
API_URL="https://${API_HOST}:${API_PORT}"
CLIENT_URL="https://${API_HOST}:${UI_PORT}"

CERT_DIR="${BASEDIR}/certs"
CERT_FILE="${CERT_DIR}/api.ping.demo+2.pem"
KEY_FILE="${CERT_DIR}/api.ping.demo+2-key.pem"

# ── /etc/hosts check ─────────────────────────────────────────────────────────────────
if ! grep -q "${API_HOST}" /etc/hosts 2>/dev/null; then
  echo "WARNING:  ${API_HOST} is not in /etc/hosts."
  echo "   Run this once to add it, then restart the script:"
  echo "   echo '127.0.0.1  ${API_HOST}' | sudo tee -a /etc/hosts"
  echo ""
  echo "   Continuing with api.ping.demo URLs (ensure /etc/hosts is set)..."
  API_URL="https://api.ping.demo:${API_PORT}"
  CLIENT_URL="https://api.ping.demo:${UI_PORT}"
fi

# ── SSL cert check / auto-generate ───────────────────────────────────────────
if [[ ! -f "${CERT_FILE}" ]] || [[ ! -f "${KEY_FILE}" ]]; then
  if command -v mkcert &>/dev/null; then
    echo "[SSL] Generating SSL certs for ${API_HOST}..."
    mkdir -p "${CERT_DIR}"
    (cd "${CERT_DIR}" && mkcert "${API_HOST}" localhost 127.0.0.1)
    echo "[OK] Certs created in ${CERT_DIR}"
  else
    echo "WARNING:  mkcert not found — install with: brew install mkcert && mkcert -install"
    echo "   Falling back to HTTP..."
    API_URL="http://${API_HOST}:${API_PORT}"
    CLIENT_URL="http://${API_HOST}:${UI_PORT}"
  fi
fi

# PID files — separate from start.sh so both can coexist
PID_API=/tmp/demo-api.pid
PID_MCP=/tmp/demo-mcp.pid
PID_AGENT=/tmp/demo-langchain.pid
PID_UI=/tmp/demo-ui.pid

LOG_API=/tmp/demo-api.log
LOG_UI=/tmp/demo-ui.log
LOG_MCP=/tmp/demo-mcp.log
LOG_AGENT=/tmp/demo-langchain.log
LOG_MCP_TRAFFIC=/tmp/demo-mcp-traffic.log
PID_GW=/tmp/demo-mcp-gateway.pid
LOG_GW=/tmp/demo-mcp-gateway.log
PID_HITL=/tmp/demo-hitl.pid
LOG_HITL=/tmp/demo-hitl.log
PID_AGENT_SVC=/tmp/demo-agent.pid
LOG_AGENT_SVC=/tmp/demo-agent.log
PID_INVEST=/tmp/demo-invest.pid
LOG_INVEST=/tmp/demo-invest.log
PID_MORTGAGE=/tmp/demo-mortgage.pid
LOG_MORTGAGE=/tmp/demo-mortgage.log
LOG_AUTH=/tmp/demo-authorize.log
LOG_HELIX=/tmp/demo-helix.log

# Pre-create all log files so tail/log viewers work before services start.
# We TRUNCATE here (not just touch) — services that get skipped or fail to relaunch
# would otherwise leave stale errors from a prior run, which is misleading when
# debugging the current startup. Only run on `start` to keep `status`/`tail` safe.
if [[ "${1:-start}" == "start" || "${1:-start}" == "restart" || -z "${1:-}" ]]; then
  for _logf in "${LOG_API}" "${LOG_UI}" "${LOG_MCP}" "${LOG_AGENT}" "${LOG_MCP_TRAFFIC}" \
               "${LOG_GW}" "${LOG_HITL}" "${LOG_AGENT_SVC}" "${LOG_INVEST}" "${LOG_MORTGAGE}" "${LOG_AUTH}" \
               "${LOG_HELIX}"; do
    : > "${_logf}" 2>/dev/null || true
  done
else
  touch "${LOG_API}" "${LOG_UI}" "${LOG_MCP}" "${LOG_AGENT}" "${LOG_MCP_TRAFFIC}" \
        "${LOG_GW}" "${LOG_HITL}" "${LOG_AGENT_SVC}" "${LOG_INVEST}" "${LOG_MORTGAGE}" "${LOG_AUTH}" \
        "${LOG_HELIX}" 2>/dev/null || true
fi

# Terminal colors (global — used by banner, status, and tail_demo_logs)
BOLD='\033[1m'
CYAN='\033[1;36m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
MAGENTA='\033[1;35m'
BLUE='\033[1;34m'
WHITE='\033[1;37m'
RED='\033[1;31m'
DIM='\033[2m'
RESET='\033[0m'

# Floor for the running Node major. Must match root package.json#engines.node
# (currently ">=20"). The runtime accepts any major at or above this floor —
# Node 20, 22, 24, future LTSes are all fine.
NODE_MIN_VERSION=20

# ── Helpers ──────────────────────────────────────────────────────────────────
ok()   { echo -e "  ${GREEN}✓${RESET}  $1"; }
warn() { echo -e "  ${YELLOW}!${RESET}  $1"; }
err()  { echo -e "  ${RED}✗${RESET}  $1" >&2; }

# Return the running Node major (empty string if node missing).
_node_major() {
  command -v node >/dev/null 2>&1 || { echo ''; return; }
  node -e "process.stdout.write(process.version.replace('v','').split('.')[0])" 2>/dev/null
}

# If `node` is missing or on the wrong major, try to source nvm into THIS shell
# and `nvm use` the required major. This rescues users whose ~/.zshrc doesn't
# auto-load nvm — they'd otherwise see "command not found: nvm" before they ever
# get a chance to run our preflight.
ensure_node_runtime() {
  local current
  current="$(_node_major)"
  # Pass when current Node major is at or above the floor (20+). Node 22, 24,
  # future LTSes all work; we only need to act when current is missing or below.
  if [[ -n "${current}" ]] && [[ "${current}" -ge "${NODE_MIN_VERSION}" ]] 2>/dev/null; then
    return 0
  fi

  local nvm_dir="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "${nvm_dir}/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    \. "${nvm_dir}/nvm.sh"
    if command -v nvm >/dev/null 2>&1; then
      if nvm use "${NODE_MIN_VERSION}" >/dev/null 2>&1; then
        ok "Loaded Node $(node --version) via nvm (was ${current:-missing})"
        return 0
      fi
    fi
  fi

  if [[ -z "${current}" ]]; then
    err "Node.js is not on PATH in this shell."
  else
    err "Node ${NODE_MIN_VERSION}+ required, but this shell is using Node v${current}."
  fi
  echo ""
  echo "  Fix (zsh/bash) — load nvm into this shell, then install/select Node ${NODE_MIN_VERSION} or newer:"
  echo "    export NVM_DIR=\"\$HOME/.nvm\""
  echo "    [ -s \"\$NVM_DIR/nvm.sh\" ] && \\. \"\$NVM_DIR/nvm.sh\""
  echo "    nvm install ${NODE_MIN_VERSION} && nvm use ${NODE_MIN_VERSION}"
  echo ""
  echo "  Persist for future shells: append the two export/source lines above to"
  echo "    ~/.zshrc (zsh)   or   ~/.bashrc (bash)"
  echo ""
  echo "  No nvm yet? Install: https://github.com/nvm-sh/nvm#installing-and-updating"
  echo ""
  echo "  Then re-run from the banking-demo repo:  ./run-demo.sh"
  exit 1
}

# Check if a TCP port is listening locally
port_listening() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1
}

# ── Pre-flight checks ───────────────────────────────────────────────────────
preflight_checks() {
  echo ""
  echo -e "${WHITE}${BOLD}  PRE-FLIGHT CHECKS${RESET}"

  # Node.js — ensure_node_runtime will source nvm and switch majors if needed,
  # exiting with detailed guidance if it can't recover.
  ensure_node_runtime
  ok "Node.js $(node --version)"

  # npm
  if ! command -v npm >/dev/null 2>&1; then
    err "npm is not installed"
    exit 1
  fi
  ok "npm $(npm --version)"

  # .env files
  if [[ ! -f "${BASEDIR}/demo_api_server/.env" ]]; then
    warn "demo_api_server/.env not found — copy env.example and fill in PingOne credentials"
  else
    ok "demo_api_server/.env exists"
  fi

  # Port conflicts (check for non-Banking listeners)
  for port in "${API_PORT}" "${UI_PORT}" 8080 8888; do
    if port_listening "${port}"; then
      warn "Port ${port} is already in use (will be stopped before start)"
    fi
  done

  # Ollama (local LLM for NL intent fallback) — optional, local-only.
  # If OLLAMA_BASE_URL points to a remote host we skip the local start attempt
  # and just verify reachability. If unset, default to localhost:11434.
  local ollama_model="${OLLAMA_MODEL:-llama3.2}"
  local ollama_base="${OLLAMA_BASE_URL:-http://localhost:11434}"
  # Extract host and port from the URL (handles http://host:port and http://host)
  local ollama_host ollama_port
  ollama_host=$(echo "$ollama_base" | sed -E 's|https?://([^:/]+).*|\1|')
  ollama_port=$(echo "$ollama_base" | sed -E 's|https?://[^:]+:([0-9]+).*|\1|')
  [[ "$ollama_port" == "$ollama_base" ]] && ollama_port="11434"  # sed produced no match → default

  if [[ "$ollama_host" != "localhost" && "$ollama_host" != "127.0.0.1" ]]; then
    # Remote Ollama — just check reachability, never try to start locally
    if curl -sf --max-time 3 "${ollama_base}/api/tags" >/dev/null 2>&1; then
      ok "Ollama reachable at ${ollama_base} — model: ${ollama_model}"
    else
      warn "Ollama at ${ollama_base} not reachable — NL fallback may be disabled"
    fi
  elif ! command -v ollama >/dev/null 2>&1; then
    warn "ollama not found — NL fallback LLM disabled. Install: https://ollama.ai"
  elif port_listening "${ollama_port}"; then
    ok "Ollama running on :${ollama_port} — model: ${ollama_model}"
  else
    echo -e "  ${CYAN}[SPIN]${RESET}  Starting Ollama (model: ${ollama_model})…"
    ollama serve > /tmp/demo-ollama.log 2>&1 &
    echo $! > /tmp/demo-ollama.pid
    local i=0
    while [[ $i -lt 8 ]]; do
      port_listening "${ollama_port}" && break
      sleep 1; (( i++ )) || true
    done
    if port_listening "${ollama_port}"; then
      ok "Ollama started on :${ollama_port} — model: ${ollama_model}"
    else
      warn "Ollama did not start on :${ollama_port} — check /tmp/demo-ollama.log"
    fi
  fi

  ok "Pre-flight checks passed"
  echo ""
}

# ── Tail logs (pick one by number, or all at once) ────────────────────────────
tail_demo_logs() {
  local pre="${1:-}"
  [[ "${pre}" == "ALL" || "${pre}" == "All" ]] && pre="all"
  local names=("Demo API" "Demo UI" "MCP Server" "LangChain Agent" "MCP Traffic" "MCP Gateway" "HITL Service" "Agent Service" "MCP Invest" "Demo Mortgage" "Authorize Server" "Helix LLM")
  local logs=("${LOG_API}" "${LOG_UI}" "${LOG_MCP}" "${LOG_AGENT}" "${LOG_MCP_TRAFFIC}" "${LOG_GW}" "${LOG_HITL}" "${LOG_AGENT_SVC}" "${LOG_INVEST}" "${LOG_MORTGAGE}" "${LOG_AUTH}" "${LOG_HELIX}")
  local count=${#names[@]}
  local all_opt=$((count + 1))
  local choice=""

  echo ""
  echo -e "${CYAN}Pick a log to follow (tail -f). Ctrl+C stops tail only.${RESET}"
  for i in $(seq 0 $((count - 1))); do
    echo "  $((i + 1))) ${names[i]}"
    echo "      ${logs[i]}"
  done
  echo "  ${all_opt}) All of the above (same terminal, interleaved with file headers)"
  if [[ -n "${pre}" ]]; then
    choice="${pre}"
  else
    read -r -p "Number [1-${all_opt}] or 'all': " choice
  fi
  [[ "${choice}" == "ALL" || "${choice}" == "All" ]] && choice="all"

  if [[ "${choice}" == "all" || "${choice}" == "${all_opt}" ]]; then
    local existing=()
    local f
    for f in "${logs[@]}"; do
      if [[ -f "${f}" ]]; then
        existing+=("${f}")
      else
        echo "WARNING:  Skipping (not yet created): ${f}"
      fi
    done
    if [[ ${#existing[@]} -eq 0 ]]; then
      echo "WARNING:  No log files found yet. Start services with ./run-demo.sh first."
      exit 1
    fi
    echo "[LOG] Tailing ${#existing[@]} log file(s) together (interleaved). Ctrl+C stops."
    tail -f "${existing[@]}"
  elif [[ "${choice}" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= count )); then
    local idx=$((choice - 1))
    local f="${logs[$idx]}"
    if [[ ! -f "${f}" ]]; then
      echo "WARNING:  Log file does not exist yet: ${f}"
      echo "   (Start services first, or pick another number.)"
      exit 1
    fi
    echo "[LOG] Tailing ${names[$idx]} ..."
    tail -f "${f}"
  else
    echo "Invalid choice (use 1–${all_opt}, or 'all')."
    exit 1
  fi
}

# Kill a PID and every descendant (npm/node/uvicorn survive a plain kill on the subshell).
kill_process_tree() {
  local pid="$1"
  [[ -z "$pid" ]] && return 0
  case "$pid" in
    ''|*[!0-9]*) return 0 ;;
  esac
  [[ "$pid" -le 1 ]] && return 0
  local c
  # Children first (depth-first) so nothing is reparented under init still listening
  for c in $(pgrep -P "$pid" 2>/dev/null); do
    kill_process_tree "$c"
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
  fi
}

# Stop anything still listening on Banking ports (orphaned node/python after PID file lost).
stop_listeners_on_banking_ports() {
  local port pid pids
  for port in 3001 4000 8080 8888 8889 8890 3005 3006 3009 8081 8082; do
    pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
    for pid in $pids; do
      [[ -z "$pid" ]] && continue
      echo "   Stopping listener on :${port} (PID ${pid})"
      kill_process_tree "$pid"
    done
  done
}

force_kill_listeners_on_banking_ports() {
  local port pid pids
  for port in 3001 4000 8080 8888 8889 8890 3005 3006 3009 8081 8082; do
    pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
    for pid in $pids; do
      [[ -z "$pid" ]] && continue
      if kill -KILL "$pid" 2>/dev/null; then
        echo "   Force-killed PID ${pid} still on :${port}"
      fi
    done
  done
}

# Wait for a port with a timeout; returns "up" or "timeout" on stdout.
# When stderr is a TTY, also prints a per-second heartbeat to stderr so the
# user can see we're still working — without polluting any caller that's
# parsing stdout. The heartbeat clears itself before returning.
wait_for_port() {
  local port="$1" timeout="${2:-25}" label="${3:-port $1}" i=0
  local interactive=0
  if [[ -t 2 ]]; then interactive=1; fi

  if [[ $interactive -eq 1 ]]; then
    printf "    waiting for %s (port %s)" "$label" "$port" >&2
  fi

  while [[ $i -lt $timeout ]]; do
    if port_listening "$port"; then
      [[ $interactive -eq 1 ]] && printf " — up after %ds\n" "$i" >&2
      echo "up"; return 0
    fi
    [[ $interactive -eq 1 ]] && printf "." >&2
    sleep 1
    (( i++ )) || true
  done
  [[ $interactive -eq 1 ]] && printf " — TIMEOUT after %ds\n" "$timeout" >&2
  echo "timeout"
}

# Verify a service is truly healthy: first wait for TCP port, then poll HTTP /health
# until HTTP 200. On timeout, prints the last 20 lines of the service log.
# Args: port path timeout label log_file
# Returns "up" or "timeout" on stdout (same contract as wait_for_port).
wait_for_health() {
  local port="$1" path="$2" timeout="${3:-25}" label="${4:-:$1}" log_file="${5:-}"
  local interactive=0
  [[ -t 2 ]] && interactive=1

  # Phase 1: wait for TCP port (half the timeout budget)
  local port_timeout=$(( timeout / 2 ))
  if [[ "$(wait_for_port "$port" "$port_timeout" "$label")" == "timeout" ]]; then
    _health_timeout_report "$label" "$log_file"
    echo "timeout"; return 1
  fi

  # Phase 2: poll /health until HTTP 200
  local i=0 remaining=$(( timeout - port_timeout ))
  [[ $interactive -eq 1 ]] && printf "    polling health for %s" "$label" >&2
  while [[ $i -lt $remaining ]]; do
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
      --max-time 2 --insecure "http://localhost:${port}${path}" 2>/dev/null || echo "000")
    if [[ "$http_code" == "200" ]]; then
      [[ $interactive -eq 1 ]] && printf " — healthy after %ds\n" "$i" >&2
      echo "up"; return 0
    fi
    [[ $interactive -eq 1 ]] && printf "." >&2
    sleep 1; (( i++ )) || true
  done
  [[ $interactive -eq 1 ]] && printf " — TIMEOUT after %ds\n" "$timeout" >&2

  _health_timeout_report "$label" "$log_file"
  echo "timeout"; return 1
}

# Print last 20 lines of a service log when health check times out.
# All output goes to stderr so it isn't swallowed by >/dev/null at call sites.
_health_timeout_report() {
  local label="$1" log_file="$2"
  echo "" >&2
  err "$label did not become healthy"
  if [[ -n "$log_file" && -f "$log_file" ]]; then
    echo -e "  ${DIM}Last 20 lines of ${log_file}:${RESET}" >&2
    echo -e "  ${DIM}$(printf '─%.0s' {1..60})${RESET}" >&2
    tail -20 "$log_file" | sed 's/^/    /' >&2
    echo -e "  ${DIM}$(printf '─%.0s' {1..60})${RESET}" >&2
  fi
  echo "" >&2
  warn "Run ./run.sh status to see current service state." >&2
}

# Print a single-line status row for a service.
# Args: label port health_path url
# health_path — the HTTP path to check (e.g. /health). Pass "" to skip health check.
service_status_line() {
  local label="$1" port="$2" health_path="${3:-}" url="${4:-}"
  if port_listening "$port"; then
    local health_status="port-up"
    local health_color="${YELLOW}"
    if [[ -n "$health_path" ]]; then
      local hcode
      hcode=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time 2 --insecure "http://localhost:${port}${health_path}" 2>/dev/null || echo "000")
      if [[ "$hcode" == "200" ]]; then
        health_status="healthy"
        health_color="${GREEN}"
      fi
    fi
    printf "  ${GREEN}${BOLD}  [OK]  %-24s${RESET}  ${MAGENTA}:%-6s${RESET}  ${health_color}%-10s${RESET}  ${YELLOW}%s${RESET}\n" \
      "$label" "$port" "$health_status" "$url"
  else
    printf "  ${RED}${BOLD}  [DOWN]  %-24s${RESET}  ${MAGENTA}:%-6s${RESET}  ${DIM}%-10s${RESET}\n" \
      "$label" "$port" "offline"
  fi
}

# Print the full status table (used by both 'start' and 'status' subcommands)
print_status_table() {
  echo -e "${WHITE}${BOLD}  SERVICES${RESET}"
  service_status_line "Demo API Server"      ${API_PORT}  "/api/healthz"  "${API_URL}"
  service_status_line "Demo MCP Server"      8080         "/health"        "ws://localhost:8080 (internal)"
  service_status_line "MCP Gateway"          3005         "/health"        "http://localhost:3005 (internal)"
  service_status_line "MCP Invest Server"    8081         "/health"        "ws://localhost:8081 (internal)"
  service_status_line "Mortgage Service"     8082         "/health"        "http://localhost:8082 (internal)"
  service_status_line "Agent Service"        3006         "/health"        "http://localhost:3006 (internal)"
  service_status_line "HITL Service"         3009         "/health"        "http://localhost:3009 (internal)"
  service_status_line "LangChain Agent"      8890         "/health"        "ws://localhost:8889 (chat WS)"
  if port_listening ${UI_PORT}; then
    printf "  ${GREEN}${BOLD}  [OK]  %-24s${RESET}  ${MAGENTA}:%-6s${RESET}  ${GREEN}%-10s${RESET}  ${YELLOW}%s${RESET}\n" \
      "Demo UI (React)" "${UI_PORT}" "port-up" "${CLIENT_URL}"
  else
    printf "  ${YELLOW}  [WAIT]  %-24s${RESET}  ${MAGENTA}:%-6s${RESET}  ${DIM}%-10s${RESET}  %s${RESET}\n" \
      "Demo UI (React)" "${UI_PORT}" "compiling…" "${CLIENT_URL}"
  fi
}

# ── Subcommand: stop ─────────────────────────────────────────────────────────
cmd_stop() {
  echo "[STOP] Stopping Demo services (run-demo.sh)..."
  set +e
  for pid_file in "$PID_API" "$PID_MCP" "$PID_GW" "$PID_HITL" "$PID_AGENT_SVC" "$PID_INVEST" "$PID_MORTGAGE" "$PID_AGENT" "$PID_UI"; do
    if [[ -f "$pid_file" ]]; then
      PID=$(cat "$pid_file" 2>/dev/null || true)
      rm -f "$pid_file"
      if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
        kill_process_tree "$PID"
        echo "   Stopped process tree from PID ${PID} ($(basename "$pid_file" .pid))"
      fi
    fi
  done
  sleep 1
  echo "   Sweeping ports (API :${API_PORT}, UI :${UI_PORT}, MCP :8080, LangChain :8888/8889/8890, GW :3005, Agent :3006, HITL :3009, Invest :8081, Mortgage :8082)…"
  stop_listeners_on_banking_ports
  sleep 1
  force_kill_listeners_on_banking_ports
  set -euo pipefail
  echo "[OK] All Demo listeners stopped (or none were running)."
}

# ── Subcommand: test ─────────────────────────────────────────────────────────
cmd_test() {
  echo ""
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${CYAN}${BOLD}   [BANK]  DEMO — TEST SUITE                                          ${RESET}"
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""

  local failed=0

  if [[ -d "${BASEDIR}/demo_api_server" ]]; then
    echo -e "  ${CYAN}→${RESET}  Running demo_api_server tests..."
    if (cd "${BASEDIR}/demo_api_server" && npm test -- --passWithNoTests 2>&1); then
      ok "demo_api_server tests passed"
    else
      err "demo_api_server tests FAILED"
      failed=$((failed + 1))
    fi
  fi

  if [[ -d "${BASEDIR}/demo_api_ui" ]]; then
    if grep -q '"test"' "${BASEDIR}/demo_api_ui/package.json" 2>/dev/null; then
      echo -e "  ${CYAN}→${RESET}  Running demo_api_ui tests..."
      if (cd "${BASEDIR}/demo_api_ui" && CI=true npm test -- --watchAll=false --passWithNoTests 2>&1); then
        ok "demo_api_ui tests passed"
      else
        err "demo_api_ui tests FAILED"
        failed=$((failed + 1))
      fi
    fi
  fi

  if [[ -d "${BASEDIR}/demo_mcp_server" ]]; then
    if grep -q '"test"' "${BASEDIR}/demo_mcp_server/package.json" 2>/dev/null; then
      echo -e "  ${CYAN}→${RESET}  Running demo_mcp_server tests..."
      if (cd "${BASEDIR}/demo_mcp_server" && npm test -- --passWithNoTests 2>&1); then
        ok "demo_mcp_server tests passed"
      else
        err "demo_mcp_server tests FAILED"
        failed=$((failed + 1))
      fi
    fi
  fi

  echo ""
  if [[ "${failed}" -eq 0 ]]; then
    ok "All test suites passed"
  else
    err "${failed} test suite(s) failed"
    exit 1
  fi
  echo ""
}

# ── Subcommand: help ─────────────────────────────────────────────────────────
cmd_help() {
  echo ""
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${CYAN}${BOLD}   [BANK]  AI DEMO — run-demo.sh                      ${RESET}"
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
  echo -e "${WHITE}${BOLD}  Usage:${RESET} ./run-demo.sh <command>"
  echo ""
  echo -e "${WHITE}${BOLD}  Commands:${RESET}"
  echo "    (default)  Start all services (HTTPS on api.ping.demo)"
  echo "    stop       Stop all services gracefully (process tree + port sweep)"
  echo "    restart    Stop then start all services"
  echo "    status     Show running/stopped status with ports and URLs"
  echo "    tail       Pick a log to follow (number) or 'all' for all logs at once"
  echo "    tail N     Tail a specific log directly (1=API, 2=UI, 3=MCP, …)"
  echo "    test       Run full test suite (API, UI, MCP)"
  echo "    help       Show this message"
  echo ""
  echo -e "${WHITE}${BOLD}  Port Layout:${RESET}"
  echo "    Demo API Server      :${API_PORT}  (HTTPS)"
  echo "    Demo UI              :${UI_PORT}  (HTTPS)"
  echo "    Demo MCP Server      :8080
    MCP Gateway          :3005"
  echo "    LangChain Agent      :8888"
  echo ""
  echo -e "${WHITE}${BOLD}  Log Files:${RESET}"
  echo "    ${LOG_API}"
  echo "    ${LOG_UI}"
  echo "    ${LOG_MCP}"
  echo "    ${LOG_AGENT}"
  echo "    ${LOG_MCP_TRAFFIC}"
  echo "    ${LOG_GW}"
  echo "    ${LOG_HITL}"
  echo "    ${LOG_AGENT_SVC}"
  echo "    ${LOG_INVEST}"
  echo "    ${LOG_MORTGAGE}"
  echo "    ${LOG_AUTH}"
  echo ""
  echo -e "${WHITE}${BOLD}  One-time Setup:${RESET}"
  echo "    echo '127.0.0.1  api.ping.demo' | sudo tee -a /etc/hosts"
  echo "    mkcert -install && cd certs && mkcert api.ping.demo localhost 127.0.0.1"
  echo ""
}

# ── Subcommand dispatch ─────────────────────────────────────────────────────
COMMAND="${1:-start}"

case "${COMMAND}" in
  stop)
    cmd_stop
    exit 0
    ;;
  restart)
    cmd_stop
    # fall through to start below
    ;;
  status)
    echo ""
    echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "${CYAN}${BOLD}   [BANK]  AI DEMO — SERVICE STATUS                                ${RESET}"
    echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo ""
    print_status_table
    echo ""
    echo -e "${GREEN}${BOLD}  ┌─ URLS ──────────────────────────────────────────────────────┐${RESET}"
    echo -e "${GREEN}${BOLD}  │${RESET}  [WEB]  App           ${YELLOW}${BOLD}${CLIENT_URL}${RESET}"
    echo -e "${GREEN}${BOLD}  │${RESET}  [CONFIG]   Admin Config  ${YELLOW}${BOLD}${CLIENT_URL}/config${RESET}"
    echo -e "${GREEN}${BOLD}  │${RESET}  [SSL]  Admin Login   ${YELLOW}${BOLD}${API_URL}/api/auth/oauth/login${RESET}"
    echo -e "${GREEN}${BOLD}  │${RESET}  [USER]  User Login    ${YELLOW}${BOLD}${API_URL}/api/auth/oauth/user/login${RESET}"
    echo -e "${GREEN}${BOLD}  └─────────────────────────────────────────────────────────────┘${RESET}"
    echo ""
    echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo ""
    exit 0
    ;;
  mcp-traffic|mcp-watch)
    if [[ ! -f "${LOG_MCP_TRAFFIC}" ]]; then echo "No MCP traffic log yet. Start services first." >&2; exit 1; fi
    echo "[TRAFFIC] MCP Traffic Log — Ctrl+C to stop"
    tail -f "${LOG_MCP_TRAFFIC}"
    exit 0
    ;;
  tail)
    tail_demo_logs "${2:-}"
    exit 0
    ;;
  test)
    cmd_test
    exit 0
    ;;
  help|--help|-h)
    cmd_help
    exit 0
    ;;
  start)
    # fall through to start below
    ;;
  *)
    err "Unknown command: ${COMMAND}"
    cmd_help
    exit 1
    ;;
esac

# ══════════════════════════════════════════════════════════════════════════════
# START SERVICES
# ══════════════════════════════════════════════════════════════════════════════

preflight_checks

# ── Auto-kill any existing Banking services before (re)starting ─────────────
_any_running=false
for _chk_port in ${API_PORT} ${UI_PORT} 8080 8888; do
  if port_listening "$_chk_port"; then
    _any_running=true
    break
  fi
done
if [[ "$_any_running" == "true" ]]; then
  echo -e "${YELLOW}  [SPIN]  Stopping existing Demo services…${RESET}"
  set +e
  for _pf in "$PID_API" "$PID_MCP" "$PID_GW" "$PID_HITL" "$PID_AGENT_SVC" "$PID_INVEST" "$PID_AGENT" "$PID_UI"; do
    if [[ -f "$_pf" ]]; then
      _pid=$(cat "$_pf" 2>/dev/null || true)
      rm -f "$_pf"
      [[ -n "$_pid" ]] && kill_process_tree "$_pid" 2>/dev/null || true
    fi
  done
  stop_listeners_on_banking_ports
  sleep 1
  force_kill_listeners_on_banking_ports
  set -euo pipefail
  echo -e "${GREEN}  [OK]  Previous services stopped.${RESET}"
  echo ""
fi

# ── Dependency check (all Node services, not just the obvious three) ─────────
# Parallel arrays — keep indices aligned. SVC_BUILD="ts" means run `npm run build`
# (tsc) when dist/index.js is missing. SVC_INSTALL_FLAGS handles services that
# need extra `npm install` flags (demo_api_ui needs --legacy-peer-deps for
# CRA/typescript peerOptional). Loud failure on any error — silent skips here
# are exactly how we got cryptic MODULE_NOT_FOUND in service logs.
SVC_LIST=(demo_api_server demo_mcp_server demo_api_ui      demo_mcp_gateway demo_hitl_service demo_agent_service demo_mcp_invest demo_mortgage_service)
SVC_BUILD=(""                "ts"               ""                  "ts"                ""                   "ts"                  "ts"               "")
SVC_INSTALL_FLAGS=(""        ""                 "--legacy-peer-deps" ""                  ""                   ""                    ""                 "")

for i in "${!SVC_LIST[@]}"; do
  svc="${SVC_LIST[$i]}"
  [[ -d "$BASEDIR/$svc" ]] || continue

  if [[ ! -d "$BASEDIR/$svc/node_modules" ]]; then
    echo "[PKG] Installing dependencies for $svc..."
    if ! (cd "$BASEDIR/$svc" && npm install ${SVC_INSTALL_FLAGS[$i]}); then
      err "npm install failed for $svc — aborting startup."
      err "  Fix the error above (often a network or registry issue), then re-run ./run-demo.sh"
      exit 1
    fi
  fi

  if [[ "${SVC_BUILD[$i]}" == "ts" ]] && [[ ! -f "$BASEDIR/$svc/dist/index.js" ]]; then
    echo "[BUILD] Compiling TypeScript for $svc..."
    if ! (cd "$BASEDIR/$svc" && npm run build); then
      err "Build failed for $svc — aborting startup."
      err "  Fix the TypeScript errors above, then re-run ./run-demo.sh"
      exit 1
    fi
  fi
done

# ── Demo API Server (Express) on :3001 ────────────────────────────────────
# NODE_EXTRA_CA_CERTS points Node at mkcert's root CA so BFF→MCP-Gateway
# HTTPS probes can validate the gateway's mkcert-issued cert. Without this
# they fail with UNABLE_TO_VERIFY_LEAF_SIGNATURE and the agent UI surfaces
# "MCP Gateway unavailable; bypass not permitted".
#
# NODE_OPTIONS=--use-system-ca was tried first but doesn't work reliably on
# Node 24 (didn't pick up the mkcert root from the macOS System keychain
# in our local test). Pointing at rootCA.pem directly works on every Node
# version that supports NODE_EXTRA_CA_CERTS (Node 12+).
#
# Resolved at script time so a missing mkcert install becomes a clear
# message rather than a silent TLS failure later.
MKCERT_ROOT_PEM="$(mkcert -CAROOT 2>/dev/null)/rootCA.pem"
if [[ -f "$MKCERT_ROOT_PEM" ]]; then
  export NODE_EXTRA_CA_CERTS="$MKCERT_ROOT_PEM"
else
  echo "[WARN] mkcert root CA not found at expected path. Run \`mkcert -install\` once if BFF→MCP Gateway HTTPS probes fail."
fi

# ── Vault preflight (Phase 269 / agent vault-awareness follow-up) ────────────
# The BFF, MCP Gateway, and Agent Service each load secrets from the encrypted
# secrets.vault at startup and FAIL FAST if the vault file exists but
# VAULT_PASSWORD is unset (REGRESSION_PLAN §1 "Vault BFF startup" /
# "Vault Agent startup"). Without this preflight the operator would instead get
# three separate cryptic "refusing to start" failures in three log files.
# When no vault file exists, this is a transparent no-op — behavior is
# byte-identical to before (the common dev case on machines with no vault).
# Secret hygiene (T-269-27): VAULT_PASSWORD is only ever passed via the
# subshell environment, never as a CLI arg, and is never echoed.
VAULT_FILE="${VAULT_PATH:-$BASEDIR/secrets.vault}"
if [[ -f "$VAULT_FILE" ]]; then
  if [[ -z "${VAULT_PASSWORD:-}" ]]; then
    echo "[ERROR] secrets.vault present at ${VAULT_FILE} but VAULT_PASSWORD is not set."
    echo "        The BFF, MCP Gateway, and Agent Service will refuse to start."
    echo "        Fix: export VAULT_PASSWORD=... before ./run-demo.sh"
    echo "        (or remove/rename ${VAULT_FILE} to fall back to .env / process.env)."
    exit 1
  fi
  echo "[VAULT] secrets.vault detected — passing VAULT_PASSWORD to vault-aware services."
fi

# Helper: ensure a sibling Node service has a .env that points at the API
# server's .env. Without this, services that do `dotenv.config()` find no
# .env and fail with "Missing required env var" even though every key they
# need exists upstairs in demo_api_server/.env.
#
# Symlink instead of copy so any future bootstrap rewrite is picked up
# immediately by all services on next restart — no chance of one service
# running against a stale snapshot.
ensure_service_env() {
  local svc_dir="$1"
  local api_env="${BASEDIR}/demo_api_server/.env"
  local svc_env="${BASEDIR}/${svc_dir}/.env"

  # If the service has its own .env.development, preserve the existing
  # behavior (legacy path used by demo_mcp_server / hitl).
  if [[ -f "${BASEDIR}/${svc_dir}/.env.development" ]]; then
    cp "${BASEDIR}/${svc_dir}/.env.development" "${svc_env}" 2>/dev/null || true
    return
  fi

  # No service-specific .env.development → link to API server's .env.
  if [[ -f "$api_env" ]]; then
    # Drop any existing link/copy so we get the current source of truth.
    rm -f "${svc_env}"
    ln -s "$api_env" "${svc_env}"
  fi
}

# ── Pre-launch: symlink all service .envs before any process starts ──────────
# Done as a single pass here so no service can start before its .env is in place.
# (Previously each ensure_service_env was called inline just before that service's
# launch block, creating a race on the first service.)
for _svc in demo_mcp_server demo_mcp_gateway demo_hitl_service \
            demo_agent_service demo_mcp_invest; do
  [[ -d "$BASEDIR/$_svc" ]] && ensure_service_env "$_svc"
done
unset _svc

# ── Tier 1: Demo API Server (Express) on :3001 ───────────────────────────────
echo "[LAUNCH] Starting Demo API Server on ${API_HOST}:${API_PORT}..."
(
  cd "$BASEDIR/demo_api_server"
  PORT=${API_PORT} \
  NODE_EXTRA_CA_CERTS="${NODE_EXTRA_CA_CERTS:-}" \
  REACT_APP_CLIENT_URL=${CLIENT_URL} \
  FRONTEND_ADMIN_URL=${CLIENT_URL}/admin \
  FRONTEND_DASHBOARD_URL=${CLIENT_URL}/dashboard \
  MCP_GATEWAY_HTTP_URL="${MCP_GATEWAY_HTTP_URL:-https://api.ping.demo:3005}" \
  VAULT_PASSWORD="${VAULT_PASSWORD:-}" \
  VAULT_PATH="${VAULT_PATH:-}" \
  npm start > "${LOG_API}" 2>&1
) &
echo $! > "$PID_API"

# Gate: Tier 2 blocked until API server is healthy
wait_for_health "${API_PORT}" "/api/healthz" 30 "Demo API Server" "${LOG_API}" >/dev/null

# ── Tier 2: MCP Server, Gateway, HITL ────────────────────────────────────────

# ── Demo MCP Server on :8080 ──────────────────────────────────────────────
if [[ -d "$BASEDIR/demo_mcp_server" ]]; then
  echo "[BOT] Starting Demo MCP Server on :8080..."
  (
    cd "$BASEDIR/demo_mcp_server"
    npm start > "${LOG_MCP}" 2>&1
  ) &
  echo $! > "$PID_MCP"
fi

# ── MCP Gateway on :3005 (Phase 243) ─────────────────────────────────────────
# Build is handled by the dependency check loop above — don't re-run it here,
# and don't swallow its errors silently (that's how MODULE_NOT_FOUND happens).
if [[ -d "$BASEDIR/demo_mcp_gateway" ]]; then
  echo "[SHIELD]  Starting MCP Gateway on :3005..."
  (
    cd "$BASEDIR/demo_mcp_gateway"
    VAULT_PASSWORD="${VAULT_PASSWORD:-}" \
    VAULT_PATH="${VAULT_PATH:-}" \
    npm start > "${LOG_GW}" 2>&1
  ) &
  echo $! > "$PID_GW"
fi

# ── HITL Service on :3009 ───────────────────────────────────────────────────
if [[ -d "$BASEDIR/demo_hitl_service" ]]; then
  echo "[ALERT] Starting HITL Service on :3009..."
  (
    cd "$BASEDIR/demo_hitl_service"
    PORT=3009 npm start > "${LOG_HITL}" 2>&1
  ) &
  echo $! > "$PID_HITL"
fi

# Wait for Tier 2 services; gate Tier 3 on gateway health
wait_for_health 8080 "/health" 25 "Demo MCP Server"  "${LOG_MCP}"  >/dev/null
wait_for_health 3005 "/health" 15 "MCP Gateway"      "${LOG_GW}"   >/dev/null
wait_for_health 3009 "/health" 15 "HITL Service"     "${LOG_HITL}" >/dev/null

# ── Tier 3: Agent Service, MCP Invest, Mortgage, UI, LangChain ───────────────

# ── Agent Service on :3006 ──────────────────────────────────────────────────
# dist/ is guaranteed by the dependency check loop above (it builds or aborts).
if [[ -d "$BASEDIR/demo_agent_service" ]]; then
  echo "[CONNECT] Starting Agent Service on :3006..."
  (
    cd "$BASEDIR/demo_agent_service"
    PORT=3006 \
    VAULT_PASSWORD="${VAULT_PASSWORD:-}" \
    VAULT_PATH="${VAULT_PATH:-}" \
    npm start > "${LOG_AGENT_SVC}" 2>&1
  ) &
  echo $! > "$PID_AGENT_SVC"
fi

# ── MCP Invest Server on :8081 ──────────────────────────────────────────────
if [[ -d "$BASEDIR/demo_mcp_invest" ]]; then
  echo "[INVEST] Starting MCP Invest Server on :8081..."
  (
    cd "$BASEDIR/demo_mcp_invest"
    PORT=8081 npm start > "${LOG_INVEST}" 2>&1
  ) &
  echo $! > "$PID_INVEST"
fi

# ── Mortgage Service on :8082 (Phase 266 Path A backend) ─────────────────────
# API-key-gated. Gateway swaps the user's OAuth bearer for X-API-Key and calls
# this service on the api_key disposition. Single GET /mortgage route returns
# a dummy mortgage record.
if [[ -d "$BASEDIR/demo_mortgage_service" ]]; then
  echo "[MORTGAGE] Starting Mortgage Service on :8082..."
  (
    cd "$BASEDIR/demo_mortgage_service"
    MORTGAGE_SERVICE_PORT=8082 npm start > "${LOG_MORTGAGE}" 2>&1
  ) &
  echo $! > "$PID_MORTGAGE"
fi

# ── Demo UI (CRA) on :4000 ────────────────────────────────────────────────
# Launched here (before the Tier 3 waits) so CRA's slow compile runs in parallel
# with the ~40s of agent/invest/mortgage health checks rather than after them.
# REACT_APP_API_PORT  → picked up by src/setupProxy.js to proxy /api/* to :3001
# REACT_APP_API_URL   → used by apiClient.js for absolute axios calls
# HOST                → binds CRA dev server to 0.0.0.0 so api.ping.demo resolves
# DANGEROUSLY_DISABLE_HOST_CHECK → allows non-localhost hostnames in CRA dev
echo "[WEB] Starting Demo UI on ${CLIENT_URL}..."
(
  cd "$BASEDIR/demo_api_ui"
  HOST=0.0.0.0 \
  PORT=${UI_PORT} \
  HTTPS=true \
  SSL_CRT_FILE=${CERT_FILE} \
  SSL_KEY_FILE=${KEY_FILE} \
  REACT_APP_API_URL=${API_URL} \
  REACT_APP_API_PORT=${API_PORT} \
  REACT_APP_API_HTTPS=true \
  REACT_APP_CLIENT_URL=${CLIENT_URL} \
  DANGEROUSLY_DISABLE_HOST_CHECK=true \
  WDS_SOCKET_PORT=0 \
  npm start > "${LOG_UI}" 2>&1
) &
echo $! > "$PID_UI"

# ── LangChain Agent (chat WS :8889 + health :8890) ───────────────────────────
# Entry point is src/main.py, run as a module (`python -m src.main`) — it is an
# asyncio app that manages its own websockets server (8889) and health server
# (8890); it is NOT a uvicorn ASGI app and there is no :8888 listener. It reads
# its own langchain_agent/.env via python-dotenv. The venv is `.venv`.
if [[ -f "$BASEDIR/langchain_agent/src/main.py" ]]; then
  echo "[CHAIN] Starting LangChain Agent (chat WS :8889, health :8890)..."
  (
    cd "$BASEDIR/langchain_agent"
    if [[ -x ".venv/bin/python" ]]; then
      PY=".venv/bin/python"
    elif [[ -x "venv/bin/python" ]]; then
      PY="venv/bin/python"
    else
      PY="python3"
    fi
    "$PY" -m src.main > "${LOG_AGENT}" 2>&1
  ) &
  echo $! > "$PID_AGENT"
fi

# Wait for Tier 3 services (UI and LangChain were launched above to run in parallel)
wait_for_health 3006 "/health" 15 "Agent Service"     "${LOG_AGENT_SVC}" >/dev/null
wait_for_health 8081 "/health" 15 "MCP Invest Server" "${LOG_INVEST}"    >/dev/null
wait_for_health 8082 "/health" 10 "Demo Mortgage"     "${LOG_MORTGAGE}"  >/dev/null
# UI: port-only (CRA has no /health endpoint); full 90s budget since UI launched before waits
wait_for_port "${UI_PORT}" 90 "Demo UI" >/dev/null
# LangChain: warn-only, not a gate
wait_for_health 8890 "/health" 20 "LangChain Agent" "${LOG_AGENT}" >/dev/null || true

# ── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  [CLEAR]  DEMO STATE CLEARED${RESET} — all in-memory state reset on startup:"
echo -e "${DIM}      Token chain · App events · MCP audit · Pending consents${RESET}"

echo ""
echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${CYAN}${BOLD}   [BANK]  AI DEMO — STATUS                           ${RESET}"
echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
print_status_table
echo ""
echo -e "${MAGENTA}${BOLD}  ┌─ PORTS ─────────────────────────────────────────────────────┐${RESET}"
echo -e "${MAGENTA}${BOLD}  │${RESET}  [PORT]  Demo API Server           :${API_PORT}  ${YELLOW}(HTTPS)${RESET}"
echo -e "${MAGENTA}${BOLD}  │${RESET}  [WEB]  Demo UI (React)        :${UI_PORT}  ${YELLOW}(HTTPS)${RESET}"
echo -e "${MAGENTA}${BOLD}  │${RESET}  [BOT]  Demo MCP Server           :8080  ${YELLOW}(WebSocket)${RESET}"
echo -e "${MAGENTA}${BOLD}  │${RESET}  [CHAIN]  LangChain Agent           :8888  ${YELLOW}(HTTP/HTTPS)${RESET}"
echo -e "${MAGENTA}${BOLD}  └─────────────────────────────────────────────────────────────┘${RESET}"
echo ""
echo -e "${GREEN}${BOLD}  ┌─ URLS ──────────────────────────────────────────────────────┐${RESET}"
echo -e "${GREEN}${BOLD}  │${RESET}  [WEB]  App            ${YELLOW}${BOLD}${CLIENT_URL}${RESET}"
echo -e "${GREEN}${BOLD}  │${RESET}  [CONFIG]   Admin Config   ${YELLOW}${BOLD}${CLIENT_URL}/config${RESET}"
echo -e "${GREEN}${BOLD}  │${RESET}  [SSL]  Admin Login    ${YELLOW}${BOLD}${API_URL}/api/auth/oauth/login${RESET}"
echo -e "${GREEN}${BOLD}  │${RESET}  [USER]  User Login     ${YELLOW}${BOLD}${API_URL}/api/auth/oauth/user/login${RESET}"
echo -e "${GREEN}${BOLD}  └─────────────────────────────────────────────────────────────┘${RESET}"
echo ""
echo -e "${MAGENTA}${BOLD}  ┌─ QUICK START ───────────────────────────────────────────────┐${RESET}"
echo -e "${MAGENTA}${BOLD}  │${RESET}  1. Open ${YELLOW}${CLIENT_URL}/config${RESET} → enter PingOne credentials"
echo -e "${MAGENTA}${BOLD}  │${RESET}  2. Open ${YELLOW}${CLIENT_URL}${RESET} → click ${WHITE}${BOLD}Login${RESET} to start an OAuth flow"
echo -e "${MAGENTA}${BOLD}  │${RESET}  3. After login: use the [BOT] FAB (bottom-right) for the Demo Agent"
echo -e "${MAGENTA}${BOLD}  │${RESET}     Ask: balance, accounts, transactions, transfer, withdraw"
echo -e "${MAGENTA}${BOLD}  └─────────────────────────────────────────────────────────────┘${RESET}"
echo ""
echo -e "${WHITE}${BOLD}  ┌─ MANAGE ────────────────────────────────────────────────────┐${RESET}"
echo -e "${WHITE}${BOLD}  │${RESET}  ${BOLD}./run-demo.sh status${RESET}   — live service health check"
echo -e "${WHITE}${BOLD}  │${RESET}  ${BOLD}./run-demo.sh tail${RESET}     — pick log (or ${DIM}./run-demo.sh tail all${RESET})"
echo -e "${WHITE}${BOLD}  │${RESET}  ${BOLD}./run-demo.sh stop${RESET}     — stop all services"
echo -e "${WHITE}${BOLD}  │${RESET}  ${DIM}tail -f ${LOG_API}${RESET}"
echo -e "${WHITE}${BOLD}  │${RESET}  ${DIM}tail -f ${LOG_UI}${RESET}"
echo -e "${WHITE}${BOLD}  │${RESET}  ${DIM}tail -f ${LOG_MCP}${RESET}"
echo -e "${WHITE}${BOLD}  └─────────────────────────────────────────────────────────────┘${RESET}"
echo ""
echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

tail_demo_logs
