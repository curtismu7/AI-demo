# 29-01 SUMMARY — Account Data Model Expansion

## What was done
Expanded the account data model to support 8 new banking-realistic fields and changed the account number format from short `CHK-{UID}` / `SAV-{UID}` to a full 12-digit numeric value.

## Files modified
- `banking_api_server/data/store.js` — Added JSDoc comment documenting the full account schema (12 fields including new ones)
- `banking_api_server/routes/accounts.js` — Updated `provisionDemoAccounts` to generate 12-digit `accountNumberFull` + masked `accountNumber` + 7 new fields (routingNumber, swiftCode, iban, branchName, branchCode, openedDate, accountHolderName). Updated GET `/api/accounts/my` response shaping to include all public fields, mask accountNumber, and omit accountNumberFull and routingNumber.
- `banking_api_server/services/mcpLocalTools.js` — Updated `ensureAccounts` with identical provisioning. Added `get_sensitive_account_details` local fallback that returns `{ ok: false, consent_required: true, reason: 'sensitive_data_access' }`.

## Key decisions
- `accountNumberFull` stored as 12-digit string (`01<10-digit-N>` for checking, `02<...>` for savings)
- `accountNumber` stored as masked `****XXXX` (last 4 digits of full number)
- `routingNumber` and `accountNumberFull` intentionally omitted from GET `/api/accounts/my` response
- Public fields included in GET `/api/accounts/my`: swiftCode, iban, branchName, branchCode, openedDate, accountHolderName (populated from token claims)

## Verification
- `node /tmp/test_store.js` → PASS: store accepts new fields
- `node -e "require('./routes/accounts')"` → PASS: loads without error
