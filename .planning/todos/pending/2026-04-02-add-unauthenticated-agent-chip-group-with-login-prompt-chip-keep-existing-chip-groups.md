---
created: 2026-04-02T00:00:00.000Z
title: Add unauthenticated agent chip group with login prompt chip, keep existing chip groups
area: ui
files:
  - banking_api_ui/src/components/BankingAgent.js
  - banking_api_ui/src/components/BankingAgent.css
---

## Problem

When a user lands on the banking demo without logging in, the agent shows no useful chips — there is nothing to interact with until after authentication. This misses an opportunity to engage the user and demonstrate the agent's capabilities upfront. Additionally, there needs to be a clear pathway from the agent to initiate login.

## Solution

Add a new "pre-login" chip group to `BankingAgent.js` that is shown only when the user is NOT authenticated (i.e., no session/user object). This group should sit above (or replace temporarily) the existing chip groups when unauthenticated.

Requirements:
- Show a distinct "Pre-login" chip group when `user === null` (or session not established)
- Chips in this group should include demos the agent can run without account data — e.g., "What is OAuth?", "Explain PKCE", "What is MCP?", "Show me how this works"
- One chip MUST be a "Sign in to your account →" chip that navigates to the login/OAuth flow (same as the CTA button on the landing page)
- When the user IS authenticated, show all existing chip groups as-is — do NOT remove or modify them
- Pre-login chip group should have a visual distinction (e.g., slightly different header label like "Try without signing in" or "Get started")
- Chip groups should stack: pre-login group first, then authenticated groups (but authenticated groups only render after login)

Do not remove or reorder any existing chip groups.
