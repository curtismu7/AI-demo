# 29-04 SUMMARY — UI Consent Banner + BankingAgent.js Wiring

## What was done
Created the `SensitiveConsentBanner` React component and wired it into `BankingAgent.js` so that when the `get_sensitive_account_details` MCP tool returns `consent_required: true`, the agent panel displays an inline amber banner prompting the user to Reveal or Deny access.

## Files modified
- `banking_api_ui/src/components/SensitiveConsentBanner.js` — **New file.** Inline consent banner component. Props: `onReveal`, `onDeny`, `loading`. Amber/gold border (`#d4a017`), dark background (`#2a2a1a`), lock icon, "Reveal" and "Deny" buttons.
- `banking_api_ui/src/components/BankingAgent.js` — 7 targeted changes:
  1. **Imports:** Added `callMcpTool` from `bankingAgentService` + `SensitiveConsentBanner`
  2. **ACTIONS array:** Added `{ id: 'sensitive-account-details', label: '👁 View Sensitive Account Details', desc: '...' }`
  3. **State:** Added `sensitiveConsentPending` (null or `{actionId, form}`) and `sensitiveConsentLoading` (boolean)
  4. **Switch case:** Added `case 'sensitive-account-details': response = await callMcpTool('get_sensitive_account_details', {})`
  5. **Detection:** Added `isSensitiveConsentNeeded` check before `isAgentToolErrorResult` — checks `consent_required === true && reason === 'sensitive_data_access'`
  6. **Handlers:** Added `handleSensitiveReveal` (POSTs to `/api/accounts/sensitive-consent`, then retries with `runAction`) and `handleSensitiveDeny`
  7. **Render:** Added `{sensitiveConsentPending && <SensitiveConsentBanner .../>}` near `hitlPendingIntent` banner

## Key decisions
- Used `consent_required: true` + `reason: 'sensitive_data_access'` as the discriminator (NOT `consent_challenge_required`) to avoid conflating with the HITL flow
- The reveal handler posts to `/api/accounts/sensitive-consent` then automatically retries the original `sensitive-account-details` action
- Inline styles only in `SensitiveConsentBanner.js` (no new CSS file)

## Verification
- `npm run build` → BUILD PASS (exit 0)
