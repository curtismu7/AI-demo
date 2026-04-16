# The Three Authentication Flows

AI agents need user-scoped tokens, but users authenticate in different contexts. A user sitting at their laptop has a browser. A user walking through an airport has their phone. An AI agent mid-conversation has neither — it needs to pause, get consent, and resume.

The PingOne MCP Server supports three flows to cover these scenarios. Each produces the same result — a scoped, delegated token — but the user experience and security properties differ.

## Flow 1: Authorization Code + PKCE (Traditional Login)

**When to use:** User is at a browser, initiating the session themselves.

This is the standard OAuth 2.0 Authorization Code flow with PKCE (Proof Key for Code Exchange). The user clicks "Login," gets redirected to PingOne, authenticates, and returns with an authorization code that the BFF exchanges for tokens.

**Why PKCE?** Without PKCE, a malicious app intercepting the redirect could steal the authorization code. PKCE binds the code to the original requestor using a cryptographic challenge.

```javascript
// From banking_api_server/routes/oauthUser.js — Login initiation
// Generate PKCE challenge pair
const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto
  .createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');

// Store verifier in session (and signed cookie for serverless fallback)
req.session.oauthCodeVerifier = codeVerifier;
setPkceCookie(res, { state, codeVerifier, redirectUri, nonce }, isProd());

// Redirect to PingOne with challenge
const url = `${authEndpoint}?` + new URLSearchParams({
  response_type: 'code',
  client_id: clientId,
  redirect_uri: redirectUri,
  scope: scopes,
  state: state,
  nonce: nonce,
  code_challenge: codeChallenge,
  code_challenge_method: 'S256',
});
res.redirect(url);
```

**Security callout:** The code verifier is stored server-side in the session *and* in a signed cookie. The signed cookie is a Vercel/serverless resilience pattern — if the callback hits a different instance than the login request, the session might not be available, but the signed cookie travels with the browser.

```
┌─────────┐    ┌─────────┐    ┌─────────┐
│ Browser  │───▶│   BFF   │───▶│ PingOne │
│  (SPA)   │◀───│ Express │◀───│  AuthZ  │
└─────────┘    └─────────┘    └─────────┘
     │              │
     │ 1. Click     │ 2. Generate PKCE
     │   "Login"    │    challenge
     │              │
     │ 3. Redirect ─┼──▶ 4. User authenticates
     │              │       at PingOne
     │ 6. Exchange  │◀── 5. Callback with code
     │    code for  │
     │    tokens    │
     │              │
     │ 7. Session   │ Tokens NEVER sent
     │    cookie    │ to the browser
     └──────────────┘
```

---

## Flow 2: CIBA (Client-Initiated Backchannel Authentication)

**When to use:** Agent or service needs to authenticate a user who isn't at a browser — or when you want a "push notification" approval experience.

CIBA flips the traditional flow. Instead of the user initiating login, the *application* initiates it. The user receives a push notification on their registered device (phone, tablet) and approves or denies the request.

```javascript
// From banking_api_server/routes/ciba.js — Backchannel initiation
// POST /api/auth/ciba/initiate
router.post('/initiate', authenticateToken, async (req, res) => {
  if (!_cibaEnabled(res)) return;

  const { login_hint, scope, binding_message } = req.body;
  
  // BFF sends backchannel auth request to PingOne
  const result = await cibaService.initiateAuth({
    login_hint,            // User's email or username
    scope,                 // Requested scopes
    binding_message,       // "Approve login for Banking App"
  });

  // Return auth_req_id for polling
  res.json({
    auth_req_id: result.auth_req_id,
    expires_in: result.expires_in,
    interval: result.interval,    // Minimum polling interval (seconds)
  });
});

// GET /api/auth/ciba/poll/:authReqId — check approval status
router.get('/poll/:authReqId', authenticateToken, async (req, res) => {
  const result = await cibaService.pollAuth(req.params.authReqId);
  // Returns: { status: 'pending' | 'approved' | 'denied' }
  // When approved: tokens are stored in server-side session (BFF pattern)
  res.json(result);
});
```

**Why CIBA for AI agents?** Consider this scenario: an AI agent is processing a batch of account reviews and needs to escalate one to a human for approval. The human is on their phone. CIBA lets the agent trigger a mobile approval without requiring the human to visit a specific URL.

