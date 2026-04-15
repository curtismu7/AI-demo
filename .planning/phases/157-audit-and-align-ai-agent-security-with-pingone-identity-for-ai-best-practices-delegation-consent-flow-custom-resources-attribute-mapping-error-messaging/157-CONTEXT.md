# Phase 157: AI Agent Security Audit & PingOne Alignment — Context

**Date:** April 15, 2026  
**Reference:** https://developer.pingidentity.com/identity-for-ai/identity/idai-securing-agents-pingone.html  
**Phase Goal:** Audit current implementation against PingOne's "Securing AI agents with PingOne using delegation and least privilege" guide and plan alignment improvements.

---

## PingOne's Recommended AI Agent Security Model

### 1. **Core Principle: Agents as First-Class Non-Human Identities**

Agents must be treated as distinct from end users with:
- Separate client ID and authentication credentials
- Explicit scope restrictions (least privilege)
- Delegation chain tracking via `act` and `may_act` claims
- Consent agreements enforced at sign-on

### 2. **Custom Resources (Two-Resource Model)**

**Test Resource** (Backend Service):
- Represents the actual business service (banking APIs, transactions, accounts)
- Attribute: `sub` — maps user subject from incoming token
- Attribute: `act` — delegation chain; maps from token's `may_act` when agent ID matches
- Expression: `(#root.context.requestData.subjectToken.may_act.sub == #root.context.requestData.actorToken.client_id)?#root.context.requestData.subjectToken.may_act:null`
- Audience: `https://ig.example.com:8443/mcp` (or equivalent)
- Scope: Named `test` (represents MCP access scope)

**Agent Resource** (Delegation Relationship):
- Represents the agent itself and its authority to act on behalf of users
- Attribute: `sub` — username from PingOne Mappings
- Attribute: `may_act` — records agent's `client_id` as the active delegator
- Expression: `(#root.context.requestData.grantType == "client_credentials")?null:({ "sub": #root.context.appConfig.clientId })`
- Audience: `agent` (default)
- Scope: Named `agent`

### 3. **Consent Agreement & Authentication Policy**

**Consent Agreement:**
- Name: "Agent Consent"
- Text: "I consent to allow digital assistants created by MyCompany to act on my behalf"
- Reconsent interval: 180 days (or configurable)
- **Critical:** Must be enabled in PingOne UI

**Authentication Policy:**
- Name: "Agent-Consent-Login"
- Steps:
  1. Login (standard authentication)
  2. Agreement Prompt (agent consent agreement)
- Must be assigned to the AI agent application in PingOne

### 4. **AI Agent Application Registration in PingOne**

Configuration:
- **Name:** MCP Tutorial (or equivalent)
- **Grant Types:** Client Credentials, Refresh Token, Token Exchange *(all three required)*
- **Redirect URI:** Must point to callback endpoint (e.g., `http://localhost:3000/callback`)
- **Resources:** Agent scope AND Test scope assigned
- **Policy:** Agent-Consent-Login attached
- **Status:** Enabled

Output: **Client ID** (used by agent at runtime)

### 5. **Token Exchange Flow (RFC 8693)**

**Before Exchange:**
- User token (subject token) contains `may_act` claim asserting agent authority
- Agent token (actor token) contains agent's `client_id`

**Exchange Request:**
```
POST /as/oauth.introspect
grant_type = urn:ietf:params:oauth:grant-type:token-exchange
subject_token = (user token)
actor_token = (agent token)
resource = test (custom resource)
```

