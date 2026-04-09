# Error Codes and Remediation Guide (RFC 8693 §5.2)

## Overview

This document documents all OAuth token exchange error codes returned by the BX Finance Banking Demo, along with common causes and remediation steps per RFC 8693 §5.2.

All error codes comply with RFC 8693 unless marked as "Custom" extensions.

## Quick Lookup by HTTP Status

| HTTP Status | Common Codes | Likely Cause |
|------------|---------------|-------------|
| **400** | invalid_request, invalid_scope, invalid_grant | Malformed request, scope mismatch, bad grant |
| **401** | invalid_client, invalid_token, token_expired | Bad credentials, expired/invalid token |
| **403** | unauthorized_client, access_denied, insufficient_scope | Client not authorized, user denied, missing scope |
| **500** | config.*, server_error | Configuration error, internal server error |
| **503** | temporarily_unavailable | Service temporarily down (PingOne, auth server) |

## Configuration Errors

### config.missing_credentials (HTTP 500, server_error)

**When it occurs**: Application credentials not configured in environment

**Causes**:
- PINGONE_AI_AGENT_CLIENT_ID not set
- Client Secret missing from environment
- Application not registered in PingOne

**Remediation**:
1. Check environment variables are set:
   ```bash
   echo ${PINGONE_AI_AGENT_CLIENT_ID}
   echo ${PINGONE_AI_AGENT_CLIENT_SECRET}
   ```
2. Verify PingOne Admin → Applications → Super Banking AI Agent exists
3. Copy Client ID and Secret to `.env` or deployment config
4. Restart server
5. Re-test

**Prevention**: Validate all required credentials at server startup

---

### config.invalid_audience (HTTP 500, server_error)

**When it occurs**: Audience URIs not configured or mismatched

**Causes**:
- PINGONE_AGENT_GATEWAY_AUDIENCE env var not set
- Audience in token doesn't match any configured audience
- Resource indicator configuration incomplete

**Remediation**:
1. Check all required audience env vars:
   ```bash
   echo ${PINGONE_AGENT_GATEWAY_AUDIENCE}
   echo ${PINGONE_INTERMEDIATE_AUDIENCE}
   echo ${PINGONE_MCP_GATEWAY_AUDIENCE}
   ```
2. Update .env with correct URIs
3. Restart server
4. Verify with `/api/config` endpoint (if enabled)

---

## Authentication Errors

### invalid_client (HTTP 401, invalid_client)

**When it occurs**: Client authentication failed during token exchange

**Causes**:
- Client ID incorrect
- Client Secret incorrect or rotated
- Client app not registered in PingOne
- Auth method mismatch (basic vs. post)

**Example Error**:
```json
{
  "error": "invalid_client",
  "error_description": "Client authentication failed (unknown client...)",
  "error_code": "invalid_client"
}
```

**Remediation**:
1. Verify Client ID is correct:
   - Admin UI → Configuration page
   - Compare with PingOne app settings
2. Check Client Secret is current:
   - If rotated in PingOne, update environment
   - Use Secret rotation tool if available
3. Verify app in PingOne:
   - Admin → Applications → [App Name]
   - Check Grant Types includes "Token Exchange"
   - Verify Token Auth Method (basic or post)
4. Restart server and retry

**Testing**:
```bash
curl -X POST https://oauth.pingone.com/token \
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=client_credentials" \\
  -d "client_id=$CLIENT_ID" \\
  -d "client_secret=$CLIENT_SECRET"
```

---

### invalid_token (HTTP 401, invalid_token)

**When it occurs**: User's access token is invalid, expired, or revoked

**Causes**:
- User token expired (typically 1 hour)
- User logged out or session revoked
- Token tampered with
- Token issued by different authority

**Remediation for Users**:
1. Log in again to get fresh token
2. Verify you still have access (check user status in PingOne)
3. If error persists, check with admin

**Remediation for Operators**:
1. Verify user account exists in PingOne
2. Check user is not disabled or locked
3. Verify token introspection is working:
   ```bash
   curl -X POST https://oauth.pingone.com/introspect \
     -d "token=$TOKEN" -d "client_id=$CLIENT_ID" -d "client_secret=$CLIENT_SECRET"
   ```

