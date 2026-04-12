#!/usr/bin/env bash
# =============================================================================
# run.sh — Banking Digital Assistant — Unified Entry Point
# =============================================================================
#
# Usage:
#   ./run.sh start    Start all services (UI, API, MCP server)
#   ./run.sh stop     Stop all services gracefully
#   ./run.sh restart  Stop then start
#   ./run.sh status   Show running/stopped status with PIDs
#   ./run.sh logs     Tail logs from all services
#   ./run.sh test     Run full test suite
#   ./run.sh help     Show this help message
#
# Ports: UI=4000, API=3001, MCP=8081, LangChain=8889
# Hostname: api.pingdemo.com (fallback to localhost if not resolvable)
# Config: banking_api_server/.env and banking_api_ui/.env
# Logs:   .logs/ directory
# PIDs:   .pids/ directory
# =============================================================================

set -euo pipefail

# ── Constants ──────────────────────────────────────────────────────────────
BASEDIR="$(cd "$(dirname "$0")" && pwd)"
PIDS_DIR="${BASEDIR}/.pids"
LOGS_DIR="${BASEDIR}/.logs"

API_PORT=3001
UI_PORT=4000
MCP_PORT=8081
AGENT_PORT=8889
NODE_MIN_VERSION=16

# Hostname resolution: try api.pingdemo.com first, fallback to localhost
DEFAULT_HOST="api.pingdemo.com"
if nslookup "${DEFAULT_HOST}" >/dev/null 2>&1 || host "${DEFAULT_HOST}" >/dev/null 2>&1 || dig "${DEFAULT_HOST}" +short >/dev/null 2>&1; then
  HOSTNAME="${DEFAULT_HOST}"
else
  HOSTNAME="localhost"
fi

# Log file paths
LOG_API="${LOGS_DIR}/banking-api.log"
LOG_UI="${LOGS_DIR}/banking-ui.log"
LOG_MCP="${LOGS_DIR}/banking-mcp.log"
LOG_AGENT="${LOGS_DIR}/banking-agent.log"

# PID file paths
PID_API="${PIDS_DIR}/api.pid"
PID_UI="${PIDS_DIR}/ui.pid"
PID_MCP="${PIDS_DIR}/mcp.pid"
PID_AGENT="${PIDS_DIR}/agent.pid"

# ── Colours ────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "${RED}✗${NC}  $1" >&2; }
info() { echo -e "${CYAN}→${NC}  $1"; }

# ── Helpers ────────────────────────────────────────────────────────────────

# Check if a PID is currently running
pid_running() {
  local pid_file="$1"
  if [ -f "${pid_file}" ]; then
    local pid
    pid=$(cat "${pid_file}")
    if kill -0 "${pid}" 2>/dev/null; then
      echo "${pid}"
      return 0
    fi
  fi
  return 1
}

# Kill a process by PID file, gracefully then forcefully
kill_pid_file() {
  local pid_file="$1"
  local name="$2"
  if [ -f "${pid_file}" ]; then
    local pid
    pid=$(cat "${pid_file}")
    if kill -0 "${pid}" 2>/dev/null; then
      info "Stopping ${name} (PID ${pid})..."
      kill -TERM "${pid}" 2>/dev/null || true
      local wait=0
      while kill -0 "${pid}" 2>/dev/null && [ "${wait}" -lt 10 ]; do
        sleep 0.5
        wait=$((wait + 1))
      done
      if kill -0 "${pid}" 2>/dev/null; then
        warn "${name} did not stop; sending SIGKILL"
        kill -KILL "${pid}" 2>/dev/null || true
      else
        ok "${name} stopped"
      fi
    fi
    rm -f "${pid_file}"
  fi
}

# Check if a port is in use
port_in_use() {
  lsof -i :"$1" -sTCP:LISTEN -t >/dev/null 2>&1
}

