---
status: awaiting_human_verify
trigger: "Investigate two related issues: agent-401-and-transactions-400"
created: 2026-04-09T00:00:00Z
updated: 2026-04-10T03:15:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — three root causes identified:
  (1) bankingAgentNl.js not registered in server.js — nl/status, nl, search routes fall through
      to bankingAgentRoutes which applies agentSessionMiddleware to ALL sub-routes → 401
  (2) agentSessionMiddleware correctly checks oauthTokens.accessToken after prior fix, but
      local-login users never get oauthTokens set → agent always returns 401 for local-auth users
  (3) Transactions 400: HITL consent challenge required for amounts >$500. When user is
      OAuth-logged-in with local demo accounts (userId='1'), the ownership check in validateIntent
      returns 403 for createChallenge — but small-amount transactions should succeed. The 400
      most likely stems from consent_challenge_required (>$500 amount) being correctly issued,
      then the consent flow failing server-side with ownership mismatch (existing demo users
      have local userId='1' but req.user.id = PingOne sub UUID).
      The OTP email fails because PingOne email is not configured — but otpCodeFallback IS
      returned in the response for demo display.
test: curl test confirmed nl/status returns 401; curl confirmed message returns 401 for local-auth;
      transactions return 401 for local-auth (not 400), suggesting reporter uses OAuth login
expecting: fix nl/status by registering bankingAgentNl.js before bankingAgentRoutes in server.js
next_action: implement fixes for (1) server.js: mount bankingAgentNl; (2) investigate ownership
             mismatch for demo users with OAuth login

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected:
  - /api/banking-agent/message returns agent response
  - /api/transactions posts a transaction successfully
  - OTP email arrives in inbox for step-up verification

actual:
  - /api/banking-agent/message → 401 Unauthorized
  - /api/banking-agent/nl/status → 401 Unauthorized
  - /api/transactions → 400 Bad Request (both transfer and deposit)
  - No OTP email received

errors: |
  api/banking-agent/nl/status: 401 (Unauthorized)
  api/transactions: 400 (Bad Request)
  App.js:92 Transfer error: AxiosError: Request failed with status code 400
    at handleTransfer (UserDashboard.js:983:1)
  App.js:92 Deposit error: AxiosError: Request failed with status code 400
    at handleDeposit (UserDashboard.js:1048:1)

reproduction:
  1. Log in as user
  2. Try to send a message in the agent chat → 401
  3. Try to make a transfer or deposit on UserDashboard → 400
  4. Step-up OTP email never arrives

started: After recent LangChain agent integration work and agentSessionMiddleware changes

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-10T03:00:00Z
  checked: curl https://localhost:3001/api/banking-agent/nl/status (no auth)
  found: Returns {"error":"Unauthorized","message":"Please log in to access the banking agent."}
  implication: nl/status is hitting agentSessionMiddleware, not bankingAgentNl.js

