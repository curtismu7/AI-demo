# Configuration Guide: Two-Exchange Delegation

## Overview

This guide documents all required environment variables, validation rules, and troubleshooting for RFC 8693 two-exchange token delegation.

---

## Required Environment Variables

### AI Agent Credentials (Step 1: Actor Token Acquisition)

```bash
# Super Banking AI Agent application (registered in PingOne)
PINGONE_AI_AGENT_CLIENT_ID          # [REQUIRED] AI Agent app client ID
PINGONE_AI_AGENT_CLIENT_SECRET      # [REQUIRED] AI Agent app client secret
AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD # [OPTIONAL] Default: client_secret_basic
                                     # Options: client_secret_basic, client_secret_post, private_key_jwt
```

**Example**:
```bash
export PINGONE_AI_AGENT_CLIENT_ID="550e8400-e29b-41d4-a716-446655440000"
export PINGONE_AI_AGENT_CLIENT_SECRET="your-super-secret-key-here"
export AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD="client_secret_basic"
```

### Audiences (Resource Indicators)

Each token exchange step narrowsa the audience (RFC 8693 requirement):

```bash
# Step 1: AI Agent actor token audience
PINGONE_AGENT_GATEWAY_AUDIENCE="https://agent-gateway.example.com"

# Step 2: First exchange output audience (AI Agent intermediate)
PINGONE_AI_AGENT_INTERMEDIATE_AUDIENCE="https://ai-agent-gateway.example.com"

# Step 3: MCP actor token audience
PINGONE_MCP_GATEWAY_AUDIENCE="https://mcp-gateway.example.com"

# Step 4: Final token audience (MCP resource server)
PINGONE_MCP_RESOURCE_URI_TWO_EXCHANGE="https://resource.example.com/mcp"
```

**Important**: All 4 audiences MUST be different for proper scope narrowing. Duplication indicates configuration error.

### MCP Exchanger Credentials (Step 3: Actor Token Acquisition)

```bash
# MCP Token Exchanger application (registered in PingOne)
AGENT_OAUTH_CLIENT_ID              # [REQUIRED] MCP Exchanger app client ID
AGENT_OAUTH_CLIENT_SECRET          # [REQUIRED] MCP Exchanger app client secret
MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD # [OPTIONAL] Default: client_secret_basic
```

**Example**:
```bash
export AGENT_OAUTH_CLIENT_ID="660f9511-f39c-52e5-b827-557766551111"
export AGENT_OAUTH_CLIENT_SECRET="your-mcp-secret-key-here"
```

### Complete Configuration Example

```bash
# AI Agent Credentials and Audience (Steps 1-2)
export PINGONE_AI_AGENT_CLIENT_ID="550e8400-e29b-41d4-a716-446655440000"
export PINGONE_AI_AGENT_CLIENT_SECRET="your-super-secret-key-here"
export PINGONE_AGENT_GATEWAY_AUDIENCE="https://agent-gateway.example.com"
export PINGONE_AI_AGENT_INTERMEDIATE_AUDIENCE="https://ai-agent-gateway.example.com"

# MCP Exchanger Credentials and Audience (Steps 3-4)
export AGENT_OAUTH_CLIENT_ID="660f9511-f39c-52e5-b827-557766551111"
export AGENT_OAUTH_CLIENT_SECRET="your-mcp-secret-key-here"
export PINGONE_MCP_GATEWAY_AUDIENCE="https://mcp-gateway.example.com"
export PINGONE_MCP_RESOURCE_URI_TWO_EXCHANGE="https://resource.example.com/mcp"

# Enable two-exchange in configuration
export ENABLE_TWO_EXCHANGE_DELEGATION="true"
```

---

## Configuration Validation Rules

The `validateTwoExchangeConfig()` function enforces these rules at application startup:

### Rule 1: AI Agent Credentials Must Be Present

**Check**: PINGONE_AI_AGENT_CLIENT_ID and PINGONE_AI_AGENT_CLIENT_SECRET exist

**Why**: Cannot initiate two-exchange without AI Agent credentials

**Error Message**:
```
CONFIGURATION_ERROR: AI Agent credentials not configured
Missing: PINGONE_AI_AGENT_CLIENT_ID or PINGONE_AI_AGENT_CLIENT_SECRET

Remediation:
1. Verify Super Banking AI Agent app exists in PingOne Admin → Applications
2. Copy Client ID and Client Secret from app settings
3. Set environment variables: 
   export PINGONE_AI_AGENT_CLIENT_ID="<your-client-id>"
   export PINGONE_AI_AGENT_CLIENT_SECRET="<your-secret>"
4. Restart server
```

### Rule 2: MCP Exchanger Credentials Must Be Present

