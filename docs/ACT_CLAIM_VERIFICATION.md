# act and may_act Claim Verification Guide

## Overview

This document explains how to verify that PingOne is correctly issuing `act` and `may_act` delegation claims in the token exchange flow (RFC 8693).

## Background

The banking demo architecture relies on delegation claims to establish a clear chain of custody:

- **`may_act`** (in the **user access token**): Prospectively authorizes the Backend-for-Frontend (BFF) to exchange the token
- **`act`** (in the **MCP access token** after exchange): Identifies the current actor (Backend-for-Frontend (BFF)) acting on behalf of the user

Without these claims, the delegation chain is invisible in audit logs and token introspection.

## Prerequisites

### PingOne Configuration Required

For PingOne to issue `act` and `may_act` claims, you must configure:

1. **Token Exchange Grant** enabled on the Backend-for-Frontend (BFF) OAuth application
2. **may_act Token Policy** that adds the `may_act` claim to user tokens
3. **act Token Policy** that adds the `act` claim to exchanged tokens

### Configuration Steps

#### 1. Enable Token Exchange Grant

In PingOne Admin Console:
1. Navigate to **Applications** → Your Backend-for-Frontend (BFF) Application
2. Go to **Configuration** → **Grant Types**
3. Enable **Token Exchange** (`urn:ietf:params:oauth:grant-type:token-exchange`)
4. Save changes

#### 2. Configure may_act Token Policy

Create a custom token policy for user tokens:

```json
{
  "claims": {
    "may_act": {
      "client_id": "${application.id}"
    }
  }
}
```

This adds `may_act.client_id` to all user access tokens, authorizing the Backend-for-Frontend (BFF) to exchange them.

#### 3. Configure act Token Policy

Create a custom token policy for token exchange:

```json
{
  "claims": {
    "act": {
      "client_id": "${actor.client_id}"
    }
  }
}
```

This adds `act.client_id` to exchanged tokens, identifying the Backend-for-Frontend (BFF) as the current actor.

## Verification Methods

### Method 1: Automated Script

Use the provided verification script:

```bash
# 1. Start the server
cd banking_api_server
npm start

# 2. Log in via browser to obtain a session token
# 3. Extract the access token from the session (check server logs or use debugger)

# 4. Run the verification script
ACCESS_TOKEN=eyJhbGc... node scripts/verify-act-claims.js
```

The script will:
- Decode the user access token and check for `may_act`
- Perform token exchange to get the MCP access token
- Decode the MCP access token and check for `act`
- Report findings with clear success/failure indicators

### Method 2: Manual Token Inspection

1. **Capture user access token**
   - Log in to the application
   - Open browser DevTools → Network tab
   - Find any API request to `/api/accounts` or similar
   - The server has the token in `req.session.oauthTokens.accessToken`

2. **Decode user access token**
   ```bash
   # Use jwt.io or decode manually
   echo "eyJhbGc..." | base64 -d
   ```

3. **Look for may_act claim**
   ```json
   {
     "sub": "user-id",
     "aud": "client-id",
     "scope": "openid profile email",
     "may_act": {
       "client_id": "bff-client-id"
     }
   }
   ```

4. **Trigger Token Exchange**
   - Use the Banking Agent to call any MCP tool
   - Check server logs for token exchange events

5. **Decode MCP access token (exchanged)**
   - Extract from MCP server logs or intercept WebSocket traffic
   - Decode and look for `act` claim:
   ```json
   {
     "sub": "user-id",
     "aud": "mcp-server-audience",
     "scope": "banking:read banking:write",
     "act": {
       "client_id": "bff-client-id"
     }
   }
   ```

### Method 3: Token Chain UI

The application includes a Token Chain visualization panel:

1. Open the Banking Agent
2. Execute any banking operation (e.g., "Show my accounts")
3. Click the **Token Chain** button in the UI
4. Review the token events:
   - Event 1: User access token — should show `may_act` present/absent
   - Event 2: Token Exchange - should show success/failure
   - Event 3: MCP access token — should show `act` present/absent

## Expected Results

### ✅ Success Scenario

