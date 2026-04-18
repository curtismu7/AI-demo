# Phase 188: Define AI Token Exchange Taxonomy — Context

**Gathered:** 2026-04-18  
**Status:** Ready for planning  
**Source:** User specification (Phase 188 roadmap spec + deep discussion)

---

<domain>

## Phase Boundary

Establish clear, RFC 8693–aligned naming conventions for AI token roles across the demo:
- **Subject Token** = User's authorization identity (not "user token" or "bearer token")
- **Actor Token** = Agent's delegated identity (not "agent token" or "service account token")
- **MCP-Scoped Access Token** = Result of token exchange (not "MCP token" or "delegated token")

Validate this taxonomy against RFC 8693 normative sections AND MCP 2025-11-25 spec sections. Update documentation, code variable names, test page labels, education panels, and environment variables to use consistent RFC-aligned terminology throughout. Add automated validation to prevent regressions.

**Scope alignment:** This phase standardizes terminology across the already-implemented dual-token exchange system (Phases 184–186). No new exchange paths; terminology and validation only.

</domain>

<decisions>

## Locked Implementation Decisions

### D-01: RFC 8693 Terms as Primary + Glossary Mapping
- **Terminology source:** RFC 8693 normative sections (§2.1 subject_token, §2.2 actor_token, §2.3 resource definition)
- **Primary vocabulary:** 
  - `subject_token` (not "user token", "bearer token", or "authorization subject")
  - `actor_token` (not "agent token", "client credentials token", or "service account token")
  - `mcp_scoped_access_token` (not "MCP token", "delegated token", or "exchange result")
- **Glossary requirement:** Create `TOKEN_TERMINOLOGY_GLOSSARY.md` showing RFC term → common alternate names
  - Example: "Subject Token = User Token = Authorization Subject = Bearer Subject"
  - Example: "Actor Token = Agent Token = Service Account Token"
