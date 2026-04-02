---
created: 2026-04-02T00:00:00.000Z
title: Add unauthenticated agent chip group with login prompt chip, keep existing chip groups
area: ui
files:
  - banking_api_ui/src/components/BankingAgent.js
  - banking_api_ui/src/components/BankingAgent.css
---

## Problem

When a user lands on the banking demo without logging in, the agent shows no useful chips — there is nothing to interact with until after authentication. This misses an opportunity to engage the user and demonstrate the agent capabilities upfront. Additionally, there needs to be a clear pathway from the agent to initiate login.

If an unauthenticated user types or taps something that requires a session (e.g. "show my balance", "transfer money"), the current code falls through to the BFF, fails with an auth error, and shows a generic message. It should be caught earlier with a friendly inline prompt.

## Solution

### 1. Pre-login chip group

Add a chip group to BankingAgent.js shown only when user === null (no session established).

- Chips include demos the agent can answer without account data: "What is OAuth?", "Explain PKCE", "What is MCP?", "How does this work?"
- One chip MUST be "Sign in to your account \u2192" — navigates to the OAuth login flow (same path as the landing page CTA)
- Label: "Try without signing in" or "Explore as guest"
- When the user IS authenticated, show all existing chip groups unchanged
- Do NOT remove or reorder any existing chip groups

### 2. Auth-required action gating (unauthenticated user tries banking action)

When intent dispatch detects a banking action (transfer, balance, deposit, etc.) and user === null:

1. Do NOT attempt the BFF/API call
2. Show a friendly in-chat message: "To check your balance I need you to sign in first. [Sign in to get started \u2192]"
3. Render the login link as a tappable inline link or small "Sign in" button inside the agent message bubble
4. Implement at the intent-dispatch layer in BankingAgent.js (before runAction / before the BFF call) — not just in the error handler
5. The existing error path around line 1695 ("sign in to use the banking agent") can be kept as a fallback but this should be caught upstream

Do not remove or reorder any existing chip groups.
