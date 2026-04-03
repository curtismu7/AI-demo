# Phase 48: Remove Invalid SpEL act Expression — Context

**Gathered:** 2026-04-03
**Phase goal:** Remove the invalid SpEL `act` expression from the Super Banking Banking API resource server documentation (Step 1e), update guidance to state that `act` chain enforcement happens at BFF/PAZ layer, and move the invalid SpEL todo to done.

---

## Decision: What is being changed

**File:** `docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` — Step 1e only.
No code changes. No other docs touched.

**Scope is limited to Step 1e — Attribute Mappings tab section:**
- Remove the `act` Attribute Mapping table (currently shows the invalid SpEL expression)
- Remove the "Expression explained" blockquote
- Remove the "How to test" blockquote
- Replace with: "No mapping needed — leave this tab unchanged" + explanation of why (SpEL limitation) and where enforcement actually happens (BFF `_performTwoExchangeDelegation` + PAZ)

---

## Decision: Why the expression is invalid

The invalid expression:
```
#root.context.requestData.subjectToken?.act?.sub != null
  ? #root.context.requestData.subjectToken?.act
  : null
```

**Problem 1:** The `act` claim on the Agent Exchanged Token is a JSON Map object `{ "sub": "<AI_AGENT_CLIENT_ID>" }`. PingOne SpEL's `?.` safe navigation through custom Map entries returns null — `subjectToken?.act?.sub` always evaluates to null.

**Problem 2:** Even if Problem 1 were fixable, PingOne SpEL cannot construct inline Map objects (`{'key': value}` syntax is not supported). So the ideal fully-nested RFC 8693 §5.4 structure `{ "sub": "<MCP_CLIENT_ID>", "act": { "sub": "<AI_AGENT_CLIENT_ID>" } }` is not expressible.

**Verification:** The BFF's `_performTwoExchangeDelegation()` comment at line 971 already explains this: "PingOne SpEL cannot construct fully-nested act objects — act.sub reflects the AI Agent as delegation initiator."

---

## Decision: Where act chain enforcement actually happens

**BFF (`agentMcpTokenService.js` → `_performTwoExchangeDelegation`):**
- Decodes the Final Token and logs `act.sub` and `act.act.sub` in the `two-ex-final-token` tokenEvent
- The `nestedActOk` check at line ~972 verifies `finalClaims?.act?.sub && finalClaims?.act?.act?.sub`
- Token Chain panel in the UI displays this chain to the user

**PAZ (PingOne Authorize):**
- Introspects the Final Token against `https://resource-server.pingdemo.com`
- Enforces `act.sub == AGENT_OAUTH_CLIENT_ID` (MCP Service) and `act.act.sub == AI_AGENT_CLIENT_ID` (AI Agent) as policy attributes
- The nested `act` chain is produced naturally by PingOne during Exchange #2 — PingOne sets `act.sub = client_id of exchanger (MCP)` and nests the previous `act` from the subject token as `act.act`

**Key insight:** PingOne automatically handles `act` nesting during token exchange. The Attribute Mapping expression is NOT needed for this — it was an incorrect attempt to replicate what PingOne does natively.

---

## Decision: Replacement content for Step 1e Attribute Mappings tab

Replace the current mapping table + explanation + how-to-test with:

```
**Attribute Mappings tab:**

No custom mapping needed. Leave this tab unchanged.

> **Why not here?** PingOne automatically constructs the nested `act` claim during Exchange #2 — no attribute expression is needed. The outer `act.sub` is set to the MCP Service's `client_id` (the exchanger), and the inner `act.act` is promoted from the `act` claim on the Agent Exchanged Token (preserving the AI Agent's identity from Exchange #1). This is standard RFC 8693 §4.4 behavior.
>
> **PingOne SpEL limitation (for reference):** If you try to write a custom `act` expression on this resource server, it will fail. PingOne's SpEL evaluator cannot navigate nested Map entries via `?.` safe navigation (the `act` claim is a JSON object — `subjectToken?.act?.sub` returns null). Additionally, PingOne SpEL does not support inline Map construction (`{'key': value}` syntax), so the RFC 8693 §5.4 nested structure cannot be produced as an expression.
>
> **Where the chain is enforced:** The BFF's `_performTwoExchangeDelegation()` decodes the Final Token and verifies `act.sub` (MCP Service) and `act.act.sub` (AI Agent) are both present. PAZ enforces these as named policy attributes during token introspection.
```

---

## Decision: Todo → done

After the doc edit is committed, move:
`.planning/todos/pending/2026-04-03-fix-invalid-spel-act-expression-on-super-banking-banking-api-resource.md`
→ `.planning/todos/done/2026-04-03-fix-invalid-spel-act-expression-on-super-banking-banking-api-resource.md`

---

## Out of scope

- No BFF code changes
- No PingOne console steps (no attribute mapping to add or remove in the actual PingOne env)
- No changes to Step 1a–1d or any other section
- No changes to the 1-exchange doc (`PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md`)
- No changes to the Postman collection or environment files
