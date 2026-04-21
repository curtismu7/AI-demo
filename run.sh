#!/usr/bin/env bash
# =============================================================================
# run.sh — Banking Digital Assistant — Default Port Layout
# =============================================================================
#
# Default ports (for standalone use — no MasterFlow / OAuth Playground).
# If you need to run alongside MasterFlow on :3000/:3001, use ./run-bank.sh
# instead (which uses :3002/:4000). Both scripts use UI on :4000.
#
# Port layout:
#   Banking API Server  → https://api.pingdemo.com:3001
#   Banking UI (React)  → https://api.pingdemo.com:4000
#   Banking MCP Server  → localhost:8080
#   LangChain Agent     → localhost:8888
#
# One-time setup (run once each, requires sudo for /etc/hosts):
#   echo '127.0.0.1  api.pingdemo.com' | sudo tee -a /etc/hosts
#   mkcert -install   # install local CA (once per machine)
#
# Usage:
#   ./run.sh               # start all services
#   ./run.sh start         # start all services (same as default)
#   ./run.sh stop          # stop all services gracefully
#   ./run.sh restart       # stop then start
#   ./run.sh status        # show running/stopped status with ports
#   ./run.sh logs          # tail all logs
#   ./run.sh logs N        # tail specific log (1=API, 2=UI, 3=MCP, 4=Agent)
#   ./run.sh test          # run full test suite
#   ./run.sh help          # show this help message
# =============================================================================

set -euo pipefail

# ── Constants ────────────────────────────────────────────────────────────────
BASEDIR="$(cd "$(dirname "$0")" && pwd)"

API_HOST="api.pingdemo.com"
API_PORT=3001
UI_PORT=4000
MCP_PORT=8080
AGENT_PORT=8888
NODE_MIN_VERSION=16

CERT_DIR="${BASEDIR}/certs"
CERT_FILE="${CERT_DIR}/api.pingdemo.com+2.pem"
KEY_FILE="${CERT_DIR}/api.pingdemo.com+2-key.pem"

# URLs — updated below based on /etc/hosts and cert availability
API_URL="https://${API_HOST}:${API_PORT}"
CLIENT_URL="https://${API_HOST}:${UI_PORT}"
USE_HTTPS=true

# PID and log files
PIDS_DIR="${BASEDIR}/.pids"
LOGS_DIR="${BASEDIR}/.logs"

PID_API="${PIDS_DIR}/api.pid"
PID_UI="${PIDS_DIR}/ui.pid"
PID_MCP="${PIDS_DIR}/mcp.pid"
PID_AGENT="${PIDS_DIR}/agent.pid"

LOG_API="${LOGS_DIR}/banking-api.log"
LOG_UI="${LOGS_DIR}/banking-ui.log"
LOG_MCP="${LOGS_DIR}/banking-mcp.log"
LOG_AGENT="${LOGS_DIR}/banking-agent.log"
LOG_MCP_TRAFFIC="${LOGS_DIR}/mcp-traffic.log"

# ── Colours ──────────────────────────────────────────────────────────────────
BOLD='\033[1m'
CYAN='\033[1;36m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
MAGENTA='\033[1;35m'
WHITE='\033[1;37m'
RED='\033[1;31m'
DIM='\033[2m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC}  $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "  ${RED}✗${NC}  $1" >&2; }
info() { echo -e "  ${CYAN}→${NC}  $1"; }

# ── /etc/hosts check ────────────────────────────────────────────────────────
if ! grep -q "${API_HOST}" /etc/hosts 2>/dev/null; then
  echo -e "${YELLOW}⚠  ${API_HOST} is not in /etc/hosts.${NC}"
  echo "   Run this once:  echo '127.0.0.1  ${API_HOST}' | sudo tee -a /etc/hosts"
  echo "   Continuing with localhost fallback..."
  API_URL="https://localhost:${API_PORT}"
  CLIENT_URL="https://localhost:${UI_PORT}"
fi

