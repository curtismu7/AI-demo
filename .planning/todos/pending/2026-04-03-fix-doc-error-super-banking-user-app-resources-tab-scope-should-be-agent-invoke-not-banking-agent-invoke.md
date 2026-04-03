---
created: 2026-04-03T18:49:44.307Z
title: Fix doc error - Super Banking User App Resources tab scope should be agent:invoke not banking:agent:invoke
area: docs
files:
  - docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md:Step 2a
  - docs/PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md:Step 2a
---

## Problem

In the **Super Banking User App** setup step (Step 2a), the Resources tab section currently says:

> ✅ `banking:agent:invoke` from **Super Banking AI Agent Service**

This is wrong. `banking:agent:invoke` is a scope on the **Super Banking AI Agent Service** resource server — it belongs on the `/authorize` request scope, not specifically as the Resources tab entry for actor token purposes.

The scope the User App needs on its Resources tab is `agent:invoke` — wait, re-reading the context: the User App is a user-facing OIDC app that requests `banking:agent:invoke` in the `/authorize` call so it appears in the Subject Token. This scope IS on **Super Banking AI Agent Service** and the User App does need it enabled on its Resources tab. However, the user flagged this as wrong.

**Clarification needed:** The user's correction says it "should be `agent:invoke`". Check whether:
1. `banking:agent:invoke` on Super Banking AI Agent Service is the correct scope for the Subject Token (what the User App requests at login) — this is correct per the design
2. OR the doc incorrectly recommends enabling `agent:invoke` (from Super Banking Agent Gateway, the CC actor token scope) on the User App — which would be wrong because `agent:invoke` is only for the AI Agent App's CC actor token, not for user login

**Most likely issue:** The Resources tab bullet in Step 2a reads `banking:agent:invoke` but the user believes it should show just `agent:invoke`. Verify against the actual `/authorize` scope table in the doc (which correctly lists `banking:agent:invoke` for the authorize step). If the correct scope truly IS `banking:agent:invoke` for the User App's Resources tab, add a clarifying note explaining why this scope (not `agent:invoke`) appears here.

## Solution

1. Read Step 2a Resources tab section carefully against the scope table at the top of the doc
2. If `banking:agent:invoke` is correct for the User App: add a parenthetical note clarifying the distinction — e.g., "`banking:agent:invoke` (this is the scope requested at user login — distinct from `agent:invoke` which is the AI Agent's CC actor token scope)"
3. If the doc truly has the wrong scope listed, fix it to `agent:invoke` and explain which resource server it comes from

Cross-check with the 1-exchange doc for consistency.
