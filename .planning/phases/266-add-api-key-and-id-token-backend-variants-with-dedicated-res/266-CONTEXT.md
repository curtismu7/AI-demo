# Phase 266: Add API-key and ID-token backend variants with dedicated result pages — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning (replan after user pivot)
**Source:** Roadmap section + in-session user clarification (2026-05-10)

---

<domain>
## Phase Boundary

This phase demonstrates THREE distinct credential paths from the Gateway, each terminating in a visibly-distinct surface in the SPA so a viewer can tell at a glance which credential mechanism was used. **It does NOT introduce new backend services.** The existing OAuth-protected resource server (built in the prior phase, file: `banking_api_server/routes/resourceServer.js`) is the only data-returning backend.

The three paths terminate as follows:

1. **Path A — API-Key path:** Gateway swaps the user's OAuth token for a service API key and would call an API-key-gated endpoint. **For this demo phase, the call does NOT proceed to a backend.** The flow stops at a new SPA page that explains "this path used an API key — no banking data returned" with a clearly identifiable amber/yellow visual identity and a "Back to Dashboard" button.

2. **Path B — Access-Token + ID-Token path:** Gateway forwards BOTH the access token AND the id_token (from the original OIDC login) toward a dual-token endpoint. **For this demo phase, the call does NOT proceed to a backend.** The flow stops at a new SPA page that displays the decoded access-token claims AND the decoded id-token claims side-by-side, with a clearly identifiable teal/green visual identity and a "Back to Dashboard" button. No banking data is shown on this page.

3. **Path C — Bearer / OAuth resource-server path (EXISTING):** Gateway forwards the standard OAuth bearer to the existing resource server (`banking_api_server/routes/resourceServer.js`), which returns banking data. The data renders on the existing `ResourceServerPage` (or its equivalent surface). Visual identity: existing blue/OAuth styling. **This path is the only one that returns data.** No new backend code required — only confirm the existing path still works after the gateway routing changes.

The phase is a **demonstration of credential mechanisms**, not a multi-backend integration. The "API-key backend" and "ID-token backend" nodes that have been drawn aspirationally in `ArchitectureFlowPage.js` remain aspirational — but the GATEWAY paths to them become live (the gateway will perform the credential-swap and credential-forward operations and log them through Token Chain), they just terminate in informational pages instead of round-tripping to a real backend.

**Out of scope:** building actual API-key-gated or dual-token-gated backend services. Phase 266 is gateway + UI + diagrams only.

</domain>

<decisions>
## Implementation Decisions

### Architecture
- **No new backend services.** Reject any plan that scaffolds `banking_demo_apikey_backend/` or `banking_demo_userinfo_backend/` (the initial draft did this; it is wrong).
- **Three terminating paths:** API-key (stops at info page), Access+ID-token (stops at info page), Bearer (continues to existing resource server and returns banking data).
- **Existing resource server is unchanged** in behavior. Plans may add log markers so the Token Chain can distinguish which Gateway path delivered the bearer that hit it, but no schema or response-shape changes.
- **Gateway changes:** extend the router to support three credential dispositions:
  1. `oauth_bearer` — pass the bearer through to the OAuth resource server (existing behavior)
  2. `api_key` — swap the bearer for a configured service API key; record the swap in Token Chain; route the response to the API-Key info page in the SPA
  3. `dual_token` — keep the bearer AND attach the id_token; record both in Token Chain; route the response to the Access+ID-Token info page in the SPA
- **Gateway is the source of truth for which path was taken** — it labels the response with a `credentialPath` field so the SPA can route the result card to the correct page.

### Path A — API-Key page
- New result surface (page or full-route component) with amber/yellow visual identity and a plain-text "API-KEY PATH" badge in the header (no emoji glyphs per REGRESSION_PLAN §0).
- Page content: "This request was sent through the Gateway's API-key path. The Gateway exchanged your OAuth token for a service API key. No banking data is returned on this path — it demonstrates the credential-swap pattern."
- Show the masked API-key string (last 4 chars) so the user can see the swap happened.
- Show the Token Chain segment for this path: original bearer → exchanged-for → service API key.
- Prominent "Back to Dashboard" button.