**User access token:**
```json
{
  "sub": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "aud": "12345678-90ab-cdef-1234-567890abcdef",
  "scope": "openid profile email",
  "may_act": {
    "client_id": "12345678-90ab-cdef-1234-567890abcdef"
  },
  "iss": "https://auth.pingone.com/...",
  "exp": 1234567890,
  "iat": 1234564290
}
```

**MCP access token:**
```json
{
  "sub": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "aud": "https://mcp.banking-demo.com",
  "scope": "banking:accounts:read",
  "act": {
    "client_id": "12345678-90ab-cdef-1234-567890abcdef"
  },
  "iss": "https://auth.pingone.com/...",
  "exp": 1234567890,
  "iat": 1234564290
}
```

### ❌ Failure Scenarios

#### Scenario 1: may_act missing from user access token

**Symptom:** Token exchange fails with error
```
{
  "error": "invalid_grant",
  "error_description": "Token exchange not authorized"
}
```

**Cause:** PingOne token policy not configured to add `may_act` claim

**Fix:** Configure may_act token policy (see Configuration Steps above)

#### Scenario 2: Token exchange succeeds but act missing from MCP access token

**Symptom:** MCP access token is issued but contains no `act` claim

**Impact:** Delegation chain is invisible. Audit logs cannot show "Backend-for-Frontend (BFF) acting on behalf of user"

**Cause:** PingOne token exchange policy not configured to add `act` claim

**Fix:** Configure act token policy (see Configuration Steps above)

#### Scenario 3: REQUIRE_MAY_ACT=true Blocks Exchange

**Symptom:** Token exchange rejected before reaching PingOne
```
{
  "error": "may_act_required",
  "message": "REQUIRE_MAY_ACT=true but the user token has no may_act claim"
}
```

**Cause:** Pre-flight validation in `agentMcpTokenService.js` enforcing may_act presence

**Fix:** Either:
1. Add may_act to user tokens via PingOne policy, OR
2. Set `REQUIRE_MAY_ACT=false` for local testing (not recommended for production)

## Environment Variables

| Variable | Purpose | Required | Example |
|----------|---------|----------|---------|
| `MCP_RESOURCE_URI` | Audience for exchanged token | Yes (for exchange) | `https://mcp.banking-demo.com` |
| `USE_AGENT_ACTOR_FOR_MCP` | Include actor token in exchange | No | `true` |
| `REQUIRE_MAY_ACT` | Enforce may_act pre-flight check | No | `true` |
| `AGENT_OAUTH_CLIENT_ID` | Agent client ID for actor token | Only if `USE_AGENT_ACTOR_FOR_MCP=true` | `agent-client-id` |

## Troubleshooting

### Token Exchange Fails with "invalid_grant"

1. Check PingOne application has Token Exchange grant enabled
2. Verify `may_act` claim is present in the user access token
3. Check PingOne logs for detailed error message
4. Ensure Backend-for-Frontend (BFF) client credentials are correct

### act claim not present in MCP access token

1. Verify token exchange succeeded (MCP access token was issued)
2. Check PingOne token exchange policy configuration
3. Review PingOne documentation on delegation claims
4. Contact PingOne support if policy is configured but claim still missing

### Script Reports "ACCESS_TOKEN not set"

1. Start the server: `npm start`
2. Log in via browser
3. Extract token from session (use debugger or server logs)
4. Set environment variable: `ACCESS_TOKEN=eyJ... node scripts/verify-act-claims.js`

## References

- [RFC 8693 - OAuth 2.0 Token Exchange](https://datatracker.ietf.org/doc/html/rfc8693)
- [PingOne Token Exchange Documentation](https://docs.pingidentity.com/r/en-us/pingone/p1_t_configure_token_exchange)
- [PingOne Token Policies](https://docs.pingidentity.com/r/en-us/pingone/p1_c_token_policies)
- [may_act Specification](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-token-exchange-19#section-4.2)

## Next Steps

After verifying `act` and `may_act` claims:

1. **Document PingOne Configuration**: Save screenshots and policy JSON for reference
2. **Update Architecture Docs**: Confirm delegation chain is functional
3. **Implement Audit Logging**: Extract `act` claims in middleware and log delegation events
4. **Add Monitoring**: Alert on token exchange failures or missing delegation claims
5. **Update Tests**: Add test cases that validate `act` claim presence in exchanged tokens
