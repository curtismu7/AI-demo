# 29-05 SUMMARY — DemoDataPage Account Profile Fields Section

## What was done
Added an "Account Profile Fields" section to `DemoDataPage.js` (the Demo Config page) that lets the demo operator configure all 8 extended account fields per enabled account type, with visibility toggles for sensitive fields. Also extended the backend `demoScenario` route to persist and return these settings.

## Files modified
- `banking_api_ui/src/components/DemoDataPage.js`
  - Added `defaultAccountProfile(type, accountHolderName)` helper function (defaults: SWIFT code, IBAN, branch details, routing number, etc.)
  - Added `accountProfiles` and `accountProfileSaving` state
  - Extended `load()` to populate `accountProfiles` from `scenario.accountProfileFields` merged with defaults
  - Added `handleSaveAccountProfiles()` — saves via `saveDemoScenario({ accountProfileFields: ... })`
  - Added "Account Profile Fields" JSX section (placed before the Agent Scope Permissions section); renders per-account sub-sections for all enabled account types; public fields: swiftCode, iban, branchName, branchCode, openedDate, accountHolderName; sensitive fields in an amber sub-box: routingNumber + includeRoutingNumber toggle, accountNumberFull + includeAccountNumberFull toggle
- `banking_api_server/routes/demoScenario.js`
  - GET handler: added `accountProfileFields: scenario.accountProfileFields || {}` to response
  - PUT handler: added `accountProfileFields` save block — accepts and stores any object value via `demoScenarioStore.save()`

## Key decisions
- Section placed OUTSIDE the main `<form>` (its own Save button), consistent with "Agent Scope Permissions" and "Marketing Page Login" sections
- `includeRoutingNumber` and `includeAccountNumberFull` toggles are demo-layer controls — real security is the scope+PAZ gate from Plan 02, not these flags
- `accountNumberFull` defaults to empty string (not pre-populated from provisioned account since GET /api/accounts/my intentionally omits it)
- Backend uses permissive storage (any object) — validation is not needed for demo-only config data

## Verification
- `npm run build` → BUILD PASS (exit 0)
