# Phase 189: Marketing Page User Authentication — Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

---

<domain>
## Phase Boundary

Marketing page (`/marketing`) becomes a fully functional entry point for customers: users can log in directly from `/marketing`, stay on `/marketing` to view account information (balance, transactions) via resource-server API calls, and trigger token exchange (RFC 8693 1-token flow via Phase 187) on 401 responses. The agent path follows the 401→exchange pattern established in Phase 187 without additional changes.

**What this phase delivers:** Unified auth + resource access flow on `/marketing` for customers; existing session/auth infrastructure reused.

</domain>

---

<decisions>
## Implementation Decisions

### D-01: Login Return Destination
After customer login from `/marketing`, user **remains on `/marketing`** (not redirected to `/dashboard`). This aligns with existing `return_to` parameter pattern in `oauthUser.js` and allows marketing page to serve as a working dashboard for customers to explore resources before committing to full-app navigation.

**Rationale:** Existing code (oauthUser.js lines 430-520) already supports post-login return-path preservation via `sanitizePostLoginReturnPath()`. Reuse this pattern for consistency.

**Implementation hint:** Ensure BankingAgent.js `handleLoginAction('login_user')` passes `return_to=/marketing` when user initiates login from `/marketing`.

### D-02: Resource-Server Button Behavior — Pre-Login State
Resource buttons (balance, transactions) on `/marketing` are **disabled/inactive when user is logged out**. On click, they show the standard gate message: "🔐 You need to sign in first to perform banking operations."

**Rationale:** CLAUDE.md §5 requires `/marketing` stability for marketing-only pages. Disabled buttons satisfy this — page structure and content remain purely informational when unauthenticated. Buttons activate only after login, avoiding functional scope creep.

**Implementation hint:** BankingAgent.js already has layer-zero gate at line 1650 (`if (!isLoggedIn)`). Reuse this for button state control on `/marketing`.

### D-03: Logged-In /Marketing Page Content
Logged-in `/marketing` page shows **same content** as logged-out variant, but with resource buttons now interactive. No layout reorganization or dashboard-like content swap needed.

**Rationale:** Minimal diff per CLAUDE.md §2 ("Minimal diff — name the component/element; do not refactor unrelated code"). Keeps page stable and leverages existing LandingPage.jsx structure.

### D-04: Token Exchange Flow on 401 — No Additional Changes
Use the **existing Phase 187 token exchange flow as-is**. No new test routes, special marketing-page handlers, or endpoint changes required.

**Rationale:** Phase 187 already implemented universal 401→need_auth signal propagation (BFF services + BankingAgent.js intercept). This works for all pages, including `/marketing`. No specialization needed.

**Implementation hint:** When resource buttons trigger agent actions (balance, transactions) from `/marketing`, any 401 will flow through Phase 187's existing intercept and exchange logic automatically.

### The Agent's Discretion
- **Button placement on /marketing:** Decide whether buttons appear in main hero section, features grid, or separate card. Existing EmbeddedAgentDock provides agent UI; resource buttons should complement it.
- **Button styling/labels:** Should reflect existing BankingAgent action labels (balance, transactions) or new marketing-specific copy? Recommend consistency with dashboard.
- **Error handling:** How to surface token exchange failures to user from marketing page? Recommend existing toast system (see `appToast.js`).

</decisions>

---

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### OAuth & Session Management
- [banking_api_server/routes/oauthUser.js](banking_api_server/routes/oauthUser.js) §`sanitizePostLoginReturnPath()` — Post-login return path validation pattern
- [banking_api_server/routes/oauthUser.js](banking_api_server/routes/oauthUser.js) §lines 430-520 — End-user OAuth callback, session setup, return-to handling
- [CLAUDE.md](CLAUDE.md) §Non-negotiables — Read before UI changes: "Do not edit marketing-only pages unless the task explicitly says so"

### Token Exchange & 401 Handling
- [Phase 187 token-exchange-critical-fixes-and-enhancements](/.planning/phases/187-*/187-*-SUMMARY.md) — 1-token RFC 8693 exchange via MCP 401
- [banking_api_ui/src/components/BankingAgent.js](banking_api_ui/src/components/BankingAgent.js) §lines 2092-2098 — need_auth intercept + login redirect
- [banking_api_ui/src/components/BankingAgent.js](banking_api_ui/src/components/BankingAgent.js) §line 1650 — Layer-zero auth gate for agent actions

