# Phase 264: MCP Gateway Config Page - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-02
**Phase:** 264-do-we-need-a-config-page-for-mcp-gateway-so-show-and-configu
**Areas discussed:** Doc links placement, Form-based route config, Route visualization, Mock gateway fidelity

---

## Doc Links Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated Docs tab | Add a 4th tab "📖 Docs & Setup" with links organized by topic | ✓ |
| Inline in relevant sections | Embed each link in the section it pertains to | |
| Top-of-page callout | Banner at top visible on all tabs | |

**User's choice:** Dedicated Docs tab
**Notes:** Clean separation from config tabs; links organized by topic with brief descriptions

---

## Form-Based Route Config

| Option | Description | Selected |
|--------|-------------|----------|
| Form fields that feed the JSON generator | Input fields at top of Real tab; JSON preview updates live | ✓ |
| Keep JSON-only | No form — just improve copy buttons | |
| Separate config panel (new BFF endpoint) | New POST endpoint + form | |

**User's choice:** Form fields that feed the JSON generator

**Persistence sub-question:**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — save to configStore | POST to existing endpoint; persists across restarts | ✓ |
| No — in-memory session only | Values lost on page reload | |

**User's choice:** Yes — save to configStore
**Notes:** Consistent with how other config values are saved; reuses existing POST /api/admin/mcp-gateway/config endpoint

---

## Route Visualization

| Option | Description | Selected |
|--------|-------------|----------|
| Form on top, JSON preview below | Stacked layout; works at any screen width | ✓ |
| Side-by-side two-pane | Form left, JSON right; requires 900px+ | |

**User's choice:** Form on top, JSON preview below
**Notes:** Screen-width-compatible; existing copy buttons stay alongside JSON preview

---

## Mock Gateway Fidelity

| Option | Description | Selected |
|--------|-------------|----------|
| WWW-Authenticate header on 401/403 | RFC 9728 Bearer realm + resource_metadata URL | ✓ |
| Stricter aud/scope validation | Reject tokens where aud doesn't match MCP_GW_RESOURCE_URI | |
| PingOne Authorize response shapes | Match real PingOne Authorize API JSON exactly | |
| None — mock fidelity is good enough | Focus on config UI only | |

**User's choice:** WWW-Authenticate header on 401/403
**Notes:** Format: `Bearer realm="PingOne", resource_metadata="<MCP_GW_RESOURCE_URI>/.well-known/mcp-server"` — matches RFC 9728 and real PingGateway behavior

---

## Claude's Discretion

- CSS styling of new Docs tab (use existing `mgc-*` pattern)
- `target="_blank"` for external doc links
- configStore key names for new route-level fields
- Error handling on Save button (inline success/error, same pattern as existing push form)

## Deferred Ideas

- Side-by-side form + JSON pane layout
- Stricter aud/scope validation in mock
- PingOne Authorize response shape matching
