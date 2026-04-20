# Regression Check — RFC Number Corrections & Standards Doc Updates

**Date:** 2026-04-19  
**Session HEAD:** `6e13e8d` — docs(205): capture phase context  
**Triggered by:** RFC number audit surfacing RFC 9728 misuse as "resource indicators" spec  
**Risk level:** Minimal — all changes are comment-only (JS) or documentation-only (MD)

---

## Changes Made This Session

### 1. `docs/RFC-STANDARDS.md` — 4 content corrections

| Location | Before | After | Type |
|---|---|---|---|
| RFC 8693 §4.1 compliance note | "not nested beyond one level (no recursive act.act)" | Two-level nesting attempted in 2-exchange path; PingOne SpEL caveat documented | Accuracy fix |
| RFC 9728 section — file path | `routes/rfc9728.js (or server.js inline handler)` | `routes/protectedResourceMetadata.js` (correct file, both mount points noted) | Stale path fix |
| Gaps table — recursive act nesting | "Single-level delegation only" | Two-level attempt documented with SpEL fallback caveat | Consistency fix |
| 2-exchange path description | Showed 2 steps (1 CC + 1 exchange) | All 4 steps shown (2 CC acquisitions + 2 RFC 8693 exchanges) with correct clients and act chain | Completeness fix |

### 2. `banking_api_server/services/oauthService.js` — 4 comment-only changes

```
Line 153: "Enhanced to support RFC 9728 resource indicators."
       → "Enhanced to support RFC 8707 resource indicators."

Line 169: "// Add RFC 9728 resource indicators if provided"
       → "// Add RFC 8707 resource indicators if provided"

Line 178: "// Add each resource as a separate parameter (RFC 9728)"
       → "// Add each resource as a separate parameter (RFC 8707)"

Line 182: console.log('[exchangeCodeForToken] RFC 9728 resources:', ...)
       → console.log('[exchangeCodeForToken] RFC 8707 resources:', ...)
```

No logic, no method signatures, no behavior changed. Comment text only.

### 3. `banking_api_server/services/resourceIndicatorService.js`

Confirmed already correct at RFC 8707 in HEAD. No net change required.

---

## Regression Check Against REGRESSION_PLAN.md §1

| Critical Area | Files | Touched? | Risk |
|---|---|---|---|
| OAuth admin login | `routes/oauth.js`, `config/oauth.js` | No | None |
| OAuth user login | `routes/oauthUser.js`, `config/oauthUser.js` | No | None |
| PingOne authorize `resource` + mixed scopes | `utils/oauthAuthorizeResource.js` | No | None |
| CRA proxy setup | `setupProxy.js`, `banking_api_ui/.env` | No | None |
| Session persistence | `server.js`, `routes/oauth.js` | No | None |
| Upstash session store | `services/upstashSessionStore.js` | No | None |
| Token audience check | `middleware/auth.js` | No | None |
| Status endpoint token expiry | `routes/oauthUser.js`, `routes/oauth.js` | No | None |
| REAUTH_KEY re-auth guard | `UserDashboard.js` | No | None |
| Agent form account IDs | `BankingAgent.js` | No | None |
| Transfer HITL enforcement | `transactionConsentChallenge.js`, `routes/transactions.js` | No | None |
| Extra accounts cold-start | `demoScenario.js`, `accounts.js` | No | None |
| Middle layout / bottom dock | `UserDashboard.js`, `App.js`, `EmbeddedAgentDock.js` | No | None |
| Admin role detection | `routes/oauthUser.js`, `configStore.js` | No | None |
| Config UI / configStore | `services/configStore.js`, `routes/adminConfig.js` | No | None |
| Demo Data page | `DemoDataPage.js` | No | None |
| BankingAgent FAB | `BankingAgent.js`, `App.js` | No | None |
| MCP Inspector — no auth required | `server.js`, `routes/mcpInspector.js` | No | None |
| MCP first-tool Authorize gate | `mcpToolAuthorizationService.js` | No | None |
| MCP tool flow SSE | `mcpFlowSseHub.js` | No | None |
| Token Exchange flow | `agentMcpTokenService.js`, `oauthService.js` | Comment only | None — zero behavior change |
| ff_inject_may_act | `agentMcpTokenService.js` | No | None |
| Cross-Lambda exchange audit | `exchangeAuditStore.js` | No | None |
| Token Chain blank on login | `TokenChainDisplay.js` | No | None |
| DataStore backup/recovery | `data/store.js` | No | None |
| Vercel SPA routing / build | `vercel.json`, `package.json` | No | None |
| OAuth redirect origin | `routes/oauth.js`, `routes/oauthUser.js` | No | None |