# ── SSL cert check / auto-generate ──────────────────────────────────────────
if [[ ! -f "${CERT_FILE}" ]] || [[ ! -f "${KEY_FILE}" ]]; then
  if command -v mkcert &>/dev/null; then
    echo -e "${CYAN}🔐 Generating SSL certs for ${API_HOST}...${NC}"
    mkdir -p "${CERT_DIR}"
    (cd "${CERT_DIR}" && mkcert "${API_HOST}" localhost 127.0.0.1)
    echo -e "${GREEN}✅ Certs created in ${CERT_DIR}${NC}"
  else
    echo -e "${YELLOW}⚠  mkcert not found — install with: brew install mkcert && mkcert -install${NC}"
    echo "   Falling back to HTTP..."
    USE_HTTPS=false
    API_URL="http://${API_HOST}:${API_PORT}"
    CLIENT_URL="http://${API_HOST}:${UI_PORT}"
  fi
fi

# ── Helpers ──────────────────────────────────────────────────────────────────

# Check if a TCP port is listening locally
port_listening() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1
}

# Kill a PID and every descendant (npm/node/uvicorn survive a plain kill)
kill_process_tree() {
  local pid="$1"
  [[ -z "$pid" ]] && return 0
  case "$pid" in
    ''|*[!0-9]*) return 0 ;;
  esac
  [[ "$pid" -le 1 ]] && return 0
  local c
  for c in $(pgrep -P "$pid" 2>/dev/null); do
    kill_process_tree "$c"
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
  fi
}

# Stop anything still listening on our ports
stop_listeners_on_ports() {
  local port pid pids
  for port in "${API_PORT}" "${UI_PORT}" "${MCP_PORT}" "${AGENT_PORT}"; do
    pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
    for pid in $pids; do
      [[ -z "$pid" ]] && continue
      echo "   Stopping listener on :${port} (PID ${pid})"
      kill_process_tree "$pid"
    done
  done
}

force_kill_listeners_on_ports() {
  local port pid pids
  for port in "${API_PORT}" "${UI_PORT}" "${MCP_PORT}" "${AGENT_PORT}"; do
    pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
    for pid in $pids; do
      [[ -z "$pid" ]] && continue
      if kill -KILL "$pid" 2>/dev/null; then
        echo "   Force-killed PID ${pid} still on :${port}"
      fi
    done
  done
}

# Wait for a port with a timeout
wait_for_port() {
  local port="$1" timeout="${2:-25}" i=0
  while [[ $i -lt $timeout ]]; do
    port_listening "$port" && return 0
    sleep 1
    (( i++ )) || true
  done
  return 1
}

# Print a single-line status row for a service
service_status_line() {
  local label="$1" port="$2" url="${3:-}"
  if port_listening "$port"; then
    printf "  ${GREEN}${BOLD}  ✅  %-24s${NC}  ${MAGENTA}:%-6s${NC}  ${YELLOW}%s${NC}\n" "$label" "$port" "$url"
  else
    printf "  ${RED}${BOLD}  ❌  %-24s${NC}  ${MAGENTA}:%-6s${NC}  ${DIM}not running${NC}\n" "$label" "$port"
  fi
}

print_status_table() {
  echo -e "${WHITE}${BOLD}  SERVICES${NC}"
  service_status_line "Banking API Server"  "${API_PORT}"   "${API_URL}"
  service_status_line "Banking MCP Server"  "${MCP_PORT}"   "ws://localhost:${MCP_PORT}"
  service_status_line "LangChain Agent"     "${AGENT_PORT}" "http://localhost:${AGENT_PORT}"
  if port_listening "${UI_PORT}"; then
    printf "  ${GREEN}${BOLD}  ✅  %-24s${NC}  ${MAGENTA}:%-6s${NC}  ${YELLOW}%s${NC}\n" "Banking UI (React)" "${UI_PORT}" "${CLIENT_URL}"
  else
    printf "  ${YELLOW}  ⏳  %-24s${NC}  ${MAGENTA}:%-6s${NC}  ${DIM}compiling… %s${NC}\n" "Banking UI (React)" "${UI_PORT}" "${CLIENT_URL}"
  fi
}

