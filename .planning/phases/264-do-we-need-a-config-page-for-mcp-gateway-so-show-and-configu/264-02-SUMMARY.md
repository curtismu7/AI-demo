---
plan: "264-02"
status: complete
---

## What was done
- Added RFC 9728-compliant WWW-Authenticate header to all 3 error response paths in authorizeMcpRequest.ts:
  - 401 on inactive/revoked token
  - 401 on GatewayTokenPolicyError (policy violation)
  - 403 on Authorize DENY/INDETERMINATE
- Header format: `Bearer realm="PingOne", resource_metadata="${gatewayResourceUri}/.well-known/mcp-server"`
- 401 responses retain existing error/error_description params after realm+resource_metadata

## Tests
Extended banking_mcp_gateway/tests/gateway-auth.test.ts with Section 5 (2 new tests). All tests pass.

Also fixed pre-existing TypeScript compile errors in both test files (stubConfig fixtures missing
`tokenEndpointAuthMethod` and `introspectionEndpoint` fields added to GatewayConfig interface).

## Files changed
- banking_mcp_gateway/src/middleware/authorizeMcpRequest.ts
- banking_mcp_gateway/tests/gateway-auth.test.ts
- banking_mcp_gateway/tests/gateway-server.test.ts (pre-existing compile fix: missing stubConfig fields)