### Path B — Access+ID-Token page
- New result surface with teal/green visual identity and a plain-text "ACCESS + ID-TOKEN PATH" badge.
- Page content: decoded access-token claims (sub, aud, scope, exp, act if present) AND decoded id-token claims (name, email, sub, picture if PingOne emits it) rendered side-by-side or stacked.
- BFF must decode the id_token server-side and return CLAIMS ONLY — never the raw JWT — to preserve the token-custody rule (CLAUDE.md).
- Show the Token Chain segment: original bearer (forwarded) + id_token (forwarded from session).
- Prominent "Back to Dashboard" button.

### Path C — Existing resource server (bearer)
- Renders banking data on the existing `ResourceServerPage`. Visual identity: existing blue/OAuth styling — leave alone (REGRESSION_PLAN §1 minimal-touch).
- Update the existing page header to include a plain-text "OAUTH BEARER PATH" badge so the three paths are visually labelled consistently. This is the smallest possible change to the existing surface.

### Chat prompt routing
- Three NL prompts trigger the three paths:
  - "Show my accounts" / "Show my balance" → Path C (existing)
  - "Show special offers" / "Use the API-key path" → Path A (new — informational page)
  - "Show my profile card" / "Use the access-and-id-token path" → Path B (new — informational page)
- Extend `banking_api_server/services/nlIntentParser.js` (or wherever the heuristic NL routing lives) with TWO new actions (`api_key_demo`, `dual_token_demo`) that the gateway interprets as routing dispositions.

### Token Chain UI
- `TokenChainDisplay` MUST visibly differentiate the three paths.
- The Token Chain Context (`banking_api_ui/src/context/TokenChainContext.js`) must accept and pass through a `credentialPath: 'oauth_bearer' | 'api_key' | 'dual_token'` field per chain segment.
- Each path's chain segment renders with the matching path colour (blue/amber/teal) so the user sees three visually distinct token chains as they exercise the three demo prompts.

### Diagrams (MANDATORY)
- `/architecture/flow` (`ArchitectureFlowPage.js`) — flip the aspirational `api-key-backend` node to live; add a sibling `id-token-backend` node; add simulation scenarios for all three paths.
- `/sequence-diagram` (`SequenceDiagramPage.js`) — add divergent steps for each of the three paths, clearly labelled.
- `/architecture` page — review for any tracker/step diagrams that reference the OAuth path; add the new paths.
- `ArchitectureTokenFlowPage.js` — add the new path branches.
- Any `.mmd` mermaid source files under `public/architecture/` — update and regenerate PNGs (existing script `npm run build:diagrams` per recent commit `3d3f0f75`).
- Confirm the existing `npm run build:diagrams` pipeline regenerates all needed assets.

### Visual identity (for 266-R3)
- Path C (existing OAuth bearer): blue (existing — do not change)
- Path A (API-key): amber, badge string `API-KEY PATH`
- Path B (Access+ID-token): teal, badge string `ACCESS + ID-TOKEN PATH`
- Plain text only, no emoji glyphs (REGRESSION_PLAN §0)

### Token custody (CLAUDE.md non-negotiable)
- Raw id_token NEVER appears in any browser-facing response body. BFF decodes server-side and returns the claims object only.
- BFF route for the dual-token info page must include a `scrubRawJwts` guard at the response boundary as defense-in-depth.
- API key string is returned MASKED to the SPA (last 4 chars visible). The full key never reaches the browser.
- All BFF calls from the SPA continue to use `bffAxios` (cookie-based).

