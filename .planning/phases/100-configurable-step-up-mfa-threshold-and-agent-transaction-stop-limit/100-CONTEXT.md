# Phase 100: Configurable Step-up MFA Threshold and Agent Transaction Stop Limit

**Gathered:** 2026-04-08
**Status:** Ready for planning
**Source:** Codebase audit + ROADMAP phase title

---

## Phase Boundary

Add two interconnected security controls to the transaction authorization layer:

1. **Enhanced step-up MFA configurability** — Review & complete the existing step-up threshold configuration in SecuritySettings, ensure it's production-ready
2. **Agent transaction stop limit (new)** — Implement a configurable limit on the number or cumulative value of transactions an agent can perform before requiring explicit user re-approval

These controls work together to provide enterprise-grade HITL (Human-In-The-Loop) governance for delegated agent actions.

---

## Decisions

### Step-up MFA Threshold Configuration (D-100-01)
- **Current state**: Already implemented in SecuritySettings.js (`stepUpAmountThreshold`, `stepUpAcrValue`, `stepUpTransactionTypes`, `stepUpMethod`, `stepUpWithdrawalsAlways`)
- **Banking API**: transactions.js uses runtimeSettings + configStore to read and enforce thresholds at request time
- **Requirement**: Verify UI is complete, backend is correctly reading live config, and the error message format is clear to API consumers (mobile, agent, web)
- **Locked constraint**: Do NOT change the existing threshold logic; audit and polish only

### Agent Transaction Stop Limit (D-100-02)
- **Definition**: A configurable limit controlling how many transactions (or cumulative value) an agent can initiate before requiring a new explicit user approval/consent
- **Scenario**: User approves agent to perform "up to 3 transactions worth $500 total"; after the agent performs 2 transfers and 1 withdrawal, further actions require new approval
- **Integration**: Builds on Phase 94 (Explicit HITL for agent consent)
- **Config location**: Add to SecuritySettings.js and runtimeSettings (agentTransactionLimit, agentTransactionValueLimit)
- **Enforcement**: Check in transactions.js POST / route before executing; track per-agent-session in runtimeSettings or session state

### the agent's Discretion
- **Tracking granularity**: Whether to track by individual transaction count or cumulative value or both — recommend both with separate toggles
- **Reset mechanism**: Whether limit resets on new approval, per-day, or per-session — recommend explicit user approval resets it
- **UI clarity**: Dashboard showing agent activity counter and remaining agent transaction budget — can be deferred to Phase 102 UI redesign if necessary
- **Fallback behavior**: What happens when agent hits limit — 429 (Too Many Requests) with clear error message, or 403 (Forbidden), or 428 (Precondition Required with step-up URL)

---

## Canonical References

**What this phase depends on (MUST READ before planning):**

- `banking_api_server/routes/transactions.js` — Step-up MFA gate logic (lines 313–360); read to understand how runtimeSettings thresholds are enforced
- `banking_api_ui/src/components/SecuritySettings.js` — Step-up MFA configuration UI (all fields in FIELD_META); verify completeness
- `banking_api_server/config/runtimeSettings.js` — Settings registry and storage layer
- `ROADMAP.md` Phase 94 entry — "Explicit HITL for agent consent"
- `.planning/STATE.md` — Decisions D-01–D-06 provide auth + security context

---

## Requirements

**From ROADMAP.md Phase 100:**
- Step-up MFA threshold must be clearly configurable and production-ready
- Agent transaction stop limit must be implemented and fully configurable
- Both controls must integrate with existing consent/approval flow from Phase 94

**Success criteria:**
1. Admin can navigate to SecuritySettings and adjust step-up threshold, ACR value, transaction types, and method without issues
2. Error messages returned by BFF (`/api/transactions` POST) clearly explain why step-up was required and what threshold applies
3. Admin can configure agent transaction limits (count and/or value) in SecuritySettings
4. Transactions API enforces agent transaction limits before creating a transaction; returns appropriate HTTP status + error detail
5. Agent encounters stop condition and can re-request user approval before continuing
