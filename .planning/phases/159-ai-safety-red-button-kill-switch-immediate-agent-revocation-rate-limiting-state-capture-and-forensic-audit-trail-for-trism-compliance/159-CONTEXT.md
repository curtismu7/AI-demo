# Phase 159: AI Safety Red Button Kill Switch — Context

**Date:** April 15, 2026  
**Framework:** AI TRiSM (Trust, Risk, and Security Management)  
**Audience:** Security leaders, compliance officers, board/regulator stakeholders  
**Phase Goal:** Implement a visual red button kill switch that demonstrates immediate agent revocation, blast radius capping, state capture, and forensic audit capabilities.

---

## The Problem: 24/7 AI at Machine Speed

In 2026, the traditional Human-in-the-Loop (HITL) model doesn't scale:

- **AI agents run 24/7** without human supervision
- **Machines move faster than humans** — by the time a human detects a problem, damage may be done
- **One mistake cascades** — a single misdirected API call from a rogue or compromised agent could drain accounts, expose data, or reverse transactions at scale
- **Regulatory pressure** — auditors ask: "If your AI goes rogue right now, how fast can you stop it?"

### Example: The Agent Disaster Scenario

```
10:00:00 — Agent starts "transfer funds" loop
10:00:02 — Agent has made 50 transactions (human hasn't noticed)
10:00:05 — $500K transferred to wrong account (human realizes)
10:00:30 — Manual intervention (revoke API keys, freeze account)
```

**Time to discover:** 30 seconds  
**Damage:** $500K transferred

**With Red Button:**
```
10:00:05 — Human spots issue, hits red button
10:00:05.2 — Agent's token immediately revoked at OAuth server
10:00:05.3 — All pending requests rejected
10:00:05.5 — State frozen for forensics
```

**Time to stop:** 0.5 seconds  
**Damage:** Limited to in-flight requests (10-50ms of work)

---

## AI TRiSM Pillars & Red Button Alignment

### 🔍 Trust

**What it means:** Humans can verify the agent is doing what it says it's doing.

**Red Button contribution:**
- Transparent audit trail of why agent was stopped
- State capture shows exactly what agent was doing at kill time
- Clear rules enforcement log (rate limits, policy violations)

### ⚠️ Risk

**What it means:** Limit the blast radius if something goes wrong.

**Red Button contribution:**
- **Immediate Revocation:** Agent can't make any more API calls
- **Rate Limiting:** Even if token is valid, agent can only make N requests per minute
- **Scoped Permissions:** Agent can't access resources outside its approved scope
- **Automatic Triggers:** Kill switch activates on policy violation (e.g., 100+ requests/min)

### 🛡️ Security Management

**What it means:** Actively prevent and detect threats.

