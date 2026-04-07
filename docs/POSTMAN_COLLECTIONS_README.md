# Postman Collections - Super Banking Demo

This directory contains Postman collections and environments for testing the Super Banking demo application.

## Environment Files

### Localhost Development
- **`Super-Banking-Shared.postman_environment.json`** - Main shared environment with localhost defaults
  - `BANKING_API_BASE_URL` = `http://localhost:3001`
  - `MCP_SERVER_URL` = `http://localhost:8080`
  - Includes Vercel-specific variables for easy switching
  - Total: 21 variables

### Vercel Deployment
- **`Super-Banking-Vercel.postman_environment.json`** - Vercel-specific environment
  - `BANKING_API_BASE_URL` = `https://banking-demo-puce.vercel.app`
  - `MCP_SERVER_URL` = `https://banking-mcp-server.vercel.app`
  - Pre-configured for production testing

## Collections

### Core Token Exchange Collections
- **`Super Banking — 1-Exchange Step-by-Step.postman_collection.json`** - Single RFC 8693 exchange flow
- **`Super Banking — 1-Exchange Delegated Chain — pi.flow.postman_collection.json`** - 1-exchange with pi.flow
- **`Super Banking — 2-Exchange Delegated Chain — pi.flow.postman_collection.json`** - Chained RFC 8693 exchanges
- **`Super-Banking-Advanced-Utilities.postman_collection.json`** - PAZ policy decisions and token revocation

### MCP & BFF API Collections
- **`Super-Banking-MCP-Tools.postman_collection.json`** - Direct MCP server HTTP endpoints
- **`Super-Banking-MCP-Tools-Vercel.postman_collection.json`** - Same, but uses Vercel URLs by default
- **`Super-Banking-BFF-API.postman_collection.json`** - BFF API endpoints (audit, exchange-mode, RFC 9728, inspector)
- **`Super-Banking-BFF-API-Vercel.postman_collection.json`** - Same, but uses Vercel URLs by default

### Reference Collections
- **`AI-IAM-CORE Webinar.postman_collection.json`** - Webinar reference collection
- **`Super-Banking-1-Exchange-Step-by-Step.postman_collection.json`** - Step-by-step tutorial

## Usage

### Local Development
1. Import `Super-Banking-Shared.postman_environment.json` into Postman
2. Set your PingOne credentials and environment variables
3. Use the standard collections (localhost URLs)

### Vercel Testing
1. Import `Super-Banking-Vercel.postman_environment.json` into Postman
2. Set your PingOne credentials (same as localhost)
3. Use the `-Vercel` suffixed collections for direct Vercel URLs
4. Or use standard collections with the Vercel environment active

### Variable Reference
- `BANKING_API_BASE_URL` / `BANKING_API_BASE_URL_VERCEL` - BFF server URL
- `MCP_SERVER_URL` / `MCP_SERVER_URL_VERCEL` - MCP server URL
- `PINGONE_ENVIRONMENT_ID` - PingOne environment UUID
- `PINGONE_CORE_USER_CLIENT_ID` - End-user OAuth client ID
- `PINGONE_CORE_CLIENT_ID` - BFF/admin OAuth client ID
- `MCP_CLIENT_ID` - MCP service OAuth client ID
- `ENDUSER_AUDIENCE` - AI agent resource URI
- `MCP_RESOURCE_URI` - MCP server resource URI
- `BANKING_SENSITIVE_SCOPE` - `banking:sensitive:read`

## Environment Switching

You can switch between localhost and Vercel by:

1. **Method 1: Environment Switching**
   - Import both environment files
   - Switch between "Super Banking — Shared" and "Super Banking — Vercel" environments
   - Use the same collections (they'll pick up the active environment)

2. **Method 2: Collection Switching**
   - Use the standard collections with localhost environment
   - Use the `-Vercel` collections with any environment
   - Collections have hardcoded URL variables for their target deployment

## New Endpoints Coverage

The BFF API collections cover endpoints added in phases 29-34:

- `/api/mcp/audit` - BFF proxy to MCP audit events
- `/api/mcp/exchange-mode` - Get/set token exchange mode
- `/api/rfc9728` - RFC 9728 protected resource metadata
- `/api/mcp/inspector/invoke` - MCP tool invocation via BFF

## Phase 36 Updates

- ✅ Added Vercel environment variables to shared environment
- ✅ Created Vercel-specific environment file
- ✅ Created Vercel-specific collections for MCP Tools and BFF API
- ✅ All collections use variable references (no hardcoded URLs)
- ✅ Both localhost and Vercel deployments fully supported
