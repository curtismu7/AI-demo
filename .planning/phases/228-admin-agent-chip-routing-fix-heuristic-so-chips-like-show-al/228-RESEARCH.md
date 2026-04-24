# Phase 228: Admin Agent Chip Routing — Research

**Researched:** 2026-04-24
**Domain:** Banking Agent heuristic NL routing, admin chip dispatch, BFF admin APIs
**Confidence:** HIGH

---

## Summary

The admin agent currently shows two suggestion chips that are never executed by the heuristic layer:
`"Show all customer accounts"` and `"Show me last 5 errors"`. When a user clicks these, the text is
dispatched through `handleNaturalLanguage()` in `BankingAgent.js`, which calls `sendAgentMessage()` —
a BFF endpoint that also runs through the heuristic parser in `nlIntentParser.js`. However, neither
chip phrase matches any regex in `parseBanking()`, so `parseHeuristic()` returns `kind:'none'`, and
the system falls through to the Ollama LLM call (which times out at 10 s or returns a confused answer).

The fix has two orthogonal parts:

1. **Heuristic parser** (`nlIntentParser.js`, `parseBanking()`) needs two new admin-specific regex
   branches: one for `"all customer accounts"` (maps to a new action `admin_accounts`) and one for
   `"last N errors"` (maps to action `admin_errors`). The `"show last 5 errors"` case *already has*
   a working client-side handler in `handleNaturalLanguage()` via `parseLogPrompt()`, but `parseLogPrompt`
   is called only inside `handleNaturalLanguage` — and the suggestion chips call `sendAgentMessage()`
   directly (bypassing `handleNaturalLanguage`). The underlying client-side log-fetch code is solid and
   already works; the gap is that suggestion chips bypass it.

2. **Admin all-accounts action** requires a new execution branch in `executeHeuristicBanking()` in
   `bankingAgentLangGraphService.js` that calls `dataStore.getAllAccounts()` (already exists) and
   formats a summary for the admin. Sample data in `sampleData.js` already has 3+ customers — no
   new seed data is strictly required, though enriching it adds demo value.

**Primary recommendation:** Add two regex branches to `parseBanking()` in `nlIntentParser.js`;
wire those to execution handlers in `executeHeuristicBanking()`; fix the suggestion chip dispatch
path so it calls `handleNaturalLanguage()` instead of `sendAgentMessage()` directly (or alternatively,
duplicate the `parseLogPrompt` guard at the BFF layer).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Chip click dispatch | Frontend (BankingAgent.js) | — | Chips trigger JS handlers, not navigation |
| Heuristic intent classification | BFF (nlIntentParser.js) | Frontend client-side guard | Shared server path; client-side guard for log queries |
| Admin account listing | BFF (dataStore.getAllAccounts) | — | Data lives on server; admin token required |
| Error log retrieval | BFF (logs.js /api/logs/console) | — | Server-side logs only accessible via BFF |
| Sample/seed data | BFF (sampleData.js + bootstrapData.json) | — | Static seed on server |

---

## Current State — Exact Bug Analysis

### Path 1: Suggestion chip → `sendAgentMessage()` (the broken path)

When a suggestion chip is clicked (line ~5467 in `BankingAgent.js`), it calls:

```js
sendAgentMessage(s)   // s = "Show all customer accounts"
```

`sendAgentMessage` POSTs to `POST /api/banking-agent/message` → `bankingAgentRoutes.js` →
`processAgentMessage()` in `bankingAgentLangGraphService.js`.

Inside `processAgentMessage()`:
```js
const heuristic = parseHeuristic(message);    // line 557
if (heuristic && heuristic.kind === 'banking') {
  // only banking-kind is short-circuited
}
```

`parseHeuristic("Show all customer accounts")` runs `parseBanking()`. The relevant regex is:

```js
/\b(show|list|get|see).*(account|balances?)\b|\bmy accounts\b|\ball accounts\b/.test(t)
```

