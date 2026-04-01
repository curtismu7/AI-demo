# Phase 06 Plan 02 — SUMMARY
## Plan: `06-02` — 2-exchange delegation tests + security properties + live integration

**Phase:** `06-token-exchange-fix`
**Status:** ✅ Complete
**Commit:** `589d792`

---

## What Was Built

### Task 1 — 2-exchange delegation unit tests

**`banking_api_server/src/__tests__/agentMcpTokenService.test.js`:**

Extended the oauthService mock to include `getClientCredentialsTokenAs` and `performTokenExchangeAs` (the two methods used in `_performTwoExchangeDelegation`).

Added `describe('resolveMcpAccessTokenWithEvents — 2-exchange delegation', ...)` with **8 tests**:

| Test | Verifies |
|------|---------|
| Happy path: returns finalMcpJwt | Final token is from Exchange #2, not userToken or agentExchangedJwt |
| Happy path: 2×CC + 2×exchange calls | `getClientCredentialsTokenAs` called twice, `performTokenExchangeAs` called twice |
| Happy path: tokenEvents order | two-ex-agent-actor, two-ex-exchange1, two-ex-mcp-actor, two-ex-final-token present |
| Preflight: missing AI_AGENT_CLIENT_ID → 503 | Throws with httpStatus=503, `two-exchange-not-configured` event with status='failed' |
| Preflight: missing AGENT_OAUTH_CLIENT_SECRET → 503 | Same preflight guard |
| Exchange #1 failure | `two-ex-exchange1` event has status='failed' |
| session.mcpExchangeMode='double' triggers 2-exchange (ff=false) | Session override bypasses feature flag |
| session.mcpExchangeMode='single' blocks 2-exchange (ff=true) | Session override blocks feature-flag-enabled path |

### Task 2 — Security property tests

Added `describe('Security properties', ...)` with **5 tests**:

| Test | Security property |
|------|------------------|
| User token never forwarded | `result.token !== sampleJwtUserAccessToken` when exchange succeeds |
| audMatches=true when aud matches mcpResourceUri | Audience narrowing verified |
| audMatches=false when aud differs | Detects mis-issued token |
| actPresent=true when act claim present | Delegation act claim presence asserted |
| ff_skip_token_exchange=true returns user token | Explicit opt-out documented with security comment |

### Task 2 — Live integration scaffold

**`banking_api_server/src/__tests__/token-exchange-pingone.integration.test.js`:**

- Guard updated: `RUN_PINGONE_TOKEN_EXCHANGE=true` also enables live tests (backward compat with `RUN_PINGONE_TOKEN_INTEGRATION`)
- Added `performTokenExchangeWithActor` live test (requires `INTEGRATION_AGENT_ACCESS_TOKEN`)
- Added `getAgentClientCredentialsToken` live test (requires `AGENT_OAUTH_CLIENT_ID` + `AGENT_OAUTH_CLIENT_SECRET`)
- All 3 live tests in `(live ? describe : describe.skip)` block — skipped in CI

---

## Test Results

```
Test Suites: 50 passed, 50 total
Tests:       7 skipped, 879 passed, 886 total
```

Zero regressions. 0 failures.

---

## Requirement Coverage

- **TOKEN-FIX-02:** ✅ Both 1-exchange and 2-exchange paths tested end-to-end
  - 2-exchange delegation unit tests: ✅ 8 tests covering happy path + failures + session overrides
  - Security properties explicitly asserted: ✅ 5 tests
  - Live integration scaffold: ✅ 3 opt-in tests guarded by `RUN_PINGONE_TOKEN_EXCHANGE=true`

---

## Live Testing

To run the live PingOne integration tests (requires real env + tokens):

```bash
cd banking_api_server
RUN_PINGONE_TOKEN_EXCHANGE=true \
  INTEGRATION_SUBJECT_ACCESS_TOKEN='<user JWT>' \
  INTEGRATION_AGENT_ACCESS_TOKEN='<agent actor JWT>' \
  AGENT_OAUTH_CLIENT_ID='...' \
  AGENT_OAUTH_CLIENT_SECRET='...' \
  npx jest --testPathPattern=token-exchange-pingone --forceExit
```
