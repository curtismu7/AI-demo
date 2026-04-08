---
phase: 84-review-all-syntax-errors-code-failures-looping-best-practices-for-all-code
plan: "02"
subsystem: infra
tags: [shell, scripts, devops, pid-management, preflight]

requires:
  - phase: "84-01"
    provides: "SHELL_SCRIPTS_AUDIT.md inventory of existing scripts"

provides:
  - run.sh — single entry point with start/stop/restart/status/logs/test/help subcommands
  - PID management via .pids/ directory
  - Log management via .logs/ directory
  - Pre-flight checks (Node.js version, npm, node_modules, .env, port conflicts)
  - Post-start banner with service URLs

affects: [devops, onboarding, local-dev]

tech-stack:
  added: []
  patterns:
    - "set -euo pipefail for strict error handling"
    - "PID file tracking in .pids/ (api.pid, ui.pid, mcp.pid, agent.pid)"
    - "kill_pid_file() with SIGTERM grace period then SIGKILL fallback"
    - "port_in_use() using lsof for pre-flight port checks"

key-files:
  created:
    - run.sh
  modified: []

key-decisions:
  - "Logs go to .logs/ not /tmp — keeps them with the project"
  - "shellcheck not available in environment; script logic manually verified"

patterns-established:
  - "run.sh as single entry point (replaces start.sh, stop.sh, run-tests.sh)"

requirements-completed: []

duration: 15min
completed: 2026-04-08
---

# Phase 84-02: Enterprise run.sh Summary

**Single `run.sh` entry point with 7 subcommands, pre-flight checks, PID management, and post-start banner replaces fragmented shell scripts.**

## What Was Built

- **run.sh** (393 lines): Consolidates start.sh, stop.sh, run-tests.sh into one script. Subcommands: `start`, `stop`, `restart`, `status`, `logs`, `test`, `help`. Pre-flight checks validate Node.js (≥16), npm, node_modules, .env existence, and port availability. PID files written to `.pids/`, logs to `.logs/`. Graceful stop: SIGTERM + 5s wait + SIGKILL fallback.

## Verification

- `./run.sh help` — shows all 7 subcommands ✓
- `./run.sh status` — shows all 4 services as STOPPED with ports ✓
- `shellcheck` not available in environment; set -euo pipefail used throughout

## Commit

- 9daef66 — feat(84-02): add enterprise-grade run.sh with subcommands, preflight checks, PID management