```
┌──────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ AI Agent │───▶│   BFF   │───▶│ PingOne │───▶│ Mobile  │
│          │    │ Express │    │  CIBA   │    │  Device │
└──────────┘    └─────────┘    └─────────┘    └─────────┘
     │              │               │              │
     │ 1. Request   │ 2. Backchannel│ 3. Push      │
     │    auth      │    auth req   │    notification
     │              │               │              │
     │ 4. Poll      │ 5. Poll      │              │
     │    status    │    PingOne    │ 6. User taps │
     │              │              │    "Approve"  │
     │              │◀─────────────┤              │
     │ 7. Tokens    │ 8. Exchange  │              │
     │    in session│    tokens    │              │
     └──────────────┘              └──────────────┘
```

**Security callout:** CIBA requires a confidential client (client secret never leaves the BFF). The binding message shown on the mobile device should include transaction context ("Approve $500 transfer to savings") to prevent confused-deputy attacks.

---

## Flow 3: HITL (Human-In-The-Loop) with Inline Consent

**When to use:** AI agent is mid-conversation and hits an operation requiring explicit user consent — like a money transfer.

This is the most interesting flow. The AI agent is chatting with the user, the user asks to transfer money, and the agent needs to:

1. Pause the conversation
2. Present a consent challenge (inline — no page navigation)
3. Verify the user's identity (OTP or re-authentication)
4. Resume the operation with the verified consent

```javascript
// From banking_api_server/services/transactionConsentChallenge.js
// Server-bound consent challenges for high-value transactions

const HIGH_VALUE_CONSENT_USD = 500;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;  // 10-minute window
const OTP_MAX_ATTEMPTS = 3;                // Lock after 3 wrong codes

// Flow:
// 1. POST /consent-challenge         → createChallenge()  → status: 'pending'
// 2. POST /consent-challenge/:id/confirm → sendOtp()      → status: 'otp_pending'
// 3. POST /consent-challenge/:id/verify-otp → verifyOtp() → status: 'confirmed'
// 4. POST /transactions { consentChallengeId } → verify + execute

// The challenge captures a snapshot of the transaction details
function createChallenge(session, body) {
  const snapshot = normalizeSnapshot(body);   // Freeze amount, recipient, etc.
  const id = crypto.randomUUID();
  challenges[id] = {
    status: 'pending',
    snapshot,                                  // Tamper detection
    createdAt: Date.now(),
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  };
  return { challengeId: id };
}
```

**Why not just re-authenticate?** Re-authentication proves identity but doesn't prove *intent*. The consent challenge captures a snapshot of the transaction details (amount, recipient, account) at creation time. When the user confirms, we compare the snapshot against the actual transaction. If the AI agent (or a man-in-the-middle) modifies the amount between consent and execution, the challenge fails.

```
┌──────────┐    ┌─────────┐    ┌─────────┐
│ AI Agent │───▶│   BFF   │    │ PingOne │
│  (Chat)  │◀───│ Express │    │  MFA    │
└──────────┘    └─────────┘    └─────────┘
     │              │               │
     │ 1. "Transfer │               │
     │    $500"     │               │
     │              │               │
     │◀── 2. 428   │               │
     │    consent   │               │
     │    required  │               │
     │              │               │
     │ 3. Show      │               │
     │    inline    │               │
     │    consent   │               │
     │    UI        │               │
     │              │               │
     │ 4. User      │               │
     │    confirms  │ 5. Verify OTP │
     │    + OTP     │───────────────▶
     │              │◀──────────────│
     │              │               │
     │ 6. Resume    │ 7. Execute    │
     │    transfer  │    with       │
     │    with      │    verified   │
     │    challenge │    consent    │
     │    ID        │               │
     └──────────────┘               │
```

**Security callout:** As of Phase 170, **all transfers require HITL consent** — regardless of amount. The `HIGH_VALUE_CONSENT_USD` threshold applies only to non-transfer transaction types. This is a deliberate security decision: transfers move money between accounts and should always require explicit human approval when initiated by an AI agent.

---

## Choosing the Right Flow

| Criteria | PKCE | CIBA | HITL |
|----------|------|------|------|
| **User location** | At browser | Any device | In agent chat |
| **Initiator** | User | Application/Agent | Agent (mid-operation) |
| **UX** | Redirect to IdP | Push notification | Inline consent |
| **Latency** | Fast (seconds) | Variable (user response time) | Fast (inline) |
| **Best for** | Initial login | Batch processing, mobile approval | Transaction consent |
| **PingOne requirement** | Standard OIDC app | CIBA-enabled app | Consent challenge + MFA |
| **Token result** | Session tokens in BFF | Session tokens in BFF | Verified consent ID |

**Key insight:** These flows are not mutually exclusive. A typical session might start with PKCE login, then use HITL for a transfer, and later use CIBA for a step-up approval on a different device.
