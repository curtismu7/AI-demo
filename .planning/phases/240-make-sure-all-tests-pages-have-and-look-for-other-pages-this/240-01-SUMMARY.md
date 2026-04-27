---
plan: 240-01
status: complete
commits: [0341191f]
---
# Plan 240-01 Summary

Extended `PingOneApiPanel` with endpoint badge + docsUrl props. Wired all three test pages.

## What changed

**`PingOneApiPanel.jsx`** — Two new optional props:
- `endpoint: { method, url }` — explicit badge override (falls back to auto-derive from `request.method`/`request.url`)
- `docsUrl: string` — renders a "PingOne Docs ↗" link next to the badge

The endpoint badge is always-visible above the collapsible toggles. When `request` is present, the badge auto-derives from `request.method` and `request.url` — zero call-site changes needed for existing panels.

**`PingOneApiPanel.css`** — 5 new classes: `.p1-api-panel-endpoint-badge`, `.p1-api-panel-method`, `.p1-api-panel-endpoint-url`, `.p1-api-panel-docs-link`.

**`MFATestPage.jsx`** — `TestCard` gains `docsUrl` prop (passed through to PingOneApiPanel). 11 TestCard call sites wired with correct PingOne docs URLs:
- Enroll SMS Device → `#post-create-device-sms`
- Activate SMS Device → `#post-activate-device`
- Enroll Email Device → `#post-create-device-email`
- Initiate FIDO2 Enrollment → `#post-create-device-fido2`
- Complete FIDO2 Registration → `#post-activate-device`
- Initiate SMS OTP → `#post-send-otp-sms-email`
- Verify SMS OTP → `#post-check-otp`
- Initiate Email OTP → `#post-send-otp-sms-email`
- Verify Email OTP → `#post-check-otp`
- Initiate FIDO2 Challenge → `#post-authenticate-with-fido2`
- Verify FIDO2 → `#post-authenticate-with-fido2`

**`AuthzTestPage.jsx`** — Both existing `<PingOneApiPanel>` calls get `docsUrl="#post-evaluate-decision"`.

**`PingOneTestPage.jsx`** — `TestCard` gains `docsUrl` prop. 8 call sites with pingoneRequest wired:
- Agent Token (CC) → `#post-token`
- 2-Exchange → `#post-token`
- ID Token Exchange (186) → `#post-token`
- Simple 1-Exchange (401) → `#post-token`
- Applications → `#get-read-all-applications`
- Resource Servers → `#get-read-all-resources`
- Scopes → `#get-read-all-resource-scopes`
- Users → `#get-read-all-users`

**DelegatedAccessPage** — audited, has no existing pingoneRequest/pingoneResponse state flowing to PingOneApiPanel — left untouched per D-04.

## Build

`cd banking_api_ui && npm run build` → exit 0, no new errors.
