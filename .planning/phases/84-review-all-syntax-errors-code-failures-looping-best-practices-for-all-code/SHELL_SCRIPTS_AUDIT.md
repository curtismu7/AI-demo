# Shell Scripts Audit & Consolidation Roadmap

**Phase 84 Plan 01 — Task 1**  
**Date:** 2026-04-07  
**Status:** Complete

---

## Executive Summary

The Banking Demo repository currently has **18 fragmented shell scripts** across multiple locations. Most scripts are duplicative, unrelated, or used only during deployment. Core functionality is split between:
- `run-bank.sh` — Main local development entry point (comprehensive, with subcommands)
- `start.sh` / `stop.sh` — Simple service starters (older, less robust)
- `run-tests.sh` — Test runner
- Specialized scripts: reset/update Upstash, OAuth testing, setup, Docker entry points

**Recommendation:** Continue using `run-bank.sh` as the primary entry point (already feature-complete) rather than consolidating further. The script is well-structured, supports multiple modes, and handles all necessary subcommands. Secondary scripts can be documented and marked as legacy.

---

## Shell Scripts Inventory

### Root Directory Scripts (Primary)

| Script | Location | Purpose | Subcommands | Use Case |
|--------|----------|---------|-------------|----------|
| `run-bank.sh` | `./run-bank.sh` | Main development entry point | `start`, `stop`, `tail` | **PRIMARY** - Local development, all-in-one orchestration |
| `start.sh` | `./start.sh` | Legacy service starter | None | **SECONDARY** - Older, less robust duplicate of run-bank.sh start |
| `stop.sh` | `./stop.sh` | Legacy service stopper | None | **SECONDARY** - Older duplicate of run-bank.sh stop |
| `run-tests.sh` | `./run-tests.sh` | Test suite runner | None | **ACTIVE** - Runs Jest test suites across all packages |

### Utility Scripts

| Script | Location | Purpose | Dependencies | Use Case |
|--------|----------|---------|--------------|----------|
| `reset-upstash.sh` | `./reset-upstash.sh` | Flush Upstash Redis session store | curl, jq, UPSTASH_REDIS_URL | Development/testing - session cleanup |
| `update-upstash.sh` | `./update-upstash.sh` | Update Upstash values | curl, jq, UPSTASH_REDIS_URL | Development/testing - session management |

### Banking API Server Scripts

| Script | Location | Purpose | Invoked By | Status |
|--------|----------|---------|-----------|--------|
| `setup-env.sh` | `banking_api_server/setup-env.sh` | Generate .env from.env.example | Manual setup | Setup wizard for development |
| `setup-p1aic-env.sh` | `banking_api_server/setup-p1aic-env.sh` | PingOne AI Core OAuth setup | Manual setup | Optional AI authentication config |
| `test-api.sh` | `banking_api_server/test-api.sh` | Manual API testing | Development | Ad-hoc endpoint testing |
| `test-oauth-working.sh` | `banking_api_server/test-oauth-working.sh` | OAuth integration testing | Development | Verify OAuth flows (deprecated - use Jest tests) |
| `run-oauth-integration-tests.sh` | `banking_api_server/run-oauth-integration-tests.sh` | OAuth test suite | Development | Jest-based OAuth test runner |
| `docker-entrypoint.sh` | `banking_api_server/docker-entrypoint.sh` | Docker container startup | Docker | Production container initialization |

### Banking MCP Server Scripts

| Script | Location | Purpose | Status |
|--------|----------|---------|--------|
| `docker-entrypoint.sh` | `banking_mcp_server/docker-entrypoint.sh` | Docker container startup | Production container initialization |

### Scripts Directory (CI/Deployment)

| Script | Location | Purpose | Used In | Status |
|--------|----------|---------|---------|--------|
| `install-hooks.sh` | `scripts/install-hooks.sh` | Pre-commit hook setup | Development | Git hook installation |
| `run-all-tests.sh` | `scripts/run-all-tests.sh` | Comprehensive test runner | CI pipelines | Runs all test suites with reporting |
| `restore-vercel-env.sh` | `scripts/restore-vercel-env.sh` | Restore Vercel environment | Development | Re-sync Vercel env vars locally |
| `quick-restore-vercel-env.sh` | `scripts/quick-restore-vercel-env.sh` | Quick Vercel env sync | Development | Fast Vercel env restore |

### LangChain Agent Scripts

| Script | Location | Purpose | Status |
|--------|----------|---------|--------|
| `start-frontend.sh` | `langchain_agent/start-frontend.sh` | LangChain agent frontend starter | Optional agent integration |

### Kubernetes Deployment

| Script | Location | Purpose | Status |
|--------|----------|---------|--------|
| `deploy.sh` | `k8s/deploy.sh` | Kubernetes deployment automation | Production K8s deployments (Phase 55) |

---

## Consolidation Roadmap

### Analysis: Why Full Consolidation Is Not Recommended

The repository already has a **well-structured, feature-complete primary entry point** in `run-bank.sh`. Attempting to consolidate all 18 scripts into a single master script would:

