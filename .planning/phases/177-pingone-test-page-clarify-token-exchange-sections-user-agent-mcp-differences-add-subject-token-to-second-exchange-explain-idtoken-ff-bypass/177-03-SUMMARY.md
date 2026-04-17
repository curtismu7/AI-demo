---
plan: 177-03
status: complete
---

## Summary

Extended diagnose-mcp-exchange to perform actual test exchange and validate token claims (aud, scope, client_id). Returns claimValidation with issues array. Extended fix-mcp-exchange with Step 6 to correct audience mismatch. Frontend shows claim validation in diagnostic panel. Fix button now appears when claims have issues, not just when config is missing.

## Key Files
- banking_api_server/routes/pingoneTestRoutes.js — Claim validation in diagnose, audience fix in fix route
- banking_api_ui/src/components/PingOneTestPage.jsx — Claim validation UI, updated notifications

## Commit
92916f7
