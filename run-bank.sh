#!/usr/bin/env bash
# run-bank.sh — Primary startup script for the Banking Digital Assistant.
# Runs on api.pingdemo.com (HTTPS) so it can coexist with MasterFlow
# (OAuth Playground) on :3000 / :3001.
#
# Port layout:
#   Banking API Server  → https://api.pingdemo.com:3002
#   Banking UI          → https://api.pingdemo.com:4000
#   Banking MCP Server  → localhost:8080
#   LangChain Agent     → localhost:8888
#
# One-time setup (run once each, requires sudo for /etc/hosts):
#   echo '127.0.0.1  api.pingdemo.com' | sudo tee -a /etc/hosts
#   mkcert -install   # install local CA (once per machine)
#
# Usage:
#   ./run-bank.sh              # start all services (optional: tail prompt at end if TTY)
#   ./run-bank.sh stop         # stop all services (process trees + listeners)
#   ./run-bank.sh restart      # stop then start
#   ./run-bank.sh status       # live service health check
#   ./run-bank.sh tail         # pick 1–4 (one log) or 5 / all (all logs at once)
#   ./run-bank.sh tail 2       # tail UI log directly (no prompt)
#   ./run-bank.sh tail all     # tail -f all log files together (interleaved)
#   ./run-bank.sh test         # run full test suite
#   ./run-bank.sh help         # show this help message

set -euo pipefail

BASEDIR="$(cd "$(dirname "$0")" && pwd)"

API_HOST="api.pingdemo.com"
API_PORT=3002
UI_PORT=4000
API_URL="https://${API_HOST}:${API_PORT}"
CLIENT_URL="https://${API_HOST}:${UI_PORT}"

CERT_DIR="${BASEDIR}/certs"
CERT_FILE="${CERT_DIR}/api.pingdemo.com+2.pem"
KEY_FILE="${CERT_DIR}/api.pingdemo.com+2-key.pem"

# ── /etc/hosts check ─────────────────────────────────────────────────────────────────
if ! grep -q "${API_HOST}" /etc/hosts 2>/dev/null; then
  echo "⚠️  ${API_HOST} is not in /etc/hosts."
  echo "   Run this once to add it, then restart the script:"
  echo "   echo '127.0.0.1  ${API_HOST}' | sudo tee -a /etc/hosts"
  echo ""
  echo "   Continuing with localhost fallback for now..."
  API_URL="https://localhost:${API_PORT}"
  CLIENT_URL="https://localhost:${UI_PORT}"
fi

# ── SSL cert check / auto-generate ───────────────────────────────────────────
if [[ ! -f "${CERT_FILE}" ]] || [[ ! -f "${KEY_FILE}" ]]; then
  if command -v mkcert &>/dev/null; then
    echo "🔐 Generating SSL certs for ${API_HOST}..."
    mkdir -p "${CERT_DIR}"
    (cd "${CERT_DIR}" && mkcert "${API_HOST}" localhost 127.0.0.1)
    echo "✅ Certs created in ${CERT_DIR}"
  else
    echo "⚠️  mkcert not found — install with: brew install mkcert && mkcert -install"
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

NODE_MIN_VERSION=16

# ── Helpers ──────────────────────────────────────────────────────────────────
ok()   { echo -e "  ${GREEN}✓${RESET}  $1"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}  $1"; }
err()  { echo -e "  ${RED}✗${RESET}  $1" >&2; }

# Check if a TCP port is listening locally
port_listening() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1
}

# ── Pre-flight checks ───────────────────────────────────────────────────────
preflight_checks() {
  echo ""
  echo -e "${WHITE}${BOLD}  PRE-FLIGHT CHECKS${RESET}"

  # Node.js
  if ! command -v node >/dev/null 2>&1; then
    err "Node.js is not installed. Install from https://nodejs.org"
    exit 1
  fi
  local node_version
  node_version=$(node -e "process.stdout.write(process.version.replace('v','').split('.')[0])")
  if [[ "${node_version}" -lt "${NODE_MIN_VERSION}" ]]; then
    err "Node.js v${NODE_MIN_VERSION}+ required (found v${node_version})"
    exit 1
  fi
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

  ok "Pre-flight checks passed"
  echo ""
}