**Check**: AGENT_OAUTH_CLIENT_ID and AGENT_OAUTH_CLIENT_SECRET exist

**Why**: Cannot complete two-exchange without MCP authenticator

**Error Message**:
```
CONFIGURATION_ERROR: MCP Exchanger credentials not configured
Missing: AGENT_OAUTH_CLIENT_ID or AGENT_OAUTH_CLIENT_SECRET

Remediation:
1. Verify MCP Token Exchanger app exists in PingOne Admin → Applications
2. Copy Client ID and Client Secret from app settings
3. Set environment variables:
   export AGENT_OAUTH_CLIENT_ID="<your-mcp-client-id>"
   export AGENT_OAUTH_CLIENT_SECRET="<your-mcp-secret>"
4. Restart server
```

### Rule 3: All 4 Audiences Must Be Explicitly Configured

**Check**: None of the 4 audience variables are missing or empty

**Why**: No hard-coded fallbacks; all audiences must be explicit

**Audiences Validated**:
1. `PINGONE_AGENT_GATEWAY_AUDIENCE` — Step 1 actor token audience
2. `PINGONE_AI_AGENT_INTERMEDIATE_AUDIENCE` — Step 2 exchange output audience
3. `PINGONE_MCP_GATEWAY_AUDIENCE` — Step 3 actor token audience
4. `PINGONE_MCP_RESOURCE_URI_TWO_EXCHANGE` — Step 4 final resource server audience

**Error Message** (if any missing):
```
CONFIGURATION_ERROR: Two-exchange requires all 4 audiences explicitly configured

Missing audience:
- PINGONE_AGENT_GATEWAY_AUDIENCE (Step 1 actor token audience)
- (other missing audiences listed)

Remediation:
1. Define PingOne Resource Indicators for each audience
2. Set corresponding environment variable:
   export PINGONE_AGENT_GATEWAY_AUDIENCE="https://your-gateway.com"
3. Repeat for all 4 audiences
4. Restart server
5. Verify via Admin UI → Configuration page
```

### Rule 4: Audience Values Must Be Non-Empty Strings

**Check**: Each audience is not null, undefined, or whitespace-only

**Why**: Empty audience cannot be used for token narrowing

**Error Message**:
```
CONFIGURATION_ERROR: ai_agent_intermediate_audience must be non-empty string

Found: "" (empty) or "   " (whitespace)

Remediation:
1. Check PINONE_AI_AGENT_INTERMEDIATE_AUDIENCE is not empty:
   echo $PINGONE_AI_AGENT_INTERMEDIATE_AUDIENCE
2. If empty, set the value:
   export PINGONE_AI_AGENT_INTERMEDIATE_AUDIENCE="https://your-intermediate-gateway.com"
3. Verify no trailing spaces in environment variable
4. Restart server
```

### Rule 5: Audiences Should Be Unique

**Check**: Each of the 4 audiences is different from the others

**Why**: Same audience indicates configuration copy-paste error; scope narrowing won't work

**Warning Message** (not error, but should be fixed):
```
CONFIGURATION_WARNING: Audience duplication detected

PINGONE_AI_AGENT_INTERMEDIATE_AUDIENCE == PINGONE_MCP_RESOURCE_URI_TWO_EXCHANGE

This may prevent proper RFC 8693 scope narrowing at Step 4.
Recommendation: Use distinct audiences for each step.
```

---

## Validation Output

### Successful Validation

When configuration is correct, startup logs show:

```
[Configuration] Two-Exchange Delegation Configuration Status
✅ AI Agent credentials: Present
✅ MCP Exchanger credentials: Present
✅ Agent Gateway Audience: https://agent-gateway.example.com
✅ AI Agent Intermediate Audience: https://ai-agent-gateway.example.com
✅ MCP Gateway Audience: https://mcp-gateway.example.com
✅ MCP Resource URI (Two Exchange): https://resource.example.com/mcp
✅ All audiences unique: Yes
✅ Validation: PASSED

Two-exchange delegation is ENABLED and ready.
```

### Configuration Validation Endpoint

After server starts, verify configuration programmatically:

```bash
# Returns configuration validation status
curl http://localhost:3001/api/admin/config/validate-two-exchange

# Expected response (success):
{
  "valid": true,
  "credentials": {
    "aiAgent": {
      "hasId": true,
      "hasSecret": true
    },
    "mcpExchanger": {
      "hasId": true,
      "hasSecret": true
    }
  },
  "audiences": {
    "agentGateway": "https://agent-gateway.example.com",
    "intermediate": "https://ai-agent-gateway.example.com",
    "mcpGateway": "https://mcp-gateway.example.com",
    "finalResource": "https://resource.example.com/mcp",
    "allUnique": true
  },
  "enabled": true
}

# Error response (invalid):
{
  "valid": false,
  "error": "CONFIGURATION_ERROR: AI Agent credentials not configured",
  "missingFields": ["PINGONE_AI_AGENT_CLIENT_SECRET"],
  "remediation": [
    "1. Set PINGONE_AI_AGENT_CLIENT_SECRET in environment",
    "2. Restart server"
  ]
}
```