### Claude's Discretion
- Exact React component organization (single component file per page vs. shared base + variants). Researcher recommended separate `ApiKeyResultPage.jsx` and `UserInfoResultPage.jsx` (now better named `AccessIdTokenResultPage.jsx`). Use whichever clean naming aligns with existing `ResourceServerPage.jsx`.
- Exact API key storage: configStore vs. env var fallback. Default to configStore with env fallback per existing pattern in `configStore.getEffective`.
- Whether the two info pages are routed via React Router paths or rendered as result cards inside the agent chat. Recommend ROUTED pages so the "Back to Dashboard" button has somewhere meaningful to go. The agent chat result card links to the route.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & tokens
- `CLAUDE.md` — Token custody rule, BFF architecture, module systems per package, regression non-negotiables
- `REGRESSION_PLAN.md` §0 (UI style guidelines — no emojis), §1 (critical files)
- `banking_api_server/routes/resourceServer.js` — Existing OAuth-protected resource server (the data backend for Path C). Do not modify behavior.
- `banking_api_server/routes/oauthUser.js:471` — Where `req.session.oauthTokens.idToken` is set. ID token is already persisted; planners must not introduce schema changes here.
- `banking_api_server/services/agentMcpTokenService.js` — RFC 8693 token exchange pattern (template for "exchange bearer for API key")
- `banking_mcp_gateway/src/` — Existing gateway. Extend router with credential dispositions.
- `banking_api_ui/src/context/TokenChainContext.js` — Token Chain context; add `credentialPath` field
- `banking_api_ui/src/components/TokenChainDisplay.js` — Token Chain UI; add visual differentiation per path
- `banking_api_ui/src/components/ResourceServerPage.jsx` — Existing Path C result page; minimal touch to add the OAUTH BEARER PATH badge
- `banking_api_ui/src/components/ArchitectureFlowPage.js:150` — Where the aspirational `api-key-backend` node lives; flip `aspirational:true` to `false` and add sibling `id-token-backend` node
- `banking_api_ui/src/components/SequenceDiagramPage.js` — Sequence diagram source; add the three-path branches
- `banking_api_ui/src/components/ArchitectureTokenFlowPage.js` — Token-flow diagram; add the three paths

### Research and validation
- `.planning/phases/266-add-api-key-and-id-token-backend-variants-with-dedicated-res/266-RESEARCH.md` — Full technical research. **NOTE:** §Recommended PLAN.md Split proposed new backend services — that recommendation is SUPERSEDED by this CONTEXT.md. The other research findings (file paths, line refs, REGRESSION traps, id_token persistence location, token chain integration points, diagram regeneration pipeline) remain valid.
- `.planning/phases/266-add-api-key-and-id-token-backend-variants-with-dedicated-res/266-VALIDATION.md` — Per-task verification map. Will need revision to drop the new-backend-service test stubs (266-01-01 through 266-02-02 as originally written) and replace with info-page + gateway-routing tests.

### Skills
- `.claude/skills/oauth-pingone/` — OAuth/PingOne grant types, token exchange
- `.claude/skills/mcp-server/` — MCP tool registration patterns
- `.claude/skills/typescript-banking/` — TS style rules for banking_mcp_gateway

</canonical_refs>

<specifics>
## Specific Ideas

- The phase aims to be a **clear visual demonstration** for conference walkthroughs. The three paths are not equally valuable as integrations — they are equally valuable as **visible distinctions** that show "the same Gateway can route to three different credential mechanisms."
- The existing resource server (Path C) is the ONLY one that returns data because that's the real product. Paths A and B exist to show the credential plumbing without requiring two more backend services to exist.
- "Back to Dashboard" button on Paths A and B is critical UX — the user must always have a clear way out of the informational pages.
- Token Chain visualization across three paths is a primary deliverable — when a presenter clicks all three demo prompts in sequence, the Token Chain panel should show three visibly different chains.

</specifics>

<deferred>
## Deferred Ideas

- Actual API-key-gated backend service — could become a future phase if the demo needs it
- Actual dual-token-gated backend service rendering userinfo from id_token claims — same
- LangChain agent (port 8888) integration — heuristic-only NL routing for Phase 266; LangChain deferred

</deferred>

---

*Phase: 266-add-api-key-and-id-token-backend-variants-with-dedicated-res*
*Context gathered: 2026-05-10 via roadmap + in-session user pivot*
*Pivot recorded: 2026-05-10 — original planner draft built two new backend services; user clarified the demo terminates at info pages on paths A/B and only Path C (existing resource server) returns data.*