**After Exchange:**
- New token contains:
  - `sub` — the user subject
  - `act` — delegation info (agent's `client_id` + user `sub`)
  - `aud` — the MCP endpoint
- **This token is used to call downstream services**

### 6. **Error Scenarios & Messaging**

| Scenario | Root Cause | Expected Error Message |
|----------|-----------|------------------------|
| Token exchange fails, `act` claim null | `may_act` missing from user token | "Delegation failed: user token missing delegation grant to agent" |
| Token exchange fails, `act` claim null | Agent ID doesn't match `may_act.sub` | "Delegation failed: agent client_id mismatch with authorized delegator" |
| Agent can list tools but not call them | Wrong scope assigned | "Access denied: agent lacks 'test' scope for MCP resource" |
| User doesn't see consent prompt | Policy not assigned or redirect URI wrong | "Consent required: agent policy not configured for this application (check Agent-Consent-Login policy)" |
| Delegated token rejected by backend | `act` claim malformed or missing | "Authorization failed: delegation chain invalid — agent not explicitly delegated for this user" |
| User sends token to endpoint requiring agent scope | Scope mismatch | "Scope violation: this endpoint requires agent token with 'agent' scope; user token detected" |

### 7. **PingGateway Protection (Optional but Recommended)**

- API Gateway sits in front of MCP server
- Validates tokens, enforces `act` claim presence
- Requires `streamingEnabled: true` in admin.json (for SSE/MCP)
- Routes MCP requests through filtering pipeline

---

## Current Banking Demo Implementation — Audit Checklist

### What We Have ✅

- [ ] OAuth 2.0 integration with PingOne (verify: check BFF setup)
- [ ] Session token management (user tokens from sign-in)
- [ ] MCP agent integration (banking_mcp_server)
- [ ] Token exchange routine in BFF (RFC 8693 implementation)
- [ ] Agent flow diagram / debugging (AgentFlowDiagramPanel)
- [ ] Session preview token display
- [ ] Basic error handling for auth failures

### Gaps to Audit 🔍

#### Core Security Model
- [ ] **Agent registered as first-class identity in PingOne?**
  - Currently: Check if agent has separate client ID or using shared credentials
  - Required: Dedicated agent app with Client Credentials + Token Exchange grants
  - Impact: If shared, delegation chain is compromised

- [ ] **Two custom resources configured in PingOne?**
  - Currently: Verify if "agent" and "test" resources exist
  - Required: Both with proper attribute expressions
  - Impact: Without proper resource mapping, `act` claims won't be generated

- [ ] **Consent agreement enforced?**
  - Currently: Check if users see consent prompt on sign-on for agent actions
  - Required: "Agent Consent" agreement + Agent-Consent-Login policy
  - Impact: If missing, delegation not auditable; no user approval trail

#### Token Flow & Claims
- [ ] **`may_act` claim present in user tokens from sign-on?**
  - Currently: Check TokenChainDisplay and session tokens
  - Expected: User token should have `may_act: { sub: "<agent-client-id>" }`
  - If missing: Token exchange can't build proper delegation

- [ ] **`act` claim in exchanged tokens?**
  - Currently: Verify MCP token has `act` field with delegation info
  - Expected: `act: { sub: "<user-id>" }` or similar
  - If missing: Downstream services can't audit who initiated action

- [ ] **Actor token properly passed to token exchange?**
  - Currently: Check BFF token-exchange.js for actor_token handling
  - Required: Sending agent's access token as `actor_token` in exchange
  - If wrong: Claims won't validate correctly

#### Error Handling & UX
- [ ] **Scope violation errors are educational?**
  - Currently: Check error responses (GSD Phase 156 scope!)
  - Required: "This is user token but endpoint requires agent token" style messaging
  - If generic: Users don't understand why delegation failed

- [ ] **Missing delegation caught early?**
  - Currently: Check if errors caught at exchange time or later
  - Required: Token exchange should validate `may_act` presence before proceeding
  - If not: Errors bubble up to tool calls (worse UX)

- [ ] **Token mismatch errors are clear?**
  - Currently: Check apiClient.js, BFF error responses
  - Required: "Delegation failed: agent client_id does not match authorized delegator"
  - If not: Debugging becomes very hard

#### Configuration & Scopes
- [ ] **Agent granted both 'agent' and 'test' (or banking) scopes?**
  - Currently: Verify PingOne app configuration
  - Required: Both scopes assigned to agent app
  - Impact: Without 'agent' scope, `may_act` won't be generated; without 'test', token exchange fails

- [ ] **Scopes stable across sessions?**
  - Currently: Check if scopes change between user logins
  - Known issue: If scopes vary, user sees consent prompt every time
  - Solution: Ensure scope list is constant

#### Compliance & Audit
- [ ] **Delegation chain end-to-end auditable?**
  - Currently: Check logs; trace from user sign-on → consent → agent auth → token exchange → MCP call
  - Required: Each step logs `client_id`, `sub`, `act` claim, timestamp
  - If missing: Can't audit who authorized what

- [ ] **PingGateway or equivalent MCP protection?**
  - Currently: Check if MCP server sits behind API gateway
  - Required: Gateway validates `act` claim before forwarding to MCP
  - If not implemented: MCP server trusts whatever client sends

### Known Issues to Address

From conversation history (Phase 156 context):
- **Error messaging is not educational** — Users see generic 401s instead of "user token vs. agent token" clarity
- **Stale cached auth data broke agent calls** — Session caching caused scope/delegation mismatches
- **Token chain visibility needed** — TokenChainDisplay works but needs scope/act/may_act explanations

---

## Phase 157 Scope & Requirements

### What This Phase Will Do

1. **Comprehensive Audit** — Verify each checklist item against PingOne guide
2. **Gap Report** — Document what we have vs. what's needed
3. **Root Cause Analysis** — Why delegation fails (if it does)
4. **Roadmap for Alignment** — Create follow-up phases for each gap

### What This Phase Will NOT Do (Yet)

- Implement changes (that's follow-up phases)
- Redesign token flow architecture
- Rewrite MCP integration
- Deploy to production

### Deliverables

1. **157-AUDIT-REPORT.md**
   - ✅ What we've implemented correctly
   - ⚠️ What's partial or incomplete
   - ❌ What's missing
   - 🔍 Evidence for each item (code references, PingOne config screenshots, logs)

2. **157-GAP-ANALYSIS.md**
   - For each gap: impact, severity, and recommended fix
   - Dependencies between gaps (e.g., consent agreement must exist before policy creation)
   - Proposed follow-up phases

3. **Recommendations for Follow-Up Phases**
   - Phase 157a: Ensure agent is first-class identity in PingOne (if not)
   - Phase 157b: Configure custom resources per PingOne guide (if missing)
   - Phase 157c: Enable consent flow + policy (if missing)
   - Phase 157d: Add educational error messages for delegation failures (linked to Phase 156)
   - Phase 157e: Document delegation chain in logs for audit trail
   - Phase 157f: Add PingGateway or equivalent MCP protection (if needed)

### Requirements (Locked Decisions)

- **REQ-157-01:** Audit must reference PingOne official guide (not interpretation)
- **REQ-157-02:** Audit must include code/config evidence (not assumptions)
- **REQ-157-03:** Report must be non-judgmental (we may be ahead of guide in areas)
- **REQ-157-04:** Gaps must be actionable (specific PingOne config or code change needed)

---

## Key Questions for Phase Planning

1. **Is our agent registered separately in PingOne, or is it using user app credentials?**
   → This determines if delegation chain is properly isolated

2. **Do our users see a consent agreement when signing on for agent use?**
   → If no, we're missing the authorization audit trail

3. **Are custom resources configured with the recommended attribute expressions?**
   → If not, `act` claims won't be generated correctly

4. **What happens when agent tries to use a user token (or vice versa)?**
   → Current error should be educational per Phase 156 work

5. **Is our MCP server protected by PingGateway or equivalent validation?**
   → If not, we're relying on client-side token validity checks

---

## Dependencies

- **Depends on:** Phase 156 (security error messaging)
- **Feeds into:** Follow-up phases 157a-f (implementation phases)
- **Related:** Phase 154 (DPoP) — may interact with delegation claims

---

## Next Steps for Planning

Run `/gsd-plan-phase 157` to break audit into:
- Task 1: Audit PingOne configuration (agent app, resources, policies)
- Task 2: Audit token flow end-to-end
- Task 3: Audit error handling and messaging
- Task 4: Document findings and recommendations
