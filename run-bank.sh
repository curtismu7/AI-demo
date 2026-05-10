#!/usr/bin/env bash
# run-bank.sh — Primary startup script for the Banking Digital Assistant.
# Runs on api.ping.demo (HTTPS).
#
# Port layout:
#   Banking API Server  → https://api.ping.demo:3001
#   Banking UI          → https://api.ping.demo:4000
#   Banking MCP Server  → localhost:8080
#   LangChain Agent     → localhost:8888
#
# One-time setup (run once each, requires sudo for /etc/hosts):
#   echo '127.0.0.1  api.ping.demo' | sudo tee -a /etc/hosts
#   mkcert -install   # install local CA (once per machine)
#
# Usage:
#   ./run-bank.sh              # start all services (optional: tail prompt at end if TTY)
#   ./run-bank.sh stop         # stop all services (process trees + listeners)
#   ./run-bank.sh restart      # stop then start
#   ./run-bank.sh status       # live service health check
#   ./run-bank.sh tail         # pick a log by number or 'all' (all logs at once)
#   ./run-bank.sh tail 2       # tail UI log directly (no prompt)
#   ./run-bank.sh tail all     # tail -f all log files together (interleaved)
#   ./run-bank.sh test         # run full test suite
#   ./run-bank.sh help         # show this help message

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
PID_API=/tmp/bank-api-server.pid
PID_MCP=/tmp/bank-mcp-server.pid
PID_AGENT=/tmp/bank-langchain-agent.pid
PID_UI=/tmp/bank-ui.pid

LOG_API=/tmp/bank-api-server.log
LOG_UI=/tmp/bank-ui.log
LOG_MCP=/tmp/bank-mcp-server.log
LOG_AGENT=/tmp/bank-langchain-agent.log
LOG_MCP_TRAFFIC=/tmp/bank-mcp-traffic.log
PID_GW=/tmp/bank-mcp-gateway.pid
LOG_GW=/tmp/bank-mcp-gateway.log
PID_HITL=/tmp/bank-hitl-service.pid
LOG_HITL=/tmp/bank-hitl-service.log
PID_AGENT_SVC=/tmp/bank-agent-service.pid
LOG_AGENT_SVC=/tmp/bank-agent-service.log
PID_INVEST=/tmp/bank-mcp-invest.pid
LOG_INVEST=/tmp/bank-mcp-invest.log
LOG_AUTH=/tmp/bank-authorize-server.log
LOG_HELIX=/tmp/bank-helix.log

# Pre-create all log files so tail/log viewers work before services start.
# We TRUNCATE here (not just touch) — services that get skipped or fail to relaunch
# would otherwise leave stale errors from a prior run, which is misleading when
# debugging the current startup. Only run on `start` to keep `status`/`tail` safe.
if [[ "${1:-start}" == "start" || "${1:-start}" == "restart" || -z "${1:-}" ]]; then
  for _logf in "${LOG_API}" "${LOG_UI}" "${LOG_MCP}" "${LOG_AGENT}" "${LOG_MCP_TRAFFIC}" \
               "${LOG_GW}" "${LOG_HITL}" "${LOG_AGENT_SVC}" "${LOG_INVEST}" "${LOG_AUTH}" \
               "${LOG_HELIX}"; do
    : > "${_logf}" 2>/dev/null || true
  done
else
  touch "${LOG_API}" "${LOG_UI}" "${LOG_MCP}" "${LOG_AGENT}" "${LOG_MCP_TRAFFIC}" \
        "${LOG_GW}" "${LOG_HITL}" "${LOG_AGENT_SVC}" "${LOG_INVEST}" "${LOG_AUTH}" \
        "${LOG_HELIX}" 2>/dev/null || true
fi

# Terminal colors (global — used by banner, status, and tail_bank_logs)
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