**Negatives:**
- Introduce complexity and coupling (test runner, reset-upstash, setup-env all have different dependencies)
- Make deployment-specific scripts (Docker, K8s) harder to use independently
- Require breaking changes to CI pipelines that invoke secondary scripts directly
- Obscure the purpose of maintenance utilities (reset-upstash is a one-off utility, not a subcommand)

**Existing `run-bank.sh` Capabilities (Already Complete):**
```
✓ start — Full stack orchestration with pre-flight checks
✓ stop — Clean shutdown of all services with PID tracking
✓ tail — Log file viewing with interactive selection
✓ HTTPS support with mkcert CA integration
✓ /etc/hosts management for api.pingdemo.com
✓ Service dependency management (ports, timeouts)
✓ PID file tracking for graceful restarts
✓ Error handling and exit codes
```

### Recommended Action: Deprecate & Document

Instead of consolidating, **document the role of each script** and mark older duplicates as deprecated:

**Keep (Active):**
- `run-bank.sh` — Primary development entry point
- `run-tests.sh` — Test runner (active, used frequently)
- `banking_api_server/run-oauth-integration-tests.sh` — OAuth-specific tests
- `scripts/run-all-tests.sh` — CI test aggregation
- Docker entry points (`docker-entrypoint.sh`) for containers
- K8s deployment (`k8s/deploy.sh`) for orchestration

**Mark as Legacy (Document but Don't Remove):**
- `start.sh`, `stop.sh` — Superceded by `run-bank.sh` (subcommands)
- `test-api.sh`, `test-oauth-working.sh` — Use Jest tests instead
- `banking_api_server/setup-env.sh` — Use setup wizard instead

**Keep as Utilities (Standalone):**
- `reset-upstash.sh`, `update-upstash.sh` — Session management (doesn't fit subcommand pattern)
- `banking_api_server/setup-p1aic-env.sh` — Optional AI Core setup
- `scripts/restore-vercel-env.sh`, `scripts/quick-restore-vercel-env.sh` — Vercel sync
- `scripts/install-hooks.sh` — Git hook setup
- `langchain_agent/start-frontend.sh` — Agent isolation

---

## Unified Entry Point Approach (Alternative: If Consolidation Becomes Necessary)

If future phases require consolidation, here's the recommended structure:

```bash
#!/usr/bin/env bash
# main.sh — Unified entry point (hypothetical future consolidation)

usage() {
  cat << EOF
Usage: ./main.sh <command> [options]

Commands:
  start [all|ui|api|mcp|agent]    Start services (default: all)
  stop                             Stop all services
  restart [service]                Restart services
  logs [service]                   View service logs
  test [unit|integration|all]      Run test suites
  setup [env|hooks|deps]           Setup development environment
  session flush                    Clear Upstash session store
  vercel [sync|list]               Manage Vercel environment variables
EOF
}

# Dispatch subcommands
case "$1" in
  start) run-bank.sh start ;;
  stop) run-bank.sh stop ;;
  test) run-tests.sh ;;
  setup) #... dispatch to setup-env.sh, install-hooks.sh, etc.
  ;;
  *) usage; exit 1 ;;
esac
```

**However:** This adds a layer of indirection to already-working scripts. Recommend **postponing consolidation** unless script management becomes a bottleneck.

---

## Current Pain Points & Solutions

| Issue | Impact | Solution | Priority |
|-------|--------|----------|----------|
| Multiple start/stop scripts | Confusion about which to use | Document that `run-bank.sh` is primary; mark others deprecated | Low |
| PID file management inconsistency | Orphaned processes on unclean exits | `run-bank.sh` already handles this well; `start.sh`/`stop.sh` less robust | Low |
| No CI integration for shell scripts | Hard to test script changes in CI | Add `shellcheck` linting; validate scripts in GH Actions | Medium |
| Scattered setup utilities | Hard to onboard new developers | Consolidate setup docs; link from README to `run-bank.sh` setup section | Medium |
| Docker entry points duplicated | Maintenance burden across containers | Keep as-is; entry points are container-specific | Low |

---

## Recommendations for Phase 84 Follow-up

If Phase 84 Plans 02-03 touch shell scripts, use this guidance:

1. **Do NOT attempt to merge all 18 scripts** — too much scope, too high risk
2. **Keep `run-bank.sh` as the canonical primary entry point**
3. **Document legacy scripts** in README as "deprecated, use run-bank.sh instead"
4. **Fix specific issues, not the whole system:**
   - Add optional pre-flight dependency check to `run-bank.sh` (e.g., check for mkcert, openssl)
   - Add post-start validation after services launch (verify ports responding)
   - Improve error messages if services fail to start
5. **Deprecation note:** Add to each legacy script's comment block:
   ```bash
   # ⚠️  DEPRECATED: Use ./run-bank.sh instead (see ./run-bank.sh for all subcommands)
   ```

---

## Status: READY FOR PHASE 84 PLAN 02-03

All shell scripts have been audited and documented. The consolidation roadmap concludes that the current system is adequate — no major refactoring needed unless a specific issue emerges in Phase 84 Plans 02-03.

**Next:** Execute Plan 02 (unified run.sh entry point consolidation — optional, recommend deferring) and Plan 03 (code quality fixes).
