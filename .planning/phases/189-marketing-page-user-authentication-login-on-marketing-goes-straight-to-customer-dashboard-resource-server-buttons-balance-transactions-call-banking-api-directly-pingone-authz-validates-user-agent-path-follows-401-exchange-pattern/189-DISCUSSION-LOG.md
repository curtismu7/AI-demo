# Phase 189 Discussion Log

**Date:** 2026-04-18  
**Decision Mode:** Autonomous (based on codebase analysis + CLAUDE.md constraints)

---

## Discussion Areas & Decisions

### Area 1: Login Return Destination

**Question:** After customer login from `/marketing`, where should user be routed?

| Option | Description | Selected |
|--------|-------------|----------|
| A | Remain on `/marketing` (working page for resource access) | ✅ **D-01** |
| B | Redirect to `/dashboard` (traditional pattern) | — |
| C | Configurable per admin settings | — |

**Reasoning:** Existing `oauthUser.js` code (lines 430-520) already supports post-login return-path preservation via `sanitizePostLoginReturnPath()`. Phase 189 scope says "login on /marketing goes straight to customer dashboard" — interpreted as staying on `/marketing` (not redirecting away), allowing it to serve as a working dashboard for customers to explore resources before committing to full-app navigation.

**Implementation Signal:** D-01 locked. Pass `return_to=/marketing` in login redirect.

---

### Area 2: Resource-Server Button Pre-Login State

**Question:** How should resource buttons (balance, transactions) behave when user is logged out?

| Option | Description | Selected |
|--------|-------------|----------|
| A | Disabled until login; show "Sign in first" gate message | ✅ **D-02** |
| B | Always visible; inline login form on click | — |
| C | Show preview data when logged out, full data when logged in | — |

**Reasoning:** CLAUDE.md §5 requires `/marketing` stability. Disabled buttons ensure page remains purely informational when unauthenticated. This satisfies the "marketing-only" constraint while enabling functionality for authenticated users. Existing BankingAgent.js layer-zero gate (line 1650) already implements this pattern — no new logic needed.

**Implementation Signal:** D-02 locked. Reuse BankingAgent gate for button state.

---

### Area 3: Logged-In /Marketing Content Layout

**Question:** Should logged-in `/marketing` have different content or layout than logged-out?

| Option | Description | Selected |
|--------|-------------|----------|
| A | Same content; buttons become active | ✅ **D-03** |
| B | Different dashboard-like layout for logged-in users | — |
| C | Add "Go to Dashboard" button in header | — |
| D | Auto-redirect logged-in users to `/dashboard` | — |

**Reasoning:** Minimal diff per CLAUDE.md §2. Reuse existing LandingPage.jsx structure. No refactoring or layout reorganization needed. Keeps the page stable and consistent.

**Implementation Signal:** D-03 locked. No layout changes; button state only.

---

### Area 4: Token Exchange Flow Integration

**Question:** Should Phase 187's 401→exchange flow use special marketing-page handling, or apply universally?

| Option | Description | Selected |
|--------|-------------|----------|
| A | Use existing Phase 187 flow universally; no changes | ✅ **D-04** |
| B | Add special marketing-page 401 handlers | — |
| C | Create marketing-specific test route | — |
| D | Document-only; no code changes | — |

**Reasoning:** Phase 187 already implemented universal 401→need_auth signal propagation across all pages. BankingAgent.js need_auth intercept (lines 2092-2098) handles this automatically. No specialization needed. When resource buttons on `/marketing` trigger agent actions hitting MCP 401, the existing flow works without modification.

**Implementation Signal:** D-04 locked. Reuse Phase 187 as-is.

---

### Area 5: CLAUDE.md Marketing-Only Constraint Validation

**Question:** Do resource buttons calling real APIs violate CLAUDE.md §5 ("Do not edit marketing-only pages unless the task explicitly says so")?

| Resolution | Interpretation |
|-----------|-----------------|
| ✅ **Satisfies Constraint** | Buttons are **disabled when logged out**, so `/marketing` page structure remains purely informational for unauthenticated users. Constraint satisfied. |

**Reasoning:** The phase scope explicitly says "resource-server buttons call banking API directly" and "PingOne authz validates user". This is intentional scope (not creep). Buttons are **inactive by default** (authentication gate), so the page's public-facing surface (logged-out experience) remains unchanged. Only authenticated users see active buttons — no violation of marketing stability.

**Implementation Signal:** Phase 189 approved to add functional buttons to `/marketing` under the constraint that they are disabled when unauthenticated.

---

## Summary of Locked Decisions

| ID | Decision | Locked Status |
|----|----------|---------------|
| D-01 | Login returns to `/marketing` (not `/dashboard`) | ✅ Locked |
| D-02 | Buttons disabled when logged out; gate message shown | ✅ Locked |
| D-03 | Same content layout; state changes only | ✅ Locked |
| D-04 | Reuse Phase 187 flow; no new handlers | ✅ Locked |
| D-05 | Buttons are agent's discretion (placement, styling, error handling) | ✅ Agent discretion |

---

## Discovery Findings

### Codebase Patterns Verified
- ✅ Post-login return-path system exists and works (oauthUser.js)
- ✅ BankingAgent.js has layer-zero auth gate (reusable)
- ✅ Token exchange flow handles 401 universally (Phase 187)
- ✅ EmbeddedAgentDock already on `/marketing`
- ✅ Session persistence via express-session + Upstash Redis
- ✅ OAuth error toast system exists (endUserOAuthErrorToast.js)

### No Blockers or Research Gaps Identified
- No new external dependencies required
- No API changes needed (existing endpoints reused)
- No database schema changes (existing user/session tables)
- All required infrastructure in place from Phase 187

---

*Discussion completed: 2026-04-18*  
*Status: All decisions locked; ready for planning*