# ── Pre-flight Checks ──────────────────────────────────────────────────────
preflight_checks() {
  echo ""
  echo -e "${BOLD}Pre-flight checks${NC}"

  # Node.js
  if ! command -v node >/dev/null 2>&1; then
    err "Node.js is not installed. Install from https://nodejs.org"
    exit 1
  fi
  local node_version
  node_version=$(node -e "process.stdout.write(process.version.replace('v','').split('.')[0])")
  if [ "${node_version}" -lt "${NODE_MIN_VERSION}" ]; then
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

  # node_modules — warn if missing, offer to install
  for svc in banking_api_server banking_api_ui banking_mcp_server; do
    if [ -d "${BASEDIR}/${svc}" ] && [ ! -d "${BASEDIR}/${svc}/node_modules" ]; then
      warn "${svc}/node_modules missing — installing dependencies..."
      (cd "${BASEDIR}/${svc}" && npm install --silent)
      ok "${svc} dependencies installed"
    fi
  done

  # .env files
  if [ ! -f "${BASEDIR}/banking_api_server/.env" ]; then
    warn "banking_api_server/.env not found — copy .env.example and fill in PingOne credentials"
  else
    ok "banking_api_server/.env exists"
  fi

  # Ports
  for port in "${UI_PORT}" "${API_PORT}" "${MCP_PORT}"; do
    if port_in_use "${port}"; then
      warn "Port ${port} is already in use — a service may already be running. Use ./run.sh stop first."
    fi
  done

  ok "Pre-flight checks passed"
  echo ""
}

# ── Start ──────────────────────────────────────────────────────────────────
cmd_start() {
  echo ""
  echo -e "${BOLD}🏦  Banking Digital Assistant — Starting...${NC}"

  # Stop any existing services first to avoid conflicts
  cmd_stop

  preflight_checks

  mkdir -p "${PIDS_DIR}" "${LOGS_DIR}"

  # Banking API Server (port 3001)
  info "Starting Banking API Server on :${API_PORT}..."
  (cd "${BASEDIR}/banking_api_server" && npm start > "${LOG_API}" 2>&1) &
  echo $! > "${PID_API}"
  ok "Banking API Server started (PID $(cat "${PID_API}"))"

  sleep 1

  # Banking MCP Server (port 8081)
  if [ -d "${BASEDIR}/banking_mcp_server" ]; then
    info "Starting Banking MCP Server on :${MCP_PORT}..."
    (cd "${BASEDIR}/banking_mcp_server" && MCP_SERVER_PORT=${MCP_PORT} npm start > "${LOG_MCP}" 2>&1) &
    echo $! > "${PID_MCP}"
    ok "Banking MCP Server started (PID $(cat "${PID_MCP}"))"
  fi

  # LangChain Agent (port 8888)
  if [ -f "${BASEDIR}/langchain_agent/main.py" ] || [ -f "${BASEDIR}/langchain_agent/server.py" ]; then
    info "Starting LangChain Agent on :${AGENT_PORT}..."
    local agent_main="main"
    [ -f "${BASEDIR}/langchain_agent/server.py" ] && agent_main="server"
    (cd "${BASEDIR}/langchain_agent" && python3 -m uvicorn "${agent_main}:app" --port "${AGENT_PORT}" > "${LOG_AGENT}" 2>&1) &
    echo $! > "${PID_AGENT}"
    ok "LangChain Agent started (PID $(cat "${PID_AGENT}"))"
  fi

  # Banking UI (port 3000)
  if [ -d "${BASEDIR}/banking_api_ui" ]; then
    info "Starting Banking UI on :${UI_PORT}..."
    (cd "${BASEDIR}/banking_api_ui" && npm start > "${LOG_UI}" 2>&1) &
    echo $! > "${PID_UI}"
    ok "Banking UI started (PID $(cat "${PID_UI}"))"
  fi

  # Post-start banner
  echo ""
  echo -e "${BOLD}${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${GREEN}║${NC}  ${BOLD}${GREEN}✅ All Services Started Successfully${NC}                           ${BOLD}${GREEN}║${NC}"
  echo -e "${BOLD}${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${BOLD}📡 Server URLs:${NC}"
  echo ""
  echo -e "  ${CYAN}➜ Banking UI:${NC}       ${BOLD}http://${HOSTNAME}:${UI_PORT}${NC}"
  echo -e "  ${CYAN}➜ Banking API:${NC}      ${BOLD}http://${HOSTNAME}:${API_PORT}/api${NC}"
  echo -e "  ${CYAN}➜ MCP Server:${NC}       ${BOLD}ws://${HOSTNAME}:${MCP_PORT}${NC}"
  echo -e "  ${CYAN}➜ LangChain Agent:${NC}  ${BOLD}http://${HOSTNAME}:${AGENT_PORT}${NC}"
  echo ""
  echo -e "${BOLD}📋 Management Commands:${NC}"
  echo ""
  echo -e "  ${CYAN}• View logs:${NC}   ./run.sh logs"
  echo -e "  ${CYAN}• Check status:${NC} ./run.sh status"
  echo -e "  ${CYAN}• Stop services:${NC} ./run.sh stop"
  echo -e "  ${CYAN}• Restart:${NC}      ./run.sh restart"
  echo ""
  echo -e "${BOLD}📁 Log Files:${NC}"
  echo ""
  echo -e "  ${CYAN}• API:${NC}     ${LOG_API}"
  echo -e "  ${CYAN}• UI:${NC}      ${LOG_UI}"
  echo -e "  ${CYAN}• MCP:${NC}     ${LOG_MCP}"
  echo -e "  ${CYAN}• Agent:${NC}   ${LOG_AGENT}"
  echo ""
}

