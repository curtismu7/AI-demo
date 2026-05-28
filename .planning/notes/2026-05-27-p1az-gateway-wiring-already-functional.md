---
title: P1AZ gateway wiring already functional — only FF missing
date: 2026-05-27
context: Exploration of PingGateway skill applicability to existing demo_mcp_gateway P1AZ integration
---

## Observation

`demo_mcp_gateway/src/auth/PingOneAuthorizeClient.ts` and
`demo_mcp_gateway/src/pingAuthorizeGuard.ts` already call the **PingOne Authorize
(P1AZ) Sideband API** correctly. The call pattern is:

```
POST ${PINGAUTHORIZE_ENDPOINT}/governance/pap/alpha/policy/${PINGAUTHORIZE_WORKER_ID}/decision
body: { parameters: { DecisionContext, McpMethod, ToolName, ClientId, ActClientId,
                       TokenScopes, TokenAudience, TransactionAmount, TransactionType,
                       ToAccountId, [TratPurp, TratAzdAct, TratSessionId, ...] } }
```

This is the same Sideband API that `PingAuthorizeFilter` in the PingGateway product
calls. The decision outcomes (PERMIT / DENY / INDETERMINATE) and the response
shape (decision_id, policy_version, trace_id) are already handled.

## What's missing

The gateway currently gates on **env var presence only** — if
`PINGAUTHORIZE_ENDPOINT` and `PINGAUTHORIZE_WORKER_ID` are set, P1AZ is active;
if not, local scope evaluation runs. There is no runtime feature flag, no
configStore toggle, and no UI indicator.

## Gap to close

Add `ff_p1az_gateway` / `MCP_GW_P1AZ_ENABLED=true/false` as a runtime flag so:
- Credentials can be configured in `.env` without activating the feature
- The flag can be flipped mid-demo from the admin panel
- The gateway logs which path (P1AZ live vs local scope) was taken per request

See related todo: [[p1az-gateway-feature-flag-todo]]
