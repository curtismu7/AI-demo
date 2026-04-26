# Phase 233: Enrich Activity Log with Decoded Token Payloads — Research

**Researched:** 2026-04-26
**Domain:** Token payload enrichment, activity log metadata capture, frontend instrumentation
**Confidence:** HIGH

## Summary

Phase 233 extends the Phase 232 activity log infrastructure with comprehensive token payload decoding and enriched event metadata. The research confirms that the Phase 232 foundation (appEventService.js with NDJSON persistence, 21 instrumented call sites, ring buffer) is solid and ready for enrichment.

Key findings:
- **JWT decode function exists and is extractable** — `decodeJwtClaims()` in agentMcpTokenService.js (lines 92–103) is a clean, non-throwing utility that can be extracted to `utils/tokenUtils.js` without circular dependencies.
- **Existing logEvent call sites are ready for enrichment** — 21 instrumented sites across Phase 232 (oauth.js, cibaService.js, agentMcpTokenService.js, authorize.js, tokenChain.js, agentTokenService.js, delegationService.js) follow a consistent `{ tag, metadata }` pattern, making metadata addition straightforward.
- **POST /api/admin/app-events endpoint needs creation** — D-05 requires a new route for frontend loading-state events; the existing GET endpoint in admin.js (line 954) shows the pattern; POST variant will use `authenticateToken` (not `requireAdmin`).
- **ActivityLogs.js can render enriched metadata** — The UI already handles nested metadata objects (line 127: `response.data.events`), and Phase 224 established JSON expand-on-click patterns in DevToolsDashboard.
- **No duplicate events detected in Phase 232 instrumentation** — Audit of oauth.js, cibaService.js, and bankingAgentLangGraphService.js shows each call site fires once, no overlapping paths.
- **TokenChainContext.js polling is separate from ActivityLogs.js polling** — Different data sources (token events in context vs. app events in logs), consolidation is out of scope for Phase 233.

**Primary recommendation:** Extract `decodeJwt()` to `utils/tokenUtils.js` immediately (pre-step), then execute enrichment in the priority order stated in D-01 (JWT decode → PingOne bodies → LLM prompts → PKCE/CIBA details → session snapshots → frontend POST endpoint). Plan each as a separate task for clarity.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: Full scope — all enrichment types in Phase 233**  
Priority order for planning: (1) JWT decode, (2) PingOne API bodies, (3) LLM prompts, (4) PKCE/CIBA details, (5) session snapshots, (6) frontend loading-state events.

**D-02: JWT decode at call sites, not inside appEventService**  
Each instrumented service decodes and passes `{ jwtFullDecode: { header, claims } }` in metadata. Tokens: user access, MCP/exchanged, agent actor, ID token.

**D-03: Shared tokenUtils.js — extract decodeJwtClaims()**  
New utility: `banking_api_server/utils/tokenUtils.js` with `function decodeJwt(token) → { header, claims } | null`.

**D-04: LLM prompt logging — full text, no truncation**  
Complete prompt and system prompt in `agent_prompt` events. Field names: `{ prompt: string, systemPrompt: string, model: string, toolsAvailable: string[] }`.

**D-05: Frontend loading events — POST /api/admin/app-events**  
New route (or extend existing in admin.js): `POST /api/admin/app-events` with `authenticateToken` only (session-gated, no admin role check). Body: `{ category, severity, message, tag, metadata }`. Frontend helper: `postAppEvent()` in `banking_api_ui/src/services/`, fire-and-forget.

**D-06: PingOne API body capture**  
Log request body (no raw tokens) and response body (status, claims summary, error codes) as `metadata.request` and `metadata.response`. Strip: `access_token`, `id_token`, `refresh_token`, `client_secret` values.

**D-07: PKCE, CIBA, session snapshot details**  
Embed in existing auth_lifecycle events: PKCE method/length, CIBA binding/scope/delivery, session ID hash + role + token presence flags.

**D-08: Holistic event system review (before enrichment)**  
Audit call sites for duplicates, consolidate UI polling, review ActivityLogs.js display, verify appEventService.js code quality, check category/icon/label coverage.

### Claude's Discretion

None explicitly stated in CONTEXT.md. Planner should decide:
- Whether to extract tokenUtils.js pre-phase or as first task
- Task granularity for PingOne body capture (per-service vs. shared helper)
- Whether to refactor ActivityLogs.js display as part of this phase or defer

### Deferred Ideas (OUT OF SCOPE)

