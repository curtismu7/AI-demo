# 29-06 SUMMARY — Sensitive Data Education Panel + Agent Chip

## What was done
Created the "Sensitive Data & Selective Disclosure" education panel and registered it in the education system. Added a suggestion chip in the banking agent for viewing full account details.

## Files created
- `banking_api_ui/src/components/education/SensitiveDataPanel.js` — Two-tab education drawer:
  - **Tab 1 "Least-Data Principle":** Explains field-level scopes, masking patterns (masked vs full response), why agents shouldn't receive full PII, and how this demo gates sensitive data via 3 layers (scope check + PAZ + consent).
  - **Tab 2 "RAR / RFC 9396":** RAR in one sentence, shows `authorization_details` JSON for banking data, explains per-object/per-action/per-session authorization, notes cross-reference to RARPanel.js.
  - Teal/blue-green accent color scheme; reuses canonical `EducationDrawer` + inline `Code`, `Section`, `Callout` helpers.

## Files modified
- `banking_api_ui/src/components/education/educationIds.js` — Added `SENSITIVE_DATA: 'sensitive-data'` to `EDU` object
- `banking_api_ui/src/components/education/EducationPanelsHost.js` — Imported `SensitiveDataPanel` and added `<SensitiveDataPanel isOpen={panel === EDU.SENSITIVE_DATA} onClose={close} initialTabId={tab} />`
- `banking_api_ui/src/components/education/educationCommands.js` — Added two entries:
  - `{ id: 'sensitive-data', label: '🔒 Sensitive Data & Selective Disclosure', panel: EDU.SENSITIVE_DATA, tab: 'least-data' }`
  - `{ id: 'sensitive-data-rar', label: '🔒 Selective Disclosure: RAR / RFC 9396', panel: EDU.SENSITIVE_DATA, tab: 'rar-selective' }`
- `banking_api_ui/src/components/BankingAgent.js` — Added `'Show me my full account details'` to `SUGGESTIONS_CUSTOMER` array (becomes a clickable "Try asking:" chip in the agent panel)

## Key decisions
- Tab 2 explicitly avoids duplicating `RARPanel.js` content — focused entirely on the banking selective-disclosure use-case
- Chip uses natural-language suggestion (matches existing chip pattern) rather than a direct tool dispatch button
- Panel uses same `EducationDrawer` import path as all other education panels (`'../shared/EducationDrawer'`)

## Verification
- `npm run build` → BUILD PASS (exit 0, Compiled successfully)