`"show all customer accounts"` contains `"show"` and `"accounts"` so this **does match** and
returns `{ kind: 'banking', banking: { action: 'accounts' } }`. However, `executeHeuristicBanking`
with action `'accounts'` calls `dataStore.getAccountsByUserId(userId)` — the **current user's own
accounts** — not all customer accounts. So the response is correct accounts data but for the wrong
scope: the admin sees their own accounts, not all customers' accounts.

For `"Show me last 5 errors"`: `parseBanking()` has no `errors` regex. The parser returns
`kind: 'none'`, the heuristic branch is skipped entirely, and Ollama is invoked.

### Path 2: NL input field → `handleNaturalLanguage()` (the working path for errors)

When a user types text and presses Enter, `handleNaturalLanguage()` runs:
```js
const logQuery = parseLogPrompt(text);   // line 3801
if (logQuery) {
  // fetches /api/logs/console?level=error&limit=5 etc.
  return;
}
```

`parseLogPrompt("Show me last 5 errors")` matches the regex:
```js
/(?:show|list|give me|get)\s+(?:me\s+)?(?:the\s+)?last\s+(\d+)\s+errors?/
```
→ `{ type: 'errors', limit: 5 }`. This works correctly when typed. Suggestion chips bypass it.

### Path 3: Admin accounts — existing `parseBanking` false match

`"show all customer accounts"` matches `action: 'accounts'` but executes as the current user's
accounts lookup, not an admin-scoped all-accounts query. This is a semantic mismatch, not a
routing miss.

---

## Standard Stack

No new libraries required. All changes are within the existing stack.

### Core files affected

| File | Location | Change Needed |
|------|----------|---------------|
| `nlIntentParser.js` | `banking_api_server/services/` | Add `admin_accounts` action; add `admin_errors` action to `parseBanking()` |
| `bankingAgentLangGraphService.js` | `banking_api_server/services/` | Add execution branches for `admin_accounts` and `admin_errors` in `executeHeuristicBanking()` |
| `BankingAgent.js` | `banking_api_ui/src/components/` | Fix suggestion chip dispatch: route through `handleNaturalLanguage()` instead of calling `sendAgentMessage()` directly, OR add `parseLogPrompt` guard before `sendAgentMessage` call |
| `nlIntentParser.test.js` | `banking_api_server/src/__tests__/` | Add tests for `admin_accounts` and `admin_errors` phrases |
| `BankingAgent.chips.test.js` | `banking_api_ui/src/components/__tests__/` | Add tests verifying admin chip phrases route to heuristic, not LLM |

### Supporting files (no changes expected)

| File | Notes |
|------|-------|
| `sampleData.js` | Already has 3 customers + accounts; sufficient for demo |
| `store.js` | `getAllAccounts()` and `getAllUsers()` already implemented |
| `logs.js` | `/api/logs/console?level=error&limit=N` already works |

---

## Architecture Patterns

### System Architecture Diagram

```
Admin chip click ("Show all customer accounts")
    │
    ▼
BankingAgent.js — suggestion chip onClick handler
    │
    ├─ [CURRENT — broken] sendAgentMessage(s)
    │       │
    │       ▼
    │   POST /api/banking-agent/message
    │       │
    │       ▼
    │   processAgentMessage()
    │       │
    │       ├─ parseHeuristic(msg) → kind:'banking' action:'accounts'  ← wrong scope!
    │       │       (matches \b(show|list).*(accounts)\b but executes per-user, not admin)
    │       │
    │       └─ executeHeuristicBanking(action:'accounts', userId)
    │               └─ dataStore.getAccountsByUserId(userId)  ← own accounts only!
    │
    └─ [FIXED — option A] handleNaturalLanguage(s)
            │
            ├─ parseLogPrompt(s) → { type:'errors', limit:5 }  ← handled locally!
            │       └─ fetch /api/logs/console?level=error&limit=5
            │
            └─ sendAgentMessage(s) if no logQuery match
                    └─ processAgentMessage()
                            └─ parseHeuristic() → action:'admin_accounts'  ← new!
                                    └─ executeHeuristicBanking('admin_accounts')
                                            └─ dataStore.getAllAccounts()  ← all customers!
```