# Must match root package.json#engines.node (currently "20.x").
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
  if [[ "${current}" == "${NODE_MIN_VERSION}" ]]; then
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
    err "Node major ${NODE_MIN_VERSION} required, but this shell is using Node v${current}."
  fi
  echo ""
  echo "  Fix (zsh/bash) — load nvm into this shell, then install/select Node ${NODE_MIN_VERSION}:"
  echo "    export NVM_DIR=\"\$HOME/.nvm\""
  echo "    [ -s \"\$NVM_DIR/nvm.sh\" ] && \\. \"\$NVM_DIR/nvm.sh\""
  echo "    nvm install ${NODE_MIN_VERSION} && nvm use ${NODE_MIN_VERSION}"
  echo ""
  echo "  Persist for future shells: append the two export/source lines above to"
  echo "    ~/.zshrc (zsh)   or   ~/.bashrc (bash)"
  echo ""
  echo "  No nvm yet? Install: https://github.com/nvm-sh/nvm#installing-and-updating"
  echo ""
  echo "  Then re-run from the banking-demo repo:  ./run-bank.sh"
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
  if [[ ! -f "${BASEDIR}/banking_api_server/.env" ]]; then
    warn "banking_api_server/.env not found — copy env.example and fill in PingOne credentials"
  else
    ok "banking_api_server/.env exists"
  fi

  # Port conflicts (check for non-Banking listeners)
  for port in "${API_PORT}" "${UI_PORT}" 8080 8888; do
    if port_listening "${port}"; then
      warn "Port ${port} is already in use (will be stopped before start)"
    fi
  done

  # Ollama (local LLM for NL intent fallback) — optional but recommended
  local ollama_model="${OLLAMA_MODEL:-llama3.2}"
  if ! command -v ollama >/dev/null 2>&1; then
    warn "ollama not found — NL fallback LLM disabled. Install: https://ollama.ai"
  elif port_listening 11434; then
    ok "Ollama running on :11434 — model: ${ollama_model}"
  else
    echo -e "  ${CYAN}[SPIN]${RESET}  Starting Ollama (model: ${ollama_model})…"
    ollama serve > /tmp/bank-ollama.log 2>&1 &
    echo $! > /tmp/bank-ollama.pid
    # Give it a moment to start
    local i=0
    while [[ $i -lt 8 ]]; do
      port_listening 11434 && break
      sleep 1; (( i++ )) || true
    done
    if port_listening 11434; then
      ok "Ollama started on :11434 — model: ${ollama_model}"
    else
      warn "Ollama did not start on :11434 — check /tmp/bank-ollama.log"
    fi
  fi

  ok "Pre-flight checks passed"
  echo ""
}

# ── Tail logs (pick one by number, or all at once) ────────────────────────────
tail_bank_logs() {
  local pre="${1:-}"
  [[ "${pre}" == "ALL" || "${pre}" == "All" ]] && pre="all"
  local names=("Banking API" "Banking UI" "MCP Server" "LangChain Agent" "MCP Traffic" "MCP Gateway" "HITL Service" "Agent Service" "MCP Invest" "Authorize Server" "Helix LLM")
  local logs=("${LOG_API}" "${LOG_UI}" "${LOG_MCP}" "${LOG_AGENT}" "${LOG_MCP_TRAFFIC}" "${LOG_GW}" "${LOG_HITL}" "${LOG_AGENT_SVC}" "${LOG_INVEST}" "${LOG_AUTH}" "${LOG_HELIX}")
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
      echo "WARNING:  No log files found yet. Start services with ./run-bank.sh first."
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
  for port in 3001 4000 8080 8888 3005 3006 3009 8081; do
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
  for port in 3001 4000 8080 8888 3005 3006 3009 8081; do
    pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
    for pid in $pids; do
      [[ -z "$pid" ]] && continue
      if kill -KILL "$pid" 2>/dev/null; then
        echo "   Force-killed PID ${pid} still on :${port}"
      fi
    done
  done
}

