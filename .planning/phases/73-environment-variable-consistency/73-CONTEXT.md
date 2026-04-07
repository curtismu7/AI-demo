# Phase 73: Environment Variable Consistency — Context

**Status:** Ready for planning  
**Gathered:** 2026-04-07

## Problem Statement

Environment variables are inconsistent between localhost and Vercel deployments:

- Redirect URIs in `.env` still point to `api.pingdemo.com:3002` (local dev) instead of the canonical Vercel URL
- Several env vars set in Vercel production were never present in `.env` (e.g. `PINGONE_REGION`, `ENDUSER_AUDIENCE`, `CIBA_*`, `AI_AGENT_*`, `MCP_*` audience vars)
- `.env.example` is incomplete — doesn't reflect all variables actually needed in production
- No single authoritative list of required vars that works for both environments
- Developers stand up localhost pointing to wrong endpoints; Vercel was missing vars causing 500 errors

## Goal

Make environment variable handling **consistent and self-documenting** so that:

1. `.env` serves as the **canonical source of truth** for all required variables
2. `.env.example` is **complete and correct** — any developer can copy it, fill in secrets, and run locally or deploy to Vercel
3. All redirect URIs and URLs are **driven by a single `PUBLIC_APP_URL` env var** — no hardcoded hostnames anywhere
4. Vercel environment matches `.env` structure exactly — same key names, same defaults

## Scope

### In Scope
- Audit all env var references in `banking_api_server/` and `banking_api_ui/`
- Update `.env.example` to be complete and correct with inline comments
- Update `.env` to use `PUBLIC_APP_URL`-driven redirect URIs (removing `api.pingdemo.com:3002` hardcodes)
- Add a validation script `scripts/check-env.js` that verifies all required vars are set before server starts
- Document each variable with: purpose, required/optional, default, example value
- Ensure `runtimeSettings.js` and `configStore.js` defaults use env vars consistently

### Out of Scope
- Changing PingOne app configurations (redirect URIs registered in PingOne console must be updated separately)
- Changes to the MCP server environment
- UI env vars (React build-time vars are separate concern)

## Technical Areas

- `banking_api_server/.env` — fix hardcoded localhost URLs
- `banking_api_server/.env.example` — complete, accurate, documented
- `banking_api_server/config/runtimeSettings.js` — ensure all settings have correct env var fallbacks
- `banking_api_server/services/oauthRedirectUris.js` — verify `PUBLIC_APP_URL`-driven URI construction
- New: `scripts/check-env.js` — startup validation script
- `banking_api_server/server.js` — call check-env on startup in non-test environments

## Success Criteria

1. `cp .env.example .env && <fill secrets> && npm start` works on a fresh clone with zero extra config
2. All redirect URIs derived from `PUBLIC_APP_URL` — no hardcoded `localhost:3002` or `api.pingdemo.com` in `.env.example`
3. `check-env.js` catches missing required vars at startup with a clear error message
4. Vercel production env vars match `.env.example` key names exactly
5. No 500 errors from missing/wrong env vars after deployment