# ── Stop ───────────────────────────────────────────────────────────────────
cmd_stop() {
  echo ""
  echo -e "${BOLD}🛑  Stopping Banking Digital Assistant...${NC}"
  echo ""

  kill_pid_file "${PID_UI}"    "Banking UI"
  kill_pid_file "${PID_AGENT}" "LangChain Agent"
  kill_pid_file "${PID_MCP}"   "Banking MCP Server"
  kill_pid_file "${PID_API}"   "Banking API Server"

  # Also kill any processes using our ports (more robust than PID files)
  for port in "${UI_PORT}" "${API_PORT}" "${MCP_PORT}" "${AGENT_PORT}"; do
    if port_in_use "${port}"; then
      info "Killing process using port ${port}..."
      lsof -ti :${port} | xargs kill -9 2>/dev/null || true
    fi
  done

  echo ""
  ok "All services stopped"
  echo ""
}

# ── Restart ────────────────────────────────────────────────────────────────
cmd_restart() {
  cmd_stop
  cmd_start
  # Show logs after restart
  cmd_logs
}

# ── Status ─────────────────────────────────────────────────────────────────
cmd_status() {
  echo ""
  echo -e "${BOLD}Banking Digital Assistant — Status${NC}"
  echo ""

  local pid
  local all_stopped=true

  for entry in "Banking UI:${PID_UI}:${UI_PORT}" "Banking API:${PID_API}:${API_PORT}" "MCP Server:${PID_MCP}:${MCP_PORT}" "LangChain:${PID_AGENT}:${AGENT_PORT}"; do
    local name="${entry%%:*}"
    local pf="${entry#*:}"
    pf="${pf%%:*}"
    local port="${entry##*:}"

    if pid=$(pid_running "${pf}"); then
      echo -e "  ${GREEN}● RUNNING${NC}  ${name} (PID ${pid}, port :${port})"
      all_stopped=false
    else
      echo -e "  ${RED}○ STOPPED${NC}  ${name} (port :${port})"
    fi
  done

  echo ""
  if "${all_stopped}"; then
    info "No services running. Start with: ./run.sh start"
  else
    info "Logs: ./run.sh logs | Stop: ./run.sh stop"
  fi
  echo ""
}

