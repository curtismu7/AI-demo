# Phase 183: MCP Tools Metadata Compliance and Token Chain Logging - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 183-mcp-tools-metadata-compliance-and-token-chain-logging
**Areas discussed:** Tool annotations mapping, Token chain audit scope, Education/visibility, Spec compliance depth

---

## Tool Annotations Mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Proposed mapping table | 9 tools mapped to readOnlyHint, destructiveHint, idempotentHint, openWorldHint based on existing readOnly field and tool behavior | ✓ |

**User's choice:** Approved the proposed mapping as-is
**Notes:** Key decisions: `create_withdrawal` and `create_transfer` are destructive (irreversible money movement). `create_deposit` is NOT destructive but NOT idempotent. `sequential_think` is openWorldHint=true. `get_sensitive_account_details` keeps readOnlyHint=true (spec hint is about state mutation, not PII access).

---

## Token Chain Audit Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal | Log only token exchange event (request → success/fail, scopes, act claim) | |
| Full per-tool-call chain | Complete lifecycle: user token → exchange → claims → tool execution → result | |
| Full chain + token lineage | Same as full chain, plus track lineage across tool calls in a session | ✓ |

**User's choice:** Full chain + token lineage
**Notes:** Upgrade TokenExchangeService from console.log to AuditLogger (Redis-backed). Track cross-call lineage (e.g., "3rd tool call using exchanged token X, derived from user token Y").

---

## Education / Visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Existing /audit admin page | Add Token Chain filter/tab to admin audit page | |
| Token chain panel enhancement | Enhance frontend token chain panel with MCP-side events | |
| Both | Admin audit page + user-facing token chain panel | ✓ |
| Backend only | No UI changes, just AuditLogger/Redis queryable via API | |

**User's choice:** Both — admin audit page gets full structured logs, token chain panel gets lightweight MCP delegation trail
**Notes:** None

---

## Spec Compliance Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Annotations only | Add annotations block to getMCPToolDefinitions() output | |
| Annotations + title | Also add human-readable title to each tool | |
| Annotations + title + icons | Full MCP 2025-11-25 compliance with SVG/PNG icons per tool category | ✓ |

**User's choice:** Full spec compliance — annotations + title + icons
**Notes:** Icons by category (read, write, sensitive, think).

---

## Agent's Discretion

- Exact title strings for each tool
- Icon design/source (SVG per category)
- Token chain audit record schema structure
- Lineage presentation format in token chain panel
- Whether to add new AuditLogger method or extend existing

## Deferred Ideas

None
