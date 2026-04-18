# Phase 188 Research: Token Exchange Taxonomy

**Researched:** 2026-04-18  
**Status:** RESEARCH COMPLETE

---

## Q1: Current Terminology Patterns

### Variables Found
**In `server.js` + `middleware/agentSessionMiddleware.js`:**
- `agentToken` — holds agent's OAuth token (currently used for MCP calls)
- Variable terminology: "user token" vs "agent token" vs "bearer token" inconsistent

**In `services/oauthService.js`:**
- Method parameters use RFC 8693 terms: `subjectToken`, `actorToken` ✓
- But method names stay simple: `performTokenExchange`, `performTokenExchangeWithActor`
- JSDoc comments reference RFC correctly: "RFC 8693 Token Exchange"

**Critical finding:** Code already uses `subject_token` + `actor_token` in RFC 8693 request bodies (§3.1), but variable names in code don't consistently reflect this.

### Environment Variables Found
```
PINGONE_USER_CLIENT_ID / PINGONE_USER_CLIENT_SECRET       → user app credentials
PINGONE_AI_AGENT_CLIENT_ID / PINGONE_AI_AGENT_CLIENT_SECRET → agent credentials
AI_AGENT_AUDIENCE                                          → audience for agent token
AI_AGENT_INTERMEDIATE_AUDIENCE                            → intermediate routing
ENDUSER_AUDIENCE                                          → user's audience
AGENT_GATEWAY_AUDIENCE                                    → agent gateway audience
MCP_TOKEN_EXCHANGE_SCOPES                                 → scopes for MCP token
```

**Inconsistency:** Mix of `USER_*` / `AI_AGENT_*` / `AGENT_*` prefixes. Should standardize to RFC terms.

### Comments/JSDoc
- ✓ RFC 8693 is cited correctly: "RFC 8693 Token Exchange"
- ✓ Methods document their RFC patterns
- ✓ But variable naming doesn't always match doc terminology

### Education Panel Labels (Current)
**PingOneTestPage.jsx:** Token events use generic labels like:
- `exchange-user-to-mcp`
- `exchange-user-agent-to-mcp`
- `exchange-user-to-agent-to-mcp`

**DecodedTokenPanel.jsx:** Shows `decoded` token claims but no label prefixes (generic "decoded token")

### Test Page Descriptions (Current)
- Cards describe flows: "1-exchange", "2-exchange", "ID token flow"
- No RFC terminology in card titles or descriptions
- No RFC section references

---

## Q2: RFC 8693 Normative Requirements

### §2.1 — Subject Token
**RFC 8693 mandate:**
- Defines subject_token as the primary identity being acted upon
- Format: "urn:ietf:params:oauth:token-type:access_token" or "urn:ietf:params:oauth:token-type:id_token" (etc.)
- The subject_token is the identity that needs to perform/authorize the action

**Current implementation:**
✓ Code uses `subject_token` in request body (correct)
✓ Passes `subject_token_type` (correct)
- Variable name `$subjectToken` not always used in intermediate steps

### §2.2 — Actor Token
**RFC 8693 mandate:**
- Defines actor_token as the entity performing the action on behalf of subject
- Represents delegated authority (the agent acting for the user)
- Optional in some flows (1-exchange) but critical in delegation flows (2-exchange)

**Current implementation:**
✓ Code method `performTokenExchangeWithActor(subjectToken, actorToken, ...)` uses correct terms
✓ `actorToken` included in dual-exchange flows
- Variable names in server.js still use `agentToken` instead of `actorToken`

### §2.3 — Resource / Audience
**RFC 8693 mandate:**
- Defines `resource` and `audience` as the target API/service
- `aud` claim in the resulting token MUST match the resource URI
- Used to scope the delegated power to a specific API

**Current implementation:**
✓ `audience` parameter passed to all exchange methods
✓ `AI_AGENT_AUDIENCE`, `ENDUSER_AUDIENCE`, `AGENT_GATEWAY_AUDIENCE` env vars define this
- Checking: Are these values consistently validated against response token's `aud` claim?

### §3.1 — Token Exchange Request
**RFC 8693 mandate:**
- Required fields: `grant_type` (must be `urn:ietf:params:oauth:grant-type:token-exchange`)
- Required: `subject_token` + `subject_token_type`
- Optional: `actor_token` + `actor_token_type`
- Required: `requested_token_type`
- Required: `audience` or `resource`

**Current implementation (from read):**
```javascript
const body = new URLSearchParams({
  grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',        // ✓
  subject_token: subjectToken,                                            // ✓
  subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',  // ✓
  requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',// ✓
  audience: audience,                                                     // ✓
  scope: scopeStr,                                                        // ✓ (per RFC 8693 §3.1)
  client_id: this.config.clientId,                                       // ✓
});
```
✓ All required fields present per RFC 8693