# ── Pre-flight checks ───────────────────────────────────────────────────────
preflight_checks() {
  echo ""
  echo -e "${WHITE}${BOLD}  PRE-FLIGHT CHECKS${NC}"

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

  # node_modules — auto-install if missing
  for svc in banking_api_server banking_mcp_server banking_api_ui; do
    if [[ -d "${BASEDIR}/${svc}" ]] && [[ ! -d "${BASEDIR}/${svc}/node_modules" ]]; then
      warn "${svc}/node_modules missing — installing..."
      (cd "${BASEDIR}/${svc}" && npm install --silent)
      ok "${svc} dependencies installed"
    fi
  done

  # .env files
  if [[ ! -f "${BASEDIR}/banking_api_server/.env" ]]; then
    warn "banking_api_server/.env not found — copy env.example and fill in PingOne credentials"
  else
    ok "banking_api_server/.env exists"
  fi

  # Port conflicts
  for port in "${API_PORT}" "${UI_PORT}" "${MCP_PORT}" "${AGENT_PORT}"; do
    if port_listening "${port}"; then
      warn "Port ${port} is already in use (will be stopped before start)"
    fi
  done

  ok "Pre-flight checks passed"
  echo ""
}

# ── Tail logs ────────────────────────────────────────────────────────────────
cmd_logs() {
  local pre="${1:-}"
  [[ "${pre}" == "ALL" || "${pre}" == "All" ]] && pre="all"
  local names=("Banking API" "Banking UI" "MCP Server" "LangChain Agent" "MCP Traffic")
  local logs=("${LOG_API}" "${LOG_UI}" "${LOG_MCP}" "${LOG_AGENT}" "${LOG_MCP_TRAFFIC}")
  local choice=""

  # If a specific log number was passed, use it directly
  if [[ -n "${pre}" && "${pre}" != "all" ]]; then
    choice="${pre}"
  elif [[ -n "${pre}" ]]; then
    choice="${pre}"
  else
    echo ""
    echo -e "${CYAN}Pick a log to follow (tail -f). Ctrl+C stops tail only.${NC}"
    for i in 0 1 2 3 4; do
      echo "  $((i + 1))) ${names[i]}  (${logs[i]})"
    done
    echo "  6) All of the above (interleaved)"
    read -r -p "Number [1-6] or 'all': " choice
  fi
  [[ "${choice}" == "ALL" || "${choice}" == "All" ]] && choice="all"

  case "${choice}" in
    1|2|3|4|5)
      local idx=$((choice - 1))
      local f="${logs[$idx]}"
      if [[ ! -f "${f}" ]]; then
        warn "Log file does not exist yet: ${f}"
        exit 1
      fi
      echo "📜 Tailing ${names[$idx]} ..."
      tail -f "${f}"
      ;;
    6|all)
      local existing=()
      for f in "${logs[@]}"; do
        [[ -f "${f}" ]] && existing+=("${f}")
      done
      if [[ ${#existing[@]} -eq 0 ]]; then
        warn "No log files found yet. Start services first."
        exit 1
      fi
      echo "📜 Tailing ${#existing[@]} log file(s). Ctrl+C stops."
      tail -f "${existing[@]}"
      ;;
    *)
      echo "Invalid choice (use 1–6, or 'all')."
      exit 1
      ;;
  esac
}

# ── Stop ─────────────────────────────────────────────────────────────────────
cmd_stop() {
  echo ""
  echo -e "${BOLD}🛑  Stopping Banking Digital Assistant...${NC}"
  set +e
  for pid_file in "$PID_API" "$PID_MCP" "$PID_AGENT" "$PID_UI"; do
    if [[ -f "$pid_file" ]]; then
      local PID
      PID=$(cat "$pid_file" 2>/dev/null || true)
      rm -f "$pid_file"
      if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
        kill_process_tree "$PID"
        echo "   Stopped process tree from PID ${PID} ($(basename "$pid_file" .pid))"
      fi
    fi
  done
  sleep 1
  echo "   Sweeping ports (API :${API_PORT}, UI :${UI_PORT}, MCP :${MCP_PORT}, Agent :${AGENT_PORT})…"
  stop_listeners_on_ports
  sleep 1
  force_kill_listeners_on_ports
  set -euo pipefail
  echo ""
  ok "All services stopped"
  echo ""
}

# ── Start ────────────────────────────────────────────────────────────────────
cmd_start() {
  preflight_checks

  mkdir -p "${PIDS_DIR}" "${LOGS_DIR}"

  # Auto-kill any existing services before starting
  local _any_running=false
  for _chk_port in "${API_PORT}" "${UI_PORT}" "${MCP_PORT}" "${AGENT_PORT}"; do
    if port_listening "$_chk_port"; then
      _any_running=true
      break
    fi
  done
  if [[ "$_any_running" == "true" ]]; then
    echo -e "${YELLOW}  ⟳  Stopping existing services…${NC}"
    set +e
    for _pf in "$PID_API" "$PID_MCP" "$PID_AGENT" "$PID_UI"; do
      if [[ -f "$_pf" ]]; then
        local _pid
        _pid=$(cat "$_pf" 2>/dev/null || true)
        rm -f "$_pf"
        [[ -n "$_pid" ]] && kill_process_tree "$_pid" 2>/dev/null || true
      fi
    done
    stop_listeners_on_ports
    sleep 1
    force_kill_listeners_on_ports
    set -euo pipefail
    ok "Previous services stopped"
    echo ""
  fi

  # ── Banking API Server ───────────────────────────────────────────────────
  info "Starting Banking API Server on :${API_PORT}..."
  (
    cd "${BASEDIR}/banking_api_server"
    PORT=${API_PORT} \
    REACT_APP_CLIENT_URL=${CLIENT_URL} \
    FRONTEND_ADMIN_URL=${CLIENT_URL}/admin \
    FRONTEND_DASHBOARD_URL=${CLIENT_URL}/dashboard \
    npm start > "${LOG_API}" 2>&1
  ) &
  echo $! > "${PID_API}"

  sleep 1

  # ── Banking MCP Server ──────────────────────────────────────────────────
  if [[ -d "${BASEDIR}/banking_mcp_server" ]]; then
    info "Starting Banking MCP Server on :${MCP_PORT}..."
    (
      cd "${BASEDIR}/banking_mcp_server"
      cp .env.development .env 2>/dev/null || true
      MCP_SERVER_PORT=${MCP_PORT} npm start > "${LOG_MCP}" 2>&1
    ) &
    echo $! > "${PID_MCP}"
  fi

  # ── LangChain Agent ────────────────────────────────────────────────────
  if [[ -f "${BASEDIR}/langchain_agent/main.py" ]] || [[ -f "${BASEDIR}/langchain_agent/server.py" ]]; then
    local ENTRY="main"
    [[ -f "${BASEDIR}/langchain_agent/server.py" ]] && ENTRY="server"
    info "Starting LangChain Agent on :${AGENT_PORT}..."
    (
      cd "${BASEDIR}/langchain_agent"
      [[ -d venv ]] && source venv/bin/activate
      if [[ "${USE_HTTPS}" == "true" ]] && [[ -f "${CERT_FILE}" ]] && [[ -f "${KEY_FILE}" ]]; then
        python3 -m uvicorn "${ENTRY}:app" --port "${AGENT_PORT}" \
          --ssl-keyfile "${KEY_FILE}" --ssl-certfile "${CERT_FILE}" \
          > "${LOG_AGENT}" 2>&1
      else
        python3 -m uvicorn "${ENTRY}:app" --port "${AGENT_PORT}" > "${LOG_AGENT}" 2>&1
      fi
    ) &
    echo $! > "${PID_AGENT}"
  fi

  # ── Banking UI (CRA) ──────────────────────────────────────────────────
  info "Starting Banking UI on ${CLIENT_URL}..."
  (
    cd "${BASEDIR}/banking_api_ui"
    if [[ "${USE_HTTPS}" == "true" ]] && [[ -f "${CERT_FILE}" ]] && [[ -f "${KEY_FILE}" ]]; then
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
    else
      HOST=0.0.0.0 \
      PORT=${UI_PORT} \
      REACT_APP_API_URL=${API_URL} \
      REACT_APP_API_PORT=${API_PORT} \
      REACT_APP_CLIENT_URL=${CLIENT_URL} \
      DANGEROUSLY_DISABLE_HOST_CHECK=true \
      WDS_SOCKET_PORT=0 \
      npm start > "${LOG_UI}" 2>&1
    fi
  ) &
  echo $! > "${PID_UI}"

  # ── Health check + Banner ──────────────────────────────────────────────
  echo ""
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}${BOLD}   🏦  BANKING DIGITAL ASSISTANT — STARTING                       ${NC}"
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "${DIM}  Waiting for API and MCP Server to come up…${NC}"

  wait_for_port "${API_PORT}" 25 || warn "API Server did not start in time — check ${LOG_API}"
  wait_for_port "${MCP_PORT}" 25 || warn "MCP Server did not start in time — check ${LOG_MCP}"
  sleep 1

  echo ""
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}${BOLD}   🏦  BANKING DIGITAL ASSISTANT — STATUS                         ${NC}"
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  print_status_table
  echo ""
  echo -e "${GREEN}${BOLD}  ┌─ URLS ──────────────────────────────────────────────────────┐${NC}"
  echo -e "${GREEN}${BOLD}  │${NC}  🌐  App            ${YELLOW}${BOLD}${CLIENT_URL}${NC}"
  echo -e "${GREEN}${BOLD}  │${NC}  ⚙️   Admin Config   ${YELLOW}${BOLD}${CLIENT_URL}/config${NC}"
  echo -e "${GREEN}${BOLD}  │${NC}  🔐  Admin Login    ${YELLOW}${BOLD}${API_URL}/api/auth/oauth/login${NC}"
  echo -e "${GREEN}${BOLD}  │${NC}  👤  User Login     ${YELLOW}${BOLD}${API_URL}/api/auth/oauth/user/login${NC}"
  echo -e "${GREEN}${BOLD}  └─────────────────────────────────────────────────────────────┘${NC}"
  echo ""
  echo -e "${MAGENTA}${BOLD}  ┌─ PORTS ────────────────────────────────────────────────────┐${NC}"
  echo -e "${MAGENTA}${BOLD}  │${NC}  🔧  Banking API Server        :${API_PORT}  ${YELLOW}(HTTPS)${NC}"
  echo -e "${MAGENTA}${BOLD}  │${NC}  🌐  Banking UI (React)        :${UI_PORT}  ${YELLOW}(HTTPS)${NC}"
  echo -e "${MAGENTA}${BOLD}  │${NC}  🤖  Banking MCP Server        :${MCP_PORT}  ${YELLOW}(WebSocket)${NC}"
  echo -e "${MAGENTA}${BOLD}  │${NC}  🔗  LangChain Agent           :${AGENT_PORT}  ${YELLOW}(HTTP/HTTPS)${NC}"
  echo -e "${MAGENTA}${BOLD}  └─────────────────────────────────────────────────────────────┘${NC}"
  echo ""
  echo -e "${WHITE}${BOLD}  ┌─ MANAGE ────────────────────────────────────────────────────┐${NC}"
  echo -e "${WHITE}${BOLD}  │${NC}  ${BOLD}./run.sh status${NC}   — live service health check"
  echo -e "${WHITE}${BOLD}  │${NC}  ${BOLD}./run.sh logs${NC}     — pick log to follow (${DIM}./run.sh logs all${NC} for all)"
  echo -e "${WHITE}${BOLD}  │${NC}  ${BOLD}./run.sh stop${NC}     — stop all services"
  echo -e "${WHITE}${BOLD}  │${NC}  ${BOLD}./run.sh test${NC}     — run test suite"
  echo -e "${WHITE}${BOLD}  │${NC}  ${DIM}tail -f ${LOG_API}${NC}"
  echo -e "${WHITE}${BOLD}  │${NC}  ${DIM}tail -f ${LOG_UI}${NC}"
  echo -e "${WHITE}${BOLD}  └─────────────────────────────────────────────────────────────┘${NC}"
  echo ""
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  # Default to showing all logs (auto-tail all)
  echo -e "${CYAN}Starting live log view (all services)…${NC}"
  echo "Press Ctrl+C to stop tailing logs (services will keep running)."
  echo ""
  cmd_logs "all"
}

