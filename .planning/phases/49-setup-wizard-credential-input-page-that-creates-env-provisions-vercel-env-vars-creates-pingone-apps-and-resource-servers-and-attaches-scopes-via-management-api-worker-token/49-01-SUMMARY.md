---
phase: 49-setup-wizard-credential-input-page-that-creates-env-provisions-vercel-env-vars-creates-pingone-apps-and-resource-servers-and-attaches-scopes-via-management-api-worker-token
plan: "01"
subsystem: api
tags: [pingone, management-api, provision, sse, setup-wizard, express]

requires: []
provides:
  - pingoneProvisionService.js — full PingOne provisioning via Management API (apps, resource server, scopes, users, env vars)
  - setupWizard.js — SSE streaming API (/api/admin/setup/run, /api/admin/setup/recreate)
  - server.js mount at /api/admin/setup (behind requireAdmin)

affects: [setup-wizard, onboarding, admin, pingone-api-calls]

tech-stack:
  added: []
  patterns:
    - "SSE streaming: res.writeHead(200, {'Content-Type': 'text/event-stream'}) + res.write('data: ...\n\n')"
    - "Idempotent provisioning: check exists before create, emit skip with resourceKey for Recreate"
    - "PingOne Management API: PUT not PATCH for app updates; vnd.pingidentity.password.set+json for passwords"

key-files:
  created:
    - banking_api_server/services/pingoneProvisionService.js
    - banking_api_server/routes/setupWizard.js
  modified:
    - banking_api_server/server.js

key-decisions:
  - "Protected behind requireAdmin middleware, not just authenticateToken"
  - "SSE streams one event per provisioning step: { step, icon, message, resourceKey? }"

patterns-established:
  - "provisionEnvironment(config, onStep) pattern for streaming long-running operations"

requirements-completed: [SETUP-01, SETUP-02, SETUP-03]

duration: N/A (implemented prior to summary)
completed: 2026-04-08
---

# Phase 49-01: BFF Provisioning Service + SSE API Summary

**Setup wizard BFF is fully implemented — PingOne Management API provisioner with SSE streaming enables one-click environment setup.**

## What Was Built

- **pingoneProvisionService.js** (993 lines): Orchestrates all PingOne resource creation — Admin OIDC app, User OIDC app, Resource Server (banking_api_enduser audience), banking scopes, demo users (bankuser/bankadmin with passwords), env file writing and Vercel env var setting. Idempotent — checks existence before creating, emits skip events with resourceKey for Recreate. Exports: `provisionEnvironment`, `recreateResource`, `checkResourceExists`.
- **setupWizard.js** (373 lines): SSE streaming route. `POST /api/admin/setup/run` accepts worker credentials, streams live per-step progress. `POST /api/admin/setup/recreate` deletes and recreates a specific resource. Both protected with `requireAdmin`.
- **server.js**: Mounted at `app.use('/api/admin/setup', setupWizardRoutes)`.

## Verification

- `node -e "const s = require('./banking_api_server/services/pingoneProvisionService'); console.log(Object.keys(s))"` → provisionEnvironment, recreateResource, checkResourceExists
- `node -e "require('./banking_api_server/routes/setupWizard'); console.log('OK')"` → OK
- server.js line 893: `app.use('/api/admin/setup', setupWizardRoutes)` ✓
- SSE `text/event-stream` content type confirmed in route ✓

## Notes

Implementation existed in codebase prior to SUMMARY being written. Files created via commits on the main branch; SUMMARY retroactively documented 2026-04-08.
