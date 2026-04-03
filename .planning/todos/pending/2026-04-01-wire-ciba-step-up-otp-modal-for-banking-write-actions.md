---
created: 2026-04-01T18:12:09.272Z
title: Wire CIBA step-up OTP modal for banking write actions
area: auth
files:
  - banking_api_ui/src/components/BankingAgent.js
  - banking_api_server/routes/oauthUser.js
  - banking_api_server/bankingAgentService.js
---

## Problem

CIBA (Client-Initiated Backchannel Authentication) option appears in the UI but is not enabled / not wired end-to-end. When a user initiates a banking write action (deposit, withdraw, transfer), the expected flow is:

1. BFF initiates a CIBA backchannel auth request to PingOne
2. PingOne sends an OTP to the user's email
3. A modal appears in the UI asking the user to enter the OTP
4. User enters the correct OTP → transaction is approved and executed
5. User enters wrong OTP / times out → transaction is blocked

Currently the modal is not shown and no email OTP is sent — the transaction proceeds (or fails) without the step-up challenge.

## Solution

- Enable CIBA on the PingOne application (check app config — CIBA grant type must be enabled)
- BFF: on write-action tool call, initiate `/as/bc-authorize` backchannel auth request before executing the transaction
- Frontend: display an OTP input modal when the BFF returns a `ciba_pending` response; poll or use SSE to get result
- On CIBA approval, BFF re-executes the queued transaction; on rejection/timeout, return error to user
- Reference: PingOne CIBA docs + `.github/skills/oauth-pingone/SKILL.md`