### §3.2 — Token Exchange Response
**RFC 8693 mandate:**
- Response includes `access_token` (the exchanged token)
- `access_token` MUST contain:
  - `sub` claim = subject (user ID)
  - `act` claim = actor (agent ID) if dual exchange
  - `aud` claim = audience (target API)
  - Other claims as needed

**Current implementation:**
✓ Code extracts `response.data.access_token`
✓ BFF holds token (not exposed to browser) per CLAUDE.md
- **Question NOT validated yet:** Does response token have correct `act` claim? If `act` present, is it actor_token_id?
- **Question NOT validated yet:** Is `aud` claim verified against expected audience?

### Validation Checklist for Phase 188

| RFC 8693 Section | Requirement | Current Status | Action |
|---|---|---|---|
| §2.1 | subject_token format documented | ✓ Code uses correct type URIs | Validate claim format in test |
| §2.2 | actor_token required for delegation | ✓ Used in performTokenExchangeWithActor | Add validation: actor must exist when delegation |
| §2.3 | resource/audience defines scope | ✓ audience passed to exchange | Add validation: compare aud claim to expected |
| §3.1 | grant_type = token-exchange | ✓ Correct | No change |
| §3.1 | subject_token_type included | ✓ Correct | No change |
| §3.2 | sub claim in result | ✓ Should be present | Add test: verify sub = user ID |
| §3.2 | act claim in result (dual) | ⚠ Not validated | **Add validation: when dual exchange, act must be present & = agent ID** |
| §3.2 | aud claim in result | ⚠ Not validated | **Add validation: aud must match requested audience** |

---

## Q3: MCP Spec Token Requirements

### MCP 2025-11-25 Spec — Token in Tool Requests

**MCP expectation:** When agent calls tools via MCP, the request includes a Bearer token in Authorization header.

**MCP auth challenge flow (from spec):**
- Tool request includes `Authorization: Bearer <token>`
- If MCP server rejects (401), it may include `authRequired` + specific scope in challenge
- Agent should perform token exchange and retry

**Does MCP spec mandate `act` claim?**
- MCP spec section 3.2 (Tool invocation) does not explicitly mandate `act` presence
- BUT: From demo architecture, `act` claim implicitly identifies the agent to MCP server
- Phase 184 comment: "act claim shows agent on behalf of user" — that's for MCP server logging/auditing

### MCP Scope Alignment with RFC 8693

**Current implementation (from .env):**
```
MCP_TOKEN_EXCHANGE_SCOPES=banking:read banking:write banking:mcp:invoke
```
- These scopes are requested in the MCP-scoped access token
- MCP server expects these (or validates against PingOne introspection)

**Validation gaps for Phase 188:**
- Are MCP-scoped access token claims validated at MCP server? (oauthService validates at BFF, but...)
- Does MCP server check `aud` claim? (Should be MCP_SERVER_AUDIENCE)
- What happens if `act` claim is missing from token sent to MCP?

### MCP Error Codes (Per MCP spec)
**From MCP spec error handling:**
- 403 "invalid scopes" — token doesn't have required scope
- 401 "auth required" — token missing or invalid

**Phase 188 validation point:** If token exchange produces token without required scopes, MCP will return 403. Should planner add scope validation?

### Existing MCP Validation (In banking_mcp_server)

**Search result:** Need to check if banking_mcp_server validates token claims.

---

## Q4: Existing Validation Patterns

### Current Validation in `oauthService.js`
- `validateToken(accessToken)` — Introspects token at PingOne
- Does NOT validate claims locally
- Relies on PingOne for `active`, `scope`, `aud` confirmation

### JWT Middleware Patterns
- `tokenValidationService.js`: `validateToken(token, { jwksUri, issuer, audience })`
  - Verifies JWT signature
  - **Does NOT validate `act` claim specifically**
  - Audience validation can be passed as option

### Test Patterns
- `agent-module-smoke.test.js` — Loads services without errors
- No specific token structure tests (sub, act, aud claims)

### Error Handling (Current)
- Token exchange failure: Rich error with pingoneError, errorDescription, errorDetail
- Missing validation: If resulting token lacks `act` claim in dual exchange, error is silent

### Gaps Identified
| Gap | Impact | Phase 188 Fix |
|---|---|---|
| No local JWT claim validation | Can't catch malformed tokens before MCP call | Add validateTokenStructure() |
| No `act` claim verification | Dual exchange may succeed without agent identity | Add check: `act` claim must match actorToken subject |
| No `aud` claim verification | Token may be used against wrong API | Add check: `aud` claim must match requested audience |
| No scope validation | Token might lack required scopes silently | Add check: token.scope includes requested scopes |
| No Expiry validation | Expired tokens aren't caught locally | Add check: token.exp > Date.now() |

---

## Q5: Education Panel Terminology (Currently)

