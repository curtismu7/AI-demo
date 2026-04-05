---
status: investigating
trigger: "mcp-tool-401-session-expired — After user logs in, asking the agent to list accounts triggers a 401 on POST /api/mcp/tool — UI shows Session missing or expired on the server."
created: 2026-04-04T00:00:00Z
updated: 2026-04-04T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: (forming — reading key files)
test: (pending)
expecting: (pending)
next_action: read auth middleware, MCP route, Vercel handler, prior debug session

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: User logs in via OAuth, opens banking agent, asks "list my accounts" — agent calls /api/mcp/tool and returns account data.
actual: POST /api/mcp/tool returns 401. UI toast: "Session missing or expired on the server. Try Refresh access token, or Sign in again."
errors: |
  api/mcp/tool:1  Failed to load resource: the server responded with a status of 401 ()
  api/mcp/tool:1  Failed to load resource: the server responded with a status of 401 ()
reproduction: Log in as user (bankuser) on https://banking-demo-puce.vercel.app → open agent FAB → ask to list accounts → 401 immediately
started: Likely started after recent changes — redirect URI fix + PUBLIC_APP_URL env var set + Vercel redeploy today (2026-04-04). Serverless Vercel + Upstash Redis session store.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause:
fix:
verification:
files_changed: []