### Option A: Fix chip dispatch (recommended)

Change the suggestion chip `onClick` handler to call `handleNaturalLanguage` instead of
`sendAgentMessage` directly. This reuses the existing `parseLogPrompt` client-side guard for
errors, and the new `admin_accounts` heuristic server-side branch handles customer accounts.

The suggestion chip handler at line ~5466:
```js
// CURRENT
sendAgentMessage(s)

// FIXED: set nlInput and call handleNaturalLanguage
setNlInput(s);
// then trigger the existing submit path (or inline the logic)
```

However, `handleNaturalLanguage` reads from `nlInput` state, so the pattern needs to be:
set `nlInput(s)` then call the function, or inline the relevant guard at the call site.

Looking at the actual call site more carefully: the chips set `nlInput("")` and call
`sendAgentMessage(s)` directly. The simplest correct fix is to add the `parseLogPrompt` guard
before calling `sendAgentMessage` at that call site, and add the new `admin_accounts` action to
the server-side heuristic.

### Option B: Add `parseLogPrompt` guard to BFF (belt-and-suspenders)

Add a check in `processAgentMessage()` before calling the LLM that runs `parseLogPrompt` and
fetches `/api/logs/console` server-side. This is heavier — logs route is public, client-side
fetch is simpler.

**Recommended approach: Option A (client fix + server heuristic extension).**

### Pattern: Heuristic regex extension in `parseBanking()`

```js
// In nlIntentParser.js parseBanking(t):

// Admin: all customer accounts (show/list/get all customer accounts)
if (
  /\b(show|list|get).*(all.*(customer|user).*account|customer.*account|all.*account)\b/i.test(t) ||
  /\ball\s+customer\s+accounts?\b/i.test(t)
) {
  return { kind: 'banking', banking: { action: 'admin_accounts' } };
}

// Admin: recent errors (show last N errors / show me errors)
if (
  /\b(show|list|get|give).*last\s+\d+\s+errors?\b/i.test(t) ||
  /\blast\s+\d+\s+errors?\b/i.test(t) ||
  /\b(show|list).*(recent.*errors?|errors?\s+log)\b/i.test(t)
) {
  return { kind: 'banking', banking: { action: 'admin_errors', params: { limit: extractLimit(t) } } };
}
```

This must be placed **before** the existing `accounts` regex in `parseBanking()` so that the
more-specific `admin_accounts` pattern takes priority over the generic `accounts` catch-all.

### Pattern: `executeHeuristicBanking` for `admin_accounts`

```js
// In bankingAgentLangGraphService.js executeHeuristicBanking():

if (action === 'admin_accounts') {
  const allAccounts = dataStore.getAllAccounts();
  const allUsers = dataStore.getAllUsers();
  if (!allAccounts || allAccounts.length === 0) {
    return {
      reply: 'No customer accounts found in the system.',
      success: true,
      toolsCalled: ['admin_list_accounts'],
      ...
    };
  }
  // Group by userId, join with user display name
  const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));
  const lines = allAccounts.map(a => {
    const u = userMap[a.userId];
    const owner = u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username : a.userId;
    return `• **${owner}** — ${a.accountType} (${a.accountNumber || '—'}) — $${Number(a.balance).toFixed(2)} ${a.currency || 'USD'}`;
  });
  return {
    reply: `All customer accounts (${allAccounts.length} total):\n\n${lines.join('\n')}`,
    success: true,
    toolsCalled: ['admin_list_accounts'],
    tokensUsed: 0,
    requiresConsent: false,
    agentConfigured: true,
    tokenEvents: [],
    accounts: allAccounts,  // structured for potential AccountsTable rendering
  };
}
```