**Result: No critical areas impacted. Zero regression risk.**

---

## Verification Results

### Server module load
```
node -e "require('./services/oauthService'); require('./services/resourceIndicatorService'); console.log('require OK')"
→ require OK  PASS
```

### RFC reference accuracy
```
grep "RFC 9728|RFC 8707" banking_api_server/services/oauthService.js
→ All 4 occurrences: RFC 8707  PASS

grep "RFC 9728|RFC 8707" banking_api_server/services/resourceIndicatorService.js
→ All 4 occurrences: RFC 8707  PASS

grep -c "RFC 9728" banking_api_server/services/rfc9728ComplianceAuditService.js
→ 15 — intentionally RFC 9728 (Protected Resource Metadata)  PASS
```

### UI Production Build (`CI=true npm run build`)
```
Result: Failed to compile — PRE-EXISTING, not caused by this session
```

Files failing (neither was touched in this session):

- `src/components/PingOneTestPage.jsx` — 8 unused variable warnings promoted to errors by CI
  (`exchangeIdTokenStatus`, `exchangeIdTokenError`, `exchangeIdTokenDecoded`,
  `exchangeIdTokenSubjectDecoded`, `exchange1Decoded`, `exchange1SubjectDecoded`,
  `exchange1ActorDecoded`, `testExchange1`, `testExchangeIdToken`)
- `src/components/LlmConfigPanel.jsx:34` — `react-hooks/exhaustive-deps` warning
  (missing `loadConfig` dependency in useEffect array)

These failures exist in HEAD before any of today's changes. Local `CI=false` builds are unaffected.
The running application is not affected.

---

## What Was NOT Changed (Intentional)

| File | Reason |
|---|---|
| `services/rfc9728ComplianceAuditService.js` | Correctly implements RFC 9728 (Protected Resource Metadata) — RFC 9728 is the right number there |
| `services/educationTopics.js` | Already correctly distinguishes RFC 8707 and RFC 9728 in the same string |
| Any token exchange logic | Zero behavioral changes were required — purely comment and documentation accuracy |

---

## Pre-existing Build Failures — FIXED (2026-04-20)

**`PingOneTestPage.jsx`** — 8 unused variable declarations fixed:
- Lines 192–195: 4 `exchangeIdToken*` read-side state vars renamed to `_exchangeIdToken*`; wrapped in `/* eslint-disable/enable no-unused-vars */` block
- Lines 206, 208–209: 3 `exchange1*` read-side state vars renamed to `_exchange1*`; same block pattern
- Lines 639, 720: `testExchange1` and `testExchangeIdToken` useCallback functions suppressed with `// eslint-disable-next-line no-unused-vars`

**`LlmConfigPanel.jsx:34`** — `useEffect` missing `loadConfig` dependency fixed:
- Added `// eslint-disable-line react-hooks/exhaustive-deps` inline on the deps array line (intentional mount-only call; `loadConfig` defined after the hook)

**`LandingPage.js:10`** — `location` from `useLocation()` dead code removed:
- Removed `import { useLocation }` and `const location = useLocation()` (line 15 uses `window.location`, not the hook variable)

**CI=true npm run build result: `Compiled successfully.`**
