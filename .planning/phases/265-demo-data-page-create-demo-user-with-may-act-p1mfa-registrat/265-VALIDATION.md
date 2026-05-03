# Phase 265: Validation Plan

## Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (CRA default) |
| Config file | `banking_api_ui/package.json` (CRA), `banking_api_server/jest.config.js` |
| Quick run command | `cd banking_api_ui && CI=true npm test -- --testPathPattern=DemoDataPage --watchAll=false` |
| Full suite command | `cd banking_api_ui && CI=true npm test --watchAll=false` |
| Build verification | `cd banking_api_ui && npm run build` (exit 0 required per CLAUDE.md) |

## Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Status |
|--------|----------|-----------|-------------------|--------|
| D-11 | Email input + Provision button render | unit | `CI=true npm test -- --testPathPattern=DemoDataPage` | Existing test file covers render |
| D-12 | Step log renders after provision | unit | same | Existing test file |
| D-13 | Credential card renders on success | unit | same | Existing test file |
| D-15 | POST /api/demo/provision-user route | unit | `cd banking_api_server && npm test -- --testPathPattern=demoProvisioning` | New file — deferred (see note) |
| D-18 | requireAdmin blocks non-admin | unit | same | New file — deferred (see note) |

**Deferred note:** D-15 and D-18 unit tests for the new BFF route are deferred to a follow-up phase. The existing `DemoDataPage.test.js` covers the UI tier; the route is validated at phase gate by `npm run build` exit 0 and manual smoke test.

## Sampling Rate

- **Per task commit:** `cd banking_api_ui && CI=true npm run build` (exit 0)
- **Per wave merge:** `cd banking_api_ui && CI=true npm test --watchAll=false`
- **Phase gate:** Build exit 0 + no new test failures before `/gsd-verify-work`

## Security Controls Validated

| ASVS Category | Control | Verified By |
|---------------|---------|-------------|
| V4 Access Control | `requireAdmin` on POST /api/demo/provision-user | grep + manual smoke |
| V5 Input Validation | Email validated server-side before PingOne call | grep for email validation in demoProvisioning.js |