### Pattern: `executeHeuristicBanking` for `admin_errors`

The client-side `handleNaturalLanguage()` already has a complete error-log handler that fetches
`/api/logs/console?level=error&limit=N`. The server-side `admin_errors` action can replicate this
using the `appEventService` or via an in-process reference to the log store.

The simplest server implementation delegates to the existing `/api/logs` route data:

```js
if (action === 'admin_errors') {
  const limit = params?.limit || 5;
  // appEventService stores events in memory accessible in-process
  const events = appEventService.getEvents({ level: 'error', limit });
  if (!events || events.length === 0) {
    return { reply: `No error events found.`, success: true, ... };
  }
  const lines = events.map((e, i) => {
    const when = new Date(e.timestamp || Date.now()).toLocaleString();
    return `${i+1}. [ERROR] ${when}\n   ${String(e.message || '').slice(0, 180)}`;
  });
  return {
    reply: `Last ${events.length} errors:\n\n${lines.join('\n\n')}`,
    success: true,
    toolsCalled: ['admin_list_errors'],
    ...
  };
}
```

However, the richer approach (already proven) is to keep errors on the client side via
`parseLogPrompt` + `fetch /api/logs/console`. This is already working when text is typed; the
only fix needed is to route the chip through `handleNaturalLanguage` (Option A above).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| All-accounts admin query | Custom admin API route | `dataStore.getAllAccounts()` already exists | Instant, no HTTP round-trip |
| Error log retrieval | New log route | Existing `GET /api/logs/console?level=error` | Already handles merge of in-memory + Redis audit events |
| Admin role guard | Custom auth check | `requireAdmin` middleware already guards all admin routes | Consistency with existing pattern |

---

## Common Pitfalls

### Pitfall 1: `admin_accounts` regex must precede the generic `accounts` regex

**What goes wrong:** The current `parseBanking()` regex
`/\b(show|list|get|see).*(account|balances?)\b|\bmy accounts\b|\ball accounts\b/` already matches
`"show all customer accounts"` (because `show` + `accounts` is present). If `admin_accounts` is
added AFTER this line, it will never be reached.

**How to avoid:** Place the new `admin_accounts` branch above the existing `accounts` branch.

### Pitfall 2: Suggestion chip bypasses `handleNaturalLanguage` / `parseLogPrompt`

**What goes wrong:** The `"Show me last 5 errors"` chip works when typed in the NL input because
it goes through `handleNaturalLanguage` which runs `parseLogPrompt` first. When clicked as a chip,
it calls `sendAgentMessage` directly, skipping `parseLogPrompt` entirely, causing the Ollama
fallback.

**How to avoid:** Either (a) route chip clicks through `handleNaturalLanguage`, or (b) duplicate
the `parseLogPrompt` guard at the chip call site before `sendAgentMessage`. Option (b) is
lower-risk because it doesn't touch the NL state machine.

**Warning signs:** If after the fix typing "show last 5 errors" still works but clicking the chip
returns an LLM response, the chip path fix was not applied.

### Pitfall 3: Admin check missing in `executeHeuristicBanking`

**What goes wrong:** `admin_accounts` routes to `dataStore.getAllAccounts()` which returns ALL
accounts system-wide. If a non-admin user somehow triggers this action (e.g., by typing the
exact phrase), they would see all accounts.

**How to avoid:** In `executeHeuristicBanking()`, check `req?.user?.role === 'admin'` (or
`req?.session?.user?.role`). If not admin, return a 403-style reply message. The `req` parameter
is already threaded through to `executeHeuristicBanking`.

### Pitfall 4: `sampleData.js` has no `bankuser` account

**What goes wrong:** The demo seed user `bankuser` (referenced in the Dashboard) is provisioned
by PingOne login, not hardcoded in `sampleData.js`. If `getAllAccounts()` is called before any
PingOne user has logged in, results may be thin (only the 3 seed users john.doe, jane.smith,
mike.johnson).

