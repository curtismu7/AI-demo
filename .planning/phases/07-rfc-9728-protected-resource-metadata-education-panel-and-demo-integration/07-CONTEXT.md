---
phase: 07-rfc-9728-protected-resource-metadata-education-panel-and-demo-integration
created: 2026-04-01
method: auto
---

# Phase 7 — RFC 9728 Protected Resource Metadata: Discussion Context

## Goal

Implement RFC 9728 Protected Resource Metadata on the BFF (serving `/.well-known/oauth-protected-resource`) and add an education panel tab explaining what the spec does and why it matters for MCP/AI agent discovery, with a live demo that fetches the actual endpoint.

## Background

RFC 9728 (published April 2025, internet standard) defines `/.well-known/oauth-protected-resource` — a JSON discovery endpoint that resource servers publish so OAuth clients and authorization servers can learn which AS to use, which scopes the RS supports, and what bearer methods are accepted. The MCP spec references RFC 9728 for resource server metadata discovery. BX Finance's BFF is a protected resource and should advertise this metadata.

The `RFCIndexPanel` already lists RFC 9728 pointing to `EDU.AGENT_GATEWAY, tab: 'rfc9728'`, but the `AgentGatewayPanel` has no `rfc9728` tab yet — this phase fills that gap.

## Decisions

### D-01: BFF endpoint strategy
Add `GET /.well-known/oauth-protected-resource` to the BFF, following the same pattern as the existing `/.well-known/oauth-client/:clientId` handler in `routes/clientRegistration.js`. Also add `GET /api/rfc9728/metadata` as a same-origin proxy for the React UI (avoids port-difference CORS issues in local dev).

### D-02: Metadata content
Response includes: `resource` (built from `PUBLIC_APP_URL`), `authorization_servers` ([PingOne issuer URI from env]), `scopes_supported` (full banking scope list), `bearer_methods_supported: ["header"]`, `resource_name: "BX Finance Banking API"`. Build the response fresh on each request (no caching needed for a demo).

### D-03: Education tab
Add a `rfc9728` tab to `AgentGatewayPanel.js`. Tab content (inline in `educationContent.js` as new `RFC9728Content` export) includes:
- What RFC 9728 is (discovery document for resource servers)
- Why it matters for AI agent / MCP discovery
- Metadata fields explained (resource, authorization_servers, scopes_supported)
- Live demo: a `<React.Suspense>` or `useEffect` fetch of `/api/rfc9728/metadata` → renders prettified JSON with field annotations
- Security callout: resource identifier validation prevents impersonation

### D-04: rfc8707 tab
`rfc8707` panel tab is **OUT OF SCOPE** for Phase 7. The RFCIndexPanel already links it but AgentGatewayPanel has no such tab — leave as-is.

### D-05: Build validation
After UI changes: `npm run build` in `banking_api_ui/` must exit 0. No new ESLint warnings.

## Deferred Ideas

- Signed metadata JWT (`signed_metadata` field) — not needed for demo
- `WWW-Authenticate: Bearer resource_metadata=` header on 401 responses — deferred to Phase 8
- DPoP support in metadata (`dpop_signing_alg_values_supported`) — deferred
- rfc8707 education tab — separate phase

## Claude's Discretion

- Structure the live demo fetch using `useEffect` + `useState` matching the pattern in other tab content components in `educationContent.js`
- Match the copy / styling of existing education tabs (edu-code blocks, descriptive paragraph prose, `<strong>` for key terms)
