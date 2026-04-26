# Phase 233: Enrich Activity Log — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-26
**Phase:** 233 — enrich-activity-log-with-decoded-token-payloads-log-full-jwt
**Areas discussed:** Scope, JWT decode strategy, Frontend loading events

---

## Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Scope — what's in vs deferred | The roadmap lists ~10 enrichment types. What's actually in Phase 233? | ✓ |
| JWT decode strategy | Where and how should JWT decode happen? | ✓ |
| Sensitive data policy | What gets logged vs redacted in PingOne bodies and prompts? | |
| Frontend loading events | Phase 232 D-02 deferred frontend UI spinner events to here | ✓ |

---

## Scope

| Option | Description | Selected |
|--------|-------------|----------|
| JWT decodes only | Phase 233 = JWT enrichment only; everything else defers | |
| JWT + frontend events | Two concerns but closely related | |
| Everything in the roadmap | Ship all 10+ enrichment types; expect 6-8 plans | ✓ |

**User's choice:** Everything in the roadmap

**Follow-up: Priority order**

| Option | Description | Selected |
|--------|-------------|----------|
| JWT decodes first, then the rest | JWT most visible, creates foundation for other enrichment | ✓ |
| Frontend events first | Highest-priority deferral from Phase 232 | |
| All in parallel | No strict ordering needed | |

**User's choice:** JWT decodes first, then the rest

**Follow-up: LLM prompt length**

| Option | Description | Selected |
|--------|-------------|----------|
| Full text | Complete prompt + system prompt, no truncation | ✓ |
| First 500 chars + length | Preview + length | |
| Summary only | Tool name, model, token count — no raw text | |

**User's choice:** Full text — this is a demo/dev tool, full visibility is the point

---

## JWT Decode Strategy

**Where should decode happen?**

| Option | Description | Selected |
|--------|-------------|----------|
| At call sites — pass decoded into metadata | Consistent with jwtFullDecode pattern in agentMcpTokenService | ✓ |
| Inside appEventService — auto-detect tokens | Transparent enrichment but complex auto-detection | |
| New enrichment helper | Separate enrichEventWithTokens() step | |

**User's choice:** At call sites — pass `{ jwtFullDecode: { header, claims } }` in metadata

**Which tokens?**

| Option | Description | Selected |
|--------|-------------|----------|
| User access token | OAuth login token | ✓ |
| MCP / exchanged token | RFC 8693 result with act claim | ✓ |
| Agent actor token | Agent's own token in 2-exchange flows | ✓ |
| ID token | OIDC id_token with sub/name/email | ✓ |

**User's choice:** All four tokens

**Where should decodeJwtClaims() live?**

| Option | Description | Selected |
|--------|-------------|----------|
| Extract to shared tokenUtils.js | New utils/ file, no cross-service deps | ✓ |
| Inline at each call site | Duplicate logic | |
| Leave in agentMcpTokenService | Awkward cross-service imports | |

**User's choice:** Extract to banking_api_server/utils/tokenUtils.js

---

## Frontend Loading Events

**BFF endpoint shape?**

| Option | Description | Selected |
|--------|-------------|----------|
| POST /api/admin/app-events | New route, symmetric with server events | ✓ |
| Extend existing GET endpoint | Same URL, different verb | |
| WebSocket push | No new HTTP endpoint | |

**User's choice:** POST /api/admin/app-events

**Which frontend loading states?**

| Option | Description | Selected |
|--------|-------------|----------|
| Agent processing spinner | Between submit and response | ✓ |
| Token exchange in-flight | RFC 8693 in-progress | ✓ |
| MCP tool execution | Between dispatch and result | ✓ |
| Step-up MFA challenge | HITL consent / CIBA polling | ✓ |

**User's choice:** All four

**Auth requirement?**

| Option | Description | Selected |
|--------|-------------|----------|
| Admin auth required | authenticateToken + admin role | |
| Session-only | authenticateToken only (any logged-in user) | ✓ |
| No auth for demo | Unauthenticated POST | |

**User's choice:** Session-only — frontend events come from the user's own session, admin role is over-restrictive

---

## Claude's Discretion

- PingOne API body capture detail level (D-06) — sensitive data stripping rule defined in CONTEXT.md without explicit discussion
- Session snapshot field set (D-07) — SHA-256 hash approach for session ID defined without explicit discussion

## Deferred Ideas

- Log rotation / file size management — future hardening phase
- Token signature validation status in decoded metadata — requires introspection, out of scope for Phase 233
- Per-category log level filtering — future hardening phase
