---
phase: 153-postman-collections-fix
plan: 01
status: complete
---

# Phase 153 Plan 01 — Summary

## What was done

Audited all 3 Postman files. Auth flow, redirect URIs, and naming were already fixed. Scope strings were not aligned with canonical registry — fixed in follow-up.

## Findings

### Super-Banking-PingOne-Test.postman_collection.json — Already Fixed ✅
- Has `sessionCookie` collection variable with empty default
- Has Cookie header `connect.sid={{sessionCookie}}` on all session-dependent requests
- Has comprehensive auth documentation ("🔐 Authentication" folder)

### PingOne Authorization Code — pi.flow.postman_collection.json — Fixed ✅
- `redirect_uri` already correct (local port 4000, `/oauth/user/callback`)
- **Fixed**: `scope` variable: `banking:agent:invoke` → `banking:read banking:write` (canonical)
- **Fixed**: Step 5 token exchange: deprecated compounds → `banking:read banking:write` (canonical)

### Super-Banking-Local.postman_environment.json — Fixed ✅
- **Fixed**: `mcpTokenExchangeScopes`: removed non-canonical `banking:mcp:invoke`

## Files modified
- `postman/Super-Banking-Local.postman_environment.json`
- `postman/PingOne Authorization Code — pi.flow.postman_collection.json`