# Wait for a port with a timeout; prints 'up' or 'timeout'
wait_for_port() {
  local port="$1" timeout="${2:-25}" i=0
  while [[ $i -lt $timeout ]]; do
    port_listening "$port" && echo "up" && return 0
    sleep 1
    (( i++ )) || true
  done
  echo "timeout"
}

# Print a single-line status row for a service
service_status_line() {
  local label="$1" port="$2" url="${3:-}"
  if port_listening "$port"; then
    printf "  ${GREEN}${BOLD}  [OK]  %-24s${RESET}  ${MAGENTA}:%-6s${RESET}  ${YELLOW}%s${RESET}\n" "$label" "$port" "$url"
  else
    printf "  ${RED}${BOLD}  [ERROR]  %-24s${RESET}  ${MAGENTA}:%-6s${RESET}  ${DIM}not yet ready${RESET}\n" "$label" "$port"
  fi
}

# Print the full status table (used by both 'start' and 'status' subcommands)
print_status_table() {
  echo -e "${WHITE}${BOLD}  SERVICES${RESET}"
  service_status_line "Banking API Server"  ${API_PORT}  "${API_URL}"
  service_status_line "Banking MCP Server"  8080         "ws://localhost:8080 (internal)"
  service_status_line "MCP Gateway"          3005         "http://localhost:3005 (internal)"
  service_status_line "MCP Invest Server"   8081         "ws://localhost:8081 (internal)"
  service_status_line "Agent Service"       3006         "http://localhost:3006 (internal)"
  service_status_line "HITL Service"        3009         "http://localhost:3009 (internal)"
  service_status_line "LangChain Agent"     8888         "http://localhost:8888 (internal)"
  if port_listening ${UI_PORT}; then
    printf "  ${GREEN}${BOLD}  [OK]  %-24s${RESET}  ${MAGENTA}:%-6s${RESET}  ${YELLOW}%s${RESET}\n" "Banking UI (React)" "${UI_PORT}" "${CLIENT_URL}"
  else
    printf "  ${YELLOW}  [WAIT]  %-24s${RESET}  ${MAGENTA}:%-6s${RESET}  ${DIM}compiling… %s${RESET}\n" "Banking UI (React)" "${UI_PORT}" "${CLIENT_URL}"
  fi
}

# ── Subcommand: stop ─────────────────────────────────────────────────────────
cmd_stop() {
  echo "[STOP] Stopping Banking services (run-bank.sh)..."
  set +e
  for pid_file in "$PID_API" "$PID_MCP" "$PID_GW" "$PID_HITL" "$PID_AGENT_SVC" "$PID_INVEST" "$PID_AGENT" "$PID_UI"; do
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
  echo "   Sweeping ports (API :${API_PORT}, UI :${UI_PORT}, MCP :8080, GW :3005, Agent :3006, HITL :3009, Invest :8081)…"
  stop_listeners_on_banking_ports
  sleep 1
  force_kill_listeners_on_banking_ports
  set -euo pipefail
  echo "[OK] All Banking listeners stopped (or none were running)."
}

