# Debug Session: User Token Scopes Visibility + Token Exchange Injection

**Status:** INVESTIGATION STARTED
**Date:** 2026-04-14
**Investigator:** gsd-debugger
**Goal:** 
1. Add user token visibility to PingOne Test Page with scope display
2. Enable token exchange with both PingOne and injected scopes
3. Test on page first, then real flows

---

## Phase 146 Context (Completed Work)

Commits:
- `b4196ed` — ff_inject_scopes feature flag and scope injection logic
- `bd3ba98` — INJECTED scope badges in Token Chain + warning banner  
- `e91b20b` — Scope vocabulary reference endpoint, page, and nav link
- `937b80b` — Canonical scope vocabulary in PingOne test page and routes

What works now:
✅ ff_inject_scopes flag (default: false)
✅ conditionalInjectBankingScopes() in agentMcpTokenService.js
✅ injected_scope_names array in token claims
✅ Token Chain displays INJECTED badges for injected scopes

What's missing:
❌ User token scopes display on PingOne Test Page
❌ Token exchange UI for testing with injected scopes
❌ Verification that first exchange includes injected scopes

---

## Investigation Checklist

### TASK 1: Check PingOne Test Page Current State
- [ ] Is there a "User Token" / "Auth Token" card on the page?
- [ ] Does it show decoded scopes?
- [ ] Can user enable/disable ff_inject_scopes to test?

### TASK 2: Create User Token Info Endpoint (if missing)
- [ ] Does GET /api/pingone-test/user-token exist?
- [ ] Returns: { token: JWT_string, decoded: { scope, aud, sub, ... }, injected_scopes: [] }
- [ ] Include both decoded claims AND raw JWT for browser inspection

### TASK 3: Add User Token Section to UI
- [ ] Add card showing decoded user token with scopes
- [ ] Show "Real Scopes (from PingOne)" vs "Injected Scopes"
- [ ] Show toggle for ff_inject_scopes (if admin)

### TASK 4: Wire Token Exchange Test
- [ ] "Exchange User Token" button in UI
- [ ] Exchange endpoint: /api/pingone-test/exchange-user-token
- [ ] Returns: { success, mcpToken: JWT_string, decoded: {...} }
- [ ] Show result with decoded scopes

### TASK 5: Verification
- [ ] With ff_inject_scopes=false: only PingOne scopes in exchange
- [ ] With ff_inject_scopes=true: both PingOne + injected scopes in exchange
- [ ] Exchange succeeds in both cases

---

## Next: Findings Log

(populated during investigation)

### Finding 1: OAuth Token Inspector Panel — Missing "Inspect" Button

**Symptom:**
- PingOne Test Page displays "OAuth TOKEN INSPECTOR" panel showing decoded user token claims (sub, email, name)
- Panel text says: "Click 'Inspect' to decode the full JWT claims and perform an RFC 8693 token exchange to the MCP server."
- **NO Inspect button or link is visible** — instructional text references unavailable action

**Location:**
- Component: PingOneTestPage.jsx (auth token display section)
- Likely source: Missing button or conditional rendering issue

**Impact:**
- Users cannot trigger token exchange from the UI
- Feature described in instructions is unreachable
- Token exchange testing workflow blocked

**Root Cause Hypothesis:**
- [ ] Button code exists but is hidden/CSS display:none
- [ ] Button element never rendered (conditional logic issue)
- [ ] Text is outdated — button was removed but help text not updated
- [ ] onClick handler not wired to exchange function

**Tasks to Close Gap:**
1. Audit PingOneTestPage.jsx for Inspect button code
2. If button exists in code: verify CSS/conditional rendering
3. If button missing: add `<button>Inspect & Exchange</button>` wired to exchange endpoint
4. **Severity:** HIGH — blocks all token exchange testing on this page

---

## Status Update

**Task 1 (Check State):** ✅ COMPLETE — PingOne Test Page partially exists but has gaps
**Task 2-5:** → Blocked by missing Inspect button. Must fix first before testing exchange logic.

**Next Action:** Search codebase for "Inspect" button, verify if missing or hidden, implement if needed.

---

### Finding 1 — DETAILED Analysis

**Source Code Located:**
- `banking_api_ui/src/hooks/useCurrentUserTokenEvent.js` line 37
- Creates sessionEvent with explanation text referencing "Inspect" button
- Text says: `Click "Inspect" to decode the full JWT claims and perform an RFC 8693 token exchange to the MCP server.`

**Problem Confirmed:**
- ✅ Text exists (hard-coded in explanation field)
- ❌ No button or clickable element created
- ❌ No onClick handler
- ❌ No exchange function wired

**Root Cause:**
The explanation is just static text. TokenChainDisplay renders it as read-only instructional content. There's no:
1. &lt;button&gt; element
2. onClick handler
3. Exchange API call
4. Result display

**Fix Required:**
Transform explanation text into actual interactive button. Either:
- Option A: Add button inside explanation text as React component
- Option B: Add separate "Exchange" button below the token claims
- Option C: Make explanation clickable and trigger exchange

**This must be fixed in Task 2/4 of the investigation.** The feature is described but not implemented.
