---
created: "2026-04-01T11:35:09.988Z"
title: "Enterprise-grade run.sh startup script with post-start guide"
area: "tooling"
files:
  - run-bank.sh
  - start.sh
  - stop.sh
  - run-tests.sh
---

## Problem

There are currently 5+ shell scripts in the repo root (`run-bank.sh`, `start.sh`, `stop.sh`, `run-tests.sh`, `reset-upstash.sh`, `update-upstash.sh`) with no single canonical entry point. `run-bank.sh` is 354 lines of useful but dense bash; `start.sh` is 59 lines; they overlap and neither surfaces a clear post-startup guide for a first-time developer.

Issues to fix:
- No canonical `run.sh` — users have to know to pick `run-bank.sh`
- No post-start output telling the user what URLs to open, what env vars to set, and how to verify the app is healthy
- No pre-flight dependency check (node version, npm, mkcert, required env vars)
- No color-coded status output or consistent section headers
- Incomplete cleanup: `stop.sh` may leave orphaned processes
- `run-tests.sh` doesn't communicate CI vs local mode clearly

## Solution

Consolidate into a single enterprise-grade `run.sh`:

1. **Pre-flight checks** (fail fast, print clear action):
   - Node ≥ 18, npm ≥ 9
   - `mkcert` installed (warn if missing, local HTTPS won't work)
   - `.env` present in both `banking_api_server/` and `banking_api_ui/`; list any missing required vars
   - Port availability check for 3002, 4000, 8080, 8888 — warn if already in use

2. **Subcommands** with a help banner (`./run.sh help`):
   - `./run.sh start` — start all services (default when no arg)
   - `./run.sh stop` — graceful shutdown (SIGTERM → SIGKILL fallback)
   - `./run.sh restart` — stop + start
   - `./run.sh logs [api|ui|mcp|agent|all]` — tail logs
   - `./run.sh test [unit|integration|all]` — run test suites
   - `./run.sh status` — print PID, port, and health for each service

3. **Post-start summary block** (printed after all services are up):
   ```
   ════════════════════════════════════════════════════════════════
    BX Finance Banking Demo — Running
   ════════════════════════════════════════════════════════════════

    🌐  UI          https://api.pingdemo.com:4000
    🔌  API Server  https://api.pingdemo.com:3002
    🤖  MCP Server  ws://localhost:8080
    🦜  LangChain   http://localhost:8888

    📋  Admin login:   /admin  (PingOne admin credentials)
    👤  User login:    /        (PingOne demo user)
    🔧  Demo config:   /demo-data
    🏥  Health:        https://api.pingdemo.com:3002/api/health

   ════════════════════════════════════════════════════════════════
    Logs: ./run.sh logs all   |   Stop: ./run.sh stop
   ════════════════════════════════════════════════════════════════
   ```

4. **Color and formatting**:
   - Use ANSI codes with `tput` fallback (graceful in non-TTY)
   - Green ✓ for running services, red ✗ for failures, yellow ⚠ for warnings
   - Consistent `[INFO]`, `[WARN]`, `[ERROR]`, `[FATAL]` prefixes

5. **`./run.sh stop` improvements**:
   - Kill by PID file (write PIDs to `/tmp/banking-*.pid` on start)
   - Fallback: `lsof -ti:PORT | xargs kill` for ports 3002, 4000, 8080, 8888
   - Confirm each service stopped before returning

6. **Keep `run-bank.sh` as a symlink or thin wrapper** until adoption is validated — don't break existing workflows.

**Standards to follow:**
- `#!/usr/bin/env bash`, `set -euo pipefail` at top
- All functions named `snake_case`, no global side-effects in function definitions
- `trap cleanup EXIT` to ensure PID files are removed on crash
- `shellcheck`-clean (no SC2086, SC2046 warnings)
