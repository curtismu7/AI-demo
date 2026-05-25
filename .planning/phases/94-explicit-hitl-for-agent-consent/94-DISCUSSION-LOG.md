# Phase 94: explicit-hitl-for-agent-consent - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** 94-explicit-hitl-for-agent-consent
**Areas discussed:** Consent dialog content, Allow Always scope

---

## Consent Dialog Content

| Option | Description | Selected |
|--------|-------------|----------|
| Action + scopes | "Agent wants to: [action]" + "Requires: [scope]". Clean, permission-focused. | ✓ |
| Full tool detail | Tool name, description, all parameters, scopes. More transparent but verbose. | |
| Natural language only | "The AI agent is about to check your bank accounts. Allow?" No technical detail. | |

**User's choice:** Action + scopes

---

| Option | Description | Selected |
|--------|-------------|----------|
| Stack (two dialogs) | New pre-action gate fires first; existing transaction consent fires after. | |
| Merge into one dialog | Single enhanced dialog: agent context + scopes + transaction details + OTP. | ✓ |
| Skip for financial ops | New gate applies only to non-financial tools; existing HITL handles financial. | |

**User's choice:** Merge into one dialog

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — Token Chain panel | Consent events appear inline in Token Chain (no new UI). | ✓ |
| Yes — separate consent log | Dedicated "Consented Actions" section in agent panel or tab. | |
| No — server-side audit only | Decisions logged server-side, not surfaced in session UI. | |

**User's choice:** Yes — Token Chain panel

---

## Allow Always scope

| Option | Description | Selected |
|--------|-------------|----------|
| Session only | Stored in req.session; cleared on logout. Simple, safe. | ✓ |
| Persistent per user | Stored server-side per userId (LMDB). Survives logout. | |
| Browser session (localStorage) | Stored in browser. No server storage but inconsistent across devices. | |

**User's choice:** Session only

---

| Option | Description | Selected |
|--------|-------------|----------|
| Per tool name | Keyed by tool.name. Each tool approved independently. | ✓ |
| Per scope | Any tool needing an approved scope is pre-approved. More principled. | |
| All agent actions (blanket) | One Allow Always covers everything this session. | |

**User's choice:** Per tool name

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — in agent panel | "Consented this session" list in Banking Agent sidebar with revoke button. | ✓ |
| No — session ends naturally | Allow Always expires at logout; no mid-session revoke. | |
| Yes — on Profile/Settings page | Dedicated section on profile page for active session grants. | |

**User's choice:** Yes — in the agent panel

---

## Claude's Discretion

- Button labels and visual design of the merged consent dialog — follow existing AgentConsentModal / TransactionConsentModal patterns.
- Whether the consent interceptor fires at BFF middleware layer or at the agent message handler.
- Exact Token Chain event shape for consent decisions.

## Deferred Ideas

- Persistent Allow Always (server-side per user) — requires new LMDB table and profile UI. Future phase.
- Admin controls for HITL thresholds per tool — future phase.
- Rate limiting on Allow Always grants — session-scoped grants don't need this; deferred.