- Log rotation / file size management
- Token signature validation status
- Per-category log level filtering

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| JWT decoding (all token types) | API / Backend | — | Decoding happens server-side during event logging; no UI computation |
| Token payload enrichment in events | API / Backend | — | Metadata added at call sites before appEventService persists |
| PingOne API request/response capture | API / Backend | — | BFF makes calls; BFF logs request/response bodies |
| LLM prompt + system prompt logging | API / Backend | — | LangGraph service has full prompt text; logs it |
| PKCE, CIBA, session details | API / Backend | — | OAuth, CIBA, and session services own these details |
| Session state snapshots | API / Backend | — | BFF manages session; logs snapshots at key lifecycle points |
| Frontend loading-state events | Frontend / SPA | API / Backend | UI triggers event POST to new BFF endpoint |
| Activity log rendering | Frontend / SPA | — | ActivityLogs.js renders metadata from `/api/admin/app-events` |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js (fs) | Native | NDJSON file append, directory creation | Phase 232 established, no external deps |
| Express | (via banking_api_server/package.json) | Routing, middleware, POST handler | BFF framework |
| appEventService.js | Phase 232 | Centralized event capture + ring buffer | Built in Phase 232, ready for enrichment |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| crypto (Node.js) | Native | Session ID hashing for snapshot events | PKCE/session safety requirement |
| axios | (existing in server) | PingOne API calls (already used) | Request/response logging captures call details |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shared tokenUtils.js | Import decodeJwtClaims from agentMcpTokenService.js | Creates awkward cross-service dependency; tokenUtils.js is cleaner at scale |
| `authenticateToken` + session middleware | `requireAdmin` for frontend POST endpoint | D-05 explicitly chooses session auth (no role check) so users can log their own events |
| Full prompt text in logs | Truncated prompts | D-04 decided full text; demo prioritizes visibility over file size |

**Installation:**
```bash
npm list crypto fs axios  # all native or already in package.json
```

**Version verification:** All dependencies are native Node.js or already installed in Phase 232. No new npm packages required.

---

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        Frontend (React SPA)                       │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Loading States (Agent, Token Exchange, MCP, MFA)            │ │
│  │  ├─ postAppEvent(category, severity, message, metadata)     │ │
│  │  └─ fires POST /api/admin/app-events (fire-and-forget)      │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ ActivityLogs.js Component                                    │ │
│  │  └─ polls GET /api/admin/app-events every 10s               │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
         │                                          │
         │ POST /api/admin/app-events               │ GET /api/admin/app-events
         │ (session auth + body)                    │ (admin auth)
         │                                          │
         v                                          v
┌──────────────────────────────────────────────────────────────────┐
│                     Express BFF (Node.js)                         │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ POST /api/admin/app-events (NEW — D-05)                     │ │
│  │  ├─ authenticateToken (session only, no role check)         │ │
│  │  ├─ parse { category, severity, message, tag, metadata }    │ │
│  │  └─ call appEventService.logEvent(...)                      │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ GET /api/admin/app-events (EXISTING — Phase 232)            │ │
│  │  └─ appEventService.getEvents({ category, severity, ... })  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Instrumented Services (Enrichment Points)                    │ │
│  │  ├─ oauth.js (callback success + errors)                   │ │
│  │  ├─ cibaService.js (initiate, initiated, denied, timeout)   │ │
│  │  ├─ agentMcpTokenService.js (exchange success/error)        │ │
│  │  ├─ authorize.js (gate decisions + errors)                  │ │
│  │  ├─ bankingAgentLangGraphService.js (LLM prompts)           │ │
│  │  ├─ agentTokenService.js (agent token validation)           │ │
│  │  ├─ tokenChain.js (token chain fetch)                       │ │
│  │  └─ delegationService.js (grant/revoke)                     │ │
│  │                                                              │ │
│  │  Each service:                                               │ │
│  │   (1) decodes tokens via utils/tokenUtils.js:decodeJwt()   │ │
│  │   (2) adds jwtFullDecode: { header, claims } to metadata   │ │
│  │   (3) adds PingOne request/response bodies (D-06)            │ │
│  │   (4) calls appEventService.logEvent(category, severity,   │ │
│  │        message, { tag, metadata })                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ appEventService.js (Phase 232 Foundation)                    │ │
│  │  ├─ Validates event structure                               │ │
│  │  ├─ Pushes to in-memory ring buffer (MAX_EVENTS = 500)       │ │
│  │  └─ Appends to NDJSON file (ACTIVITY_LOG_FILE env var)       │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Utilities                                                    │ │
│  │  └─ utils/tokenUtils.js (NEW — D-03)                        │ │
│  │      └─ decodeJwt(token) → { header, claims } | null        │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
         │
         v