# ── Subcommand: test ─────────────────────────────────────────────────────────
cmd_test() {
  echo ""
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${CYAN}${BOLD}   [BANK]  SUPER BANK — TEST SUITE                                   ${RESET}"
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""

  local failed=0

  if [[ -d "${BASEDIR}/banking_api_server" ]]; then
    echo -e "  ${CYAN}→${RESET}  Running banking_api_server tests..."
    if (cd "${BASEDIR}/banking_api_server" && npm test -- --passWithNoTests 2>&1); then
      ok "banking_api_server tests passed"
    else
      err "banking_api_server tests FAILED"
      failed=$((failed + 1))
    fi
  fi

  if [[ -d "${BASEDIR}/banking_api_ui" ]]; then
    if grep -q '"test"' "${BASEDIR}/banking_api_ui/package.json" 2>/dev/null; then
      echo -e "  ${CYAN}→${RESET}  Running banking_api_ui tests..."
      if (cd "${BASEDIR}/banking_api_ui" && CI=true npm test -- --watchAll=false --passWithNoTests 2>&1); then
        ok "banking_api_ui tests passed"
      else
        err "banking_api_ui tests FAILED"
        failed=$((failed + 1))
      fi
    fi
  fi

  if [[ -d "${BASEDIR}/banking_mcp_server" ]]; then
    if grep -q '"test"' "${BASEDIR}/banking_mcp_server/package.json" 2>/dev/null; then
      echo -e "  ${CYAN}→${RESET}  Running banking_mcp_server tests..."
      if (cd "${BASEDIR}/banking_mcp_server" && npm test -- --passWithNoTests 2>&1); then
        ok "banking_mcp_server tests passed"
      else
        err "banking_mcp_server tests FAILED"
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
  echo -e "${CYAN}${BOLD}   [BANK]  SUPER BANK BANKING DEMO — run-bank.sh                      ${RESET}"
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
  echo -e "${WHITE}${BOLD}  Usage:${RESET} ./run-bank.sh <command>"
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
  echo "    Banking API Server   :${API_PORT}  (HTTPS)"
  echo "    Banking UI (React)   :${UI_PORT}  (HTTPS)"
  echo "    Banking MCP Server   :8080
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
    echo -e "${CYAN}${BOLD}   [BANK]  SUPER BANK — SERVICE STATUS                                ${RESET}"
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
    tail_bank_logs "${2:-}"
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
  echo -e "${YELLOW}  [SPIN]  Stopping existing Banking services…${RESET}"
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
# need extra `npm install` flags (banking_api_ui needs --legacy-peer-deps for
# CRA/typescript peerOptional). Loud failure on any error — silent skips here
# are exactly how we got cryptic MODULE_NOT_FOUND in service logs.
SVC_LIST=(banking_api_server banking_mcp_server banking_api_ui      banking_mcp_gateway banking_hitl_service banking_agent_service banking_mcp_invest)
SVC_BUILD=(""                "ts"               ""                  "ts"                ""                   "ts"                  "ts")
SVC_INSTALL_FLAGS=(""        ""                 "--legacy-peer-deps" ""                  ""                   ""                    "")

for i in "${!SVC_LIST[@]}"; do
  svc="${SVC_LIST[$i]}"
  [[ -d "$BASEDIR/$svc" ]] || continue

  if [[ ! -d "$BASEDIR/$svc/node_modules" ]]; then
    echo "[PKG] Installing dependencies for $svc..."
    if ! (cd "$BASEDIR/$svc" && npm install ${SVC_INSTALL_FLAGS[$i]}); then
      err "npm install failed for $svc — aborting startup."
      err "  Fix the error above (often a network or registry issue), then re-run ./run-bank.sh"
      exit 1
    fi
  fi

  if [[ "${SVC_BUILD[$i]}" == "ts" ]] && [[ ! -f "$BASEDIR/$svc/dist/index.js" ]]; then
    echo "[BUILD] Compiling TypeScript for $svc..."
    if ! (cd "$BASEDIR/$svc" && npm run build); then
      err "Build failed for $svc — aborting startup."
      err "  Fix the TypeScript errors above, then re-run ./run-bank.sh"
      exit 1
    fi
  fi
done

# ── Banking API Server (Express) on :3001 ────────────────────────────────────
echo "[LAUNCH] Starting Banking API Server on ${API_HOST}:${API_PORT}..."
(
  cd "$BASEDIR/banking_api_server"
  PORT=${API_PORT} \
  REACT_APP_CLIENT_URL=${CLIENT_URL} \
  FRONTEND_ADMIN_URL=${CLIENT_URL}/admin \
  FRONTEND_DASHBOARD_URL=${CLIENT_URL}/dashboard \
  MCP_GATEWAY_HTTP_URL="${MCP_GATEWAY_HTTP_URL:-https://api.ping.demo:3005}" \
  npm start > /tmp/bank-api-server.log 2>&1
) &
echo $! > "$PID_API"

sleep 1

# ── Banking MCP Server on :8080 ──────────────────────────────────────────────
if [[ -d "$BASEDIR/banking_mcp_server" ]]; then
  echo "[BOT] Starting Banking MCP Server on :8080..."
  (
    cd "$BASEDIR/banking_mcp_server"
    cp .env.development .env 2>/dev/null || true
    npm start > /tmp/bank-mcp-server.log 2>&1
  ) &
  echo $! > "$PID_MCP"
fi

# ── MCP Gateway on :3005 (Phase 243) ────────────────────────────────────────────
# Build is handled by the dependency check loop above — don't re-run it here,
# and don't swallow its errors silently (that's how MODULE_NOT_FOUND happens).
if [[ -d "$BASEDIR/banking_mcp_gateway" ]]; then
  echo "[SHIELD]  Starting MCP Gateway on :3005..."
  (
    cd "$BASEDIR/banking_mcp_gateway"
    [[ -f .env.development ]] && cp .env.development .env 2>/dev/null || true
    npm start > "${LOG_GW}" 2>&1
  ) &
  echo $! > "$PID_GW"
fi

# ── HITL Service on :3009 ───────────────────────────────────────────────────
if [[ -d "$BASEDIR/banking_hitl_service" ]]; then
  echo "[ALERT] Starting HITL Service on :3009..."
  (
    cd "$BASEDIR/banking_hitl_service"
    [[ -f .env.development ]] && cp .env.development .env 2>/dev/null || true
    PORT=3009 npm start > "${LOG_HITL}" 2>&1
  ) &
  echo $! > "$PID_HITL"
fi

# ── Agent Service on :3006 ──────────────────────────────────────────────────
# dist/ is guaranteed by the dependency check loop above (it builds or aborts).
if [[ -d "$BASEDIR/banking_agent_service" ]]; then
  echo "[CONNECT] Starting Agent Service on :3006..."
  (
    cd "$BASEDIR/banking_agent_service"
    [[ -f .env.development ]] && cp .env.development .env 2>/dev/null || true
    PORT=3006 npm start > "${LOG_AGENT_SVC}" 2>&1
  ) &
  echo $! > "$PID_AGENT_SVC"
fi

# ── MCP Invest Server on :8081 ──────────────────────────────────────────────
if [[ -d "$BASEDIR/banking_mcp_invest" ]]; then
  echo "[INVEST] Starting MCP Invest Server on :8081..."
  (
    cd "$BASEDIR/banking_mcp_invest"
    [[ -f .env.development ]] && cp .env.development .env 2>/dev/null || true
    PORT=8081 npm start > "${LOG_INVEST}" 2>&1
  ) &
  echo $! > "$PID_INVEST"
fi

# ── LangChain Agent on :8888 ─────────────────────────────────────────────────
if [[ -f "$BASEDIR/langchain_agent/main.py" ]] || [[ -f "$BASEDIR/langchain_agent/server.py" ]]; then
  ENTRY="main"
  [[ -f "$BASEDIR/langchain_agent/server.py" ]] && ENTRY="server"
  echo "[CHAIN] Starting LangChain Agent on :8888 (HTTPS if certs available)..."
  (
    cd "$BASEDIR/langchain_agent"
    [[ -d venv ]] && source venv/bin/activate
    if [[ -f "${CERT_FILE}" ]] && [[ -f "${KEY_FILE}" ]]; then
      python3 -m uvicorn "${ENTRY}:app" --port 8888 \
        --ssl-keyfile "${KEY_FILE}" --ssl-certfile "${CERT_FILE}" \
        > /tmp/bank-langchain-agent.log 2>&1
    else
      python3 -m uvicorn "${ENTRY}:app" --port 8888 > /tmp/bank-langchain-agent.log 2>&1
    fi
  ) &
  echo $! > "$PID_AGENT"
fi

# ── Banking UI (CRA) on :4000 ────────────────────────────────────────────────
# REACT_APP_API_PORT  → picked up by src/setupProxy.js to proxy /api/* to :3001
# REACT_APP_API_URL   → used by apiClient.js for absolute axios calls
# HOST                → binds CRA dev server to 0.0.0.0 so api.ping.demo resolves
# DANGEROUSLY_DISABLE_HOST_CHECK → allows non-localhost hostnames in CRA dev
echo "[WEB] Starting Banking UI on ${CLIENT_URL}..."
(
  cd "$BASEDIR/banking_api_ui"
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
  npm start > /tmp/bank-ui.log 2>&1
) &
echo $! > "$PID_UI"

# ── Banner + health check ────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${CYAN}${BOLD}   [BANK]  SUPER BANK BANKING DEMO — STARTING                         ${RESET}"
echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "${DIM}  Waiting for Banking API and MCP Server to come up…${RESET}"

wait_for_port "${API_PORT}" 25 >/dev/null
wait_for_port 8080 25 >/dev/null
sleep 1   # give LangChain agent a moment too

echo -e "${GREEN}${BOLD}  [CLEAR]  DEMO STATE CLEARED${RESET} — all in-memory state reset on startup:"
echo -e "${DIM}      Token chain · App events · MCP audit · Pending consents${RESET}"

echo ""
echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${CYAN}${BOLD}   [BANK]  SUPER BANK BANKING DEMO — STATUS                           ${RESET}"
echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
print_status_table
echo ""
echo -e "${MAGENTA}${BOLD}  ┌─ PORTS ─────────────────────────────────────────────────────┐${RESET}"
echo -e "${MAGENTA}${BOLD}  │${RESET}  [PORT]  Banking API Server        :${API_PORT}  ${YELLOW}(HTTPS)${RESET}"
echo -e "${MAGENTA}${BOLD}  │${RESET}  [WEB]  Banking UI (React)        :${UI_PORT}  ${YELLOW}(HTTPS)${RESET}"
echo -e "${MAGENTA}${BOLD}  │${RESET}  [BOT]  Banking MCP Server        :8080  ${YELLOW}(WebSocket)${RESET}"
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
echo -e "${MAGENTA}${BOLD}  │${RESET}  3. After login: use the [BOT] FAB (bottom-right) for BankingAgent"
echo -e "${MAGENTA}${BOLD}  │${RESET}     Ask: balance, accounts, transactions, transfer, withdraw"
echo -e "${MAGENTA}${BOLD}  └─────────────────────────────────────────────────────────────┘${RESET}"
echo ""
echo -e "${WHITE}${BOLD}  ┌─ MANAGE ────────────────────────────────────────────────────┐${RESET}"
echo -e "${WHITE}${BOLD}  │${RESET}  ${BOLD}./run-bank.sh status${RESET}   — live service health check"
echo -e "${WHITE}${BOLD}  │${RESET}  ${BOLD}./run-bank.sh tail${RESET}     — pick log (or ${DIM}./run-bank.sh tail all${RESET})"
echo -e "${WHITE}${BOLD}  │${RESET}  ${BOLD}./run-bank.sh stop${RESET}     — stop all services"
echo -e "${WHITE}${BOLD}  │${RESET}  ${DIM}tail -f ${LOG_API}${RESET}"
echo -e "${WHITE}${BOLD}  │${RESET}  ${DIM}tail -f ${LOG_UI}${RESET}"
echo -e "${WHITE}${BOLD}  │${RESET}  ${DIM}tail -f ${LOG_MCP}${RESET}"
echo -e "${WHITE}${BOLD}  └─────────────────────────────────────────────────────────────┘${RESET}"
echo ""
echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

tail_bank_logs