---

## Common Configuration Issues

### Issue 1: "Two-exchange not configured" Error

**Symptom**: User enables two-exchange mode but gets error immediately

**Root Causes**:
- Missing environment variable(s)
- Credentials not set or mistyped
- Application restart didn't happen after setting env vars

**Diagnostic Steps**:
```bash
# Check if all env vars are set
env | grep -i "PINGONE\|AGENT_OAUTH"

# If missing, set and restart:
export PINGONE_AI_AGENT_CLIENT_ID="..."
export PINGONE_AI_AGENT_CLIENT_SECRET="..."
export AGENT_OAUTH_CLIENT_ID="..."
export AGENT_OAUTH_CLIENT_SECRET="..."
npm run start

# Verify via API endpoint
curl http://localhost:3001/api/admin/config/validate-two-exchange
```

**Solution**:
1. Set all 6 required variables (2 AI Agent + 2 MCP + 4 audiences)
2. Restart server
3. Check validation endpoint returns `valid: true`

---

### Issue 2: "Exchange #1 failed: may_act.sub missing"

**Symptom**: Step 2 of exchange returns error about missing may_act

**Root Cause**: User record doesn't have may_act attribute set

**Solution**:
```bash
# Via Admin UI:
1. Go to DemoData page (/admin/demo-data)
2. Toggle "2-Exchange Mode" ON
3. This sets may_act.sub = AI_AGENT_CLIENT_ID on your user record
4. Wait 30 seconds for token refresh
5. Try exchange again

# Or manually set via PingOne Admin:
1. Go to Identities → Users → Your User
2. Go to Profile Attributes tab
3. Set custom attribute "may_act" to: {"sub":"<AI_AGENT_CLIENT_ID>"}
```

---

### Issue 3: "Exchange #2 failed: act.sub mismatch"

**Symptom**: Step 4 (final exchange) fails with act.sub mismatch

**Root Cause**: 
- AGENT_OAUTH_CLIENT_ID doesn't match MCP Token Exchanger app in PingOne
- PINGONE_MCP_GATEWAY_AUDIENCE doesn't match app's Resource Indicator

**Solution**:
```bash
# Verify MCP app client ID
1. Go to PingOne Admin → Applications → MCP Token Exchanger
2. Copy Client ID
3. Verify AGENT_OAUTH_CLIENT_ID matches:
   echo $AGENT_OAUTH_CLIENT_ID

# Verify MCP audience
1. Go to PingOne Admin → Applications → MCP Token Exchanger
2. Go to Resource Indicators tab
3. Verify PINGONE_MCP_GATEWAY_AUDIENCE matches one of the listed URIs

# If mismatch, update and restart:
export AGENT_OAUTH_CLIENT_ID="<correct-client-id>"
export PINGONE_MCP_GATEWAY_AUDIENCE="<correct-resource-uri>"
npm run start
```

---

### Issue 4: "Invalid Client" Error (Any Step)

**Symptom**: Token request returns `invalid_client` error

**Root Cause**:
- Client ID doesn't exist in PingOne
- Client Secret is incorrect or expired
- Client Secret rotation happened but env var not updated

**Solution**:
```bash
# For Step 1 (AI Agent) errors:
1. Verify Super Banking AI Agent app exists:
   PingOne Admin → Applications → Super Banking AI Agent
2. Copy current Client Secret (in case it was rotated)
3. Update environment:
   export PINGONE_AI_AGENT_CLIENT_ID="<from-app>"
   export PINGONE_AI_AGENT_CLIENT_SECRET="<from-app>"
4. Restart server

# For Step 3 (MCP Exchanger) errors:
1. Verify MCP Token Exchanger app exists:
   PingOne Admin → Applications → MCP Token Exchanger
2. Copy current Client Secret
3. Update environment:
   export AGENT_OAUTH_CLIENT_ID="<from-app>"
   export AGENT_OAUTH_CLIENT_SECRET="<from-app>"
4. Restart server
```

---

### Issue 5: "Invalid Scope" Error (Any Step)

**Symptom**: Token request returns `invalid_scope` or audience not valid error

**Root Cause**: Audience not configured as Resource Indicator in PingOne app