---

### token_expired (HTTP 401, invalid_token)

**When it occurs**: User's token has exceeded its lifetime

**Causes**:
- Normal token expiration (1 hour for short-lived tokens)
- System clock skew
- Token issued long ago

**Remediation**:
1. User: Re-authenticate to get new token
2. Check system clocks are synchronized (NTP)
3. If frequent: review token lifetime configuration

---

## Authorization Errors

### unauthorized_client (HTTP 403, unauthorized_client)

**When it occurs**: Client app is not authorized for this operation

**Causes**:
- Token Exchange grant type not enabled on app
- Client credentials lack required permissions
- May_act delegation not enabled

**Remediation**:
1. Check PingOne Admin → Applications → [App Name] → Grant Types
2. Verify "Token Exchange" is enabled (checked)
3. Save if changed
4. Restart server
5. Re-test

**Testing**:
```bash
# Verify app has token_exchange grant
curl -X GET https://api.pingone.com/v1/environments/${ENVID}/applications/${APP_ID} \  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq '.grantTypes'
```

---

### access_denied (HTTP 403, access_denied)

**When it occurs**: User or resource owner denied the request

**Causes**:
- User declined consent
- User not authorized for operation
- May_act delegation not granted

**Remediation for Users**:
1. Go to Admin UI → DemoData page
2. Toggle "2-Exchange Mode" ON if needed
3. Check you're logged in with correct account
4. Retry operation

**Remediation for Administrators**:
1. Verify user has necessary permissions
2. Check consent flow requirements
3. Review audit logs for denial reasons

---

### insufficient_scope (HTTP 403, insufficient_scope)

**When it occurs**: User's token lacks required scope for operation

**Causes**:
- Logged in with narrow scope
- Delegate not granted required scope
- Scope narrowing too aggressive

**Remediation**:
1. User: Re-authenticate with broader scope grant
2. Or: Use narrower scope operation
3. Check MCP server scope requirements
4. Verify scope narrowing configuration

**Debug**:
```bash
# Check token claims
jwt_decode ${USER_TOKEN} | grep scope
```

---

## Scope Errors

### invalid_scope (HTTP 400, invalid_scope)

**When it occurs**: Requested scope is invalid, unknown, or exceeds what was granted

**Causes**:
- Scope doesn't exist in resource server
- Scope not in user's token
- Scope narrowing filtered out all requested scopes
- Audience scope mismatch (RFC 8707)

**Example**:
```json
{
  "error": "invalid_scope",
  "error_description": "Requested scope invalid for this audience: transfer:execute not in [...]",
  "error_code": "invalid_scope"
}
```

**Remediation**:
1. Check user token includes required scope:
   ```bash
   jwt_decode ${TOKEN} | grep scope
   ```
2. Verify scope exists on resource server
3. Check SCOPE_AUDIENCE_MAPPING.md for valid scopes per audience
4. Ensure scope narrowing doesn't remove required scopes
5. Re-authenticate if needed

**Configuration**:
- See `SCOPE_AUDIENCE_MAPPING.md` for detailed scope-audience mapping
- See `ALLOWED_SCOPES_BY_AUDIENCE` in configStore.js

---

## Server Errors

### server_error (HTTP 500, server_error)

**When it occurs**: Unexpected internal server error

**Causes**:
- Unhandled exception in exchange logic
- Null pointer or undefined reference
- External service error (PingOne)
- Configuration incomplete

**Remediation**:
1. Check server logs for stack trace:
   ```bash
   tail -100 server.log | grep -A 10 "server_error"
   ```
2. Look for line number and file
3. If configuration-related: check config errors above
4. If PingOne-related: check PingOne status
5. File bug report with full error log

**Debugging**:
```bash
# Enable detailed error logging
DEBUG=banking:* npm run start
```

---

### temporarily_unavailable (HTTP 503, temporarily_unavailable)

**When it occurs**: Authorization server temporarily unable to process request

