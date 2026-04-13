---
created: 2026-04-04T12:44:46.184Z
title: Require login for all bank account actions; block unauthenticated transfers
area: auth
files:
  - banking_api_server/server.js
  - banking_api_server/services/mcpLocalTools.js
  - banking_api_server/middleware/
  - banking_api_ui/src/components/BankingAgent.js
  - banking_api_ui/src/pages/Home.js
---

## Problem

A user can currently perform banking actions (including a $100 transfer) **without being logged in at all**. There is no server-side auth guard on the MCP tool execution path that enforces an active session before processing any banking tool call.

Three related requirements from UAT:

1. **Any bank account action requires at minimum a logged-in session.** If no session exists, the action must be blocked — both on the server and in the client.

2. **OTP / step-up for high-value transactions** (already tracked in `2026-04-01-wire-ciba-step-up-otp-modal-for-banking-write-actions.md`) is a second layer on top of login — but login is layer zero and currently missing entirely.

3. **Home page must not carry a session.** The marketing/home page should be stateless — no "you are logged in" state should bleed from a previous dashboard session onto the home page experience.

4. **If a session IS present** (user browsed to dashboard then back), show a subtle indicator ("Logged in as [name] · Go to Dashboard") rather than silently acting as if unauthenticated or silently auto-redirecting.

## Solution

### Server-side (layer zero)
- Add a `requireSession` middleware (or check `req.session.user` / `req.session.tokens`) to the `POST /api/mcp/tool` handler **before** the tool call is dispatched.
- Return `401 { error: 'unauthenticated' }` if no valid session — the client should never reach tool execution without a session.
- Same check on `POST /api/banking/*` write routes.

### Client-side agent gate (belt and suspenders)
- In `BankingAgent.js` intent dispatch (before `runAction`), if `user === null`, block the action immediately and show: "Please sign in to perform banking operations. [Sign in →]"
- Do NOT fall through to the BFF — catch it client-side before any API call.
- Note: `2026-04-02-add-unauthenticated-agent-chip-group...` covers the chips UX; this covers the hard gate on actual action execution.

### Home page session isolation
- On the Home (`/`) page, do NOT check for or display session state in the main hero/CTA — keep it stateless.
- If `user !== null` (session in store), render a **non-intrusive session banner** (e.g. top bar or small chip): "Welcome back, [First Name] · [Go to Dashboard]" — so the user knows they're still logged in without disrupting the public landing experience.
- Do NOT auto-redirect from Home to Dashboard (let the user choose).

### Transfer amount threshold vs. login
- Login (session) = required for ALL amounts.
- Step-up OTP = required for HIGH VALUE amounts (threshold configurable, currently $200+ or as set by `STEP_UP_THRESHOLD`).
- These are independent gates; both must pass for a high-value write action.
