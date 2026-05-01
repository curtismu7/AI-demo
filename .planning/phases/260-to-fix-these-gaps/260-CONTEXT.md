# Phase 260: to fix these gaps - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Fixing implementation gaps identified during recent sessions and captured in the `.planning/debug/` directory:
1. **MCP results not showing:** Token Chain panel shows no tool calls due to overly strict userId filtering in `getMCPToolCalls`.
2. **P1MFA device selection missing:** The transaction consent flow skips device selection and defaults to OTP, bypassing FIDO/WebAuthn options.

This phase is strictly for bug fixes and wiring corrections for these existing features. No new capabilities are introduced.
</domain>

<decisions>
## Implementation Decisions

### MCP Results Tracking
- **D-01:** Fix `getMCPToolCalls` filter in `tokenChainService.js` to include events where `event.userId` is falsy (`!event.userId`).
- **D-02:** Do not modify the TypeScript MCP server (`BankingToolProvider.ts`) to extract JWT claims, as the filter fix is sufficient, robust, and less risky.

### P1MFA Device Selection
- **D-03:** Update `transactionConsentChallenge.js` to separate the challenge initiation from device selection.
- **D-04:** Add a new `POST /consent-challenge/:id/select-device` route in `transactions.js` that calls `mfaService.selectDevice()`.
- **D-05:** Update the `TransactionConsentModal.js` UI to render the device picker list after the initial approval, before showing the specific challenge UI (OTP or FIDO).

### the agent's Discretion
- Exact UI styling and layout of the device picker in `TransactionConsentModal.js`
- Error handling verbosity for the new `/select-device` endpoint

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Debug Root Cause Analyses
- `.planning/debug/mcp-results-not-showing.md` — Verified root cause and one-line fix for the MCP results filter.
- `.planning/debug/p1mfa-device-selection-missing.md` — Verified root cause and architecture plan for the P1MFA device selection omission.

</canonical_refs>

<code_context>
## Existing Code Insights

### Established Patterns
- `mfaService.js` already contains the necessary logic for device enumeration and selection (`initiateDeviceAuth`, `selectDevice`). The gap is just that `transactionConsentChallenge.js` isn't using it correctly.
</code_context>

<specifics>
## Specific Ideas

- The `mcp-results-not-showing` fix is exactly: `.filter(event => !userId || !event.userId || event.userId === userId || event.details?.userToken?.sub === userId)`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope
</deferred>