**How to avoid:** The `admin_accounts` handler should format results from whatever is in the
store at query time. If the store has 0 non-seed accounts, the response should say so clearly.
No new seed data is required; the 3 existing seed users are sufficient for the demo.

---

## Code Examples

### Existing `parseBanking` accounts branch (reference, do not modify this line)

```js
// banking_api_server/services/nlIntentParser.js lines 149–153
if (
  /\b(show|list|get|see).*(account|balances?)\b|\bmy accounts\b|\ball accounts\b/.test(t)
) {
  return { kind: 'banking', banking: { action: 'accounts' } };
}
```

### Existing `parseLogPrompt` in BankingAgent.js (already working for typed input)

```js
// banking_api_ui/src/components/BankingAgent.js ~line 1052
const errorMatch =
  lower.match(/(?:show|list|give me|get)\s+(?:me\s+)?(?:the\s+)?last\s+(\d+)\s+errors?/) ||
  lower.match(/last\s+(\d+)\s+errors?/);
if (errorMatch) {
  return { type: 'errors', limit: Math.min(Math.max(parseInt(errorMatch[1], 10) || 5, 1), 50) };
}
```

### Suggestion chip call site (current — to be fixed)

```js
// banking_api_ui/src/components/BankingAgent.js ~line 5466
sendAgentMessage(s)
  .then(res => { ... })
```

### Suggestion chip call site (fixed — add parseLogPrompt guard)

