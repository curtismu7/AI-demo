# Phase 95: Actor token = Agent token education — Context

**Gathered:** 2026-04-08  
**Status:** Ready for planning  
**Source:** Roadmap definition (Phase 95)

---

## Phase Boundary

Document and teach that the Actor token is the Agent token (they are the same thing with different names in different contexts). Establish consistent terminology across all code, documentation, and education UI. Clarify when to use "actor", "agent", "act claim", and "agent actor" to eliminate confusion in RFC 8693 token exchange and agent delegation patterns.

---

## Implementation Decisions

### Terminology Standardization

- **Actor Token** = Token identifying the entity performing actions (usually an AI agent)
- **Agent Token** = Same token, used when discussing the banking agent specifically  
- **Agent Actor** = RFC 8693 terminology: agent acting on behalf of user
- **Act Claim** = JWT claim containing subject being acted upon (user) and actor (agent)
- **Usage:** Prefer "Agent" in UI/education, "Actor" in RFC/technical docs, "Agent Actor" in architecture diagrams

### Documentation Scope

- Create definitive terminology guide: `ACTOR_TOKEN_TERMINOLOGY.md`
- Audit and update: README, API docs, OAuth docs, RFC 8693 guides, PingOne config docs
- Annotate all architecture diagrams with "Agent/Actor" token labels
- Scan all `.md` files for inconsistent terminology and fix systematically

### Education UI

- Add education panel: "What is the Actor Token?"
- Visual diagram: User Token → Agent Actor → Modified Token with Act Claim
- Token inspector: Label all actor/agent-related claims (act, may_act, sub, aud)
- MCP server logs: Show which agent (actor) invoked which tool for traceability

### Code & Comments

- Add comprehensive JSDoc comments explaining actor/agent terminology
- Variable naming: Use `agentActorToken` or `agentToken` consistently (no `actorToken` alone)
- Comments format: "Agent (Actor) validation" or "Actor (Agent) token exchange"
- Test naming: Use "agent-as-actor-token-exchange" format for clarity

### Compliance & References

- RFC 8693 Section 4.2: Reference when explaining `act` claim (actor's identity)
- RFC 8693 Section 4.3: Reference when explaining `may_act` claim (permissions)
- MCP spec: Clarify distinction between "client credentials" and "agent actor delegation"
- Cross-reference with Phase 96 (aud validation) for complete token claims picture

---

## Canonical References

**Downstream agents MUST read before planning or implementation:**

### Existing Actor/Agent Token Patterns

- [banking_api_server/routes/token-exchange.js](banking_api_server/routes/token-exchange.js) — Current token exchange implementation  
- [PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md](PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md) — Existing token exchange documentation
- [banking_mcp_server/](banking_mcp_server/) — MCP server token usage patterns

### RFC & Standards

- RFC 8693: OAuth 2.0 Token Exchange (act claim, may_act claim, delegation patterns)
- RFC 6749: OAuth 2.0 Authorization Framework
- MCP Specification: Authentication and authorization patterns

### Token Inspector & Education Panels

- [banking_api_ui/src/components/TokenInspector.tsx](banking_api_ui/src/components/TokenInspector.tsx) — Token display UI (if exists)
- [banking_api_ui/src/components/EducationPanel.tsx](banking_api_ui/src/components/EducationPanel.tsx) — Education panel component (if exists)

---

## Success Criteria

1. ✓ Consistent terminology used across codebase (actor vs agent vs agent-actor)
2. ✓ Education panel explaining "Actor Token = Agent Token" relationship created
3. ✓ All documentation files updated with clear terminology definitions
4. ✓ Token inspector displays actor/agent-related claims with proper labels
5. ✓ No ambiguous use of "actor" or "agent" in new code
6. ✓ `ACTOR_TOKEN_TERMINOLOGY.md` is comprehensive and linked from README
7. ✓ RFC 8693 references integrated throughout documentation

---

*Phase 95 Context*  
*Ready for /gsd-plan-phase 95*
