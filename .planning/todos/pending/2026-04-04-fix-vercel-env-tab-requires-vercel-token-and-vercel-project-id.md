---
created: "2026-04-04T18:04:37.686Z"
title: "Fix Vercel Env tab requires VERCEL_TOKEN and VERCEL_PROJECT_ID"
area: "ui"
files:
  - banking_api_ui/src/components/VercelConfigTab.js
  - banking_api_ui/src/components/Config.js
---

## Problem

The **Vercel Env** tab at `/config` shows:

> "VERCEL_TOKEN and VERCEL_PROJECT_ID must be set to use this feature."

with just a **Retry** button — no explanation, no guidance on where/how to set them. This makes the tab look broken on local dev and on Vercel deployments that don't have those vars configured.

With Phase 38 we made the tab bar always visible (previously gated on `hostedOn === 'vercel'`), which means this error now shows on localhost too where it was previously hidden.

Two issues:
1. **Unhelpful error UX** — no instructions on how to get `VERCEL_TOKEN` (Vercel dashboard → Account Settings → Tokens) or `VERCEL_PROJECT_ID` (project settings or `vercel.json`).
2. **Always-visible tab** — the Vercel Env tab probably should remain hidden (or clearly disabled) on non-Vercel deployments, since the credentials will never be available locally.

## Solution

Option A (preferred): Re-gate the **Vercel Env** tab so it only appears when `hostedOn === 'vercel'` — consistent with original behavior. The Worker App tab added in Phase 38 is always useful; Vercel Env is only useful on Vercel.

Option B: Keep tab always visible but replace the raw error with actionable guidance: instructions linking to Vercel token docs + code snippet for setting the env vars.

Files to check:
- `banking_api_ui/src/components/VercelConfigTab.js` — source of the error message
- `banking_api_ui/src/components/Config.js` — tab bar visibility condition changed in Phase 38 (line ~703)