┌──────────────────────────────────────────────────────────────────┐
│                    Storage Layer                                  │
│  ├─ Ring Buffer (in-memory, MAX_EVENTS = 500)                    │
│  └─ NDJSON File (append-only, banking_api_server/logs/activity.  │
│     ndjson)                                                      │
└──────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
banking_api_server/
├── utils/
│   ├── tokenUtils.js          # NEW: shared JWT decoding (decodeJwt)
│   └── [existing utils]
├── services/
│   ├── appEventService.js     # Phase 232: event storage + persistence
│   ├── agentMcpTokenService.js # enriched with jwtFullDecode
│   ├── cibaService.js         # enriched with CIBA details
│   ├── agentTokenService.js   # enriched with actor token decode
│   └── [others: oauth, authorize, bankingAgent...]
├── routes/
│   ├── admin.js               # GET /api/admin/app-events (existing)
│   │                          # POST /api/admin/app-events (NEW)
│   └── [others]
└── logs/
    └── activity.ndjson        # Append-only event log (created at runtime)

banking_api_ui/
├── src/
│   ├── services/
│   │   └── appEventClient.js  # NEW: postAppEvent() helper for frontend
│   ├── components/
│   │   ├── ActivityLogs.js    # existing, renders enriched metadata
│   │   └── DevToolsDashboard.jsx
│   └── context/
│       └── TokenChainContext.js # separate from app events
```

### Pattern 1: JWT Decoding (Extraction + Reuse)

**What:** Extract `decodeJwtClaims()` from agentMcpTokenService.js into a shared utility that returns `{ header, claims }` or `null` on invalid tokens. Use this utility across 5+ instrumented services.

**When to use:** Any service that needs to decode a JWT for event metadata without verifying the signature.

**Example:**
```javascript
// banking_api_server/utils/tokenUtils.js
function decodeJwt(token) {
  if (!token || typeof token !== 'string') { return null; }
  try {
    const parts = token.split('.');
    if (parts.length !== 3) { return null; }
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return { header, claims };
  } catch (_e) {
    return null;
  }
}
module.exports = { decodeJwt };
```

[VERIFIED: agentMcpTokenService.js lines 92–103]

Usage in instrumented service:
```javascript
const { decodeJwt } = require('../utils/tokenUtils');
const { logEvent: logAppEvent } = require('./appEventService');

// ... in OAuth callback or token exchange ...
const userTokenDecoded = decodeJwt(userAccessToken);
logAppEvent('token_exchange', 'info', 'RFC 8693 exchange complete', {
  tag: 'token_exchange/success',
  metadata: {
    jwtFullDecode: userTokenDecoded || undefined,
    exchangedAudience: mcpTokenDecoded?.claims?.aud,
  },
});
```

### Pattern 2: Event Metadata with Optional Fields

**What:** When calling `logAppEvent()`, add optional `metadata.jwtFullDecode` and `metadata.request` / `metadata.response` fields only if available (use `|| undefined` to omit null/undefined).

**When to use:** Every Phase 233 enrichment point where new data (decoded token, API body, prompt text) is available.

**Example:**
```javascript
logAppEvent('auth_lifecycle', 'info', 'OAuth callback received', {
  tag: 'oauth/callback-success',
  metadata: {
    jwtFullDecode: idTokenDecoded || undefined,  // null → omitted
    pkce: {
      code_challenge_method: 'S256',
      code_challenge_length: 64,
    },
    idTokenClaims: {
      sub: idTokenDecoded?.claims?.sub,
      email: idTokenDecoded?.claims?.email,
      acr: idTokenDecoded?.claims?.acr,
    },
  },
});
```

[VERIFIED: appEventService.js lines 66–94, existing logEvent signature]

### Pattern 3: Fire-and-Forget Frontend Event POST

**What:** Frontend helper that POSTs to `/api/admin/app-events` without awaiting response. Non-blocking, suitable for loading-state instrumentation.

**When to use:** At start/end of every async operation that shows a spinner (agent processing, token exchange, MCP tool call, step-up MFA).

**Example:**
```javascript
// banking_api_ui/src/services/appEventClient.js
async function postAppEvent(category, severity, message, options = {}) {
  try {
    await fetch('/api/admin/app-events', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category,
        severity,
        message,
        tag: options.tag,
        metadata: options.metadata || null,
      }),
    });
  } catch (e) {
    // Silently fail — logging infrastructure should not block UX
    console.debug('[appEventClient] Event POST failed:', e.message);
  }
}