**Causes**:
- PingOne service down or degraded
- Network connectivity issue
- High server load
- Maintenance window

**Remediation**:
1. Wait 30-60 seconds
2. Retry the operation
3. If persists, check:
   - Internet connectivity: `ping 1.1.1.1`
   - PingOne status: https://status.pingone.com
   - Firewall/proxy allowing access to PingOne
   - DNS resolution: `nslookup auth.pingone.com`
4. If service is down, wait for maintenance to complete
5. Contact PingOne support if not recovering

**Monitoring**:
- Set alerts on HTTP 503 responses
- Monitor PingOne status page
- Test connectivity to auth server periodically

---

## Custom/Extension Errors

### may_act_validation_failed (HTTP 400, invalid_grant)

**When it occurs**: The may_act claim doesn't match request context (RFC 8693 §2.2)

**Causes**:
- May_act subject doesn't match actual subject
- May_act scope mismatch
- May_act claim malformed

**Remediation**:
1. Verify subject token contains may_act claim:
   ```bash
   jwt_decode ${TOKEN} | grep may_act
   ```
2. Ensure actor_token matches may_act.sub
3. Check scope in may_act includes requested scope
4. Re-generate token if claim is incorrect

---

### subject_mismatch (HTTP 400, invalid_grant)

**When it occurs**: The subject claim doesn't match user identity

**Causes**:
- Token subject (sub) doesn't match user_id
- User changed between requests
- Token issued for different user

**Remediation**:
1. Verify token belongs to current user
2. Check user_id in subject claim
3. If multi-step flow: confirm user consistency
4. Re-authenticate with correct credentials

---

## RFC 8693 Error Response Format

All error responses follow RFC 8693 §5.2 format:

```json
{
  "error": "invalid_scope",
  "error_description": "The requested scope is invalid or exceeds the scope granted by the resource owner",
  "error_code": "custom_diagnostic_code"
}
```

**Fields**:
- **error** (required): RFC 8693 error code
- **error_description** (optional): Human-readable error description
- **error_code** (custom): Internal diagnostic code for operator support

---

## Error Response Examples

### Example 1: Invalid Client Credentials

**Request**:
```bash
POST /api/exchange HTTP/1.1
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:token-exchange&
subject_token=eyJhbGc...&
client_id=wrong-client&
client_secret=wrong-secret
```

**Response**:
```json
HTTP/1.1 401 Unauthorized
{
  "error": "invalid_client",
  "error_description": "Client authentication failed",
  "error_code": "invalid_client"
}
```

**Diagnosis**: Client ID or secret incorrect. Update .env and restart server.

---

### Example 2: Scope Mismatch

**Request**:
```bash
POST /api/exchange HTTP/1.1

grant_type=urn:ietf:params:oauth:grant-type:token-exchange&
subject_token=eyJhbGc...&
audience=https://mcp-gateway.example.com&
requested_token_use=access_token&
scope=transfer:execute
```

**Response**:
```json
HTTP/1.1 400 Bad Request
{
  "error": "invalid_scope",
  "error_description": "Requested scope transfer:execute not allowed for audience https://mcp-gateway.example.com",
  "error_code": "invalid_scope"
}
```

**Diagnosis**: scope doesn't match audience. See SCOPE_AUDIENCE_MAPPING.md.

---

### Example 3: Token Expired

**Response**:
```json
HTTP/1.1 401 Unauthorized
{
  "error": "invalid_token",
  "error_description": "The access token provided has expired",
  "error_code": "token_expired"
}
```

**Diagnosis**: User needs to re-authenticate to get fresh token.

---

## References

- **RFC 8693**: OAuth 2.0 Token Exchange — https://tools.ietf.org/html/rfc8693#section-5.2
- **RFC 8707**: OAuth 2.0 Resource Indicators — https://tools.ietf.org/html/rfc8707
- **SCOPE_AUDIENCE_MAPPING.md**: Detailed scope-audience reference
- **CONFIGURATION_GUIDE.md**: Configuration and troubleshooting
- **configStore.js**: ERROR_CODES constant, mapErrorToCode() function