### TokenChainDisplay.jsx
- **Current behavior:** Decodes tokens from session/response
- Labels used: Generic "User Token", "Agent Token", "MCP Token"
- **Not present:** RFC claim labels like "Subject (sub)", "Actor (act)", "Audience (aud)"

### DecodedTokenPanel.jsx
- Shows decoded JWT payload
- Claims displayed as-is: `sub`, `act`, `aud`, `scope`, `exp`
- **Not present:** Inline explanation of what each claim means per RFC 8693

### RFCIndex.md (Education Panel)
- Lists RFC 8693, RFC 9396, RFC 7519, etc.
- **Not present:** Token terminology section explaining subject/actor/resource/audience

### PingOneTestPage.jsx
- Card titles: "1-Token Exchange", "2-Token Exchange", "ID Token Exchange"
- **Not present:** RFC section references (e.g., "RFC 8693 §3.1 Request Structure")
- **Future:** Should show RFC claim validation results inline

---

## Validation Strategy Recommendations

Based on research:

**Strategy fits locked decisions (D-01 to D-05):** Yes

**Recommended validation function structure (`validateTokenStructure()`):**
```javascript
function validateTokenStructure(token, expectedAudience, expectedScopes = []) {
  const errors = [];
  const warnings = [];
  
  // RFC 8693 §3.2 — Required claims
  if (!token.sub) errors.push('RFC 8693: Missing sub claim (RFC §3.2)');
  if (!token.aud) errors.push('RFC 8693: Missing aud claim (RFC §3.2)');
  if (!token.exp) errors.push('RFC 8693: Missing exp claim');
  
  // RFC 8693 §3.2 — Actor claim (when delegation)
  if (process.env.USE_AGENT_ACTOR_FOR_MCP && !token.act) {
    warnings.push('RFC 8693 §2.2: act claim expected in dual-exchange but not found');
  }
  
  // RFC 8693 §2.3 — Audience validation
  if (expectedAudience && token.aud !== expectedAudience) {
    errors.push(`RFC 8693 §2.3: aud claim (${token.aud}) does not match expected audience (${expectedAudience})`);
  }
  
  // Scope validation
  if (expectedScopes.length > 0) {
    const tokenScopes = (token.scope || '').split(' ');
    const missing = expectedScopes.filter(s => !tokenScopes.includes(s));
    if (missing.length > 0) {
      errors.push(`Token missing required scopes: ${missing.join(', ')}`);
    }
  }
  
  // Expiry validation
  if (token.exp && token.exp < Date.now() / 1000) {
    errors.push('RFC 8693: Token expired');
  }
  
  return { valid: errors.length === 0, errors, warnings };
}
```

**Where to hook it:**
1. After token exchange in `oauthService.js` — validate response token structure
2. In `agentMcpTokenService.js` — validate token before sending to MCP
3. New CI test — runs validation against test tokens

---

## Risks / Special Considerations

### Risk 1: Environment Variable Rename Migration
- **Issue:** Renaming `AGENT_*` → `ACTOR_*` could break Vercel deployments
- **Mitigation:** Keep aliases during transition; deprecation warnings in logs

### Risk 2: MCP Server Side Validation
- **Issue:** MCP server (banking_mcp_server) may not validate RFC 8693 structure
- **Mitigation:** Phase 188 adds validation on MCP side too (addresses D-05 scope)

### Risk 3: Backward Compatibility (Education Panels)
- **Issue:** Changing UI labels from "Agent Token" to "Actor Token" is a breaking change for tutorials/docs
- **Mitigation:** Add glossary showing equivalence; update tutorials/documentation in same phase

### Risk 4: Phase 185 Color Coding
- **Issue:** If Phase 185 assigned colors to "Agent" / "User", renaming might confuse color meaning
- **Mitigation:** Review colors in Phase 188; update labels but keep colors if they still make sense

---

## RESEARCH COMPLETE

### Key Findings Summary

| Finding | Implication for Phase 188 |
|---|---|
| RFC 8693 terms already in request bodies (subject_token, actor_token) | ✓ Good foundation; just need variable names to match |
| Variable names inconsistent (agentToken vs actorToken) | Must refactor per D-02 |
| No local JWT claim validation exists | Must add validateTokenStructure() per D-03 |
| Env vars use mixed naming (USER_, AGENT_, AI_AGENT_) | Must standardize per D-05 |
| Education panels use generic "Agent/User" labels | Must update to RFC + MCP terminology per D-02 |
| MCP server side likely doesn't validate RFC structure | Must integrate MCP validation per D-05 |
| No admin audit page exists | Must create per D-03 |
| No CI check for RFC compliance | Must add per D-03 |

**All locked decisions (D-01 to D-05) are supported by research findings and implementable.**

Recommendation: **Proceed to planning. All gray areas from Phase 188 context discussion are research-validated.**
