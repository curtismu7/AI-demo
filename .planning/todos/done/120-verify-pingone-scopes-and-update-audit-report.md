---
status: pending
area: auth
priority: high
created: 2026-04-10
dependency: Phase 120 - Scope Configuration Audit
related: docs/SCOPE_AUDIT_FINAL_REPORT.md, docs/SCOPE_CONFIGURATION_VERIFICATION.md
---

# Verify PingOne Resource Scopes and Update Phase 120 Audit Report

## Goal
Verify that all PingOne resource servers have the correct scopes attached, and populate the SCOPE_AUDIT_FINAL_REPORT.md with actual findings from PingOne.

## Context
Phase 120 audit identified scope configuration issues but was unable to directly access PingOne to verify actual scopes attached to each resource. This todo captures the verification step.

## Required Steps

### 1. Create/Obtain Worker App Credentials
- [ ] Create a PingOne Worker application (if not exists)
- [ ] Copy Client ID and Client Secret to .env as:
  - `PINGONE_MGMT_CLIENT_ID=<...>`
  - `PINGONE_MGMT_CLIENT_SECRET=<...>`

### 2. Run the Verification Script
```bash
cd banking_api_server
npm run verify:scopes
```
- Captures all PingOne resources and their current scopes
- Compares against expected scopes from code
- Identifies missing required/optional scopes

### 3. Document Findings
Update `docs/SCOPE_AUDIT_FINAL_REPORT.md`:
- [ ] **Finding 2 (PingOne Resource Inventory):** Replace placeholder with actual resource IDs and scopes from verification
- [ ] **Finding 3 (Mismatch Analysis):** Add actual scope attachment status for each resource
- [ ] Add audit timestamp and verification method used
- [ ] Include resource-to-scope binding table with actual PingOne configuration

### 4. Fix Missing Scopes (if needed)
- [ ] If scopes are missing, either:
  - **Option A:** Manually add via PingOne UI
  - **Option B:** Run `npm run verify:scopes:fix` to auto-create missing scopes
- [ ] Re-run verification to confirm all scopes present

### 5. Update Report with Actual Configuration
- [ ] Add actual resource URIs and IDs to report
- [ ] Update success criteria: actual scope coverage
- [ ] Confirm go/no-go status based on actual data

## Deliverable
`docs/SCOPE_AUDIT_FINAL_REPORT.md` populated with:
- ✅ Actual PingOne resource IDs and URIs
- ✅ Current scopes attached to each resource
- ✅ Missing scope list (if any)
- ✅ Verification timestamp
- ✅ Go/no-go recommendation based on actual findings

## Success Criteria
- [ ] All 7 PingOne resources verified and documented
- [ ] Expected scopes (29 total) mapped to resources
- [ ] Missing scopes identified (if any) and noted
- [ ] Audit report updated with actual findings
- [ ] Go/no-go decision made: ready for demo launch or identified blockers

## Time Estimate
30-45 minutes (depending on scope fixes needed)

## Notes
- Verification script is at: `banking_api_server/scripts/verify-scope-configuration.js`
- Script requires PingOne worker app credentials in .env
- Supports `--fix` flag to auto-create missing scopes
- See `docs/SCOPE_CONFIGURATION_VERIFICATION.md` for detailed setup + troubleshooting