# ── Tail logs (one log 1–4, or all at once: 5 / all) ─────────────────────────
tail_bank_logs() {
  local pre="${1:-}"
  [[ "${pre}" == "ALL" || "${pre}" == "All" ]] && pre="all"
  local names=("Banking API" "Banking UI" "MCP Server" "LangChain Agent")
  local logs=("${LOG_API}" "${LOG_UI}" "${LOG_MCP}" "${LOG_AGENT}")
  local choice=""

  echo ""
  echo -e "${CYAN}Pick a log to follow (tail -f). Ctrl+C stops tail only.${RESET}"
  for i in 0 1 2 3; do
    echo "  $((i + 1))) ${names[i]}"
    echo "      ${logs[i]}"
  done
  echo "  5) All of the above (same terminal, interleaved with file headers)"
  if [[ -n "${pre}" ]]; then
    choice="${pre}"
  else
    read -r -p "Number [1-5] or 'all': " choice
  fi
  [[ "${choice}" == "ALL" || "${choice}" == "All" ]] && choice="all"

  case "${choice}" in
    1|2|3|4)
      local idx=$((choice - 1))
      local f="${logs[$idx]}"
      if [[ ! -f "${f}" ]]; then
        echo "⚠️  Log file does not exist yet: ${f}"
        echo "   (Start services first, or pick another number.)"
        exit 1
      fi
      echo "📜 Tailing ${names[$idx]} ..."
      tail -f "${f}"
      ;;
    5|all)
      local existing=()
      local f
      for f in "${logs[@]}"; do
        if [[ -f "${f}" ]]; then
          existing+=("${f}")
        else
          echo "⚠️  Skipping (not yet created): ${f}"
        fi
      done
      if [[ ${#existing[@]} -eq 0 ]]; then
        echo "⚠️  No log files found yet. Start services with ./run-bank.sh first."
        exit 1
      fi
      echo "📜 Tailing ${#existing[@]} log file(s) together (interleaved). Ctrl+C stops."
      tail -f "${existing[@]}"
      ;;
    *)
      echo "Invalid choice (use 1–5, or 'all')."
      exit 1
      ;;
  esac
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
  for port in 3002 4000 8080 8888; do
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
  for port in 3002 4000 8080 8888; do
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
    printf "  ${GREEN}${BOLD}  ✅  %-24s${RESET}  ${MAGENTA}:%-6s${RESET}  ${YELLOW}%s${RESET}\n" "$label" "$port" "$url"
  else
    printf "  ${RED}${BOLD}  ❌  %-24s${RESET}  ${MAGENTA}:%-6s${RESET}  ${DIM}not yet ready${RESET}\n" "$label" "$port"
  fi
}

# Print the full status table (used by both 'start' and 'status' subcommands)
print_status_table() {
  echo -e "${WHITE}${BOLD}  SERVICES${RESET}"
  service_status_line "Banking API Server"  ${API_PORT}  "${API_URL}"
  service_status_line "Banking MCP Server"  8080         "ws://localhost:8080"
  service_status_line "LangChain Agent"     8888         "http://localhost:8888"
  if port_listening ${UI_PORT}; then
    printf "  ${GREEN}${BOLD}  ✅  %-24s${RESET}  ${MAGENTA}:%-6s${RESET}  ${YELLOW}%s${RESET}\n" "Banking UI (React)" "${UI_PORT}" "${CLIENT_URL}"
  else
    printf "  ${YELLOW}  ⏳  %-24s${RESET}  ${MAGENTA}:%-6s${RESET}  ${DIM}compiling… %s${RESET}\n" "Banking UI (React)" "${UI_PORT}" "${CLIENT_URL}"
  fi
}

# ── Subcommand: stop ─────────────────────────────────────────────────────────
cmd_stop() {
  echo "🛑 Stopping Banking services (run-bank.sh)..."
  set +e
  for pid_file in "$PID_API" "$PID_MCP" "$PID_AGENT" "$PID_UI"; do
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
  echo "   Sweeping ports (API :${API_PORT}, UI :${UI_PORT}, MCP :8080, Agent :8888)…"
  stop_listeners_on_banking_ports
  sleep 1
  force_kill_listeners_on_banking_ports
  set -euo pipefail
  echo "✅ All Banking listeners stopped (or none were running)."
}

# ── Subcommand: test ─────────────────────────────────────────────────────────
cmd_test() {
  echo ""
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${CYAN}${BOLD}   🏦  SUPER BANK — TEST SUITE                                   ${RESET}"
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
  echo -e "${CYAN}${BOLD}   🏦  SUPER BANK BANKING DEMO — run-bank.sh                      ${RESET}"
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
  echo -e "${WHITE}${BOLD}  Usage:${RESET} ./run-bank.sh <command>"
  echo ""
  echo -e "${WHITE}${BOLD}  Commands:${RESET}"
  echo "    (default)  Start all services (HTTPS on api.pingdemo.com)"
  echo "    stop       Stop all services gracefully (process tree + port sweep)"
  echo "    restart    Stop then start all services"
  echo "    status     Show running/stopped status with ports and URLs"
  echo "    tail       Pick a log to follow (1–4 for individual, 5/all for all)"
  echo "    tail N     Tail a specific log directly (1=API, 2=UI, 3=MCP, 4=Agent)"
  echo "    test       Run full test suite (API, UI, MCP)"
  echo "    help       Show this message"
  echo ""
  echo -e "${WHITE}${BOLD}  Port Layout:${RESET}"
  echo "    Banking API Server   :${API_PORT}  (HTTPS)"
  echo "    Banking UI (React)   :${UI_PORT}  (HTTPS)"
  echo "    Banking MCP Server   :8080"
  echo "    LangChain Agent      :8888"
  echo ""
  echo -e "${WHITE}${BOLD}  Log Files:${RESET}"
  echo "    ${LOG_API}"
  echo "    ${LOG_UI}"
  echo "    ${LOG_MCP}"
  echo "    ${LOG_AGENT}"
  echo ""
  echo -e "${WHITE}${BOLD}  One-time Setup:${RESET}"
  echo "    echo '127.0.0.1  api.pingdemo.com' | sudo tee -a /etc/hosts"
  echo "    mkcert -install && cd certs && mkcert api.pingdemo.com localhost 127.0.0.1"
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
    echo -e "${CYAN}${BOLD}   🏦  SUPER BANK — SERVICE STATUS                                ${RESET}"
    echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo ""
    print_status_table
    echo ""
    echo -e "${GREEN}${BOLD}  ┌─ URLS ──────────────────────────────────────────────────────┐${RESET}"
    echo -e "${GREEN}${BOLD}  │${RESET}  🌐  App           ${YELLOW}${BOLD}${CLIENT_URL}${RESET}"
    echo -e "${GREEN}${BOLD}  │${RESET}  ⚙️   Admin Config  ${YELLOW}${BOLD}${CLIENT_URL}/config${RESET}"
    echo -e "${GREEN}${BOLD}  │${RESET}  🔐  Admin Login   ${YELLOW}${BOLD}${API_URL}/api/auth/oauth/login${RESET}"
    echo -e "${GREEN}${BOLD}  │${RESET}  👤  User Login    ${YELLOW}${BOLD}${API_URL}/api/auth/oauth/user/login${RESET}"
    echo -e "${GREEN}${BOLD}  └─────────────────────────────────────────────────────────────┘${RESET}"
    echo ""
    echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo ""
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
  echo -e "${YELLOW}  ⟳  Stopping existing Banking services…${RESET}"
  set +e
  for _pf in "$PID_API" "$PID_MCP" "$PID_AGENT" "$PID_UI"; do
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
  echo -e "${GREEN}  ✅  Previous services stopped.${RESET}"
  echo ""
fi

# ── Dependency check ─────────────────────────────────────────────────────────
for svc in banking_api_server banking_mcp_server banking_api_ui; do
  if [[ ! -d "$BASEDIR/$svc/node_modules" ]]; then
    echo "📦 Installing dependencies for $svc..."
    (cd "$BASEDIR/$svc" && npm install)
  fi
done

# ── Banking API Server (Express) on :3002 ────────────────────────────────────
echo "🚀 Starting Banking API Server on ${API_HOST}:${API_PORT}..."
(
  cd "$BASEDIR/banking_api_server"
  PORT=${API_PORT} \
  REACT_APP_CLIENT_URL=${CLIENT_URL} \
  FRONTEND_ADMIN_URL=${CLIENT_URL}/admin \
  FRONTEND_DASHBOARD_URL=${CLIENT_URL}/dashboard \
  npm start > /tmp/bank-api-server.log 2>&1
) &
echo $! > "$PID_API"

sleep 1

# ── Banking MCP Server on :8080 ──────────────────────────────────────────────
if [[ -d "$BASEDIR/banking_mcp_server" ]]; then
  echo "🤖 Starting Banking MCP Server on :8080..."
  (
    cd "$BASEDIR/banking_mcp_server"
    cp .env.development .env 2>/dev/null || true
    npm start > /tmp/bank-mcp-server.log 2>&1
  ) &
  echo $! > "$PID_MCP"
fi

# ── LangChain Agent on :8888 ─────────────────────────────────────────────────
if [[ -f "$BASEDIR/langchain_agent/main.py" ]] || [[ -f "$BASEDIR/langchain_agent/server.py" ]]; then
  ENTRY="main"
  [[ -f "$BASEDIR/langchain_agent/server.py" ]] && ENTRY="server"
  echo "🔗 Starting LangChain Agent on :8888 (HTTPS if certs available)..."
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
# REACT_APP_API_PORT  → picked up by src/setupProxy.js to proxy /api/* to :3002
# REACT_APP_API_URL   → used by apiClient.js for absolute axios calls
# HOST                → binds CRA dev server to 0.0.0.0 so api.pingdemo.com resolves
# DANGEROUSLY_DISABLE_HOST_CHECK → allows non-localhost hostnames in CRA dev
echo "🌐 Starting Banking UI on ${CLIENT_URL}..."
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
echo -e "${CYAN}${BOLD}   🏦  SUPER BANK BANKING DEMO — STARTING                         ${RESET}"
echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "${DIM}  Waiting for Banking API and MCP Server to come up…${RESET}"

wait_for_port "${API_PORT}" 25 >/dev/null
wait_for_port 8080 25 >/dev/null
sleep 1   # give LangChain agent a moment too

echo ""
echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${CYAN}${BOLD}   🏦  SUPER BANK BANKING DEMO — STATUS                           ${RESET}"
echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
print_status_table
echo ""
echo -e "${MAGENTA}${BOLD}  ┌─ PORTS ─────────────────────────────────────────────────────┐${RESET}"
echo -e "${MAGENTA}${BOLD}  │${RESET}  🔌  Banking API Server        :${API_PORT}  ${YELLOW}(HTTPS)${RESET}"
echo -e "${MAGENTA}${BOLD}  │${RESET}  🌐  Banking UI (React)        :${UI_PORT}  ${YELLOW}(HTTPS)${RESET}"
echo -e "${MAGENTA}${BOLD}  │${RESET}  🤖  Banking MCP Server        :8080  ${YELLOW}(WebSocket)${RESET}"
echo -e "${MAGENTA}${BOLD}  │${RESET}  🔗  LangChain Agent           :8888  ${YELLOW}(HTTP/HTTPS)${RESET}"
echo -e "${MAGENTA}${BOLD}  └─────────────────────────────────────────────────────────────┘${RESET}"
echo ""
echo -e "${GREEN}${BOLD}  ┌─ URLS ──────────────────────────────────────────────────────┐${RESET}"
echo -e "${GREEN}${BOLD}  │${RESET}  🌐  App            ${YELLOW}${BOLD}${CLIENT_URL}${RESET}"
echo -e "${GREEN}${BOLD}  │${RESET}  ⚙️   Admin Config   ${YELLOW}${BOLD}${CLIENT_URL}/config${RESET}"
echo -e "${GREEN}${BOLD}  │${RESET}  🔐  Admin Login    ${YELLOW}${BOLD}${API_URL}/api/auth/oauth/login${RESET}"
echo -e "${GREEN}${BOLD}  │${RESET}  👤  User Login     ${YELLOW}${BOLD}${API_URL}/api/auth/oauth/user/login${RESET}"
echo -e "${GREEN}${BOLD}  └─────────────────────────────────────────────────────────────┘${RESET}"
echo ""
echo -e "${MAGENTA}${BOLD}  ┌─ QUICK START ───────────────────────────────────────────────┐${RESET}"
echo -e "${MAGENTA}${BOLD}  │${RESET}  1. Open ${YELLOW}${CLIENT_URL}/config${RESET} → enter PingOne credentials"
echo -e "${MAGENTA}${BOLD}  │${RESET}  2. Open ${YELLOW}${CLIENT_URL}${RESET} → click ${WHITE}${BOLD}Login${RESET} to start an OAuth flow"
echo -e "${MAGENTA}${BOLD}  │${RESET}  3. After login: use the 🤖 FAB (bottom-right) for BankingAgent"
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

# Default to showing all logs (auto-tail all)
echo -e "${CYAN}Starting live log view (all services)…${RESET}"
echo "Press Ctrl+C to stop tailing logs (services will keep running)."
echo ""
tail_bank_logs "all"
