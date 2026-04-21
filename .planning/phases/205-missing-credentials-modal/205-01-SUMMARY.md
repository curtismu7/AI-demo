---
phase: 205
plan: 01
status: complete
---

# Summary — Missing Credentials Modal

## What was done
Created a self-service credentials modal workflow that detects missing OAuth/worker credentials and prompts users to fill them in with PingOne setup guidance.

### New files
- `banking_api_ui/src/components/MissingCredentialsModal.jsx` — Modal UI with dynamic form fields, PingOne setup guidance per credential type, keyboard handling (Escape/Enter), dark mode support
- `banking_api_ui/src/components/MissingCredentialsModal.css` — Styling matching existing banking design system
- `banking_api_ui/src/services/credentialsService.js` — `submitCredentials()` and `getMissingCredentials()` API calls
- `banking_api_server/routes/configCredentials.js` — BFF endpoints: GET `/api/config/credentials/missing` (check what's missing per action type) and POST `/api/config/credentials/set` (validate + save to configStore with whitelist enforcement)

### Modified files
- `banking_api_server/server.js` — Registered configCredentials route
- `banking_api_ui/src/App.js` — Added MissingCredentialsModal state, `missing-credentials` event listener, modal render with dynamic import for submit handler

## How it works
1. Any component can dispatch `window.dispatchEvent(new CustomEvent('missing-credentials', { detail: { missingFields, credentialType, message } }))`
2. App.js catches the event and opens the modal
3. User fills in fields (with PingOne setup instructions displayed)
4. On submit, credentials are POSTed to BFF which validates against a whitelist and persists to configStore
5. Modal closes on success

## Credential types supported
- `customer_oauth` — Customer OAuth app (client_id, client_secret)
- `admin_oauth` — Admin OAuth app
- `worker_token` — Worker app (worker_app_id, worker_app_secret)
- `ai_agent` — AI Agent app
- `environment` — PingOne environment ID

## Verification
- `npm run build` exits 0
- Input validation (required fields, whitelist enforcement)
- No open redirect or injection vectors (config keys whitelisted server-side)
