# Phase 160: AI TRiSM Training Panel — Context

**Date:** April 15, 2026  
**Framework:** Gartner AI TRiSM (AI Trust, Risk and Security Management)  
**Audience:** Security leaders, compliance officers, training participants  
**Phase Goal:** Create an interactive educational panel that explains AI TRiSM principles AND demonstrates how the banking demo implements each principle in real code/UI.

---

## What is AI TRiSM?

**AI TRiSM** (AI Trust, Risk and Security Management) is Gartner's framework for making AI systems reliable, secure, and governed across their entire lifecycle.

**Six Core Principles:**

1. **Trust & Transparency** — Make AI explainable and understandable
2. **Risk Management & Assurance** — Identify, assess, and mitigate AI risks
3. **Security & Privacy by Design** — Protect data, models, and tools from attack
4. **Governance, Compliance & Accountability** — Define policies, roles, and guardrails
5. **Lifecycle Management & Observability** — Treat AI as a product with continuous monitoring
6. **Identity, Access & Least Privilege** — Authenticate agents, enforce minimal permissions

---

## Banking Demo: How We Meet Each Principle

### Principle 1: Trust & Transparency

**What it means:**
- Users understand what the agent is doing
- Agent behavior is explainable and auditable
- Clear lineage from request → decision → action

**How our demo meets it:**

| Feature | Demo Component | Code Location |
|---------|---|---|
| **Agent Flow Diagram** | Visual step-by-step trace of agent execution | `AgentFlowDiagramPanel.js` shows each step: user request → token exchange → MCP call → tool execution |
| **Token Chain Display** | Decode and show all tokens used | `TokenChainDisplay.js` decodes JWT, displays `sub`, `act`, `aud`, `scope` claims |
| **Transparent Error Messages** | Explain WHY operations fail | Phase 156: Educational errors ("This is user token, not agent token") |
| **Audit Logs** | Every action logged with context | `AgentFlowDiagramService.js` records each step with timestamp + claims |
| **Session Preview** | Show what user/agent tokens contain | `/api/tokens/session-preview` endpoint decodes and displays tokens |

**Training Slide:**
```
┌─ TRUST & TRANSPARENCY ────────────────────────┐
│                                               │
│ Our approach: Agent operations are NOT a     │
│ "black box". Every step is visible.          │
│                                               │
│ What you see in the demo:                    │
│ 1. Click "Get Transactions" button           │
│ 2. Agent Flow Diagram appears                │
│ 3. See each step: user auth → token exchange │
│    → MCP call → response                     │
│ 4. Click [Show Tokens] to see exact claims   │
│ 5. Audit log shows timestamp + who did what  │
│                                               │
│ Why this matters:                            │
│ • Security teams can verify behavior         │
│ • Compliance can audit all actions           │
│ • If something goes wrong, root cause is     │
│   visible straight away                      │
│                                               │
└───────────────────────────────────────────────┘
```

**Live Demo in Panel:**
- Show token decode UI
- Show flow diagram for a transaction
- Click through to see what each claim means

---

### Principle 2: Risk Management & Assurance

**What it means:**
- Identify potential failures (bias, drift, hallucinations, cascade errors)
- Test and validate agent behavior
- Monitor for anomalies in real-time

**How our demo meets it:**

| Feature | Demo Component | Code Location |
|---------|---|---|
| **Token Validation Tests** | Try sending wrong tokens to MCP | Phase 158: Token Security Tester shows scope/audience validation |
| **Rate Limiting** | Prevent cascade errors (100+ requests) | `agentRateLimitMiddleware` caps requests per minute |
| **State Capture on Failure** | Freeze agent state for analysis | Phase 159: Kill switch captures state |
| **Error Scenario Testing** | Run test scenarios (user token → MCP) | Admin test panel runs all 5 failure scenarios |
| **Metrics & Monitoring** | Track agent health in real-time | `AgentFlowDiagramPanel` shows request count, errors, latency |

