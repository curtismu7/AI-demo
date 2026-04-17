# Phase 172 — Discussion Log

**Date:** 2026-04-16
**Participants:** User, Claude (discuss-phase)

## Gray Areas Discussed

### Area 1: Exchange Trigger Point
**Question:** When should token exchange happen — eagerly at session init, lazily on first tool call, or lazily with caching?

**Options presented:**
- A: Eager — exchange at session init (simple, but wastes exchanges for non-tool sessions)
- B: Lazy — exchange on every tool call (ensures freshness, but adds latency)
- C: Lazy + cache — exchange on first call, cache with TTL, re-exchange on expiry

**Decision:** C — Lazy + cache. Best balance of performance and correctness.

---

### Area 2: Backend API Validation
**Question:** Should the banking API server validate that agent requests carry an `act` claim?

**Options presented:**
- A: Validate `act` required — reject agent requests without delegation token
- B: Accept any valid token — backend doesn't enforce delegation model
- C: Warn but allow — log missing `act` but still process

**Decision:** A — Validate `act` required. Enforces the security model end-to-end.

---

### Area 3: Scope & Audience Mapping
**Question:** What scopes should the exchanged token request?

**Options presented:**
- A: Full scope pass-through — request same scopes as user token
- B: Narrowed scopes per tool — least-privilege, only request what each tool needs
- C: Single agent scope — one umbrella scope for all tool calls

**Decision:** B — Narrowed scopes per tool. Implements least-privilege principle.

---

### Area 4: Error Handling & Fallback
**Question:** What happens when token exchange fails?

**Options presented:**
- A: Hard fail — tool call fails, no banking API call made
- B: Fallback to pass-through — send raw user token, log warning
- C: Retry then fail — retry once for transient errors, then hard fail

**Decision:** A — Hard fail. No fallback, no pass-through. Most secure.
