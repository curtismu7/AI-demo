---
created: 2026-04-01T18:12:09.272Z
title: Auto-scroll to agent chat when banking action button is clicked
area: ui
files:
  - banking_api_ui/src/components/UserDashboard.js
  - banking_api_ui/src/components/BankingAgent.js
---

## Problem

When the user clicks an action button (Transfer, Deposit, Withdraw, etc.) on the dashboard, the AI agent is invoked but the chat panel sits at the bottom of the page. The user has no visual feedback that something is happening because the agent conversation area is off-screen. They don't see the "asking for more detail" follow-up prompt.

## Solution

After the action button click triggers the agent, scroll the page (or the chat container) down so the agent chat is visible. Options:
- `element.scrollIntoView({ behavior: 'smooth' })` on the BankingAgent chat container ref
- Or scroll the page to the bottom where the floating agent panel lives
- Trigger the scroll immediately on button click, before the agent response arrives, so the user sees the spinner/typing indicator