# ── Logs ───────────────────────────────────────────────────────────────────
cmd_logs() {
  local log_files=()
  for lf in "${LOG_API}" "${LOG_UI}" "${LOG_MCP}" "${LOG_AGENT}"; do
    [ -f "${lf}" ] && log_files+=("${lf}")
  done

  if [ "${#log_files[@]}" -eq 0 ]; then
    warn "No log files found. Start services first: ./run.sh start"
    exit 0
  fi

  echo ""
  info "Tailing logs (Ctrl-C to stop):"
  for lf in "${log_files[@]}"; do
    echo "  ${lf}"
  done
  echo ""
  tail -f "${log_files[@]}"
}

# ── Test ───────────────────────────────────────────────────────────────────
cmd_test() {
  local mode="${1:-api}"
  echo ""
  echo -e "${BOLD}Banking Digital Assistant — Test Suite${NC}"
  echo ""

  local failed=0

  # API tests
  if [ -d "${BASEDIR}/banking_api_server" ]; then
    info "Running banking_api_server tests..."
    if (cd "${BASEDIR}/banking_api_server" && npm test -- --passWithNoTests 2>&1); then
      ok "banking_api_server tests passed"
    else
      err "banking_api_server tests FAILED"
      failed=$((failed + 1))
    fi
  fi

  # UI tests (if present)
  if [ -d "${BASEDIR}/banking_api_ui" ]; then
    if grep -q '"test"' "${BASEDIR}/banking_api_ui/package.json" 2>/dev/null; then
      info "Running banking_api_ui tests..."
      if (cd "${BASEDIR}/banking_api_ui" && npm test -- --watchAll=false --passWithNoTests 2>&1); then
        ok "banking_api_ui tests passed"
      else
        err "banking_api_ui tests FAILED"
        failed=$((failed + 1))
      fi
    fi
  fi

  # MCP server tests
  if [ -d "${BASEDIR}/banking_mcp_server" ]; then
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
  if [ "${failed}" -eq 0 ]; then
    ok "All test suites passed"
  else
    err "${failed} test suite(s) failed"
    exit 1
  fi
  echo ""
}

# ── Help ───────────────────────────────────────────────────────────────────
cmd_help() {
  echo ""
  echo -e "${BOLD}Banking Digital Assistant — run.sh${NC}"
  echo ""
  echo "Usage: ./run.sh <command>"
  echo ""
  echo -e "${BOLD}Commands:${NC}"
  echo "  start    Start all services (UI :${UI_PORT}, API :${API_PORT}, MCP :${MCP_PORT})"
  echo "  stop     Stop all services gracefully"
  echo "  restart  Stop then start all services"
  echo "  status   Show running/stopped status with PIDs"
  echo "  logs     Tail logs from all running services"
  echo "  test     Run the full test suite"
  echo "  help     Show this message"
  echo ""
  echo -e "${BOLD}Files:${NC}"
  echo "  PIDs:  .pids/  (api.pid, ui.pid, mcp.pid, agent.pid)"
  echo "  Logs:  .logs/  (banking-api.log, banking-ui.log, banking-mcp.log)"
  echo "  Env:   banking_api_server/.env"
  echo ""
  echo -e "${BOLD}Examples:${NC}"
  echo "  ./run.sh start          # Start everything"
  echo "  ./run.sh status         # Check what's running"
  echo "  ./run.sh logs           # View all logs"
  echo "  ./run.sh test           # Run all tests"
  echo "  ./run.sh stop           # Stop everything"
  echo ""
}

# ── Dispatch ───────────────────────────────────────────────────────────────
COMMAND="${1:-restart}"

case "${COMMAND}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  logs)    cmd_logs ;;
  test)    cmd_test "${2:-api}" ;;
  help|--help|-h) cmd_help ;;
  *)
    err "Unknown command: ${COMMAND}"
    cmd_help
    exit 1
    ;;
esac
