# Phase 07 / Plan 01 — SUMMARY

## What was built

Added **RFC 9728 Protected Resource Metadata** support to the BX Finance BFF.

### New file
- `banking_api_server/routes/protectedResourceMetadata.js` — Express router that builds and serves the RFC 9728 JSON document

### Modified file
- `banking_api_server/server.js` — Added `require` and registered two routes

## Routes registered

| URL | Handler |
|-----|---------|
| `GET /.well-known/oauth-protected-resource` | `protectedResourceMetadataRoutes` (root path) |
| `GET /api/rfc9728/metadata` | `protectedResourceMetadataRoutes` (`/metadata` path) |

## Response shape

```json
{
  "resource": "https://<PUBLIC_APP_URL or req.host>/api",
  "authorization_servers": ["https://auth.pingone.com/<PINGONE_ENVIRONMENT_ID>/as"],
  "bearer_methods_supported": ["header"],
  "scopes_supported": [
    "banking:read", "banking:write", "banking:admin",
    "banking:accounts:read", "banking:transactions:read", "banking:transactions:write"
  ],
  "resource_name": "BX Finance Banking API",
  "resource_documentation": "https://datatracker.ietf.org/doc/html/rfc9728"
}
```

`authorization_servers` is omitted when `PINGONE_ENVIRONMENT_ID` is not set.

## Commit
`b692bdb` feat(07-01): add RFC 9728 protected resource metadata endpoint

## Requirements satisfied
- RFC9728-01 ✅