```js
// Add BEFORE sendAgentMessage call
const logQuery = parseLogPrompt(s);
if (logQuery && logQuery.type === 'errors') {
  // inline the error-log fetch from handleNaturalLanguage (~line 3803)
  const params = new URLSearchParams({ level: 'error', limit: String(logQuery.limit) });
  // ... fetch and display
  return;
}
sendAgentMessage(s).then(res => { ... })
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| LLM-only routing | Heuristic-first, LLM fallback (Phase 200) | Already implemented in server; this phase extends it |
| All chips → LLM | Known chips → heuristic | Phase 200 added heuristic; admin chips were missed |

---

## Open Questions

1. **Admin role guard in `executeHeuristicBanking`**
   - What we know: `req` is threaded through to `executeHeuristicBanking` but role check is not
     currently done for any action.
   - What's unclear: Should the function silently scope down (fall back to own accounts) or return
     an explicit "admin required" message?
   - Recommendation: Return a clear message ("This query requires admin access. Sign in as admin."),
     consistent with the existing `403` messages in `handleNaturalLanguage`.

2. **Sample data richness for demo**
   - What we know: 3 seed users + accounts exist. `bankuser` is provisioned on PingOne login.
   - What's unclear: Whether the presenter will demo before any user login.
   - Recommendation: The existing 3 seed users are sufficient. Add a note in the response:
     "Showing seed data. Additional accounts appear after customers sign in."

---

## Environment Availability

Step 2.6: SKIPPED — phase is pure code changes; no external tools or new dependencies required.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (server) + Jest + React Testing Library (UI) |
| Server config | `banking_api_server/package.json` `jest` key |
| UI config | `banking_api_ui/package.json` `jest` key |
| Quick run (server) | `cd banking_api_server && npx jest --testPathPattern=nlIntentParser --forceExit` |
| Quick run (UI) | `cd banking_api_ui && npx jest --testPathPattern=BankingAgent.chips --watchAll=false` |
| Full suite | `cd banking_api_server && npm test && cd ../banking_api_ui && npm test -- --watchAll=false` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-228-01 | `"Show all customer accounts"` routes to `admin_accounts` heuristic, not LLM | unit | `npx jest --testPathPattern=nlIntentParser --forceExit` | ✅ existing file; need new test case |
| REQ-228-02 | `"Show me last 5 errors"` routes to `admin_errors` heuristic, not LLM | unit | `npx jest --testPathPattern=nlIntentParser --forceExit` | ✅ existing file; need new test case |
| REQ-228-03 | Admin chip click dispatches to heuristic path (no LLM call) | unit | `cd banking_api_ui && npx jest --testPathPattern=BankingAgent.chips --watchAll=false` | ✅ existing file; need new test case |
| REQ-228-04 | `admin_accounts` action returns all-customer accounts for admin role | unit | `npx jest --testPathPattern=nlIntentParser --forceExit` | ❌ Wave 0 gap |
| REQ-228-05 | Non-admin cannot trigger `admin_accounts` | unit | `npx jest --testPathPattern=bankingAgentLangGraph --forceExit` | ❌ Wave 0 gap |
| REQ-228-06 | UI build passes after all changes | smoke | `cd banking_api_ui && npm run build` | N/A — manual |

### Sampling Rate

- **Per task commit:** `cd banking_api_server && npx jest --testPathPattern=nlIntentParser --forceExit`
- **Per wave merge:** full suite (server + UI)
- **Phase gate:** `npm run build` in `banking_api_ui` exits 0 before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `banking_api_server/src/__tests__/nlIntentParser.test.js` — add cases for `admin_accounts` and `admin_errors` (file exists; test cases missing)
- [ ] `banking_api_server/src/__tests__/bankingAgentLangGraph.test.js` — covers REQ-228-04 and REQ-228-05 (file does not exist; create with mock dataStore)
- [ ] `banking_api_ui/src/components/__tests__/BankingAgent.chips.test.js` — add admin chip routing tests (file exists; test cases missing)

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | YES — admin_accounts must not be reachable by non-admin | Role check in `executeHeuristicBanking` using `req.session.user.role` |
| V5 Input Validation | YES — `limit` param from NL text | `Math.min(Math.max(parseInt(n, 10), 1), 50)` — already implemented in `parseLogPrompt` |

**Key risk:** The `admin_accounts` action must guard on role. The `parseLogPrompt` + error-log path
is already guarded: `/api/logs/console` does not require auth (public endpoint), but the content
returned is generic server logs, not customer PII. The `admin_accounts` result contains account
numbers and balances — always check role before calling `getAllAccounts()`.

---

## Sources

### Primary (HIGH confidence)

- `banking_api_ui/src/components/BankingAgent.js` — verified by direct read; chip dispatch at line ~5466, `handleNaturalLanguage` at line 3754, `parseLogPrompt` at line 1046, `SUGGESTIONS_ADMIN` at line 197
- `banking_api_server/services/nlIntentParser.js` — verified by direct read; `parseBanking` at line 140, `parseHeuristic` at line 259
- `banking_api_server/services/bankingAgentLangGraphService.js` — verified by direct read; `processAgentMessage` at line 528, `executeHeuristicBanking` at line 16
- `banking_api_server/services/geminiNlIntent.js` — verified by direct read; heuristic-first dispatch, Ollama fallback
- `banking_api_server/data/store.js` — verified by direct read; `getAllAccounts()` at line 291, `getAllUsers()` at line 215
- `banking_api_server/routes/logs.js` — verified; `GET /console?level=error&limit=N` at line 209
- `banking_api_server/src/__tests__/nlIntentParser.test.js` — verified; existing test structure
- `banking_api_ui/src/components/__tests__/BankingAgent.chips.test.js` — verified; existing test structure

### Secondary (MEDIUM confidence)

- `banking_api_server/data/sampleData.js` — verified; 3 seed customers + 1 admin user

---

## Metadata

**Confidence breakdown:**
- Bug identification: HIGH — traced exact code paths from chip click to LLM call
- Fix approach: HIGH — existing patterns (parseLogPrompt, executeHeuristicBanking) are clear templates
- Test mapping: HIGH — test files exist; gap is test cases, not infrastructure

**Research date:** 2026-04-24
**Valid until:** 2026-05-24 (stable codebase, no fast-moving dependencies)