export { postAppEvent };
```

Usage in BankingAgent.js:
```javascript
import { postAppEvent } from '../services/appEventClient';

// At agent invoke start
postAppEvent('agent', 'info', 'Agent processing started', {
  tag: 'agent/processing-start',
  metadata: { userId },
});

// At agent response
postAppEvent('agent', 'info', 'Agent response received', {
  tag: 'agent/processing-end',
  metadata: { toolsCalled: result.toolsCalled },
});
```

### Anti-Patterns to Avoid

- **Decoding tokens in multiple places:** Extract to tokenUtils.js once, import everywhere. Don't duplicate the decode logic.
- **Logging PingOne tokens in metadata:** D-06 explicitly says: strip `access_token`, `id_token`, `refresh_token`, `client_secret`. Keep only response status, claims summary, error codes.
- **Synchronous frontend event posts:** Use fire-and-forget (no await). If a logging call blocks the UI, it defeats the purpose.
- **Omitting metadata field entirely:** Use `|| undefined` so the field is cleanly omitted from JSON, not set to `null`. Keeps the event object lean.
- **Adding logEvent calls everywhere:** D-04 from Phase 232 already instrumented 21 key sites. Phase 233 enriches those sites; don't add new ones unless explicitly required.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT decoding (base64url, JSON parsing, error handling) | Custom decode logic per service | utils/tokenUtils.js:decodeJwt() | Decoding has edge cases (invalid base64, malformed JSON, missing parts); a single tested utility avoids bugs and reduces code. |
| Event storage + persistence + ring buffer | File append + in-memory queue manually | appEventService.js (Phase 232) | File sync, max event eviction, filtering, and retrieval already built; Phase 233 only adds metadata enrichment. |
| API request/response logging | Manual header/body capture + filtering | Centralized capture in PingOne API call wrappers | Avoiding log-token leaks is error-prone; better to centralize filtering in one place (e.g., agentMcpTokenService.js exchange logic). |
| Frontend event POST infrastructure | Custom fetch calls in each component | postAppEvent() helper in services/ | Single point for fire-and-forget logic, error handling, and session credential management (credentials: 'include'). |
| Session ID hashing | Raw session ID in snapshot events | crypto.createHash('sha256').update(sessionId).digest('hex').slice(0, 8) | Raw session IDs in logs are a security leak. Hashing is simple but must be consistent across all snapshot events. |

**Key insight:** Phase 233 is primarily about **enriching existing infrastructure**, not building new systems. The Phase 232 foundation (appEventService.js, 21 instrumented call sites) is solid. Phase 233 adds JWT decoding, PingOne body capture, and frontend events on top of that foundation.

---

## Runtime State Inventory

**Trigger:** Phase 233 is not a rename/refactor/migration phase — it's pure enrichment. No schema changes, no existing data structure renames. Skip this section.

---

## Common Pitfalls

### Pitfall 1: Circular Dependencies When Extracting tokenUtils.js

**What goes wrong:** If tokenUtils.js imports from appEventService.js and appEventService.js tries to import from tokenUtils.js, the module system deadlocks.

**Why it happens:** Eager extraction without checking import paths.

**How to avoid:** 
1. tokenUtils.js is **pure utility** — no imports from services, routes, or middleware. Only native Node.js (crypto, Buffer).
2. Services import FROM tokenUtils.js, never the reverse.
3. Verify with: `node -e "require('./utils/tokenUtils.js')"` before commit.

**Warning signs:** `Error: Cannot find module` or `undefined is not a function` on module load (not at runtime).

---

### Pitfall 2: Logging Raw Tokens in PingOne API Metadata (D-06 Violation)

**What goes wrong:** Capturing request/response bodies includes the `access_token`, `id_token`, or `client_secret` values. These leak secrets into the NDJSON log file and UI.

**Why it happens:** Copy-pasting request/response bodies without filtering.

**How to avoid:**
1. Define a **sanitization function** that strips known sensitive fields before logging:
   ```javascript
   function sanitizePingOneBody(body) {
     const { access_token, id_token, refresh_token, client_secret, ...safe } = body;
     return safe;
   }
   ```
2. Use this in every PingOne API call site (agentMcpTokenService.js exchange, cibaService.js, oauth.js callback).
3. Test with a token-containing body: `console.log(sanitizePingOneBody({ access_token: 'xyz', aud: 'api' }))` should output `{ aud: 'api' }` only.

**Warning signs:** Token strings in the NDJSON log file (visible in editor or `tail -f logs/activity.ndjson`).

---

### Pitfall 3: Frontend Event POST Blocking on Network Errors

**What goes wrong:** If `postAppEvent()` await-s the fetch and the network is slow or down, the UI hangs while waiting for the logging call to complete.

**Why it happens:** Treating logging as a critical operation instead of a best-effort side effect.

**How to avoid:**
1. **Never await** the fetch in postAppEvent(); use fire-and-forget.
2. Wrap in try/catch with silent failure (console.debug only, no console.error that might leak tokens).
3. Verify: `postAppEvent(...)` should return immediately (synchronous), not a Promise.

**Warning signs:** UI freezes or becomes unresponsive during token exchange or agent processing.

---

### Pitfall 4: Duplicate Event Firing (Phase 232 Artifact)

**What goes wrong:** Same action (e.g., RFC 8693 exchange completion) logs events in both the route handler AND the service. ActivityLogs.js shows the same event twice.

**Why it happens:** Not auditing where logEvent() calls already exist from Phase 232.

**How to avoid:**
1. Before adding enrichment to a call site, search for existing logEvent calls on that path:
   ```bash
   grep -n "logEvent.*rfc8693\|logEvent.*exchange" banking_api_server/services/*.js
   ```
2. D-08 audit: verify each action has exactly one logEvent call site (not duplicated in route + service).
3. Test: run a token exchange and count matching events in ActivityLogs.js (should be 1 per exchange, not 2).

**Warning signs:** ActivityLogs.js shows identical events with the same timestamp.

---

### Pitfall 5: Missing Category/Icon Entries in ActivityLogs.js

**What goes wrong:** New event categories (or new sub-categories) are logged to appEventService, but ActivityLogs.js CATEGORY_ICONS and CATEGORY_LABELS don't have entries. Events render as [undefined] in the UI.

**Why it happens:** Forgetting to add icon/label pairs when adding new event metadata.

**How to avoid:**
1. Every new `logEvent(category, ...)` call must have a corresponding entry in ActivityLogs.js:
   ```javascript
   const CATEGORY_ICONS = {
     // existing...
     agent_prompt: '\u{1F9E0}',  // Phase 232 added this
     // Phase 233 may add more
   };
   const CATEGORY_LABELS = {
     agent_prompt: 'Agent Prompt',  // matching label
   };
   ```
2. Verify: Before commit, check that every `EVENT_CATEGORIES` value in appEventService.js has an entry in CATEGORY_ICONS and CATEGORY_LABELS.
3. Test: Load ActivityLogs.js in the UI and filter by each category — should show icon + label, never [undefined].

**Warning signs:** ActivityLogs.js component throws a React key warning or renders blank categories.

---

## Code Examples

Verified patterns from official/existing code:

### JWT Decoding (Extract to tokenUtils.js)

```javascript
// Source: agentMcpTokenService.js lines 92–103
function decodeJwt(token) {
  if (!token || typeof token !== 'string') { return null; }
  try {
    const parts = token.split('.');
    if (parts.length !== 3) { return null; }
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return { header, claims };
  } catch (_e) {
    return null;
  }
}
module.exports = { decodeJwt };
```

### JWT Enrichment in logEvent Call

```javascript
// Source: Pattern from agentMcpTokenService.js + appEventService.js
const { decodeJwt } = require('../utils/tokenUtils');
const { logEvent: logAppEvent } = require('./appEventService');

// In token exchange flow
const exchangedTokenDecoded = decodeJwt(exchangedToken);
logAppEvent('token_exchange', 'info', 'RFC 8693 exchange successful', {
  tag: 'token_exchange/success',
  metadata: {
    jwtFullDecode: exchangedTokenDecoded || undefined,  // null → omitted
    aud: exchangedTokenDecoded?.claims?.aud,
    scope: exchangedTokenDecoded?.claims?.scope,
  },
});
```

### POST /api/admin/app-events Endpoint (Express Route)

```javascript
// Source: Pattern from admin.js GET /app-events (line 954)
const { authenticateToken } = require('../middleware/auth');
const { logEvent: logAppEvent } = require('../services/appEventService');

router.post('/app-events', authenticateToken, (req, res) => {
  try {
    const { category, severity, message, tag, metadata } = req.body;
    
    // Validation
    if (!category || !severity || !message) {
      return res.status(400).json({
        error: 'missing_fields',
        message: 'category, severity, and message are required',
      });
    }
    
    // Log the event (fires to both ring buffer + NDJSON file)
    const event = logAppEvent(category, severity, message, { tag, metadata });
    
    res.status(201).json({ event });
  } catch (error) {
    console.error('POST /app-events error:', error);
    res.status(500).json({ error: 'internal_server_error' });
  }
});
```

### Frontend Event Client (appEventClient.js)

```javascript
// Source: Pattern from tokenChainContext.js fetch pattern
async function postAppEvent(category, severity, message, options = {}) {
  try {
    const body = {
      category,
      severity,
      message,
      tag: options.tag || null,
      metadata: options.metadata || null,
    };
    
    await fetch('/api/admin/app-events', {
      method: 'POST',
      credentials: 'include',  // include session cookie
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    // Silent fail — logging should not block UX
    console.debug('[appEventClient] POST /app-events failed:', e.message);
  }
}

export { postAppEvent };
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Scattered console.log calls with tags | Centralized appEventService.js (Phase 232) | Phase 232 (2026-04-25) | Structured events, persistent storage, UI visibility |
| No token payload data in logs | jwtFullDecode: { header, claims } (Phase 233) | Phase 233 (this phase) | Full JWT visibility in Activity Logs for debugging |
| Manual token decoding per service | Shared utils/tokenUtils.js:decodeJwt() (Phase 233) | Phase 233 (this phase) | Reduced code duplication, single source of truth |
| No LLM prompt logging | Full prompt + system prompt in agent_prompt events (Phase 233) | Phase 233 (this phase) | Audit trail for AI decision making |
| No frontend event capture | POST /api/admin/app-events endpoint (Phase 233) | Phase 233 (this phase) | Loading states, UX flow visibility in server logs |

**Deprecated/outdated:**
- Manual token decoding logic duplicated across services — Phase 233 centralizes to tokenUtils.js
- Server-only event logging — Phase 233 adds frontend event POST capability

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | decodeJwt() from agentMcpTokenService.js (lines 92–103) can be extracted to utils/tokenUtils.js without circular dependencies | Standard Stack | If there are hidden imports, extraction fails on require(); mitigation: run `node -e "require('./utils/tokenUtils.js')"` after extraction |
| A2 | All 21 Phase 232 instrumented call sites follow `{ tag, metadata }` pattern and are ready for metadata enrichment | Architecture Patterns | If some call sites use different signature, enrichment task fails; mitigation: audit appEventService.logEvent() callers before planning |
| A3 | POST /api/admin/app-events endpoint can be added to admin.js (or new routes file) and mounted in server.js | Architecture Patterns | If routing precedence conflicts with existing routes, POST fails; mitigation: check server.js mount order and test route before commit |
| A4 | TokenChainContext.js polling (line 116: `setInterval(fetchMCPToolCalls, 15000)`) is independent of ActivityLogs.js polling (line 137: `setInterval(fetchAppEvents, 10000)`) and consolidation is out of scope | Architecture Patterns | If they share data source, consolidation is needed; mitigation: confirm data sources (`/api/token-chain` vs. `/api/admin/app-events`) are different; D-08 audit will clarify |
| A5 | ActivityLogs.js metadata rendering (line 127: `response.data.events`) already handles nested objects; no UI changes needed for enriched metadata | Architecture Patterns | If UI needs expand-on-click for large nested objects, may need ActivityLogs.js polish; mitigation: Phase 224 established DevToolsDashboard expand pattern, reuse it |
| A6 | crypto.createHash() (Node.js native) can hash session IDs for snapshot events without adding dependencies | Standard Stack | If crypto module is unavailable, session hashing fails; mitigation: crypto is native since Node.js v0.1.6, always available |
| A7 | fire-and-forget postAppEvent() (no await, silent fail) is acceptable for frontend logging without blocking UX | Architecture Patterns | If logging calls must be awaited for reliability, UX may hang; mitigation: confirm with user that best-effort logging is acceptable for a demo |

**User confirmation needed before execution:**
- A5: ActivityLogs.js display polish scope (in-phase vs. deferred to Phase 234+)
- A7: Frontend logging reliability requirements (fire-and-forget acceptable?)

---

## Open Questions

1. **ActivityLogs.js display improvement scope**
   - What we know: Phase 224 established JSON expand-on-click in DevToolsDashboard; ActivityLogs.js will render enriched metadata (jwtFullDecode, PingOne bodies, LLM prompts).
   - What's unclear: Does Phase 233 include refactoring ActivityLogs.js to use the same expand pattern, or does it render metadata as raw JSON?
   - Recommendation: D-08 includes "ActivityLogs.js display review" — scope this as part of holistic audit, then decide if it's a separate enrichment task.

2. **PingOne API body capture strategy**
   - What we know: D-06 requires sanitizing request/response bodies (strip tokens).
   - What's unclear: Should sanitization be a shared helper (e.g., utils/pingOneBodySanitizer.js) or inline in each service?
   - Recommendation: If PingOne body capture spans 3+ services, build shared sanitizer. If 1–2 sites, inline is fine.

3. **Frontend event categories and loading states**
   - What we know: D-05 lists four loading states (agent, token exchange, MCP, step-up MFA).
   - What's unclear: Are there other frontend loading states (e.g., agent consent HITL waiting, session refresh)?
   - Recommendation: Planner should audit BankingAgent.js, TokenChainContext.js, and auth loading indicators to identify all spinner/loading states before implementing frontend POST.

---

## Environment Availability

**Trigger:** Phase 233 is code/config changes only; no external tool dependencies beyond those already required by the banking app (Node.js, npm, Express, PingOne API access).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (fs, crypto, Buffer) | JWT decode, session hashing, NDJSON append | ✓ | (native to Node.js) | — |
| Express.js | POST /api/admin/app-events routing | ✓ | (already in banking_api_server) | — |
| npm | Module installation (no new packages) | ✓ | (already in project) | — |
| PingOne API | OAuth, token exchange, CIBA | ✓ | (configured in banking_api_server) | — |

**Missing dependencies with no fallback:** None — all requirements are already available in the banking app stack.

**Missing dependencies with fallback:** None.

---

## Validation Architecture

**Framework:** Phase 232 and prior phases established appEventService.js event capture. Phase 233 enriches events. Validation approach:

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (if test suite exists) or manual verification (integration tests in existing test dirs) |
| Config file | banking_api_server/package.json (scripts.test if defined) |
| Quick run command | `npm test -- --testPathPattern="appEventService"` (if tests exist) or manual route test |
| Full suite command | `npm test` (banking_api_server) + `npm run build` (banking_api_ui) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-03 | tokenUtils.js:decodeJwt() decodes valid JWTs without throwing | unit | `node -e "const {decodeJwt}=require('./utils/tokenUtils');const t='eyJhbGc...';console.log(decodeJwt(t).claims.sub)"` | ❌ Wave 0 |
| D-02 | logEvent() with jwtFullDecode metadata persists to NDJSON file | integration | Run token exchange; grep activity.ndjson for jwtFullDecode field | ✅ (appEventService.js tests likely exist) |
| D-05 | POST /api/admin/app-events with authenticateToken succeeds | integration | `curl -X POST http://localhost:3001/api/admin/app-events -H "Authorization: Bearer ..." -d '{"category":"test",...}'` | ❌ Wave 0 |
| D-06 | PingOne response bodies logged without access_token values | unit | Grep activity.ndjson; assert no `"access_token"` in response metadata | ❌ Wave 0 |
| D-04 | LLM prompts logged in full without truncation | integration | Agent invoke; grep activity.ndjson for agent_prompt events; verify prompt field length | ✅ (partial: agent_prompt events exist) |

### Sampling Rate
- **Per task commit:** Run unit tests for new utilities (tokenUtils.js, POST endpoint); verify NDJSON structure.
- **Per wave merge:** Full integration test: token exchange → ActivityLogs.js shows enriched event with jwtFullDecode.
- **Phase gate:** Before `/gsd-verify-work`: 1) tokenUtils.js decodes sample JWTs correctly, 2) POST endpoint accepts frontend events, 3) ActivityLogs.js displays enriched metadata without errors, 4) activity.ndjson contains expected fields (no leaked tokens).

### Wave 0 Gaps
- [ ] `banking_api_server/utils/tokenUtils.js` — unit tests for decodeJwt() with valid/invalid/malformed JWTs
- [ ] `banking_api_server/routes/admin.js` POST handler — integration test for authenticateToken gating
- [ ] `banking_api_ui/src/services/appEventClient.js` — unit test for fire-and-forget behavior (no await blocking)
- [ ] NDJSON structure validation — verify jwtFullDecode, request, response fields are logged cleanly (no truncation, no token values)

*(If test infrastructure exists, re-use existing appEventService test patterns. If minimal, manual verification is acceptable for a demo.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | (Auth happens in OAuth.js, tokenChain.js; Phase 233 logs events, doesn't change auth) |
| V3 Session Management | Yes | authenticateToken middleware guards POST /api/admin/app-events (session-based, no role escalation) |
| V4 Access Control | Partial | POST endpoint uses authenticateToken (any role can log events); GET /api/admin/app-events uses requireAdmin (admin visibility only) |
| V5 Input Validation | Yes | logEvent() body validation: category, severity, message required; no SQL or code injection vectors |
| V6 Cryptography | Yes | Session ID hashing in snapshots (SHA-256, no raw IDs); token decoding display-only (no re-encryption) |

### Known Threat Patterns for {Node.js/Express/Activity Logging}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Sensitive data (tokens) in logs | Information Disclosure | D-06: Strip access_token, id_token, refresh_token, client_secret from PingOne API metadata; logEvent() never includes raw tokens in metadata |
| Session ID leakage in logs | Information Disclosure | D-07: Hash session IDs in snapshot events (SHA-256 first 8 chars); never log raw session ID |
| Unauthorized event insertion (POST /api/admin/app-events) | Tampering | authenticateToken middleware; endpoint requires valid session, not restricted to admin (allows frontend logging) |
| Log file tampering (NDJSON file on disk) | Tampering | ACTIVITY_LOG_FILE env var points to writable path; in production, should be write-only log store (e.g., Datadog, syslog); demo file is acceptable but not production-ready |
| Denial of Service via log flooding (frontend POST events) | Denial of Service | appEventService.js MAX_EVENTS = 500; oldest events evicted on buffer overflow; NDJSON file grows unbounded (out of scope for Phase 233) |

**Phase 233 security notes:**
- No new authentication/authorization logic — reuse existing middleware (authenticateToken, requireAdmin).
- JWT decoding is display-only (no signature verification, no reliance on decoded claims for access control).
- Token payloads logged to NDJSON must be sanitized of secrets (D-06).
- POST /api/admin/app-events requires session auth but not admin role, allowing users to log their own events.

---

## Sources

### Primary (HIGH confidence)
- **agentMcpTokenService.js (lines 92–103)** — decodeJwtClaims() implementation verified [VERIFIED: repo file]
- **appEventService.js (lines 1–160)** — Event service structure, logEvent signature, ring buffer, NDJSON persistence [VERIFIED: repo file]
- **admin.js (line 954+)** — GET /api/admin/app-events endpoint pattern [VERIFIED: repo file]
- **middleware/auth.js** — authenticateToken middleware signature [VERIFIED: repo file]
- **ActivityLogs.js (lines 1–200)** — CATEGORY_ICONS, CATEGORY_LABELS, event rendering [VERIFIED: repo file]
- **233-CONTEXT.md** — User decisions D-01 through D-08 [CITED: .planning/phases/233-*/233-CONTEXT.md]
- **232-CONTEXT.md and 232-04-SUMMARY.md** — Phase 232 foundation: 21 instrumented call sites, appEventService.js structure [CITED: .planning/phases/232-*]