- **All downstream updates** validate against RFC 8693 normative language
- **Canonical ref:** RFC 8693 (https://www.rfc-editor.org/rfc/rfc8693)

### D-02: Comprehensive Taxonomy Audit Scope (Full Refactor)
- **Code refactoring:** Update all variable names in `oauthService.js`, token handlers, middleware
  - `bearerToken` → `subjectToken`
  - `agentToken` → `actorToken`
  - `mcpToken` → `mcpScopedAccessToken`
- **JSDoc/comments:** Updated throughout codebase to use RFC terminology
- **Education panels:** Update all labels (TokenChainDisplay, DecodedTokenPanel, test page) to show RFC terms
- **Test page:** Refactor cards to explicitly label exchange mode with RFC terminology
- **Add:** Inline tooltips explaining RFC terms + common alternatives (glossary references)
- **Result:** Full RFC vocabulary immersion, but glossary keeps approachability
- **Canonical ref:** CLAUDE.md § Core principles (no laziness, consistent patterns)

### D-03: Full Compliance Audit Protocol (Automation + Testing)
- **Automated validation function:** `validateTokenStructure()` in `oauthService.js`
  - Checks `sub`, `act`, `aud` claims at exchange time
  - Verifies subject_token claim format matches RFC 8693 spec
  - Verifies actor_token claim format matches RFC 8693 spec
  - Returns `{ valid: boolean, errors: string[], warnings: string[] }`
- **Test page enhancement:** Next to each token display
  - Show RFC 8693 section reference + normative definition
  - Example: "Actor Claim (RFC 8693 §2.2): `act = subject_token_id`"
  - Validate live token structure matches RFC template
- **Admin audit page:** New route `/admin/audit/token-compliance`
  - Display validation report: "All tokens RFC-compliant ✓" or list failures
  - Show compliance matrix: "RFC 8693 §2.1 ✓ §2.2 ✓ §2.3 ✓"
- **CI validation:** Pre-commit or test check ensures changes maintain RFC compliance
  - Command: `npm test -- token-compliance`
  - Fails if new code introduces non-compliant token structures
- **Canonical ref:** RFC 8693 normative sections; Phase 184 token exchange implementation

### D-04: Full MCP Spec Alignment (Cross-Spec Validation)
- **RFC 8693 is primary vocabulary**
- **Also validate:** MCP spec normative token requirements
  - Check MCP 2025-11-25 sections requiring `act` claim (if any)
  - Verify MCP tool invocation expects token structure matching Phase 188 refactor
- **Validation matrix:** New file `RFC8693_MCP_VALIDATION_MATRIX.md`
  - Map each RFC 8693 requirement → MCP spec section (if applicable) → demo implementation → where in code
  - Columns: RFC Section | Requirement | MCP Reference | Implementation | Verification
- **Test page terminology:** Show which token corresponds to which MCP concept
  - "Subject Token (MCP User Context)" — user's authorization for MCP operations
  - "Actor Token (MCP Agent Context)" — agent's delegated authority to invoke MCP tools
  - "MCP-Scoped Access Token" — result used in MCP tool requests
- **Education panel update:** Explain RFC + MCP together
  - "RFC 8693 defines how tokens are exchanged; MCP uses the resulting token to authorize agent actions"
- **Canonical ref:** RFC 8693; MCP 2025-11-25 spec (https://modelcontextprotocol.io/); Phase 184–186 implementation

### D-05: Full In-Phase Scope (All Refactoring Items)

**1. Token Color Coding Review (Phase 185 integration)**
- Review Phase 185 color legend (if any color scheme assigned to token types)
- Update colors if RFC terminology warrants new visual distinction
- Example: If Phase 185 used "Agent = Blue", rename label to "Actor = Blue" but keep color
- Rationale: Consistent RFC terminology + existing visual system
- **IN Phase 188**

**2. Environment Variable Rename (Full refactor)**
- Rename environment variables to match RFC terminology
  - `AGENT_OAUTH_CLIENT_ID` → `ACTOR_CLIENT_ID` (if used)
  - `AGENT_TOKEN_AUDIENCE` → `ACTOR_TOKEN_AUDIENCE` (if used)
  - Keep backward compatibility aliases during transition (deprecation warnings)
- Update `.env.example`, `.env.local`, deployment configs (Vercel, Render)
- Update all code references to new env var names
- Rationale: Full RFC alignment including infrastructure configs
- **IN Phase 188**

**3. Test Suite Updates (Comprehensive)**
- Add tests for `validateTokenStructure()` function
  - Test: Valid RFC 8693 token structure passes
  - Test: Missing `act` claim fails
  - Test: Invalid `sub` format fails
  - Test: Errors collected in error array
- Update existing token exchange tests to validate RFC terminology
  - Verify returned token has correct claims
  - Verify validation doesn't regress
- Add integration test: Test page audit report shows compliance
- Rationale: New validation code needs test coverage; existing tests need terminology updates
- **IN Phase 188**

**4. MCP Server Side Validation (Full stack)**
- Add `validateTokenStructure()` counterpart in `banking_mcp_server` (if applicable)
  - When MCP server receives token in tool request, validate RFC 8693 structure
  - Return 403 "invalid scopes" if token malformed (per MCP spec error handling)
  - Log validation result to audit trail
- Update MCP tool auth challenge logic to reference RFC terminology
- Rationale: Security + compliance — validate at both BFF and MCP boundaries
- **IN Phase 188**

**5. Documentation Expansion (All three docs)**
- **Update PINGONE_TWO_TOKEN_EXCHANGES.md:**
  - Explain dual token exchange using RFC 8693 subject_token / actor_token terminology
  - Add section: "RFC 8693 Terminology Explained"
  - Clarify: Why subject_token (not bearer_token), why actor_token (not agent_token)
  - Keep existing examples; add RFC annotations
- **Create RFC_VALIDATION_MATRIX.md:**
  - Table: RFC 8693 §X requirement → demo component → verification method → status ✓/✗
  - Rows for all normative sections affecting subject_token, actor_token, audience
  - Explain MCP alignment where applicable
  - Link from RFCIndex.md education panel
- **Expand RFCIndex.md education panel:**
  - Add RFC 8693 token terminology section (subject, actor, resource, audience)
  - Link to RFC_VALIDATION_MATRIX.md for compliance audit trail
  - Add MCP reference: "Why MCP requires `act` claim" (if spec requires)
- **Canonical ref:** RFC 8693, MCP 2025-11-25 spec
- **IN Phase 188**

### D-06: Success Definition
- Phase 188 complete when:
  1. ✅ Glossary created: TOKEN_TERMINOLOGY_GLOSSARY.md (RFC terms + alternates)
  2. ✅ Code refactored: All variable names use RFC terminology (subject_token, actor_token, mcp_scoped_access_token)
  3. ✅ JSDoc/comments: Updated to RFC terminology throughout
  4. ✅ Automated validation: `validateTokenStructure()` function in oauthService.js + tests passing
  5. ✅ Test page: Annotated with RFC refs + compliance labels
  6. ✅ Admin audit page: `/admin/audit/token-compliance` shows validation report
  7. ✅ CI check: Pre-commit/test validates RFC compliance + no regressions
  8. ✅ Environment vars: Renamed with backward-compatibility aliases
  9. ✅ MCP server: RFC validation integrated (full stack)
  10. ✅ Docs updated: PINGONE_TWO_TOKEN_EXCHANGES.md, RFC_VALIDATION_MATRIX.md, RFCIndex.md
  11. ✅ Education panels: TokenChainDisplay, DecodedTokenPanel updated with RFC terminology + MCP context
  12. ✅ Token colors: Phase 185 colors reviewed and relabeled if needed
  13. ✅ All changes committed; `npm run build` passes; tests pass

</decisions>

<specifics>

## Specific Implementation References

### Key RFC 8693 Sections for Validation
- **§2.1 — Subject Token:** Defines subject_token type, format requirements, claim structure
- **§2.2 — Actor Token:** Defines actor_token type, format, typical use (delegation)
- **§2.3 — Resource:** Defines resource and audience (aud claim)
- **§3.1 — Token Exchange Request:** Defines request structure with subject_token, actor_token, resource
- **§3.2 — Token Exchange Response:** Defines access_token result, claim structure (sub, act, aud)

### From Existing Codebase (Reuse Points)
- **Token exchange logic:** `banking_api_server/services/oauthService.js` — performTokenExchange()
- **Token claims:** Existing uses of `sub`, `act`, `aud` in JWT payload construction
- **Education panels:** `TokenChainDisplay.jsx`, `DecodedTokenPanel.jsx`, `RFCIndex.md` component
- **Test page:** `PingOneTestPage.jsx` — existing card patterns; add RFC annotations
- **Environment vars:** Current uses in `.env`, `.env.example`, `banking_api_ui/.env` (REACT_APP_* vars)

### New Artifacts to Create
- `TOKEN_TERMINOLOGY_GLOSSARY.md` — Mapping RFC terms to common alternates
- `RFC8693_MCP_VALIDATION_MATRIX.md` — Compliance audit matrix
- `banking_api_server/validators/tokenStructureValidator.js` — validateTokenStructure() implementation
- Updated `banking_api_ui/src/components/RFCIndex.md` — Expand with token terminology section
- Test file: `banking_api_server/tests/token-structure-validation.test.js`
- Admin page: `banking_api_ui/src/routes/AdminTokenComplianceAudit.jsx`

### Key Claims to Validate
- `sub` (subject claim) — must identify user uniquely
- `act` (actor claim) — must identify agent/service uniquely (when dual-token)
- `aud` (audience claim) — must match MCP resource URI (e.g., "https://mcp.banking.local")
- `scope` — must list required permissions (aligned with banking:read, banking:write)
- Expiry (`exp`) — token must not be expired

### Glossary Entries (Examples)
- Subject Token = User Token = Bearer Token (user's identity)
- Actor Token = Agent Token = Service Account Token = Client Assertion (agent's identity)
- MCP-Scoped Access Token = MCP Token = Delegated Token (result of exchange)
- Subject Claim (sub) = User ID = Subject ID
- Actor Claim (act) = Agent ID = Service ID
- Audience (aud) = Resource URI = Target API

</specifics>

<canonical_refs>

## Canonical References (Downstream Agents MUST Read)

### RFC 8693 (Token Exchange)
- [RFC 8693](https://www.rfc-editor.org/rfc/rfc8693) — OAuth 2.0 Token Exchange
  - Defines subject_token, actor_token, resource, audience, token exchange mechanisms
  - MANDATORY: Sections 2.1–2.3, 3.1–3.2 for claim definitions

### MCP Specification
- [MCP 2025-11-25 Spec](https://modelcontextprotocol.io/)
  - Tool invocation + auth challenge flow + expected token claims
  - Reference for "why MCP cares about token structure"

### Existing Implementation References
- `banking_api_server/services/oauthService.js` — Where token exchange currently happens
- Phase 184 CONTEXT.md — Dual-token exchange decision rationale
- Phase 186 CONTEXT.md — ID token variant reference
- `CLAUDE.md` — Project-level token handling requirements ("tokens stay server-side")

</canonical_refs>

<deferred>

## Out of Phase 188 Scope (Captured for Future)

- **Legacy token exchange endpoints removal** — If old 1-exchange or non-RFC paths exist, their removal deferred to cleanup phase
- **Multi-exchange scenario docs** — Edge cases (multi-hop, chained delegations) deferred to Phase 189 or later
- **Client library / SDK generation** — If team wants client code generators for token exchange, that's a separate phase
- **Token rotation policy** — If refresh token rotation needs specification, deferred to separate security phase
- **Key rotation audit** — If keys need rotation auditing, deferred to security audit phase

</deferred>

---

*Phase: 188 — Define AI token exchange taxonomy*  
*Context gathered: 2026-04-18 via discussion workflow*
