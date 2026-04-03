---
status: investigating
trigger: "POST https://banking-demo-puce.vercel.app/api/mcp/tool 400 (Bad Request)"
created: 2026-04-01T00:00:00Z
updated: 2026-04-01T00:00:00Z
---

## Current Focus

hypothesis: Prior fix (bcf604c) did not resolve the 400 — either the async stream read doesn't work in Vercel serverless (body already consumed), OR the tool/params shape is wrong at call site
test: Read current server.js handler + client-side call site to trace exact payload shape sent vs what handler expects
expecting: Mismatch between what client sends and what handler validates
next_action: Read server.js POST /api/mcp/tool handler + client fetch call site

## Symptoms

expected: POST /api/mcp/tool returns 200 with tool result
actual: POST /api/mcp/tool returns 400 (Bad Request) on Vercel production
errors: "POST https://banking-demo-puce.vercel.app/api/mcp/tool 400 (Bad Request)" — browser call stack shows onKeyDown → agent UI pipe
reproduction: Trigger an MCP tool call from the AI assistant in the banking demo UI
started: Observed during Phase 07 UAT; a fix was applied in bcf604c but error still occurs

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-01T00:00:00Z
  checked: conversation summary
  found: bcf604c added defensive async Buffer re-parse fallback for cold-start body loss; fix was committed and deployed
  implication: Either the fix didn't address the real cause, or the fix itself has a bug, or there's a second code path causing 400

## Resolution

root_cause:
fix:
verification:
files_changed: []
