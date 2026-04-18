# Phase 145: MCP Server Audit - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning
**Source:** Planning run without prior discuss-phase artifact

<domain>
## Phase Boundary

Audit and harden MCP tool discovery/metadata flow so agents can make dynamic decisions from server-exposed tool metadata and schemas, without relying on hardcoded per-tool assumptions.

</domain>

<decisions>
## Implementation Decisions

### Locked
- Focus on MCP tool metadata fidelity: registry -> tools/list contract -> agent consumption.
- Keep changes minimal and backward-compatible for existing clients.
- Prefer metadata-first behavior in agent tool schema handling.

### the agent's Discretion
- Exact test file names and distribution across plans.
- Whether to include optional contract fields (e.g., title/icons/annotations) in tools/list.
- Audit document format and level of detail.

</decisions>

<specifics>
## Specific Ideas

- Use `BankingToolRegistry` as canonical metadata source.
- Add regression tests around `tools/list` payload shape.
- Remove or neutralize hardcoded banking schema fallback in Python agent provider.

</specifics>

<deferred>
## Deferred Ideas

- Broader setup wizard UX goals currently listed in ROADMAP phase goal text.
- Non-MCP auditing work unrelated to tool discovery/metadata and agent dynamic behavior.

</deferred>

---

*Phase: 145-mcp-server-audit-does-the-server-meet-spec-requirements-and-provide-the-agent-with-tools-metadata-capabilities-descriptions-parameter-schemas-to-make-decisions-dynamically-not-hardcoded-tool-calls*
*Context gathered: 2026-04-17*
