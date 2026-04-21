# Phase 211 Plan 02 — SUMMARY

**Phase:** 211-scope-gated-write-tools-403-to-hitl-to-token-exchange-flow
**Plan:** 02 — 4-state scope-upgrade consent modal in BankingAgent.js
**Status:** ✅ Complete
**Commit:** `feat(211-02): 4-state scope-upgrade consent modal + handleScopeUpgradeConfirm + auto-replay`

---

## What Was Built

### Task 1: `pendingScopeUpgradeRef` + extended `setScopeErrorModal` call sites

- **`pendingScopeUpgradeRef = useRef(null)`** declared after `scopeErrorModal` state (line 1137)
- **Chip-path handler** (lines ~2584-2600): Replaced dead-end `addMessage + setScopeErrorModal` with Phase 211 version:
  - New RFC-educational `addMessage('token-event', ...)` explaining the scope gate
  - `pendingScopeUpgradeRef.current = { actionId, form }` saved before modal opens
  - `scopeUpgradeState: 'error'` added to modal state object
- **NL-path handler** (lines ~3029-3045): Replaced dead-end assistant message with:
  - Token-event message
  - `pendingScopeUpgradeRef.current = { actionId: response.tool || 'create_transfer', form: {} }`
  - `setScopeErrorModal` with `scopeUpgradeState: 'error'` + `return`

### Task 2: `handleScopeUpgradeConfirm` function (lines ~3257-3299)

Async function defined in component body before `const floatShell`:
1. Transitions modal to `'exchanging'` state + emits token-event chat message
2. Calls `POST /api/mcp/scope-upgrade` with credentials
3. On failure: transitions back to `'error'` state with `upgradeError` message
4. On success:
   - Calls `tokenChain.setTokenEvents('scope_upgrade', data.tokenEvents)` for educational display
   - Emits RFC 8693 exchange educational token-event message
   - Transitions modal to `'done'` state
   - After 500ms: closes modal, clears `pendingScopeUpgradeRef`, calls `runAction(actionId, form, { skipUserLabel: true })` to auto-replay

### Task 2: 4-state `scopeErrorModal` JSX (lines ~3776-3880)

Replaced the static "Got it" modal with a 4-state machine:

| State | Content | Actions |
|-------|---------|---------|
| `error` | Missing scope info + scope badge comparison | Cancel · Approve Scope Upgrade |
| `confirm` | RFC 8693 explanation + what `banking:write` grants | Back · Confirm & Exchange Token |
| `exchanging` | Spinner / "Exchanging Token…" message | (none — auto-proceeds) |
| `done` | "Scope Upgraded — Replaying Request" | (none — auto-closes after 500ms) |

---

## Files Modified

| File | Changes |
|------|---------|
| `banking_api_ui/src/components/BankingAgent.js` | +pendingScopeUpgradeRef; +scopeUpgradeState to both setScopeErrorModal sites; +handleScopeUpgradeConfirm; replaced modal JSX |

---

## Key Design Decisions (from CONTEXT.md)

- **D-01 (HITL consent step):** Two-step modal (error→confirm) satisfies HITL requirement without full CIBA flow
- **D-02 (Token exchange):** `handleScopeUpgradeConfirm` calls BFF endpoint which handles RFC 8693 exchange
- **D-03 (Request replay):** `pendingScopeUpgradeRef` stores actionId+form; `runAction(... { skipUserLabel: true })` replays after done state
- **D-04 (Educational visibility):** Token-event messages emitted at each state; `tokenChain.setTokenEvents` pushes exchange events to inspector

---

## Verification

```bash
# Check all key identifiers present
grep -c "pendingScopeUpgradeRef\|scopeUpgradeState\|handleScopeUpgradeConfirm\|scope-upgrade" \
  banking_api_ui/src/components/BankingAgent.js
# Expected: 20+

# Build passes
cd banking_api_ui && npm run build
# Expected: exit 0 (✅ confirmed)
```

---

## UAT Flow

1. Login and try a transfer action
2. If scope gate fires (403 `mcp_scope_denied`): modal opens in **error** state showing missing `banking:write` scope
3. Click **Approve Scope Upgrade** → modal transitions to **confirm** state with RFC 8693 explanation
4. Click **Confirm & Exchange Token** → modal transitions to **exchanging** state; BFF calls PingOne token exchange
5. On success → modal transitions to **done** state for 500ms, then auto-closes
6. Original transfer action replays automatically (no user re-input needed)
7. Check chat panel: 4 token-event messages should appear (scope_denied → consent → exchange → replay)
8. Check Token Chain Inspector: `scope_upgrade` exchange events visible