**Red Button contribution:**
- **Defense-in-Depth:** Kill switch lives outside agent code (can't be bypassed)
- **Forensics:** Frozen state enables root-cause analysis
- **Incident Response:** Automatic escalation + logging
- **Recovery:** State snapshot allows replay audits

---

## The Red Button: Four Components

### Component 1: Immediate Revocation

**What:** When the button is pressed, the agent's OAuth token is instantly invalidated at the authorization server.

**How it works:**
```
1. Admin clicks red button in UI
2. BFF sends POST /api/admin/agent/revoke to PingOne
3. PingOne marks agent's token as revoked
4. Any subsequent MCP call returns 401 Unauthorized
5. Agent cannot authenticate anymore
```

**Implementation:**
```javascript
// BFF endpoint: POST /api/admin/agent/kill-switch
async function killSwitch(agentId, reason) {
  // 1. Revoke at OAuth server
  await revokeAgentToken(agentId);
  
  // 2. Revoke all active sessions
  await sessionStore.revokeAgentSessions(agentId);
  
  // 3. Capture state
  const state = await captureAgentState(agentId);
  
  // 4. Log incident
  await auditLog.record({
    event: 'agent_revoked',
    agent_id: agentId,
    reason,
    timestamp: Date.now(),
    revoked_at: Date.now(),
    state_snapshot: state,
  });
  
  return { success: true, revoked_at: Date.now() };
}
```

**Verification:** Token should be invalid **within 100ms** at all endpoints.

---

### Component 2: Rate Limiting & Blast Radius Caps

**What:** Even if the agent has a valid token, we cap how many actions it can take per time window.

**How it works:**
```
Agent Token Rate Limit: 10 requests per 60 seconds

Request 1-10 (0-30 sec):  ✅ Allowed
Request 11 (35 sec):       ❌ Rate limited
Request 12+ (until 60 sec): ❌ Rate limited

If agent hits rate limit 5+ times in 5 minutes: Auto-trigger kill switch
```

**Implementation:**
```javascript
// Middleware: Check rate limits before processing agent requests
async function agentRateLimitMiddleware(req, res, next) {
  const agentId = req.user?.client_id;
  
  if (!agentId) return next(); // Not an agent
  
  // Check agent rate limit
  const key = `agent:${agentId}:requests`;
  const count = await redis.incr(key);
  
  if (count === 1) {
    // Set expiry on first request of window
    await redis.expire(key, 60); // 60-second window
  }
  
  const limit = 10; // 10 requests per 60 seconds
  
  if (count > limit) {
    // Log excess attempt
    await auditLog.record({
      event: 'agent_rate_limit_exceeded',
      agent_id: agentId,
      request_count: count,
      limit,
    });
    
    // Check if we should auto-kill
    const violations = await getViolationCount(agentId, '5m');
    if (violations >= 5) {
      await killSwitch(agentId, 'Auto-triggered: rate limit violations');
      return res.status(429).json({
        error: 'agent_killed',
        message: 'Agent exceeded rate limits and was automatically stopped',
        auto_kill_reason: 'rate_limit_violations',
        admin_notification: 'Red button auto-triggered for Agent ' + agentId,
      });
    }
    
    return res.status(429).json({
      error: 'rate_limit_exceeded',
      message: `Agent rate limit: ${limit} requests per 60 seconds`,
      current_count: count,
      limit,
      window: '60s',
    });
  }
  
  next();
}
```

**Blast Radius Caps:**
- **Per-Agent:** Agent can't exceed X requests/min (prevents runaway loops)
- **Per-Resource:** Agent can't access more than Y accounts per minute
- **Per-Action:** Agent can't perform Z transfers per hour
- **Per-Cost:** Agent can't authorize more than $M in transactions per day

---

### Component 3: State Capture & Forensics

**What:** When the kill switch activates, we freeze the agent's state for investigation.

**State to capture:**
1. **Current token** (for analysis)
2. **Active sessions** (what was the agent doing?)
3. **Last N requests** (what triggered the kill?)
4. **Agent config** (what permissions did it have?)
5. **Rate limit metrics** (was it misbehaving?)
6. **Previous actions** (transaction history in last 5 minutes)

**Implementation:**
```javascript
async function captureAgentState(agentId) {
  const [token, sessions, requests, config, metrics, actions] = await Promise.all([
    getAgentToken(agentId),           // Decode token
    getActiveSessions(agentId),        // Ongoing operations
    getLastRequests(agentId, 50),      // Last 50 requests
    getAgentConfig(agentId),           // Permissions, scopes
    getAgentMetrics(agentId, '5m'),    // Usage in last 5 min
    getAgentActions(agentId, '5m'),    // Transactions in last 5 min
  ]);

  return {
    timestamp: Date.now(),
    agent_id: agentId,
    token: {
      client_id: token.client_id,
      scopes: token.scopes,
      expires_in: token.expires_in,
      claims: { sub: token.sub, act: token.act, aud: token.aud },
    },
    active_sessions: sessions.map(s => ({
      session_id: s.id,
      started_at: s.created_at,
      last_activity: s.last_activity,
      operation: s.current_operation,
    })),
    last_requests: requests.map(r => ({
      timestamp: r.timestamp,
      method: r.method,
      endpoint: r.endpoint,
      status: r.status,
      duration_ms: r.duration,
      params: sanitize(r.params), // Don't log sensitive data
    })),
    config: {
      max_requests_per_minute: config.rate_limit,
      approved_resources: config.resources,
      max_transaction_amount: config.max_tx,
      expires_at: config.expires_at,
    },
    metrics: {
      requests_last_5m: metrics.request_count,
      errors_last_5m: metrics.error_count,
      rate_limit_hits: metrics.rate_limit_violations,
      avg_latency_ms: metrics.avg_latency,
    },
    actions: actions.map(a => ({
      timestamp: a.timestamp,
      action: a.action,
      resource: a.resource,
      status: a.status,
      details: sanitize(a.details),
    })),
  };
}
```

**Forensic Analysis:**
- Stored in encrypted audit store
- Accessible to security team
- Helps identify: Was it misconfiguration? Malicious intent? Cascade failure?

---

### Component 4: Forensic Audit Trail

**What:** Every action related to the agent (and red button) is logged immutably.

**Events to log:**
1. **Agent startup** — credentials loaded, scopes granted
2. **Request allowed** — timestamp, endpoint, result
3. **Request denied** — reason (rate limit, scope, token invalid)
4. **Kill switch activation** — who, when, why
5. **State capture** — what was frozen
6. **Revocation confirmation** — token no longer valid
7. **Cleanup** — sessions closed, credentials invalidated

**Log Format:**
```json
{
  "timestamp": "2026-04-15T10:00:05.234Z",
  "event": "agent_killed",
  "actor": { "type": "admin", "user_id": "admin-123" },
  "agent": { "id": "mcp-agent-001", "name": "Banking MCP Agent" },
  "kill_reason": "manual_red_button",
  "time_to_revoke_ms": 150,
  "state_captured": true,
  "state_size_bytes": 45678,
  "previous_requests_in_flight": 3,
  "requests_rejected": 3,
  "audit_id": "kill-switch-2026-04-15-001",
  "compliance_tags": ["TRiSM", "AI-Safety", "Immediate-Action"]
}
```

---

## Red Button UI/UX

### Option A: Admin Dashboard Panel

```
┌─ AI Safety Control Center ─────────────────────────┐
│                                                    │
│ Agent: MCP Banking Agent                      ✅   │
│ Status: RUNNING                                   │
│ Token Valid Until: 2026-04-15 10:15:00           │
│ Requests (last 60s): 7/10                        │
│ Rate Limit Violations: 0                         │
│                                                    │
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓      │
│ ┃      🔴 STOP AGENT (RED BUTTON)         ┃      │
│ ┃     (Immediate Revocation)              ┃      │
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛      │
│                                                    │
│ Reason for Stop (if clicked):                    │
│ [Dropdown: Misbehaving / Excessive rate / etc]   │
│                                                    │
│ [Confirm] [Cancel]                               │
│                                                    │
│ ─────────────────────────────────────────        │
│                                                    │
│ RECENT INCIDENTS:                                │
│ • 2026-04-15 10:00:05 — Agent rate limited      │
│ • 2026-04-15 09:58:22 — Token refreshed         │
│ • 2026-04-15 09:45:10 — Agent started           │
│                                                    │
└──────────────────────────────────────────────────┘
```

### Option B: Quick-Access Emergency Button

Red button in top-right corner of app:
- Always visible
- Click → confirmation modal
- Confirmation → instant revocation + state capture
- Post-incident: forensic report auto-generated

### Option C: Slack/Alert Integration

```
🚨 AI AGENT EMERGENCY ALERT
Agent: Banking MCP Agent
Status: Rate limit exceeded (15 violations in 5m)
Auto-Kill: TRIGGERED
Token: REVOKED ✓
State: CAPTURED ✓
Forensics: AVAILABLE

Review: [Link to audit dashboard]
```

---

## Kill Switch Definitions (Locked Decisions)

### What Does "Stop" Mean?

**Option A: Full Shutdown (Default)**
- ✅ Revoke agent's OAuth token
- ✅ Close all active sessions
- ✅ Reject any new requests
- ✅ Preserve state for audit
- ⚠️ Agent cannot recover; requires human intervention to restart

**Option B: Read-Only Mode**
- ✅ Revoke write/execute scopes
- ✅ Allow read-only queries (for diagnosis)
- ✅ Block mutations (transfers, deletes)
- ⚠️ Agent not fully stopped; could still leak data

**Option C: Quarantine Mode**
- ✅ Redirect all requests to sandbox
- ✅ Allow agent to run but capture everything
- ✅ No real transactions executed
- ⚠️ More complex; harder to audit

**Recommendation:** Start with **Option A (Full Shutdown)** — clearest security posture.

---

## Decoupling Controls (Security Architecture)

### ❌ BAD: Kill Switch Inside Agent Logic

```javascript
// Agent.js
async function toolCall(toolName, args) {
  if (this.isMisbehaving()) {
    throw new Error('Agent stopped itself'); // ← Bad: agent can suppress this
  }
  return await this.callMCP(toolName, args);
}
```

**Problem:** Agent can catch the exception, log a false "all clear" message, and continue.

### ✅ GOOD: Kill Switch Outside Agent Logic

```javascript
// BFF: /api/admin/agent/kill-switch (separate from agent code path)
async function killSwitch(agentId, reason) {
  // This runs in a different process/service
  await revokeTokenAt(process.env.PING_ONE_URL);
  await invalidateSessionsAt(sessionStore);
  // Agent has no way to intercept this
}

// Agent code path (agent cannot reach kill switch)
async function agentRequestHandler(req, res) {
  const token = req.headers.authorization; // Token might be revoked
  const valid = await validateTokenAt(process.env.PING_ONE_URL); // ← Real server, not agent
  if (!valid) return res.status(401);
  // ...
}
```

**Benefits:**
- Agent cannot bypass or suppress kill switch
- Revocation happens at OAuth server level (out of agent's control)
- Token validation is real-time (not cached on agent)

---

## Tabletop: The Failure Scenario

**Scenario:** Your AI banking agent goes rogue at 10:00 AM during business hours.

**Question: How many seconds until tokens are invalid?**

### Tabletop Exercise Checklist

1. **Minute 0:** Crisis detected (agent making unauthorized transfers)
   - [ ] Alert fired (automatic or manual)
   - [ ] Admin on-call paged (SLA: 30 seconds)

2. **Minute 0:30:** Admin clicks red button
   - [ ] Confirmation modal (no accidental clicks)
   - [ ] Reason for stop: "Agent making unauthorized transfers"

3. **Minute 0:35:** Kill switch activates
   - [ ] Token revocation sent to PingOne
   - [ ] State snapshot captured
   - [ ] Audit log recorded

4. **Minute 0:40:** Verification
   - [ ] Token is invalid (test new request → 401)
   - [ ] Sessions closed (agent can't proceed)
   - [ ] In-flight requests rejected

5. **Minute 1:00:** Post-incident
   - [ ] Forensic report generated
   - [ ] Legal/compliance notified
   - [ ] Board/regulators briefed

**Target**: Kill switch activates (revoke) within **2 seconds** of button click.

---

## Implementation Strategy

### Phase 159 Deliverables

1. **Red Button UI Component**
   - Visual design (large red circle, clear warning)
   - Confirmation modal (prevent accidents)
   - Status display (is agent running? revoked?)

2. **Kill Switch API Endpoint**
   - `POST /api/admin/agent/:agentId/kill-switch`
   - Authentication: Admin role required
   - Payload: `{ reason: string }`
   - Response: `{ success: true, revoked_at, state_snapshot_id }`

3. **Token Revocation at PingOne**
   - Call PingOne `/management/v1/`... endpoint
   - Invalidate agent's current token
   - Update session store

4. **State Capture & Storage**
   - Capture agent state (as defined above)
   - Store in audit database (encrypted)
   - Generate forensic report endpoint

5. **Rate Limiting Middleware**
   - Intercept agent requests
   - Track rate (N requests per time window)
   - Auto-trigger kill switch on threshold

6. **Audit Logging**
   - Log every kill switch event
   - Log every rate limit violation
   - Log token revocation + confirmation

7. **Forensic Dashboard**
   - View killed agent state
   - See timeline of events leading to kill
   - Export audit trail for compliance

---

## Requirements (Locked Decisions)

- **REQ-159-01:** Red button must revoke agent's OA uth token at authorization server  (not local memory)
- **REQ-159-02:** Token must be invalid at all endpoints within 500ms of button click
- **REQ-159-03:** Rate limiting must be external to agent logic (cannot be bypassed by agent code)
- **REQ-159-04:** State capture must happen at kill time, frozen for later forensics
- **REQ-159-05:** Kill reason must be logged immutably (audit trail)
- **REQ-159-06:** Auto-kill triggers on rate limit violations (configurable threshold)
- **REQ-159-07:** Kill switch UI accessible only to admin role
- **REQ-159-08:** Kill switch is **NOT** a feature flag—it's always active and decoupled from agent logic

---

## Dependencies

- **Depends on:** Phase 157 (PingOne audit) and Phase 158 (token validation)
- **Related to:** Phase 156 (error messaging for revocation)
- **Feeds into:** Compliance documentation, board presentations, regulator briefings

---

## Success Criteria

1. ✅ Red button visible and functional in Admin UI
2. ✅ Clicking red button revokes agent's OAuth token
3. ✅ Token is invalid at all endpoints within 500ms
4. ✅ State captured shows what agent was doing at kill time
5. ✅ Audit log immutable (cannot be modified by agent)
6. ✅ Rate limiting auto-triggers kill switch at threshold
7. ✅ Forensic dashboard accessible to security team
8. ✅ Tabletop exercise shows token invalid within 2 seconds

---

## AI TRiSM Compliance Checklist

- [ ] **Trust:** Audit trail immutable and transparent
- [ ] **Trust:** Agent state frozen for verification
- [ ] **Risk:** Blast radius capped with rate limiting
- [ ] **Risk:** Kill switch prevents further damage
- [ ] **Security:** Token revoked at OAuth server (not local)
- [ ] **Security:** Kill switch decoupled from agent code
- [ ] **Security:** Forensic analysis enabled post-incident
- [ ] **Security:** Admin controls separate from agent logic
- [ ] **Security:** Auto-kill on policy violation

---

## Next Steps for Planning

Run `/gsd-plan-phase 159` to break into:
- Task 1: Red button UI component + confirmation flow
- Task 2: Kill switch API endpoint + token revocation
- Task 3: Rate limiting middleware with auto-kill trigger
-Task 4: State capture + forensic audit trail
- Task 5: Forensic dashboard / audit log viewer
- Task 6: Documentation + tabletop exercise guide