# ── Test ─────────────────────────────────────────────────────────────────────
cmd_test() {
  echo ""
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}${BOLD}   🏦  BANKING DIGITAL ASSISTANT — TEST SUITE                     ${NC}"
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  local failed=0

  if [[ -d "${BASEDIR}/banking_api_server" ]]; then
    info "Running banking_api_server tests..."
    if (cd "${BASEDIR}/banking_api_server" && npm test -- --passWithNoTests 2>&1); then
      ok "banking_api_server tests passed"
    else
      err "banking_api_server tests FAILED"
      failed=$((failed + 1))
    fi
  fi

  if [[ -d "${BASEDIR}/banking_api_ui" ]]; then
    if grep -q '"test"' "${BASEDIR}/banking_api_ui/package.json" 2>/dev/null; then
      info "Running banking_api_ui tests..."
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
      info "Running banking_mcp_server tests..."
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

# ── Help ─────────────────────────────────────────────────────────────────────
cmd_help() {
  echo ""
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}${BOLD}   🏦  BANKING DIGITAL ASSISTANT — run.sh                         ${NC}"
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "${WHITE}${BOLD}  Usage:${NC} ./run.sh <command>"
  echo ""
  echo -e "${WHITE}${BOLD}  Commands:${NC}"
  echo "    start      Start all services (default if no command given)"
  echo "    stop       Stop all services gracefully (process tree + port sweep)"
  echo "    restart    Stop then start all services"
  echo "    status     Show running/stopped status with ports and URLs"
  echo "    logs       Pick a log to follow (1=API, 2=UI, 3=MCP, 4=Agent, 5=all)"
  echo "    logs N     Tail a specific log directly (no prompt)"
  echo "    test       Run full test suite (API, UI, MCP)"
  echo "    help       Show this message"
  echo ""
  echo -e "${WHITE}${BOLD}  Port Layout (default):${NC}"
  echo "    Banking API Server   :${API_PORT}  (HTTPS if certs available)"
  echo "    Banking UI (React)   :${UI_PORT}  (HTTPS if certs available)"
  echo "    Banking MCP Server   :${MCP_PORT}"
  echo "    LangChain Agent      :${AGENT_PORT}"
  echo ""
  echo -e "${WHITE}${BOLD}  Alternative:${NC}"
  echo "    ./run-bank.sh  — Uses :3002/:4000 to coexist with MasterFlow on :3000/:3001
