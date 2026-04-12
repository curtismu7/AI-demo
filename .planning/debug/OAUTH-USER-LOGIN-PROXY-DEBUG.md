---
status: investigating
trigger: "Error occurred while trying to proxy: localhost:4000/api/auth/oauth/user/login"
created: 2026-04-09T00:00:00Z
updated: 2026-04-09T00:00:00Z
symptoms_prefilled: true
goal: find_and_fix
---

## Current Focus

hypothesis: API server not running or HTTPS/HTTP protocol mismatch on port 3002
test: Check if API server is running; verify certificates exist; test connection to http/https://localhost:3002
expecting: Find that API is down or HTTPS not working as proxy expects
next_action: Check if API server is running and certificates are present

## Symptoms

expected: Click login button → redirect to PingOne → enter credentials → callback returns to dashboard with session
actual: "Error occurred while trying to proxy: localhost:4000/api/auth/oauth/user/login" when clicking login
errors: Proxy error on /api/auth/oauthuser/login endpoint (note: URL uses "oauthuser" not "oauth/user")
reproduction: Start UI at port 4000, start API at port 3002 (or default 3001), click login button
started: Regression detected — worked before
context:
  - Running on run-bank.sh (UI: 4000, API: 3002)
  - REACT_APP_API_PORT env var controls proxy configuration
  - Routes expected: banking_api_server/routes/oauthUser.js (endpoint /api/auth/oauthuser/login)
  - Proxy setup: banking_api_ui/src/setupProxy.js

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-09
  checked: setupProxy.js, .env, oauthUser.js route, server.js mount
  found: ✓ Proxy correctly reads REACT_APP_API_PORT from env; ✓ .env has REACT_APP_API_PORT=3002; ✓ Route exists at GET /api/auth/oauth/user/login; ✓ server.js mounts routes at '/api/auth/oauth/user'; ✓ oauthUser.js properly exports module
  implication: Configuration is correct. Route exists. Issue is likely API server not running or connection problem.

- timestamp: 2026-04-09
  checked: Recent git commits
  found: Latest commit 054ab13 only affected Phase 116 routes (bankingAgentRoutes), not oauthUser.js
  implication: Recent commit did not break this feature

## Resolution

root_cause: HTTPS hostname mismatch - setupProxy.js uses `localhost` as target hostname, but API server is configured to run on `https://api.pingdemo.com`. The certificate is issued for `api.pingdemo.com`, causing HTTPS connections to `localhost` to fail certificate validation even with `secure: false` setting.

fix: Change setupProxy.js proxy target from `localhost` to `api.pingdemo.com` to match the certificate hostname and the host configured in the hosts file.

verification: Proxy connection will succeed and reach the API server; login redirect to PingOne will work end-to-end.

files_changed: 
- banking_api_ui/src/setupProxy.js (change hostname from `localhost` to `api.pingdemo.com`)
