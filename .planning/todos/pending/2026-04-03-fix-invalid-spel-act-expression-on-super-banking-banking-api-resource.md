---
created: "2026-04-03T18:29:45.574Z"
title: "Fix invalid SpEL act expression on Super Banking Banking API resource"
area: "docs"
files:
  - docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md:429
---

## Problem

The `act` attribute expression documented for the **Super Banking Banking API** resource server (Step 1e of the 2-exchange doc) is invalid in PingOne's SpEL evaluator:

```
#root.context.requestData.subjectToken?.act?.sub != null
  ? #root.context.requestData.subjectToken?.act
  : null
```

**Why it's invalid:** PingOne's SpEL context for token exchange attribute expressions exposes `subjectToken` as the decoded payload of the incoming token, BUT the `act` claim on the Agent Exchanged Token (the subjectToken in Exchange #2) is a nested JSON object `{ "sub": "<AI_AGENT_CLIENT_ID>" }`. PingOne's SpEL expression evaluator does not support navigating into nested custom claim objects using `?.` safe navigation — this syntax is valid for top-level object properties but not for Map entries within custom claims like `act`.

The expression may either:
- Return `null` always (safe navigation fails silently on Map entries)
- Throw an `invalid_expression` error in the PingOne expression tester

This means the `act` claim will be absent or null in the final MCP Exchanged Token even if Exchange #2 succeeds, breaking PAZ enforcement of `act.sub == AI_AGENT_CLIENT_ID`.

The doc also notes a PingOne SpEL limitation: map/object construction is not supported, so the ideal nested RFC 8693 structure `{ "sub": "<MCP_CLIENT_ID>", "act": { "sub": "<AI_AGENT_CLIENT_ID>" } }` cannot be produced in a single expression.

## Solution

1. **Test the current expression** in the PingOne expression tester (Super Banking Banking API resource → Attribute Mappings → `act` row → pencil icon → Build and Test Expression) with the test payload:
   ```json
   {
     "context": {
       "requestData": {
         "subjectToken": {
           "act": { "sub": "<AI_AGENT_CLIENT_ID>" }
         },
         "actorToken": {
           "aud": ["<MCP_CLIENT_ID>"]
         }
       }
     }
   }
   ```
   If it returns `null` or an error, the expression is confirmed invalid.

2. **Research valid alternatives for nested claim access in PingOne SpEL:**
   - Try `#root.context.requestData.subjectToken['act']` (Map bracket notation)
   - Try `#root.context.requestData.subjectToken?.get('act')` 
   - Try a simpler string extraction: `#root.context.requestData.subjectToken?.act` (may work if PingOne serializes custom claim objects as accessible properties)
   - Contact PingOne support / check PingOne Developer docs for expression context for token exchange attributes on Exchange #2

3. **If no valid expression exists:** Document the limitation clearly in the doc — the `act` claim cannot be forwarded from Exchange #1 output into Exchange #2 output via PingOne SpEL. Update the BFF code comment in `agentMcpTokenService.js` to note this and confirm the BFF is the authoritative source for both actor identities in the PAZ policy context.

4. **Update `docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` Step 1e** with either:
   - The corrected working expression, or
   - A clear note that this attribute mapping cannot be achieved via PingOne SpEL and must be enforced at the BFF/PAZ layer instead
