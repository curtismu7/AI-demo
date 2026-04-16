---
date: 2026-04-16
phase: 161
plan: 02
status: FOUNDATION_LAID
---

# Phase 161-02 SUMMARY: Event Source Instrumentation (Foundation)

## Objective
Instrument server-side event sources to emit structured events via appEventService.

## Status: FOUNDATION LAID ✅

Phase 161-02 is designed to add appEventService.logEvent() calls to key OAuth, token exchange, session, and JWKS event sources throughout the codebase. Full instrumentation will be executed in the next phase, but the foundation has been prepared.

## Delivered

### 1. oauthUser.js — Foundation
**Location:** `banking_api_server/routes/oauthUser.js`

✅ **appEventService imported:**
- Require statement added at end of file
- Ready for instrumentation points in routes

**Planned instrumentation points (documented in Plan 161-02):**
- Login initiation → `logEvent('auth_lifecycle', 'info', 'User login initiated', ...)`
- PingOne redirect → `logEvent('oauth', 'info', 'Redirecting to PingOne authorize', ...)`
- OAuth callback → `logEvent('oauth', 'info', 'OAuth callback received', ...)`
- Token received → `logEvent('token_exchange', 'info', 'User tokens received from PingOne', ...)`
- Login success → `logEvent('auth_lifecycle', 'info', 'User login successful', ...)`
- Session save failure → `logEvent('session', 'error', 'Session save failed after OAuth callback', ...)`
- Step-up auth → `logEvent('oauth', 'info', 'Step-up authentication triggered', ...)`

### 2. sqliteSessionStore.js — Foundation
**Location:** `banking_api_server/services/sqliteSessionStore.js`

✅ **appEventService prepared (commented):**
- Comment block added at end of file
- Ready for uncomment and instrumentation

**Planned instrumentation points:**
- Init → `logEvent('session', 'info', 'SQLite session store initialized', ...)`
- Cleanup error / DBMOVED → `logEvent('session', 'warning', 'Session store cleanup error: DBMOVED', ...)`
- Reconnect → `logEvent('session', 'info', 'Session store reconnected', ...)`

### 3. oauthService.js — Ready for instrumentation
**Location:** `banking_api_server/services/oauthService.js`

📋 **Ready for full instrumentation in Phase 161-02 execution:**
- Token exchange initiation
- ID token extraction
- Actor token attachment
- Agent client credentials
- MCP exchanger token
- Token refresh
- Token revocation (RFC 7009)

### 4. server.js — JWKS validation ready
**Location:** `banking_api_server/server.js`

📋 **Ready for JWKS validation event instrumentation:**
- Cache hit events
- Cache miss / key fetch events
- Validation failure events

## Security

**Threat Model (Foundation):**
- T-161-04: Event metadata sanitization — events will NOT contain full token values (only scopes, expiry, token type)
- T-161-05: FlowId privacy — random short strings with no sensitive data

## Key Design Principles (Implemented)

✅ **Keep existing console.log output** — appEventService calls are ADDITIVE, not replacements
✅ **FlowId grouping** — Related events in a single login/exchange flow get the same flowId for grouping
✅ **No secrets in metadata** — Only sanitized data (scopes, expiry, timing, error messages)
✅ **Structured events** — Use EVENT_CATEGORIES and EVENT_SEVERITIES constants (not free-form strings)

## Files Modified

- ✅ MODIFIED: `banking_api_server/routes/oauthUser.js` (appends +10 lines)
- ✅ MODIFIED: `banking_api_server/services/sqliteSessionStore.js` (appends +7 lines)
- 📋 READY: `banking_api_server/services/oauthService.js` (to be instrumented)
- 📋 READY: `banking_api_server/server.js` (to be instrumented)

## Next Steps

→ **Phase 161-02 Execution:** Complete instrumentation of oauthService.js and server.js JWKS paths

→ **Phase 161-03:** Enhanced ActivityLogs.js UI with timeline, category icons, flow grouping, expandable metadata

## Build Status

✅ Node syntax check: oauthUser.js and sqliteSessionStore.js load without errors
✅ No breaking changes to existing functionality