### Secondary (MEDIUM confidence)
- **bankingAgentLangGraphService.js (lines 251–288)** — agent_prompt event instrumentation examples [VERIFIED: repo file]
- **cibaService.js (lines 100–113)** — auth_lifecycle event emission pattern [VERIFIED: repo file]
- **TokenChainContext.js (lines 82–116)** — Frontend polling architecture [VERIFIED: repo file]

---

## Metadata

**Confidence breakdown:**
- **Standard Stack:** HIGH — decodeJwt() already exists and tested; appEventService.js is Phase 232 foundation; no new npm packages.
- **Architecture:** HIGH — Phase 232 call sites verified; admin.js GET endpoint pattern confirmed; authenticateToken middleware exists.
- **Pitfalls:** MEDIUM — Common issues inferred from JWT/logging patterns; no specific bugs reported in Phase 232; circular dependency risk is theoretical (mitigated by tokenUtils.js design).
- **Security:** MEDIUM — Token leakage mitigated by D-06 sanitization rules; firewall/network security out of scope (demo app).

**Research date:** 2026-04-26
**Valid until:** 2026-05-10 (14 days — stable framework, minor version risk if Node.js or Express changes)

---

*Phase: 233-enrich-activity-log-with-decoded-token-payloads-log-full-jwt*
*Research completed: 2026-04-26*
