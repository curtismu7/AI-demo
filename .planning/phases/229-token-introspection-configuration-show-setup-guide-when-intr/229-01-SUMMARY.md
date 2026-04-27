---
phase: 229
plan: 01
status: complete
completed_at: 2026-04-26
commit: 182ff132
---

# Summary — 229-01: Token Introspection Setup Guide

## What was done

Added an inline 3-step setup guide to `ConfigTokenValidation.tsx` that appears when the health check returns `not_configured`, replacing the bare hint string with actionable guidance.

### Changes

**`banking_api_ui/src/components/ConfigTokenValidation.tsx`**
- Added proactive info banner that shows when `validationMode === 'introspection'` and no health check has been run yet — prompts user to test and signals that a setup guide will appear if unconfigured
- Added `IntrospectionSetupGuide` block (inline JSX) rendered when `healthStatus?.status === 'not_configured'`
- Guide contains three numbered steps:
  1. Find the introspection endpoint URL (`https://auth.pingone.com/{env-id}/as/introspect`) with instructions to locate the Environment ID in PingOne Admin
  2. Create a Worker Application in PingOne (5-step numbered list: add app → worker type → copy client ID/secret → enable)
  3. Add the three env vars to `.env` with exact variable names and a restart note

**`banking_api_ui/src/components/ConfigTokenValidation.module.css`**
- Added `.proactiveBanner` — light blue info banner
- Added `.setupGuide`, `.setupGuideTitle`, `.setupStep`, `.setupStepHeader`, `.setupStepNum`, `.setupStepTitle`, `.setupStepBody`, `.setupCode`, `.setupNote` — styling for the guide card and numbered steps

## Files changed
- `banking_api_ui/src/components/ConfigTokenValidation.tsx`
- `banking_api_ui/src/components/ConfigTokenValidation.module.css`

## Verification
- `npm run build` passed (0 exit, 523.83 kB gzipped)
- Unit tests pass (SideNav, buttonRouting snapshots green)
- No backend changes — purely UI enhancement
- No raw credentials shown — guide instructs user on where to find values, never pre-fills secrets
