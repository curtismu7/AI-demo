---
phase: 192
type: research
date: "2026-04-18"
---

# Research — Phase 192: Client Credentials Resource Server

## Domain Analysis

### What is Phase 192?
A **Client Credentials** (CC) version of the banking resource server page (Phase 191). While Phase 191 shows OIDC user-delegated access (Authorization Code + PKCE → user sub, act/may_act delegation), Phase 192 shows machine-to-machine access using `client_id` + `client_secret` — no user context at all.

### Why it matters
This educates on why Client Credentials alone is **insufficient for agentic delegation**:
- CC tokens have **no `sub` claim** (no user identity)
- CC tokens have **no `act` claim** (no delegation proof)
- The agent's dual token exchange (RFC 8693) targets the **OIDC resource server** (Phase 191), NOT this CC resource server
- Shows same banking API, two authentication models: user-context vs machine-context

## Existing Infrastructure

### Client Credentials in this codebase

1. **`oauthService.getAgentClientCredentialsToken()`** — Gets a CC token from PingOne using worker token app credentials. Returns raw JWT string. Uses `PINGONE_WORKER_TOKEN_CLIENT_ID` / `PINGONE_WORKER_TOKEN_CLIENT_SECRET` env vars.

2. **`clientCredentialsTokenService.js`** — Full CC token service for the banking API's own OAuth server (local CC grant, not PingOne). Has `processClientCredentialsGrant()`, token validation, introspection.

3. **`oauthClientRegistry.js`** — Manages registered OAuth clients with `allowed: ['client_credentials']` grants.

### Phase 191 reference (just completed)
- **Backend:** `routes/resourceServer.js` — GET `/api/resource-server/summary` returns accounts + decoded access/ID token claims from session
- **Frontend:** `ResourceServerPage.jsx` — Two-column layout: banking summary (left) + decoded tokens (right)
- **Pattern:** Requires OIDC session (`req.session.oauthTokens.accessToken`), serves decoded claims only (never raw tokens)

## Technical Approach

### Backend: GET /api/resource-server-cc/summary

**Key difference from Phase 191:** Phase 191 reads tokens from the user's OIDC session. Phase 192 actively obtains a CC token via `oauthService.getAgentClientCredentialsToken()` to show what a machine client would see.

**Auth model:** Require admin session (this is an educational/demo page, not a public endpoint). The admin user is authenticated via OIDC, but the page demonstrates what a CC-only client would see.

**Response structure mirrors Phase 191 but adapted:**
- `accounts`: Static demo data (no user accounts since CC has no user context)
- `ccTokenClaims`: Decoded CC token claims (client_id, scope, aud — no sub, no act, no name/email)
- `tokenMetadata`: grant_type: "client_credentials", audience, scopes, expiry
- `resourceServerInfo`: type "Client Credentials", auth method "client_id + client_secret"
- `comparison`: OIDC vs CC side-by-side for educational display

**Error handling:** If CC token fetch fails (e.g. no worker app configured), return a structured error with explanation rather than 500.

### Frontend: ClientCredentialsResourcePage.jsx

**Visual differentiation from Phase 191:**
- **Color scheme:** Orange/amber gradient (#e65100 → #ff8f00) vs Phase 191's blue (#1a237e → #0d47a1)
- **Icon:** 🔑 (key) vs Phase 191's 🔐 (lock)
- **No user identity section** — explicitly shows "No User Context"
- **Missing claims callout** — red-tinted rows showing what's absent (sub, act, name/email)
- **Comparison box** — side-by-side OIDC ✅ vs CC ❌

**Reuse:** Same two-column layout pattern, same ClaimRow/ScopesBadges helpers (reimplemented inline like Phase 191), same CLAIM_GLOSSARY.

### Routing
- Backend: `/api/resource-server-cc` mounted with admin auth
- Frontend: `/resource-server-cc` with AdminRoute wrapper
- Sidebar: "🔑 CC Resource Server" placed next to Phase 191's "🔐 OIDC Resource Server"

## Validation Architecture

### Dimension 1: Core Functionality
- CC token successfully fetched and decoded
- Admin-only access enforced
- No user-specific data shown

### Dimension 2: Visual Differentiation
- Orange header distinct from blue Phase 191
- Missing claims clearly highlighted
- Comparison table accurate

### Dimension 3: Security
- Raw CC client_secret never sent to browser
- Admin session required
- CC token decoded server-side only

## Standard Stack
- Express router (existing pattern)
- React functional component with hooks
- axios for API calls
- CSS matching project conventions (dark theme, `.ccrsp-*` prefix)

## Risks
- **Worker token app not configured:** Handle gracefully — show explanation instead of error
- **CC token may be short-lived (30min):** Token expiry countdown same as Phase 191