### Marketing & Landing Page
- [banking_api_ui/src/App.js](banking_api_ui/src/App.js) §lines 580-660 — `/marketing` route definitions (logged-in + logged-out variants)
- [banking_api_ui/src/components/LandingPage.js](banking_api_ui/src/components/LandingPage.js) §lines 1-149 — Current marketing page content
- [banking_api_ui/src/utils/endUserOAuthErrorToast.js](banking_api_ui/src/utils/endUserOAuthErrorToast.js) — OAuth error handling + toast patterns

### Logging & Auth Flow Reference
- [banking_api_ui/src/services/bankingAgentService.js](banking_api_ui/src/services/bankingAgentService.js) §line 229 — Error object with need_auth flag propagation

</canonical_refs>

---

<code_context>
## Existing Code Insights

### Reusable Assets
- **`sanitizePostLoginReturnPath()` in oauthUser.js** — Already validates and preserves post-login destinations. Can reuse for marketing page return path.
- **BankingAgent.js `handleLoginAction('login_user')`** — Already handles customer login with `return_to` parameter support (lines 1630-1670). Wrap with marketing page detection.
- **Layer-zero auth gate in BankingAgent.js** — Check `if (!isLoggedIn)` at line 1650 already prevents unauthenticated actions. Reuse for button state on marketing.
- **EmbeddedAgentDock component** — Already mounted on `/marketing` (LandingPage.jsx + App.js). Complements resource buttons.

### Established Patterns
- **Post-login return path:** `oauthUser.js` lines 430-520 preserve `req.session.postLoginReturnToPath` across redirect
- **OAuth error handling:** `endUserOAuthErrorToast.js` shows error toasts on 401/403 from BFF; reuse for resource-button failures
- **Agent action flow:** BankingAgent.js `runAction()` → service call → BFF endpoint → 401 handling via need_auth signal
- **Session check:** `checkOAuthSession()` in App.js determines `user` object; buttons can check `Boolean(user)` for enable/disable state

### Integration Points
- **Button trigger:** New resource buttons on LandingPage.jsx (or EmbeddedAgentDock) → call BankingAgent action (balance, transactions)
- **Auth redirect:** BankingAgent.js catch block (lines 2092-2098) already intercepts `need_auth` and calls `handleLoginAction('login_user')` with `return_to=/marketing`
- **Session persistence:** express-session + Upstash Redis already handles logged-in state across page reloads

</code_context>

---

<specifics>
## Specific Ideas

**From Phase 187 downstream:** The 401→exchange flow is universal and applies to `/marketing`. No special routing needed — when a resource button on marketing triggers an agent action that hits MCP 401, Phase 187's intercept in BankingAgent.js (line 2092) will fire, redirect to login, and retry automatically on return.

**Session reuse:** After login, `req.session.user` persists in Upstash Redis. LandingPage can check `user` prop to enable/disable buttons without additional checks.

**Marketing page stability (CLAUDE.md §5):** Buttons are **disabled when logged out**, so `/marketing` remains a pure information/entry page when unauthenticated. Only logged-in users see active resource access — this preserves the marketing surface.

**No new test routes required:** Phase 187's existing test route (`GET /exchange-1token-401-flow`) already demonstrates the 401→exchange scenario. Phase 189 reuses it.

</specifics>

---

<deferred>
## Deferred Ideas

**None — all gray areas resolved within phase scope.**

Considered but deferred:
- "Add search/filtering to transaction list" → Out of scope; belongs in Phase Y (transaction management enhancements)
- "Implement mobile-specific layout" → Out of scope; belongs in responsive design phase
- "Add account-creation flow" → Out of scope; assumes user already has accounts (Phase 188 premise)

</deferred>

---

*Phase: 189-marketing-page-user-authentication*  
*Context gathered: 2026-04-18*  
*Ready for: gsd-phase-researcher (if research enabled) → gsd-planner*
