# Phase 235: Surface Introspection Validation Results in Token Chain — Research

**Researched:** 2026-05-03  
**Domain:** OAuth 2.0 Token Introspection, PingOne RFC 7662, Token Chain UI  
**Confidence:** HIGH  
**Status:** Implementation completed (235-01-PLAN.md executed)

## Summary

Phase 235 surfaces token introspection validation results to end users through two UI surfaces: the Activity Log and the Token Chain display panel. Token introspection is the runtime practice of querying PingOne to confirm a token is still active and not revoked (RFC 7662), as opposed to local JWT signature validation alone.

The phase is **complete** as of commit 6115d884. All 5 tasks have been implemented:
1. Added `INTROSPECTION` event category to `appEventService.js` with 🔬 emoji
2. Integrated `logAppEvent()` calls in `tokenIntrospectionService.validateToken()` on active/inactive/error results
3. Integrated `logAppEvent()` calls in `tokenIntrospection.js` middleware on validation, rejection, and error
4. Added `validationMode` field to GET `/api/token-chain` response
5. Added introspection hint badge ("🔬 PingOne verified") to TokenChainDisplay user-token events when validation mode is introspection

**Primary recommendation:** For future introspection-related features, follow the established patterns: log events via `appEventService.logEvent()` for audit visibility, expose validation mode via configuration, and render UI hints based on that mode in TokenChainDisplay's EventRow component.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Token introspection (RFC 7662) | API / Backend | — | PingOne endpoint lives server-side; introspection must never expose raw tokens to client |
| Introspection event logging | API / Backend (Service) | — | `appEventService` is centralized backend event store |
| Activity log rendering | Frontend UI (React) | — | `ActivityLogs.js` is pure presentation; reads from backend `/api/app-events` |
| Token chain retrieval | API / Backend (Route) | Frontend (polling) | BFF route `/api/token-chain` provides; frontend `TokenChainContext` polls every 15s |
| Validation mode configuration | API / Backend (Config) | Frontend (Read-Only) | `validationModeConfig.js` controls backend behavior; exposed to frontend via response field |
| Token chain UI hints | Frontend UI (React) | — | `TokenChainDisplay.js` EventRow component renders validation mode as visual hint |

## Domain Context: Token Introspection

### What Is Token Introspection?

**RFC 7662 defines two token validation approaches:**

1. **Local JWT Validation (Fast, Offline)**
   - Validate JWT signature using PingOne's public key (RS256)
   - ~1ms latency, zero network calls
   - **Limitation:** Cannot detect revoked tokens (token remains valid until expiry)
   - Set via `VALIDATION_MODE=jwt`

2. **Active-Token Introspection (Real-Time, Network)**
   - Call PingOne's RFC 7662 introspection endpoint in real time
   - Confirms token is still active (not revoked, not suspended)
   - ~50ms latency (mitigated by 30-second in-memory cache)
   - **Best for:** High-security operations, compliance requirements
   - Set via `VALIDATION_MODE=introspection` (default)

### How PingOne Introspection Works

**tokenIntrospectionService.js (lines 50-176) implements:**
- Endpoint: `PINGONE_INTROSPECTION_ENDPOINT` or auto-derived from token endpoint by replacing `/token` with `/introspect`
- Credentials: `PINGONE_INTROSPECTION_CLIENT_ID` + `PINGONE_INTROSPECTION_CLIENT_SECRET` (or fallback to worker app)
- Auth method: `post` (default) or `basic` header-based
- Request: POST with `token` + optional `client_id`, `client_secret`
- Response fields extracted:
  - `active: boolean` — token still valid
  - `scope: string[]` — authorized scopes
  - `sub: string` — user ID
  - `exp: number` — expiry timestamp (seconds)
  - `aud: string` — intended audience
  - `client_id: string` — client that holds the token