**Training Slide:**
```
┌─ RISK MANAGEMENT & ASSURANCE ──────────────────┐
│                                                 │
│ Our approach: Test failures, not just success  │
│ paths. Cap blast radius. Monitor real-time.    │
│                                                 │
│ What you see in the demo:                      │
│                                                 │
│ [Risk Test 1: Wrong Token Type]                │
│ User token → MCP endpoint                      │
│ Result: 403 Forbidden ✓                        │
│ Why: Scope mismatch (user vs agent)            │
│                                                 │
│ [Risk Test 2: Rate Limit]                      │
│ 50 requests in 10 seconds                      │
│ Result: Auto-kill after 5 violations ✓         │
│ Why: Prevents cascade failures                 │
│                                                 │
│ [Risk Test 3: Expired Token]                   │
│ Token past expiration time                     │
│ Result: 401 Unauthorized ✓                     │
│ Why: Token security (limited lifetime)         │
│                                                 │
│ Monitoring Dashboard:                          │
│ • Requests/min (ok/rejected)                   │
│ • Error rate (expected/unexpected)             │
│ • Token validity (fresh/stale)                 │
│ • Agent health (green/yellow/red)              │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Live Demo in Panel:**
- Run token security test scenarios
- Show rate limiting in action
- Display monitoring metrics dashboard

---

### Principle 3: Security & Privacy by Design

**What it means:**
- Protect data flowing through the system
- Prevent prompt injection, token theft, data exfiltration
- Use encryption and secure channels

**How our demo meets it:**

| Feature | Demo Component | Code Location |
|---------|---|---|
| **Token Scope Isolation** | User tokens can't access agent resources | Phase 157/158: Token scopes validated per endpoint |
| **Delegation Chain** | Proof that agent acts on behalf of user | RFC 8693 `act` claim shows delegation proof |
| **HTTPS/TLS** | All data encrypted in transit | BFF/MCP use TLS; can show certificate in browser DevTools |
| **Session Security** | HTTP-only cookies, no XSS access | `sessionResolver.js` uses secure session storage |
| **Data Minimization** | Agent only sees data it needs | Custom `may_act` claim limits agent to specific user |
| **Audit Trail** | All sensitive operations logged | `auditLog.record()` tracks token usage, revocations |

**Training Slide:**
```
┌─ SECURITY & PRIVACY BY DESIGN ──────────────────┐
│                                                  │
│ Our approach: Encrypt everything. Validate      │
│ all tokens. Minimize what agent can access.     │
│                                                  │
│ What you see in the demo:                       │
│                                                  │
│ [SSL/TLS Protection]                            │
│ Open DevTools → Network tab                     │
│ All requests show 🔒 (HTTPS)                    │
│ This prevents token theft in transit            │
│                                                  │
│ [Token Scope Isolation]                         │
│ User lands on /dashboard                        │
│ Gets token with scopes: profile, email,         │
│ banking:read                                     │
│                                                  │
│ Agent lands at OAuth                            │
│ Gets token with scopes: agent, mcp:*            │
│ NOT banking:read (can't read user data)         │
│ NOT profile (can't see user Name/Email)         │
│                                                  │
│ [Delegation Proof]                              │
│ Agent calls token exchange:                     │
│ "Exchange my token + user token → MCP token"    │
│ Result has `act` claim = delegation proof       │
│ Backend sees: Agent acting as User for X        │
│                                                  │
│ [No Data Leakage]                               │
│ Agent can call /api/mcp/tools/call              │
│ Agent CANNOT call /api/users (admin only)       │
│ Agent CANNOT call /api/accounts (user scope)    │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Live Demo in Panel:**
- Show HTTPS in DevTools
- Decode tokens to show scope separation
- Show which endpoints agent can/cannot access

---

### Principle 4: Governance, Compliance & Accountability

**What it means:**
- Define who can build, deploy, use AI
- Clear policies and roles
- Audit trail for compliance (regulators, auditors, legal)

**How our demo meets it:**

| Feature | Demo Component | Code Location |
|---------|---|---|
| **Admin Console** | Central control point for policies | `/admin` dashboard with settings, controls |
| **Kill Switch** | Override mechanism (human accountability) | Phase 159: Red button with reason + logging |
| **Approval Workflows** | User consent for agent actions | Phase 157: Agent Consent agreement prompt |
| **Immutable Audit Logs** | Compliance-grade logging | `auditLog.record()` with encryption, tamper detection |
| **Role-Based Access** | Admin/user/agent roles | BFF enforces roles on each endpoint |
| **Policy Violations Logged** | Every violation recorded | Rate limits, scope violations, failed attempts logged |

**Training Slide:**
```
┌─ GOVERNANCE, COMPLIANCE & ACCOUNTABILITY ───────┐
│                                                  │
│ Our approach: Clear policies. Human oversight.  │
│ Immutable audit trail for regulators.           │
│                                                  │
│ What you see in the demo:                       │
│                                                  │
│ [Governance Layer: Admin Console]               │
│ Go to /admin                                    │
│ See controls for:                               │
│ • Agent configuration (scopes, rate limits)     │
│ • Kill switch (red button)                      │
│ • Audit dashboard (all events logged)           │
│ • User consent (oversight)                      │
│                                                  │
│ [User Consent: The Agent Consent Agreement]     │
│ When user logs in to use agent:                 │
│ "I consent to allow agents to act on my behalf" │
│ User must click [Agree] (human accountability)  │
│ This consent is logged in audit trail           │
│                                                  │
│ [Kill Switch: Emergency Override]               │
│ If agent misbehaves:                            │
│ Admin clicks 🔴 red button                      │
│ Reason: "Agent making unauthorized transfers"  │
│ Token revoked immediately                       │
│ Event logged with actor (which admin),          │
│ timestamp, reason → auditor can verify          │
│                                                  │
│ [Audit Trail: Compliance-Ready]                 │
│ Every action immutably logged:                  │
│ • Agent authenticated at 10:00:00               │
│ • User consented at 10:00:05                    │
│ • Token exchanged at 10:00:10                   │
│ • Transfer called at 10:00:15                   │
│ • Kill switch activated at 10:00:20 by admin    │
│ → Regulators can audit downstream               │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Live Demo in Panel:**
- Show admin console controls
- Trigger user consent prompt
- Click red button (demo revocation)
- Show audit log entries

---

### Principle 5: Lifecycle Management & Observability

**What it means:**
- Treat AI like a product (requirements → build → test → deploy → monitor → retire)
- Continuous observability: logs, metrics, traces, feedback
- Keep behavior within acceptable bounds

**How our demo meets it:**

| Feature | Demo Component | Code Location |
|---------|---|---|
| **Launch/Shutdown** | Agent lifecycle visible | Agent can start/stop from admin console |
| **Health Dashboard** | Real-time metrics | `AgentFlowDiagramPanel` shows health, uptime |
| **Request Metrics** | Track throughput, latency, errors | `/api/admin/metrics` endpoint tracks requests |
| **Logging & Tracing** | Full request trace from entry to MCP | `agentFlowDiagramService.js` logs each step |
| **Alerting** | Anomalies trigger notifications | Rate limit violations → auto-kill + alert |
| **Feedback Loop** | Errors surface to improve behavior | Token failures logged for root cause analysis |

**Training Slide:**
```
┌─ LIFECYCLE MANAGEMENT & OBSERVABILITY ──────────┐
│                                                  │
│ Our approach: Treat agent as a live product.   │
│ Monitor constantly. Respond to anomalies.       │
│                                                  │
│ What you see in the demo:                       │
│                                                  │
│ [Startup Lifecycle]                             │
│ Agent starts → credentials loaded               │
│ Token fetched from PingOne                      │
│ Scopes validated: agent, mcp:*                  │
│ Status: ✅ READY                                 │
│                                                  │
│ [Continuous Monitoring]                         │
│ Dashboard shows:                                │
│ • Uptime: 99.8%                                 │
│ • Requests/min: 45 (ok, limit is 100)           │
│ • Error rate: 0.2% (expected)                   │
│ • Avg latency: 120ms (normal)                   │
│ • Token freshness: 14min old (11min to expiry)  │
│                                                  │
│ [Smart Alerts]                                  │
│ Alert 1: "Rate limit violations increasing"    │
│   → Anomaly detected → auto-investigate         │
│ Alert 2: "Token about to expire"               │
│   → Refresh before expiry                       │
│ Alert 3: "Unusual token scope in request"      │
│   → Potential security issue → escalate         │
│                                                  │
│ [Observability in Action]                       │
│ User: "Why did my transfer fail?"               │
│ → Click [Show Trace]                            │
│ → See: Token exchange failed (scope mismatch)   │
│ → See: Error "user token not agent token"       │
│ → Root cause identified immediately             │
│                                                  │
│ [Retirement]                                    │
│ When agent is retired:                          │
│ • Token revoked                                 │
│ • Sessions closed                               │
│ • Audit trail preserved                         │
│ • Historical metrics archived                   │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Live Demo in Panel:**
- Show health dashboard metrics
- Trigger an anomaly (rate limit violation)
- Show auto-alert + state capture
- Display request trace

---

### Principle 6: Identity, Access & Least Privilege (Agentic AI)

**What it means:**
- Agent is a first-class identity (like a user)
- Strong authentication (OAuth token, not shared password)
- Least privilege: agent only accesses what it needs
- No more permissions than necessary

**How our demo meets it:**

| Feature | Demo Component | Code Location |
|---------|---|---|
| **Agent as First-Class Identity** | Registered in PingOne as separate app | Phase 157: Agent registered with own Client ID |
| **Strong Authentication** | OAuth Client Credentials grant (not password) | BFF uses `client_id` + `client_secret` (not user creds) |
| **Scoped Tokens** | Agent token limited to `agent`, `mcp:*` scopes | Phase 156/157/158: Token scope validation |
| **No Access to User Data** | Agent can't read user passwords, account numbers | Agent can only call `/api/mcp/tools/*` → MCP server |
| **Delegation Proof** | Agent acts on behalf of user, not as user | RFC 8693 token exchange with `act` claim |
| **Least Privilege Enforced** | Every endpoint checks agent's scopes | Middleware validates token before processing |

**Training Slide:**
```
┌─ IDENTITY, ACCESS & LEAST PRIVILEGE ────────────┐
│                                                  │
│ Our approach: Agent = first-class identity.    │
│ Never use user credentials. Always validate    │
│ scopes. Act on behalf, not as.                 │
│                                                  │
│ What you see in the demo:                       │
│                                                  │
│ [Agent ≠ User]                                  │
│ User "john@bank.com":                           │
│   • Registered in PingOne                       │
│   • Can log in with password                    │
│   • Can access /dashboard, /accounts            │
│   • Has broad access (can read their own data)  │
│                                                  │
│ Agent "banking-mcp-agent":                      │
│   • Registered in PingOne as separate app       │
│   • NO password (OAuth Client Credentials)      │
│   • Can ONLY access /api/mcp/tools/*            │
│   • Zero direct database access                 │
│   • Acts on behalf of user (delegation proof)   │
│                                                  │
│ [OAuth (Not Password)]                          │
│ User auth: john + password123 → session token   │
│ Agent auth: agent_id + agent_secret → token    │
│ Security: agent_secret never exposed to user    │
│                                                  │
│ [Scopes: Principle of Least Privilege]          │
│ User token has scopes:                          │
│   • profile (read name, email)                  │
│   • email (read email)                          │
│   • banking:read (read accounts, transactions)  │
│   • banking:write (make transfers)              │
│                                                  │
│ Agent token has scopes:                         │
│   • agent (proof it's an agent)                 │
│   • mcp:* (access to MCP tools)                 │
│   • NOT profile (no user identity info)         │
│   • NOT banking:read (no direct data access)    │
│   • NOT banking:write (can't act alone)         │
│                                                  │
│ [Delegation Proof: Acting FOR User]             │
│ Agent + User → Token Exchange → New Token       │
│ New token has:                                   │
│   • sub = user (who the action is for)          │
│   • act = agent (who's doing the action)        │
│   • aud = mcp:server (where it can be used)     │
│                                                  │
│ Backend logic:                                   │
│   if token.act == known_agent AND \             │
│      token.sub == authorized_user:              │
│        → Allow transfer                         │
│   else:                                          │
│        → Deny (401/403)                         │
│                                                  │
│ Result: Clear chain of accountability           │
│   "Agent X acted on behalf of User Y"          │
│   "User Y approved this action"                 │
│   "Audit trail shows both identities"           │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Live Demo in Panel:**
- Compare user vs agent token scopes
- Show /dashboard accessible to user, not agent
- Show /api/mcp/tools accessible to agent in delegation context
- Decode token to show `act` claim

---

## Training Panel: Interactive Design

### Panel Layout (Slide-Out from Right Side)

```
┌──────────────────────────────────────────────────────┐
│ [X] AI TRiSM Training                                │
├──────────────────────────────────────────────────────┤
│                                                      │
│ Principle: Trust & Transparency        [→ Next]     │
│                                                      │
│ ┌────────────────────────────────────────────────┐  │
│ │ What it means:                                │  │
│ │ Make agents explainable and auditable         │  │
│ │                                                │  │
│ │ How we do it:                                 │  │
│ │ ✓ Agent Flow Diagram (step-by-step trace)    │  │
│ │ ✓ Token decoder (show claims)                │  │
│ │ ✓ Educational errors (explain failures)      │  │
│ │ ✓ Audit logs (timestamp + action)            │  │
│ │                                                │  │
│ │ 🎬 Try it: [Click Get Transactions]           │  │
│ │    ↓ See Agent Flow Diagram light up          │  │
│ │    ↓ Click [Show Tokens] to decode            │  │
│ └────────────────────────────────────────────────┘  │
│                                                      │
│ ┌─ Live Demo Area ───────────────────────────────┐  │
│ │ [Agent Flow Diagram Live]                    │  │
│ │ Shows steps in real-time                      │  │
│ └────────────────────────────────────────────────┘  │
│                                                      │
│ [Prev] [1/6] [Next]                                 │
├──────────────────────────────────────────────────────┤
│ [Close Panel]                                        │
└──────────────────────────────────────────────────────┘
```

### Navigation (6 Slides)

- **Slide 1:** Trust & Transparency → See flow diagram
- **Slide 2:** Risk Management → Run token security tests
- **Slide 3:** Security & Privacy → Show scope isolation
- **Slide 4:** Governance & Accountability → See kill switch
- **Slide 5:** Lifecycle & Observability → Monitor health
- **Slide 6:** Identity & Least Privilege → Compare token scopes

---

## Implementation Approach

### Components to Create

1. **`TRiSMTrainingPanel.js`** — Main slide component
   - Six slides (principles 1-6)
   - Navigation (prev/next)
   - Live demo embeddings

2. **`TRiSMSlide.js`** — Individual slide template
   - Principle title
   - "What it means" explanation
   - "How we do it" features list
   - Live demo section

3. **`TRiSMDemoEmbed.js`** — Live demo components
   - Embed `AgentFlowDiagram` for Principle 1
   - Embed `TokenSecurityTester` for Principle 2
   - Embed scope comparison for Principle 6
   - Etc.

### Toggle/Access

- Add icon in top toolbar: 📚 (Learn) button
- Opens training panel in slide-out
- Dismissible (can close and return to app)
- Can be re-opened anytime

### Styling

- Light overlay when panel open (focus on training)
- Slides have consistent design (white background, clear typography)
- Code snippets use monospace font with syntax highlighting
- Live demos embedded inline (working example, not screenshot)

---

## Requirements (Locked Decisions)

- **REQ-160-01:** All six AI TRiSM principles must be covered
- **REQ-160-02:** Each principle must map to real demo features/code
- **REQ-160-03:** Training includes live demos (not just slides)
- **REQ-160-04:** Users see how each principle answers security concerns
- **REQ-160-05:** Interactive: users can click through, trigger examples
- **REQ-160-06:** Educational tone: explains NOT just technical, but WHY it matters

---

## Deliverables

1. **Six Training Slides** — Principle-by-principle walkthrough
2. **Live Demo Integrations** — Show working examples from app
3. **Code References** — Link to implementation (transparency)
4. **Clickable Examples** — Let users trigger scenarios
5. **PDF Export** — For training/compliance documentation
6. **Glossary** — AI TRiSM terminology (Trust, Risk, Security, etc.)

---

## Success Criteria

1. ✅ Security leader can explain all six principles after viewing
2. ✅ Can point to specific demo features proving each principle
3. ✅ Users understand "this is why we do X" (security reasoning)
4. ✅ Training is board/regulator-ready (can use for presentations)
5. ✅ Live demos make concepts tangible (not abstract)
6. ✅ Panel is non-intrusive (can be toggled open/closed)

---

## Dependencies

- **Depends on:** Phase 155-159 (all features to demonstrate)
- **Builds on:** Existing demo components (flow diagram, token display, error messages, kill switch)
- **Feeds into:** Board presentations, compliance training, regulator briefings

---

## How This Ties Everything Together

| Phase | Feature | TRiSM Principle | Training Slide |
|-------|---------|-----------------|---|
| 155 | Sidebar menu | Governance (clear navigation) | Slide 4 |
| 156 | Error messages | Trust (transparent failures) | Slide 1 |
| 157 | PingOne audit | Compliance (alignment check) | Slide 4 |
| 158 | Token validation tests | Risk (security testing) | Slide 2 |
| 159 | Kill switch | Governance (emergency override) | Slide 4 |
| 160 | Training panel | **All six principles** | All slides |

**Narrative:** "Here's how we built a secure AI agent system that meets Gartner's AI TRiSM standards."

---

## Next Steps for Planning

Run `/gsd-plan-phase 160` to break into:
- Task 1: Create `TRiSMTrainingPanel.js` with slide navigation
- Task 2: Build six principle slides with content
- Task 3: Embed live demos into each slide
- Task 4: Add toolbar icon (📚 Learn button)
- Task 5: Create PDF export + glossary
- Task 6: Documentation for board presentations
