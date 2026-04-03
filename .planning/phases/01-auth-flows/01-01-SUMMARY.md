# Summary: 01-01 — Landing Page Polish

**Phase:** 01-auth-flows
**Plan:** 01-01
**Completed:** 2026-03-31
**Commit:** 9d19e65

## What Was Built

Added two UI improvements to `LandingPage.js` + `LandingPage.css` for AUTH-03:

1. **Inline demo credential hints** — shown in the hero whenever `marketingCfg.userHint` is non-empty. Renders as a monospace strip with User/Pass fields directly below the sign-in hint paragraph. No config panel required for the presenter — credentials appear automatically when `marketing_demo_username_hint` is set in demo config.

2. **"3 Auth Flows in this Demo" card** — a compact card below the credential hints naming the three flows (Home Login, CIBA, Agent-triggered Login) with an "Open Education Panel →" button that fires the `education-open` custom event targeting the `login-flow` panel.

## Files Changed

- `banking_api_ui/src/components/LandingPage.js` — inserted credential hints block + auth-flows card after hero-signin-hint paragraph
- `banking_api_ui/src/components/LandingPage.css` — added `.landing-demo-credentials`, `.landing-demo-cred-label`, `.landing-demo-cred-item`, `.landing-demo-cred-key`, `.landing-auth-flows-card`, `.landing-auth-flows-title`, `.landing-auth-flows-list`, `.landing-auth-flows-link` styles

## Verification

- `npm run build` → `Compiled successfully.` ✓
- Existing login buttons (Customer / Admin) unchanged ✓
- Slide panel drawer hints unchanged ✓
- toast config unchanged ✓
- `marketingCfg.mode` branch logic unchanged ✓

## Key Decisions

- Credential hints are additive (conditional render) — when `userHint` is empty, the block is invisible
- Education panel link uses existing `education-open` event (same pattern as other panels)
- CSS placed immediately before `.hero-signin-hint` for co-location

## Self-Check: PASSED