#                       (run.sh uses :3001/:4000 for standalone)"
  echo ""
  echo -e "${WHITE}${BOLD}  Files:${NC}"
  echo "    PIDs:  ${PIDS_DIR}/"
  echo "    Logs:  ${LOGS_DIR}/"
  echo "    Env:   banking_api_server/.env"
  echo ""
}

# ── Status ───────────────────────────────────────────────────────────────────
cmd_status() {
  echo ""
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}${BOLD}   🏦  BANKING DIGITAL ASSISTANT — STATUS                         ${NC}"
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  print_status_table
  echo ""
  echo -e "${GREEN}${BOLD}  ┌─ URLS ──────────────────────────────────────────────────────┐${NC}"
  echo -e "${GREEN}${BOLD}  │${NC}  🌐  App           ${YELLOW}${BOLD}${CLIENT_URL}${NC}"
  echo -e "${GREEN}${BOLD}  │${NC}  ⚙️   Admin Config  ${YELLOW}${BOLD}${CLIENT_URL}/config${NC}"
  echo -e "${GREEN}${BOLD}  │${NC}  🔐  Admin Login   ${YELLOW}${BOLD}${API_URL}/api/auth/oauth/login${NC}"
  echo -e "${GREEN}${BOLD}  │${NC}  👤  User Login    ${YELLOW}${BOLD}${API_URL}/api/auth/oauth/user/login${NC}"
  echo -e "${GREEN}${BOLD}  └─────────────────────────────────────────────────────────────┘${NC}"
  echo ""
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

# ── Dispatch ─────────────────────────────────────────────────────────────────
COMMAND="${1:-start}"

case "${COMMAND}" in
  start)        cmd_start ;;
  stop)         cmd_stop ;;
  restart)      cmd_stop; cmd_start ;;
  status)       cmd_status ;;
  logs)         cmd_logs "${2:-}" ;;
  mcp-traffic|mcp-watch) [[ -f "${LOG_MCP_TRAFFIC}" ]] || { echo "No MCP traffic log yet. Start services first." >&2; exit 1; }; echo "📡 MCP Traffic Log — Ctrl+C to stop"; tail -f "${LOG_MCP_TRAFFIC}" ;;
  test)         cmd_test ;;
  help|--help|-h) cmd_help ;;
  *)
    err "Unknown command: ${COMMAND}"
    cmd_help
    exit 1
    ;;
esac
