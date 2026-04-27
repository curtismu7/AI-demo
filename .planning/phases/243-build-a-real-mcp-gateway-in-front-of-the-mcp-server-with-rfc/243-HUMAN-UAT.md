---
status: partial
phase: 243-build-a-real-mcp-gateway-in-front-of-the-mcp-server-with-rfc
source: [243-VERIFICATION.md]
started: 2026-04-27T00:00:00Z
updated: 2026-04-27T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live PingOne Authorize round-trip — policy deny blocks request
expected: Gateway calls PingOne Authorize endpoint, receives DENY, returns HTTP 403 with structured JSON error; no upstream MCP call is made
result: [pending]

### 2. Per-hop aud enforcement — upstream rejects gateway-aud token directly
expected: Upstream MCP server (MCP_GATEWAY_MODE=true) returns 401 with D-05 violation error when a gateway-aud token is sent directly, bypassing the gateway
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