- timestamp: 2026-04-10T03:00:00Z
  checked: server.js grep for bankingAgentNl
  found: bankingAgentNl.js is NOT imported or registered in server.js. Only bankingAgentRoutes
         is mounted at /api/banking-agent (line 849). bankingAgentNl.js defines /nl, /nl/status,
         /search routes that should be public/semi-public but are unreachable via their own router.
  implication: All /api/banking-agent/nl/* and /api/banking-agent/search routes fall through to
               bankingAgentRoutes which applies agentSessionMiddleware to ALL routes via
               router.use(agentSessionMiddleware) — forcing auth on public LLM config endpoints.

- timestamp: 2026-04-10T03:00:00Z
  checked: agentSessionMiddleware.js line 29 — reqiures req.session.oauthTokens?.accessToken
  found: After prior fix, middleware correctly checks session.user and session.oauthTokens. But
         routes/auth.js local login (line 35) only sets req.session.user — does NOT set oauthTokens.
         Only oauthUser.js (OAuth callback line 509) sets both session.user and session.oauthTokens.
  implication: Users who log in via local auth (/api/auth/login) always get 401 on agent routes
               because oauthTokens.accessToken is undefined. This is by design for /message (agent
               needs a real OAuth token) but /nl/status and /nl should not require oauthTokens.

- timestamp: 2026-04-10T03:00:00Z
  checked: curl local-login session → POST /api/banking-agent/message
  found: Returns 401 "Please log in to access the banking agent." — confirmed agentSessionMiddleware
         blocking due to missing oauthTokens (local auth session)
  implication: Reporter using local auth path (or token expired) hits this 401

- timestamp: 2026-04-10T03:00:00Z
  checked: curl local-login session → POST /api/transactions (amount=100)
  found: Returns 401 "authentication_required" / "Access token is required" — NOT 400
  implication: With local auth, transactions also return 401 (not 400). The original 400 report
               implies reporter uses OAuth login. With OAuth login and demo accounts (userId='1'),
               ownership check (fromAccount.userId !== req.user.id where req.user.id = decoded.sub)
               would return 403 — NOT 400 either. The 400 most likely comes from HITL consent flow
               when amounts > $500: first call returns 400 consent_challenge_required, UI opens
               consent modal, subsequent issues in consent flow return 400 with different errors
               (consent_challenge_invalid, consent_payload_mismatch etc.)

- timestamp: 2026-04-10T03:00:00Z
  checked: transactionConsentChallenge.js confirmChallenge + sendOtpEmail
  found: If email service fails (PingOne not configured), otpCodeFallback is set to the plain OTP
         and returned in the response body. UI should display this. OTP email "not received" is
         expected behavior when PINGONE_EMAIL_* env vars are not configured — code falls back to
         returning the code inline for demo purposes.
  implication: OTP email issue = PingOne email not configured + UI may not be displaying the
               fallback OTP code properly

- timestamp: 2026-04-10T03:00:00Z
  checked: runtimeSettings.js defaults
  found: stepUpEnabled=true, stepUpWithdrawalsAlways=true, stepUpTransactionTypes=['transfer','withdrawal'],
         stepUpAmountThreshold=0 (env not set). In transactions.js, threshold fallback is
         configStore.getEffective('step_up_amount_threshold') || 250 = 250.
  implication: ALL withdrawals trigger 428 step-up (regardless of amount). Transfers >= $250
               trigger 428 step-up. Deposits do NOT trigger step-up. So transfers would return
               428 (not 400) unless amount < $250. For amounts > $500, HITL also kicks in.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  ISSUE 1 (agent nl/status + nl + search 401): bankingAgentNl.js was never registered in
  server.js. Its routes (/nl, /nl/status, /search) fell through to bankingAgentRoutes which
  applies agentSessionMiddleware to ALL sub-paths via router.use(agentSessionMiddleware). The
  middleware blocks unauthenticated requests + requests without oauthTokens — even for these
  public LLM config endpoints. Fix: mount bankingAgentNlRoutes at /api/banking-agent BEFORE
  bankingAgentRoutes so the NL routes are handled first without agentSessionMiddleware.

  ISSUE 2 (agent /message 401): The agentSessionMiddleware correctly checks
  req.session.oauthTokens?.accessToken after the prior fix. However, users who log in via local
  auth (/api/auth/login) never get oauthTokens set in their session — only OAuth login via
  oauthUser.js sets both session.user AND session.oauthTokens. The error message was misleading
  ("Session has expired") since users ARE logged in but not via PingOne OAuth.

  ISSUE 3 (transactions 400 + no OTP email):
  a) For local-auth users: transactions also return 401 (not 400) because authenticateToken
     requires oauthTokens.accessToken for the BFF session pattern. Cannot diagnose the exact
     400 without knowing the user's auth method and the actual response body.
  b) For OAuth users with small amounts: transactions should succeed — ownership checks pass
     (provisioned accounts use req.user.id = decoded.sub), no step-up for deposits, no HITL
     for amounts < $500.
  c) For amounts > $500: HITL triggers 400 consent_challenge_required (handled by UI's
     openConsentFlowForPayload — does NOT trigger the console.error). The 400 from
     console.error is likely from a subsequent consent flow step (consent_challenge_invalid
     or consent_payload_mismatch) rather than the initial request.
  d) OTP email not received: expected when PINGONE_ENVIRONMENT_ID/credentials not configured.
     The system correctly falls back to otpCodeFallback returned in the response body, which
     TransactionConsentModal displays inline for demo purposes.

fix: |
  1. banking_api_server/server.js: Added require('./routes/bankingAgentNl') and mounted it at
     /api/banking-agent BEFORE bankingAgentRoutes. The NL/search routes are now served without
     agentSessionMiddleware.
  2. banking_api_server/middleware/agentSessionMiddleware.js: Improved error message for the
     missing-oauthTokens case from confusing "Session has expired" to actionable
     "oauth_session_required" / "Please sign in via PingOne to use the agent".
  3. Transactions 400: requires further investigation with actual response body. Best next step:
     open browser DevTools Network tab, reproduce the error, and check the response JSON body
     to identify exactly which 400 case is being hit.

verification: |
  curl -sk https://localhost:3001/api/banking-agent/nl/status → 200 with LLM provider config
  curl -sk https://localhost:3001/api/banking-agent/nl -d '{"message":"test"}' → 200 with parsed intent
  curl -sk -b session.txt POST /api/banking-agent/message → 401 with clear oauth_session_required error
  Server started successfully with both bankingAgentNlRoutes and bankingAgentRoutes mounted.

files_changed:
  - banking_api_server/server.js
  - banking_api_server/middleware/agentSessionMiddleware.js