**Solution**:
```bash
# Determine which step failed based on error message

# For Step 1 audit (PINGONE_AGENT_GATEWAY_AUDIENCE):
1. PingOne Admin → Applications → Super Banking AI Agent
2. Go to Resource Indicators tab
3. Add PINGONE_AGENT_GATEWAY_AUDIENCE if missing
4. Return to env, verify correct:
   echo $PINGONE_AGENT_GATEWAY_AUDIENCE
5. Restart server

# Repeat for other steps:
# Step 3: MCP Token Exchanger app + PINGONE_MCP_GATEWAY_AUDIENCE
# Step 4: Super Banking Resource Server app + PINGONE_MCP_RESOURCE_URI_TWO_EXCHANGE
```

---

## PingOne Setup Checklist

Before enabling two-exchange in production:

- [ ] **Create AI Agent App**
  - [ ] Name: "Super Banking AI Agent"
  - [ ] App Type: Web (Single Page Application or API)
  - [ ] Grant Type: Client Credentials
  - [ ] Resource Indicators: Add PINGONE_AGENT_GATEWAY_AUDIENCE
  - [ ] Copy Client ID → PINGONE_AI_AGENT_CLIENT_ID
  - [ ] Copy Client Secret → PINGONE_AI_AGENT_CLIENT_SECRET

- [ ] **Create MCP Exchanger App**
  - [ ] Name: "MCP Token Exchanger"
  - [ ] App Type: Web (API)
  - [ ] Grant Type: Client Credentials
  - [ ] Resource Indicators: Add PINGONE_MCP_GATEWAY_AUDIENCE
  - [ ] Copy Client ID → AGENT_OAUTH_CLIENT_ID
  - [ ] Copy Client Secret → AGENT_OAUTH_CLIENT_SECRET

- [ ] **Configure Audiences**
  - [ ] Define 4 distinct Resource Indicator URIs:
    - [ ] Agent gateway: PINGONE_AGENT_GATEWAY_AUDIENCE
    - [ ] Intermediate: PINGONE_AI_AGENT_INTERMEDIATE_AUDIENCE
    - [ ] MCP gateway: PINGONE_MCP_GATEWAY_AUDIENCE
    - [ ] Final resource: PINGONE_MCP_RESOURCE_URI_TWO_EXCHANGE
  - [ ] Add to respective PingOne apps' Resource Indicators

- [ ] **Configure Resource Server Token Mapper**
  - [ ] Go to Super Banking Resource Server app
  - [ ] Set act expression to generate nested act claims
  - [ ] Expression example: `$.act` (preserve incoming act claim)

- [ ] **Test Configuration**
  - [ ] Set all 6 environment variables
  - [ ] Start server: `npm run start`
  - [ ] Check validation endpoint: `curl http://localhost:3001/api/admin/config/validate-two-exchange`
  - [ ] Enable two-exchange in Admin UI
  - [ ] Test agent operation
  - [ ] Inspect token in browser: Should show nested act claims

---

## Environment Variable Validation Script

Add to your CI/CD to automatically verify configuration:

```bash
#!/bin/bash
# validate-two-exchange-config.sh

echo "Validating Two-Exchange Configuration..."

REQUIRED_VARS=(
  "PINGONE_AI_AGENT_CLIENT_ID"
  "PINGONE_AI_AGENT_CLIENT_SECRET"
  "PINGONE_AGENT_GATEWAY_AUDIENCE"
  "PINGONE_AI_AGENT_INTERMEDIATE_AUDIENCE"
  "AGENT_OAUTH_CLIENT_ID"
  "AGENT_OAUTH_CLIENT_SECRET"
  "PINGONE_MCP_GATEWAY_AUDIENCE"
  "PINGONE_MCP_RESOURCE_URI_TWO_EXCHANGE"
)

MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING+=("$var")
  fi
done

if [ ${#MISSING[@]} -eq 0 ]; then
  echo "✅ All required environment variables are set"
  exit 0
else
  echo "❌ Missing configuration:"
  for var in "${MISSING[@]}"; do
    echo "   - $var"
  done
  exit 1
fi
```

Usage in CI/CD:
```bash
./validate-two-exchange-config.sh || exit 1
npm run start
```

---

## References

- [TWO_EXCHANGE_DELEGATION_GUIDE.md](./TWO_EXCHANGE_DELEGATION_GUIDE.md) — Flow documentation
- [RFC8693_COMPLIANCE_REPORT.md](./RFC8693_COMPLIANCE_REPORT.md) — Compliance evidence
- [SECURITY_ANALYSIS.md](./SECURITY_ANALYSIS.md) — Threat model
- RFC 8693 §2.1 — Token Exchange Basics
- RFC 8693 §2.3 — Delegation Pattern
