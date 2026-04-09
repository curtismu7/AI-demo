---
quick_id: 260409-a0o
title: Configure PingOne post_logout_redirect_uri for logout flow
created: 2026-04-09
---

# Quick Task: Configure PingOne Logout URIs

## Problem

The `/api/auth/logout` endpoint in the BFF redirects to PingOne's `/as/signoff` endpoint for RP-Initiated Logout. However, **PingOne apps don't have the post_logout_redirect_uri configured**, so the flow fails silently — users are logged out but never redirected back to the app.

## Solution

Configure the `postLogoutRedirectUris` in BOTH PingOne applications (Admin + User) to include:
- `http://localhost:3000/logout` (local dev, standard npm start)
- `http://localhost:4000/logout` (local dev, run-bank.sh)
- `https://{your-vercel-deployment}.vercel.app/logout` (Vercel production)

## Current Implementation Status

✅ **Backend logout flow exists**
- `/api/auth/oauth/logout` endpoint revokes tokens, destroys session, redirects to PingOne signoff
- Uses `id_token_hint` for proper session termination

✅ **Frontend logout handler exists**
- Logout button triggers `/api/auth/logout`
- App detects `/logout` path and clears session
- Redirects back to home (`/`)

✅ **LogoutPage component created** (2026-04-09)
- Styled landing page showing "You're signed out"
- Auto-redirects to home after 3 seconds
- Dark mode support, responsive design

❌ **PingOne configuration missing**
- postLogoutRedirectUris not set on PingOne apps
- Users never redirected back after sign-off

## Action Items

1. **Configure in PingOne Console**
   - Log in to PingOne Administration Console
   - For BOTH "Super Banking Admin" and "Super Banking User" apps:
     - Go to Applications → {app} → Redirect URIs section
     - Add: `http://localhost:3000/logout` (standard dev)
     - Add: `http://localhost:4000/logout` (run-bank.sh dev)
     - Add: `https://{your-vercel-deployment}.vercel.app/logout` (production)
     - Save

2. **Test the flow**
   - Login as admin or user
   - Click logout button in the app
   - Verify: Session cleared, LogoutPage displays, redirects to home after 3s
   - Console should show no errors

## Deployment URLs

**Local Development (Standard)**
- UI: `http://localhost:3000`
- API: `http://localhost:3001`
- Logout URI: `http://localhost:3000/logout`
- Start: `npm start` in banking_api_ui and banking_api_server

**Local Development (run-bank.sh)**
- UI: `http://localhost:4000`
- API: `http://localhost:3002`
- Logout URI: `http://localhost:4000/logout`
- Start: `bash run-bank.sh` from Banking root

**Production (Vercel)**
- Get deployment URL from Vercel dashboard or `vercel --prod` output
- Format: `https://banking-demo-{yourname}.vercel.app`
- Logout URI: `https://banking-demo-{yourname}.vercel.app/logout`

## Verification Checklist

- [ ] Both PingOne apps have all three redirect URIs added
- [ ] Local development logout works (port 3000 or 4000)
- [ ] Vercel production logout works after deployment
- [ ] LogoutPage displays with countdown animation
- [ ] Browser console shows no 401/403 errors
- [ ] User can log back in immediately after logout