**Caching:** In-memory Map with SHA256(token) as key, 30-second TTL, automatic eviction every 60 seconds (prevents unbounded memory growth per Review.md #19).

### Validation Mode Configuration

**validationModeConfig.js (lines 28-104)** [VERIFIED: codebase]
- `VALIDATION_MODES.INTROSPECTION = 'introspection'` (default)
- `VALIDATION_MODES.JWT = 'jwt'`
- Runtime setter: `setValidationMode(mode)` (in-memory only, not persisted to disk)
- Exposed to frontend via `GET /api/token-chain` response field `validationMode`
- Current mode initialized from `VALIDATION_MODE` env var at server startup

## Standard Stack

### Core Services
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| axios | (bundled) | HTTP client for PingOne introspection endpoint | Handles retry/timeout logic, consistent error format |
| crypto (Node.js) | Built-in | SHA256 hashing for cache keys | Standard library, no external dependency |
| jsonwebtoken | (bundled) | JWT decode (no verification) for claims extraction | De facto standard for OAuth/OIDC token handling |

### Event Logging
| Library | Component | Purpose |
|---------|-----------|---------|
| appEventService.js | SERVICE | Structured event capture (ring buffer + NDJSON file persistence) |
| logger.js | SERVICE | Unstructured logging (file + console) |

### Configuration
| Component | Purpose |
|-----------|---------|
| validationModeConfig.js | Runtime token validation strategy selector |
| configStore.js | Persistent configuration (read from UI or env) |

## Architecture Patterns

### Token Introspection Flow

```
Request arrives at BFF
  ↓
tokenIntrospection middleware (optional, enabled by ENABLE_TOKEN_INTROSPECTION=true)
  ↓
Call tokenIntrospectionService.validateToken(token)
  ↓
  ├─ Check SHA256(token) in memory cache
  │  └─ Cache hit: return cached result (no network)
  ├─ Cache miss: POST to PingOne introspection endpoint
  │   ├─ Success: cache result + logAppEvent(INTROSPECTION, 'info'|'warning', {...})
  │   └─ Error: logAppEvent(INTROSPECTION, 'error', {...})
  ↓
Set req.tokenIntrospection = {active, sub, client_id, scope, exp, iat}
  ↓
Continue to next middleware / route handler
```

### Event Logging Pattern

**All introspection events flow through `appEventService.logEvent(category, severity, message, options)`:**

| Where | Event Category | Severity | Tag | Metadata |
|-------|---|----------|-----|----------|
| tokenIntrospectionService.validateToken() on success | INTROSPECTION | info/warning | introspection/active or introspection/inactive | {active, sub, client_id, scopeCount, scopes, exp} |
| tokenIntrospectionService.validateToken() on error | INTROSPECTION | error | introspection/error | {error: "message"} |
| tokenIntrospection middleware on valid token | INTROSPECTION | info | introspection/middleware-validated | {active: true, sub, path, scope} |
| tokenIntrospection middleware on invalid token | INTROSPECTION | warning | introspection/middleware-inactive | {sub, path} |
| tokenIntrospection middleware on error | INTROSPECTION | error | introspection/middleware-error | {error: "message", path} |

**Key principle:** Never log raw token strings — only decoded claims fields (sub, scopes, client_id, etc.).

### UI Rendering Pattern: Token Chain Hints

**TokenChainDisplay.js EventRow component (lines 1067–1071):**
```typescript
const introspectionHint =
  validationMode === 'introspection' &&
  (event.tokenType === 'user_token' || event.eventType === 'auth' || 
   event.id === 'user-token' || 
   (event.id && event.id.startsWith('synthetic-session')))
    ? { text: '\u{1F52C} PingOne verified', cls: 'ok' }
    : null;
```

Shows "🔬 PingOne verified" hint (green) on:
- User token events only (not exchanged tokens)
- When `validationMode === 'introspection'`
- Rendered alongside other hints (may_act, act, aud, scope injection)

## Integration Points

### 1. appEventService.js — Event Category Registration

**Current state (lines 14–26):** [VERIFIED: codebase]
```javascript
const EVENT_CATEGORIES = {
  OAUTH: 'oauth',
  TOKEN_EXCHANGE: 'token_exchange',
  SESSION: 'session',
  JWKS: 'jwks',
  MCP: 'mcp',
  AUTH_LIFECYCLE: 'auth_lifecycle',
  AGENT: 'agent',
  AUTHORIZE: 'authorize',
  AGENT_PROMPT: 'agent_prompt',
  DELEGATION: 'delegation',
  INTROSPECTION: 'introspection',  // ✅ Phase 235 added this
};
```

### 2. ActivityLogs.js — Icon/Label Mapping

**Current state (lines 16–40):** [VERIFIED: codebase]
```javascript
const CATEGORY_ICONS = {
  oauth: '\u{1F511}',
  token_exchange: '\u{1F504}',
  // ... other categories ...
  introspection: '\u{1F52C}',  // 🔬 microscope emoji
};

const CATEGORY_LABELS = {
  oauth: 'OAuth',
  token_exchange: 'Token Exchange',
  // ... other categories ...
  introspection: 'Introspection',  // ✅ Phase 235 added
};
```

The Activity Log component queries `/api/app-events?category=introspection` to retrieve introspection events. The UI renders each with the 🔬 icon and "Introspection" label.

### 3. tokenIntrospectionService.js — Service-Level Logging

**Current state (lines 156–159 on success, 168–169 on error):** [VERIFIED: codebase]
```javascript
// On successful network call (cache miss)
logAppEvent(EVENT_CATEGORIES.INTROSPECTION, result.valid ? 'info' : 'warning',
  result.valid ? 'Token introspected — PingOne confirmed active' : 'Token introspected — PingOne returned inactive',
  { tag: result.valid ? 'introspection/active' : 'introspection/inactive',
    metadata: { active: result.valid, sub: result.sub || null, client_id: result.client_id || null, scopeCount: (result.scopes || []).length, scopes: result.scopes || [], exp: result.exp || null } });

// On error
logAppEvent(EVENT_CATEGORIES.INTROSPECTION, 'error', `Token introspection failed: ${error.message}`,
  { tag: 'introspection/error', metadata: { error: error.message } });
```

**Important:** Logs only on cache misses (actual network calls) to avoid "too noisy" event spam on cache hits.

### 4. tokenIntrospection.js Middleware — Middleware-Level Logging

**Current state (lines 43–44 on rejection, 49–50 on validation success, 54–55 on error):** [VERIFIED: codebase]
```javascript
// On inactive token
logAppEvent('introspection', 'warning', 'Token rejected — PingOne returned inactive',
  { tag: 'introspection/middleware-inactive', metadata: { sub: r.sub || null, path: req.path } });

// On valid token
logAppEvent('introspection', 'info', 'Token validated via PingOne introspection',
  { tag: 'introspection/middleware-validated', metadata: { active: true, sub: r.sub || null, path: req.path, scope: r.scope || null } });

// On error
logAppEvent('introspection', 'error', 'Token introspection middleware failed: ' + error.message,
  { tag: 'introspection/middleware-error', metadata: { error: error.message, path: req.path } });
```

### 5. tokenChain.js Route — Validation Mode Response

**Current state (lines 22 in GET /):** [VERIFIED: codebase]
```javascript
res.json({
  tokenChain,
  mcpToolCallsChain,
  validationMode: validationModeConfig.getValidationMode(),  // ✅ Phase 235 added
  metadata: { /* ... */ }
});
```

Endpoint: `GET /api/token-chain`  
Returns: JSON object with `validationMode: 'introspection' | 'jwt'`

### 6. TokenChainContext.js — Frontend State Management

**Current state (lines 24, 111 in fetchMCPToolCalls):** [VERIFIED: codebase]
```javascript
const [validationMode, setValidationMode] = useState(null);  // ✅ State added

// In fetchMCPToolCalls:
if (data.validationMode) setValidationMode(data.validationMode);

// Exposed in context value:
{ validationMode, ... }
```

Fetches every 15 seconds from `/api/token-chain` and updates state when `validationMode` changes.

### 7. TokenChainDisplay.js — UI Rendering

**Current state (lines 1067–1071 in EventRow):** [VERIFIED: codebase]
```javascript
const introspectionHint =
  validationMode === 'introspection' &&
  (event.tokenType === 'user_token' || event.eventType === 'auth' || 
   event.id === 'user-token' || 
   (event.id && event.id.startsWith('synthetic-session')))
    ? { text: '\u{1F52C} PingOne verified', cls: 'ok' }
    : null;
```

And rendered at lines 1172:
```javascript
{introspectionHint && <span className={`tcd-event-hint tcd-event-hint--${introspectionHint.cls}`}>{introspectionHint.text}</span>}
```

The hint appears alongside `mayActHint`, `actHint`, `audHint`, etc. in the `tcd-event-hints` row.

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      BFF (Backend-for-Frontend)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Request arrives with Bearer token                               │
│    ↓                                                              │
│  [tokenIntrospection.js middleware] OPTIONAL                     │
│    ├─ Enabled by: ENABLE_TOKEN_INTROSPECTION=true               │
│    ├─ Call: tokenIntrospectionService.validateToken(token)       │
│    ├─ logAppEvent('introspection', 'info'|'warning'|'error'...) │
│    └─ Set req.tokenIntrospection = {active, sub, ...}           │
│    ↓                                                              │
│  [Route handler uses req.tokenIntrospection]                     │
│                                                                   │
│  GET /api/token-chain?userId=X                                   │
│    ├─ getTokenChain(userId) — fetch stored token events         │
│    ├─ getMCPToolCalls(userId) — fetch tool call chain           │
│    ├─ validationModeConfig.getValidationMode() → 'introspection'│
│    └─ Return: {tokenChain: [], mcpToolCallsChain: [],            │
│               validationMode: 'introspection', ...}              │
│    ↓                                                              │
│  [appEventService] Ring buffer (200 events max) + NDJSON file   │
│    ├─ logEvent('introspection', 'info', message, {tag, metadata})
│    ├─ Persisted to: logs/activity.ndjson                        │
│    └─ Subscribers notified (SSE for /api/app-events/subscribe)   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                           ↓ HTTPS
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (React UI)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  [TokenChainContext] Polls every 15 seconds                      │
│    ├─ Fetch: GET /api/token-chain                               │
│    ├─ Extract: data.validationMode → setValidationMode(...)     │
│    └─ Expose: context.validationMode = 'introspection'          │
│    ↓                                                              │
│  [TokenChainDisplay.EventRow] Renders hints                      │
│    ├─ if validationMode === 'introspection' && user_token       │
│    │   └─ Show hint: "🔬 PingOne verified" (green badge)        │
│    └─ Rendered in tcd-event-hints row                           │
│    ↓                                                              │
│  [ActivityLogs] Fetches events                                   │
│    ├─ Query: /api/app-events?category=introspection             │
│    ├─ Render: 🔬 icon + "Introspection" label                   │
│    └─ Shows metadata: {active, sub, client_id, scopes, ...}     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Success Criteria Map (from 235-01-PLAN.md)

| Must-Have | Evidence | Status |
|-----------|----------|--------|
| `appEventService.js EVENT_CATEGORIES` includes `INTROSPECTION: 'introspection'` | Line 25 of appEventService.js | ✅ |
| `ActivityLogs.js CATEGORY_ICONS` has `introspection: '🔬'` | Line 26 of ActivityLogs.js | ✅ |
| `ActivityLogs.js CATEGORY_LABELS` has `introspection: 'Introspection'` | Line 39 of ActivityLogs.js | ✅ |
| `tokenIntrospectionService.validateToken()` fires logEvent on active result | Lines 156–159 of tokenIntrospectionService.js | ✅ |
| `tokenIntrospectionService.validateToken()` fires logEvent on inactive result | Lines 156–159 (warning branch) | ✅ |
| `tokenIntrospectionService.validateToken()` fires logEvent on error | Lines 168–169 of tokenIntrospectionService.js | ✅ |
| `tokenIntrospection.js` middleware fires logEvent when validating token | Line 49–50 of tokenIntrospection.js | ✅ |
| `tokenIntrospection.js` middleware fires logEvent when rejecting token | Line 43–44 of tokenIntrospection.js | ✅ |
| `GET /api/token-chain` response includes `validationMode` field | Line 22 of tokenChain.js | ✅ |
| `TokenChainDisplay.js` shows hint on user-token when validationMode is introspection | Lines 1067–1171 of TokenChainDisplay.js | ✅ |

## Common Pitfalls

### Pitfall 1: Logging on Cache Hits
**What goes wrong:** If you log every introspection call (including cache hits), the Activity Log becomes noisy with hundreds of identical "Token introspected" events for the same user session.

**Why it happens:** Introspection results are cached for 30 seconds; without filtering, every 5-second polling cycle or tool call logs an event.

**How to avoid:** Log only on cache misses (actual network calls). In tokenIntrospectionService.js, the log statement comes **after** `introspectionCache.set(...)`, which means it only fires when a real HTTP request to PingOne completes. Cache hits return early without logging.

**Warning signs:** Activity log shows 50+ "Token introspected — active" events in 5 minutes for a single user; inspect Redis/memory usage creeping up.

### Pitfall 2: Exposing Raw Tokens in Metadata
**What goes wrong:** A developer accidentally logs `{ token: rawTokenString }` in metadata, exposing the full JWT to the logs.

**Why it happens:** Copy-paste error when building the metadata object; forgetting that tokens are secrets.

**How to avoid:** Never reference `token` directly in metadata. Instead:
- `token_hash: tokenHash.substring(0, 16)` — log first 16 chars of SHA256(token)
- `sub`, `client_id`, `scopes` — log decoded claims, not the raw token

**Warning signs:** Log files contain `Bearer eyJhbG...` strings; security scan flags raw JWTs in logs.

### Pitfall 3: Validation Mode Not Synced to Frontend
**What goes wrong:** The hint "🔬 PingOne verified" never appears in the Token Chain UI, even though introspection is enabled on the backend.

**Why it happens:** Either:
- `validationModeConfig.getValidationMode()` is not called in the tokenChain.js route
- OR TokenChainContext doesn't update state from the response
- OR EventRow doesn't receive `validationMode` prop

**How to avoid:** Verify the full chain:
1. Check tokenChain.js line 22: `validationMode: validationModeConfig.getValidationMode()`
2. Check TokenChainContext line 111: `if (data.validationMode) setValidationMode(...)`
3. Check EventRow call site (TokenChainDisplay line ~1400): `<EventRow ... validationMode={ctx?.validationMode} />`
4. Check EventRow prop declaration (line 1032): `function EventRow({ ... validationMode })`

**Warning signs:** Frontend console shows no errors, but hint badge missing; network tab shows validationMode in response; but UI unchanged.

### Pitfall 4: Event Tag Typos Breaking Admin Filters
**What goes wrong:** Admin tries to filter Activity Log by tag "introspect/active" but finds nothing; the code logged "introspection/active" instead.

**Why it happens:** Tag string spelled differently in different places; no type checking on string literals.

**How to avoid:** Define a constants object for tags:
```javascript
const INTROSPECTION_TAGS = {
  ACTIVE: 'introspection/active',
  INACTIVE: 'introspection/inactive',
  ERROR: 'introspection/error',
  MIDDLEWARE_VALIDATED: 'introspection/middleware-validated',
  MIDDLEWARE_INACTIVE: 'introspection/middleware-inactive',
  MIDDLEWARE_ERROR: 'introspection/middleware-error',
};
```
Reference the constants everywhere, not magic strings. (Not yet implemented in Phase 235, but a good refactor for Phase 236+.)

**Warning signs:** Dashboard admin filter "tag = 'introspection/active'" returns 0 results; git grep finds typos; inconsistent tag names across middleware and service layers.

## State of the Art

| Aspect | Implementation | RFC / Standard | Notes |
|--------|---|---|---|
| Token introspection | RFC 7662 with SHA256 cache + 30s TTL | RFC 7662 (OAuth 2.0 Token Introspection) | Meets standard; adds caching for performance |
| Event logging | Structured appEventService + NDJSON file | ELK/observability best practices | Ring buffer (200 events) good for in-memory; file for durability |
| Validation mode selection | Runtime config via `validationModeConfig.js` | Matches PingOne SDK approach | Allows switching without restart (in-memory) |
| UI hints | Inline badge in EventRow component | React Suspense / hooks pattern | No external UI library dependency; CSS handles styling |

## Validation Map (Phase Requirements → Implementation)

| Requirement | How Phase 235 Addresses It |
|-------------|---------------------------|
| "Surface introspection validation results in Activity Log" | appEventService logs INTROSPECTION events with metadata (active/inactive/error); ActivityLogs.js renders with 🔬 icon |
| "Surface in Token Chain UI with hint badge" | TokenChainDisplay.js EventRow shows "🔬 PingOne verified" when validationMode is 'introspection' and event is user-token |
| "Show validation mode in token chain panel" | GET /api/token-chain includes validationMode field; TokenChainContext captures it; EventRow receives it as prop |
| "Differentiate introspection from JWT local validation" | Only show hint when validationMode === 'introspection'; if mode is 'jwt', hint is null (not rendered) |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PingOne introspection endpoint | tokenIntrospectionService | Conditional | (Dynamic) | If unavailable, validateToken() returns { valid: false } and logs error |
| appEventService file write | Event persistence | ✓ | Built-in | If logs/ dir not writable, console.warn and continue (non-blocking) |
| JWT decode (jsonwebtoken) | Claims extraction | ✓ | (bundled) | — |

## Open Questions

1. **Ring buffer eviction:** The current 200-event limit may drop old introspection events from the in-memory buffer before they're persisted to the NDJSON file. Is this by design or a bug? [LOW confidence — needs product clarification]

2. **NDJSON file retention:** How long should activity.ndjson be kept? Current code doesn't rotate or compress old files. [ASSUMED — not explicitly documented]

3. **Introspection fallback mode:** If PingOne endpoint is unavailable, the code returns `{ valid: false }` and fails the request. Should there be a `INTROSPECTION_FAIL_OPEN` mode (like tokenIntrospection middleware has) that falls back to JWT? [ASSUMED — Phase 235 does not implement this]

## Code Examples

### Adding Introspection Event Log (Pattern)

**Location:** Any service that calls `tokenIntrospectionService.validateToken()`

```javascript
// Source: tokenIntrospectionService.js lines 156–169 [VERIFIED: codebase]
const { logEvent: logAppEvent, EVENT_CATEGORIES } = require('./appEventService');

// After validation completes:
logAppEvent(
  EVENT_CATEGORIES.INTROSPECTION,
  result.valid ? 'info' : 'warning',
  result.valid 
    ? 'Token introspected — PingOne confirmed active' 
    : 'Token introspected — PingOne returned inactive',
  {
    tag: result.valid ? 'introspection/active' : 'introspection/inactive',
    metadata: {
      active: result.valid,
      sub: result.sub || null,
      client_id: result.client_id || null,
      scopeCount: (result.scopes || []).length,
      scopes: result.scopes || [],
      exp: result.exp || null
    }
  }
);
```

### Rendering Validation Mode Hint (Pattern)

**Location:** TokenChainDisplay.js EventRow component (lines 1067–1071) [VERIFIED: codebase]

```typescript
// Declare hint computed property
const introspectionHint =
  validationMode === 'introspection' &&
  (event.tokenType === 'user_token' || event.eventType === 'auth' || 
   event.id === 'user-token' || 
   (event.id && event.id.startsWith('synthetic-session')))
    ? { text: '\u{1F52C} PingOne verified', cls: 'ok' }
    : null;

// Render in hints row
{introspectionHint && (
  <span className={`tcd-event-hint tcd-event-hint--${introspectionHint.cls}`}>
    {introspectionHint.text}
  </span>
)}
```

### Fetching Validation Mode in Frontend (Pattern)

**Location:** TokenChainContext.js (lines 98–111) [VERIFIED: codebase]

```javascript
const fetchMCPToolCalls = async () => {
  try {
    const res = await fetch('/api/token-chain', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    
    if (!cancelled) {
      setMCPToolCalls(data.mcpToolCallsChain || []);
      if (data.validationMode) {
        setValidationMode(data.validationMode);  // 'introspection' | 'jwt'
      }
    }
  } catch {
    // Silently fail — user may not be authenticated
  }
};
```

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | RFC 7662 introspection confirms token liveness at PingOne |
| V3 Session Management | yes | Token revocation detection via introspection (not just expiry) |
| V5 Input Validation | yes | Never pass raw tokens through frontend; only decoded claims |
| V6 Cryptography | yes | SHA256(token) for cache keys; token never stored plaintext |
| V9 Communications | yes | All introspection calls use HTTPS to PingOne; tokens only in Authorization header |

### Known Threat Patterns for Token Validation

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token reuse after revocation | Tampering | Introspection endpoint detects revoked tokens; cache TTL limits stale window |
| Token logged in plaintext | Information Disclosure | Hash token for cache key; log only decoded claims fields |
| Stale cache serving revoked token | Tampering | 30-second TTL; mandatory eviction every 60 seconds |
| Introspection endpoint MITM | Tampering | HTTPS only; PingOne CA validation |

## Sources

### Primary (HIGH confidence)
- [appEventService.js](file:///Users/cmuir/P1Import-apps/Banking/banking_api_server/services/appEventService.js) — Event category definition and logging API
- [tokenIntrospectionService.js](file:///Users/cmuir/P1Import-apps/Banking/banking_api_server/services/tokenIntrospectionService.js) — RFC 7662 implementation with caching and logging
- [tokenIntrospection.js middleware](file:///Users/cmuir/P1Import-apps/Banking/banking_api_server/middleware/tokenIntrospection.js) — Middleware-level validation and logging
- [tokenChain.js route](file:///Users/cmuir/P1Import-apps/Banking/banking_api_server/routes/tokenChain.js) — API response with validationMode
- [TokenChainContext.js](file:///Users/cmuir/P1Import-apps/Banking/banking_api_ui/src/context/TokenChainContext.js) — Frontend state management for validationMode
- [TokenChainDisplay.js](file:///Users/cmuir/P1Import-apps/Banking/banking_api_ui/src/components/TokenChainDisplay.js) — UI hint rendering
- [ActivityLogs.js](file:///Users/cmuir/P1Import-apps/Banking/banking_api_ui/src/components/ActivityLogs.js) — Event category icons and labels
- [validationModeConfig.js](file:///Users/cmuir/P1Import-apps/Banking/banking_api_server/config/validationModeConfig.js) — Validation mode configuration and API

### Secondary (MEDIUM confidence)
- [235-01-PLAN.md](file:///Users/cmuir/P1Import-apps/Banking/.planning/phases/235-surface-introspection-validation-results-in-token-chain-and-/235-01-PLAN.md) — Task specifications and implementation details
- [235-01-SUMMARY.md](file:///Users/cmuir/P1Import-apps/Banking/.planning/phases/235-surface-introspection-validation-results-in-token-chain-and-/235-01-SUMMARY.md) — Completed implementation checklist
- [CLAUDE.md](file:///Users/cmuir/P1Import-apps/Banking/CLAUDE.md) — RFC 8693 and introspection debugging guidance (lines 130–148)

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — Core libraries (axios, crypto, jsonwebtoken) are standard OAuth ecosystem choices
- **Architecture:** HIGH — Token introspection pattern follows RFC 7662 exactly; event logging follows appEventService conventions
- **Integration points:** HIGH — All integration points verified by codebase inspection; no assumptions
- **Pitfalls:** MEDIUM — Based on observing current code patterns and common token-handling errors; not all documented in codebase
- **Validation:** HIGH — Phase 235 completed and verified by 235-01-SUMMARY.md with commit hash

**Research date:** 2026-05-03  
**Valid until:** 2026-06-03 (stable domain, no breaking changes expected)  
**Phase status:** COMPLETE (ready for validation / verification phase)
