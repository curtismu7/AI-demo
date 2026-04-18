# Phase 126-01 Summary — Surface sub claim as user ID in token chain display

**Phase:** 126
**Plan:** 01
**Status:** Complete
**Date:** 2026-04-18

---

## What was built

Friendly user and actor identity is now visible across the token chain UI, education panels, and AgentFlowDiagramPanel. Raw UUIDs and client_ids are replaced with human-readable labels such as `Alice Smith (abc12345…)` and `Super Banking BFF (bff0a1b2…)` wherever sessions identity is available, with safe fallback to truncated raw IDs.

---

## Changes

### Task 1: Add resolved identity to TokenChainContext (single shared source)

**`banking_api_ui/src/context/TokenChainContext.js`**
- Added `resolvedIdentity` state: `{ currentUser: { sub, name, email }, knownClients: { [clientId]: label } }`
- Added `loadResolvedIdentity` callback — fetches `/api/auth/session` + `/api/pingone-test/config` in parallel once on mount
- Added `userAuthenticated` event listener to re-fetch identity on re-auth
- Exposed `resolvedIdentity` in context value (consumed by all downstream surfaces)
- Result: single fetch shared across all token-related surfaces — no duplicate requests

### Task 2: Update TokenChainDisplay sub rendering

**`banking_api_ui/src/components/TokenChainDisplay.js`**
- Removed local `identityHints` state and `loadIdentityHints` effect (replaced by context source)
- Added `const identityHints = ctx?.resolvedIdentity ?? null;` — reads from context
- Updated EventRow "User" button display text: raw truncation → `fmtSub(userId, hints)`
  - Now shows e.g. `👤 User: Alice Smith (a1b2c3d4…)` when identity is available
  - Falls back to `👤 User: a1b2c3d4…` when not
- `fmtSub` / `fmtAct` / `ClaimsStrip` already consumed hints correctly — no changes needed there

### Task 3: Inject live identity into education panels

**`banking_api_ui/src/components/education/TokenChainEducationPanel.js`**
- Added `import { useTokenChainOptional }` from context
- Main component reads `resolvedIdentity` from context and passes as `liveIdentity` prop to `JwtClaimsTab`
- `JwtClaimsTab` derives `exampleSub`, `exampleName`, `exampleEmail` from live identity
- Replaces `"a1b2c3d4-user-uuid"`, `"user-uuid"`, `"Jane Smith"`, `"jane@example.com"` in JWT examples when session is present
- Graceful fallback: uses placeholder text when no session

**`banking_api_ui/src/components/education/TokenChainPanel.js`**
- Added `resolvedIdentity` read from `tokenChain?.resolvedIdentity`
- Builds live-aware `steps` array — when `liveSub` is available, `banking-app` step's `payloadPreview` shows the real `sub` and `name` values
- Uses `TOKEN_CHAIN_STEPS` as base and maps over it (non-destructive)

### Task 4: Update AgentFlowDiagramPanel token display

**`banking_api_ui/src/components/AgentFlowDiagramPanel.js`**
- Added `import { useTokenChainOptional }` from context
- Main component reads `resolvedIdentity` from context, passes as prop to local `TokenChainDisplay`
- Local `TokenChainDisplay` (compact BFF-sourced variant) now has:
  - `fmtTokenSub(sub)` — shows `Name (short-id…)` when identity matches, else `short-id…`
  - `fmtTokenAct(act)` — shows `App Name (short-id…)` from `knownClients`, else truncated id
- Compact view shows `👤 Name (short-id…)` instead of `👤 raw-uuid...`
- Full view shows `User:` / `Actor:` labels with friendly values

---

## Verification

- ✅ `cd banking_api_ui && npm run build` → **exit 0**, `441.42 kB (+602 B)` — build clean
- ✅ `resolvedIdentity` is fetched once in TokenChainContext and shared — no duplicate fetches
- ✅ TokenChainDisplay: `fmtSub(userId, hints)` in EventRow User button shows friendly name
- ✅ `ClaimsStrip` already used `fmtSub`/`fmtAct` with hints — shows friendly labels in compact strip
- ✅ TokenChainEducationPanel: JWT Claims tab shows real sub/name/email when session is present
- ✅ TokenChainPanel: `banking-app` step shows real sub in payloadPreview when authenticated
- ✅ AgentFlowDiagramPanel: compact token display shows friendly name/actor instead of raw UUID
- ✅ All surfaces fall back gracefully to raw IDs when identity is unavailable
- ✅ No token-exchange logic, consent, or server contract was changed

## Self-Check: PASSED

---

## Deviations

None. Implementation aligned with CONTEXT.md decisions exactly:
- Friendly name + truncated raw ID format: `Name (uuid…)` ✅
- Known client IDs → app labels from env/config ✅
- Single cached fetch in context ✅
- Graceful fallback to raw IDs ✅
- Display-only — no token issuance or scope changes ✅

---

## Requirements satisfied

- ACTLOG-01 through ACTLOG-07: all token-chain surfaces surface friendly identity ✅
