/**
 * educationContent.js — Shared rich education content components
 *
 * Mostly pure JSX components (no state, no effects, no props). TokenChainPanel
 * is separate (local UI state for expand/copy). Used by CIBAPanel and education
 * drawer panels (LoginFlowPanel, McpProtocolPanel, IntrospectionPanel, AgentGatewayPanel).
 *
 * All code blocks use <pre className="edu-code"> to match EducationDrawer CSS.
 * Prose uses standard <h3>, <p>, <ul> elements.
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Raw content strings (shared between components)
// ---------------------------------------------------------------------------

const SEQUENCE_DIAGRAM = `
1. App (server) ──POST /bc-authorize──▶ PingOne
   { login_hint: "user@bank.com", scope: "openid banking:write",
     binding_message: "Approve $500 transfer" }

2. PingOne ◀─────────────────────────── auth_req_id returned

3. PingOne ──out-of-band approval────▶ User (channel is your PingOne / DaVinci setup)
   • Email: approval link in inbox  — OR —  • Push: notification on registered device

4. User approves (link in email or tap Approve on device)

5. App polls POST /token (grant=ciba, auth_req_id=...)
   → authorization_pending (repeat every 5s)
   → tokens returned ✓

6. Tokens stored server-side (never sent to browser)
   Tool call / transaction executes with user context
`;

const BC_AUTHORIZE_REQUEST = `POST {issuer}/as/bc-authorize
Content-Type: application/x-www-form-urlencoded
Authorization: Basic <base64(client_id:client_secret)>

scope=openid%20banking%3Awrite
&login_hint=user%40bank.com
&binding_message=Approve%20%24500%20transfer
&acr_values=Multi_factor            (optional step-up)
&client_notification_token=...      (required for ping/push delivery mode)

HTTP/1.1 200 OK
{
  "auth_req_id": "abc123xyz...",
  "expires_in": 300,
  "interval": 5
}`;

const CIBA_POLL_REQUEST = `POST {issuer}/as/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:openid:params:grant-type:ciba
&auth_req_id=abc123xyz...
&client_id=...
&client_secret=...

── If user has not yet approved ──
HTTP/1.1 400 Bad Request
{ "error": "authorization_pending" }

── If poll is too fast ──
HTTP/1.1 400 Bad Request
{ "error": "slow_down" }   → increase interval by 5s

── On approval ──
HTTP/1.1 200 OK
{
  "access_token": "...",
  "token_type": "Bearer",
  "id_token": "...",
  "refresh_token": "...",
  "expires_in": 3600
}

── On denial / timeout ──
HTTP/1.1 400 Bad Request
{ "error": "access_denied" | "expired_token" }`;

const MCP_FLOW = `
Without CIBA (current):
  Chat UI → MCP server needs tokens
  → Server returns a URL in chat text
  → User must manually open URL in browser
  → User authenticates, returns to chat
  ⚠  Breaks chat flow, awkward redirect

With CIBA:
  Chat UI → MCP server needs tokens
  → Server sends bc-authorize to PingOne
  → PingOne delivers approval (email link or push — your DaVinci config)
  → User approves out-of-band — never leaves chat
  → Tokens arrive at server silently
  ✅  Fluid, in-context, no redirect needed
`;

const STEP_UP_FLOW = `
High-value transaction (amount > threshold):

Without CIBA:
  User clicks Transfer $500
  → Server redirects browser to PingOne
  → User authenticates, gets redirected back
  → Page reload, context lost

With CIBA:
  User clicks Transfer $500
  → UI shows "Check your email or device" overlay (wording depends on PingOne)
  → PingOne sends approval (email or push per your setup)
  → User approves out-of-band
  → Transfer executes immediately
  ✅  No redirect, no page reload
`;

const FULL_STACK_DIAGRAM = `
┌──────────────────────────────────────────────────────────────────────────────┐
│ Pattern source: Agent Gateway demo architecture.vsdx (swimlanes + RFC strips) │
└──────────────────────────────────────────────────────────────────────────────┘

  Web Browser SPA
       │
       │  HTTPS (session cookie). No raw OAuth tokens in browser JS.
       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Agent — security strip: OAuth 2.1 · RFC 8707 · RFC 9728 · RFC 7523 · RFC 8693│
│   ┌─────┐    ┌────────┐    ┌────────────────┐                                 │
│   │ LLM │    │ memory │    │ business logic │   (+ Sidecar / SDK where used)  │
│   └─────┘    └────────┘    └────────────────┘                                 │
└──────────────────────────────────────────────────────────────────────────────┘
       │ REST / WebSocket to BFF                         │
       │                                                 │
       ▼                                                 ▼
┌──────────────────────────────┐            ┌──────────────────────────────────┐
│ MCP ingress (gateway role)   │            │ IDP / AS — PingOne              │
│ • Introspection + scope       │            │ /authorize · /token ·           │
│   enforcement for tools       │            │ introspect (RFC 7662) · JWKS    │
│ • MCP authZ RFC 9728          │◀───────────│ Resource indicators RFC 8707   │
│   (client ↔ authorization)    │            │ in authorize + token requests  │
└──────────────┬───────────────┘            └──────────────────────────────────┘
               │
               │ MCP egress (outbound to MCP server / token actuation)
               │ • Full RFC 9728 + RFC 8707 sequence with MCP peer
               │ • Token exchange RFC 8693 with secure binding:
               │   JWT client auth RFC 7523 or DPoP RFC 9449 (best practice)
               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ MCP Server                              Tool                                  │
│   tools/list · tools/call               API Key / Bearer to downstream       │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
                               │  Bearer access token (audience = Resource Server)
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Resource Server (RS) — Banking API HTTPS                                      │
│ RS validates token + audience (https://…/api) + scopes                        │
└──────────────────────────────────────────────────────────────────────────────┘

  Tool call without acceptable token:
       HTTP/1.1 401 Unauthorized  →  "attempt run tool"
       → OAuth flows (PKCE in browser, or CIBA, or token exchange on BFF)
       → "attempt again with bearer token"

  MCP spec: clients MUST support Resource Indicators (RFC 8707) for OAuth —
  https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization

── Phased OAuth with resource indicator (RFC 8707) — same structure as ref diagram ──
  Phase 1  Authorization request  GET /authorize?…&resource=<RS URL>
  Phase 2  Token request          POST /token  grant=authorization_code &resource=<RS>
           AS limits audience to the requested resource
  Phase 3  Resource access       GET …  Authorization: Bearer <AT for RS>

── Optional: ID-JAG / XAA (draft) — identity assertion authorization grant ──
  https://datatracker.ietf.org/doc/draft-ietf-oauth-identity-assertion-authz-grant/

── This banking demo maps: Web SPA → Banking BFF → PingOne AS → MCP server → Banking RS ──
   CIBA: POST /bc-authorize + poll /token  (parallel track; email or push per PingOne)
`;

const OAUTH_API_CHEATSHEET = `
Browser-visible (same origin as app):
  GET  /api/auth/oauth/login              Start admin OAuth (redirect to PingOne)
  GET  /api/auth/oauth/user/login         Start end-user OAuth
  GET  /api/auth/oauth/redirect-info      JSON: exact redirect_uri values for PingOne
Server-only (after login):
  GET  /api/auth/oauth/status             Admin session + userinfo
  GET  /api/auth/oauth/user/status        End-user session
MCP / agent:
  POST /api/mcp/tool                      BFF → optional token exchange → MCP tools/call
  GET  /api/mcp/inspector/tools           BFF MCP inspector: tools/list
  POST /api/mcp/inspector/invoke          BFF MCP inspector: tools/call
Agent identity (optional "on behalf of"):
  GET  /api/agent/identity/status         Actor bootstrap / mapping status
  POST /api/agent/identity/bootstrap      Optional ROPC + PingOne user for agent client
CIBA (when enabled):
  POST /api/auth/ciba/initiate            Start backchannel auth
  GET  /api/auth/ciba/poll/:authReqId     Poll until approved or denied
`;

const TOKEN_EXCHANGE_EDU = `
── Where this runs ──
  The browser never calls PingOne /token for MCP. The Banking API server holds the user's
  OAuth tokens in the session and, when a tool needs an MCP-scoped access token, performs
  RFC 8693 Token Exchange (grant_type=urn:ietf:params:oauth:grant-type:token-exchange)
  against PingOne's POST …/as/token endpoint (same host as your issuer).

── BEFORE the token exchange (inputs the BFF already has) ──
  • Session cookie → identifies the signed-in user (admin or customer).
  • req.session (server) → access_token / refresh_token / user from the initial OAuth code flow.
  • Optional "on behalf of" path: USE_AGENT_ACTOR_FOR_MCP=true and MCP resource URI set →
    the BFF may use subject_token (user) + actor_token (AGENT_OAUTH_CLIENT_* client-credentials
    token) so PingOne can mint a delegated token (JWT may include an "act" claim per your AS policy).

── THE token request (outbound from BFF to PingOne — not visible in browser DevTools as XHR) ──
  POST {issuer}/as/token
  Content-Type: application/x-www-form-urlencoded

  Typical parameters (names may vary slightly by PingOne):
    grant_type=urn:ietf:params:oauth:grant-type:token-exchange
    client_id=… & client_secret=…   (or other client auth per your app)
    subject_token=<user access token from session>
    subject_token_type=urn:ietf:params:oauth:token-type:access_token
    audience=<MCP resource / API audience PingOne expects>
    scope=<space-separated scopes for the MCP layer>

  Optional actor path (delegation):
    actor_token=<token from agent client credentials>
    actor_token_type=urn:ietf:params:oauth:token-type:access_token
    (PingOne policy must allow this exchange.)

── AFTER a successful exchange (what the BFF receives) ──
  HTTP/1.1 200 OK
  Content-Type: application/json

  {
    "access_token": "<JWT or opaque string — MCP/WebSocket uses this as Bearer>",
    "token_type": "Bearer",
    "expires_in": 3600,
    "scope": "…",
    "issued_token_type": "urn:ietf:params:oauth:token-type:access_token"
  }

  The BFF then opens or reuses the WebSocket to banking_mcp_server and sends MCP messages
  that carry this token (or passes it per your MCP auth binding). Downstream Banking REST
  calls still use RS audience/scopes as configured.

── API status codes (PingOne /token and BFF wrapping) ──
  200  OK — body is JSON with access_token (and usually expires_in).
  400  Bad Request — invalid grant, wrong token type, audience not allowed, malformed request;
       body often: { "error": "invalid_grant", "error_description": "…" }
  401  Unauthorized — client authentication failed (wrong client_id/secret or auth method).
  403  Forbidden — policy or consent blocks the exchange (wording depends on AS).
  502/503 Bad Gateway — BFF could not reach PingOne (network/DNS); app may return a JSON
       error from /api/mcp/tool or inspector routes.

── BFF responses YOU may see in the browser (after token exchange succeeds or fails) ──
  POST /api/mcp/tool — 200 with MCP tool result JSON; 401 if no session or no usable token;
       5xx if MCP server or PingOne is unreachable.
  GET /api/mcp/inspector/tools — 200 with tools list; 401 if not authenticated.
  POST /api/mcp/inspector/invoke — same pattern as tool calls.

── Error JSON shape (OAuth-style, from PingOne through BFF on failure) ──
  { "error": "invalid_grant" | "invalid_client" | …, "error_description": "human-readable" }

── Mental model ──
  1) User completes OAuth (authorization code) → session has subject token.
  2) User invokes MCP tool → BFF may exchange subject token for MCP-audience token (RFC 8693).
  3) Only after step 2 does the MCP layer see a Bearer suited to the tool/RS chain.
  Open the Config page → "MCP Inspector setup" for commands and env snippets that match your URL.
`;

// ---------------------------------------------------------------------------
// CibaWhatContent — What is CIBA + sequence diagram + key concepts
// ---------------------------------------------------------------------------

export function CibaWhatContent() {
  return (
    <>
      <p>
        CIBA (Client-Initiated Backchannel Authentication, OpenID CIBA Core 1.0) decouples the{' '}
        <strong>consumption device</strong> (where the app runs) from where the user{' '}
        <strong>approves</strong> — often another device or their email inbox. No browser redirect,
        no popup. PingOne delivers the approval step by <strong>email</strong> or{' '}
        <strong>push</strong> depending on your DaVinci configuration.
      </p>

      <h3>The flow (6 steps)</h3>
      <pre className="edu-code">{SEQUENCE_DIAGRAM}</pre>

      <h3>Real HTTP: bc-authorize request &amp; response</h3>
      <pre className="edu-code">{BC_AUTHORIZE_REQUEST}</pre>

      <h3>Real HTTP: polling for tokens</h3>
      <pre className="edu-code">{CIBA_POLL_REQUEST}</pre>

      <h3>Key concepts</h3>
      <ul>
        <li>
          <strong>auth_req_id</strong> — a short-lived opaque ID returned by PingOne when{' '}
          <code>POST /bc-authorize</code> succeeds. The server uses it to poll{' '}
          <code>POST /token</code> until the user approves or the request expires.
        </li>
        <li>
          <strong>binding_message</strong> — the text shown in the approval email or push
          notification, e.g. <em>"Approve $500 transfer to Savings"</em>. Helps the user
          confirm exactly what they are authorising.
        </li>
        <li>
          <strong>login_hint</strong> — the user's email address. PingOne resolves this to the
          target account and sends the approval to the right inbox or device.
        </li>
        <li>
          <strong>Poll vs Ping delivery mode</strong> — <em>Poll</em>: server calls{' '}
          <code>POST /token</code> every 5 s (or <code>interval</code> seconds). <em>Ping</em>:
          PingOne calls a <code>client_notification_endpoint</code> when the user approves
          (requires a publicly reachable callback URL). This demo uses Poll mode.
        </li>
        <li>
          <strong>BFF pattern — tokens never reach the browser</strong> — tokens are stored in
          the server-side session. The browser only receives approval status updates via the BFF
          poll API. XSS cannot steal them.
        </li>
        <li>
          <strong>Email vs push</strong> — controlled by your PingOne / DaVinci flow, not by
          this app. Email-only CIBA requires no push-capable MFA device.
        </li>
      </ul>

      <h3>When to use CIBA (vs Authorization Code)</h3>
      <ul>
        <li>LLM / agent contexts where a browser redirect would break the flow.</li>
        <li>Step-up authentication mid-session (high-value transaction) without a page reload.</li>
        <li>IoT / headless devices that cannot host a redirect URI.</li>
        <li>Delegated approval — approve on phone while viewing dashboard on desktop.</li>
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// CibaFullStackContent — full platform architecture diagram + RFC callouts
// ---------------------------------------------------------------------------

export function CibaFullStackContent() {
  return (
    <>
      <p>
        The diagram below uses the <strong>same swimlane pattern and RFC callouts</strong> as{' '}
        <strong>Agent Gateway demo architecture.vsdx</strong> in this repo: Web Browser SPA →
        Agent (security strip: OAuth 2.1, RFC 8707, 9728, 7523, 8693) → MCP ingress / egress →
        MCP Server / Tool → Resource Server; 401 → OAuth flows → Bearer retry; phased OAuth with{' '}
        <strong>resource</strong> indicator (RFC 8707). This app maps that pattern onto{' '}
        <strong>PingOne</strong>, the <strong>Banking BFF</strong>, and{' '}
        <strong>banking_mcp_server</strong>.
      </p>

      <h3>Agent Gateway-style architecture map</h3>
      <pre className="edu-code">{FULL_STACK_DIAGRAM}</pre>

      <h3>How this demo maps to the diagram</h3>
      <ul>
        <li><strong>Web Browser SPA</strong> — React UI; session cookie only (no raw AT/RT in JavaScript).</li>
        <li><strong>Agent / LLM</strong> — LangChain agent + chat widget (separate process); same MCP server as the BFF.</li>
        <li><strong>MCP ingress (gateway role)</strong> — Banking BFF: scope checks, session, <code>/api/mcp/tool</code>, optional introspection.</li>
        <li><strong>MCP egress</strong> — BFF performs RFC 8693 token exchange + WebSocket MCP to the server; RFC 8707 resource for MCP audience when configured.</li>
        <li><strong>IDP / AS</strong> — PingOne (<code>/authorize</code>, <code>/token</code>, introspection).</li>
        <li><strong>MCP Server + Tool</strong> — <code>banking_mcp_server</code>; tools call the Banking API with Bearer + scopes.</li>
        <li><strong>Resource Server (RS)</strong> — Banking REST API (same host as BFF in this deployment).</li>
      </ul>

      <h3>Phased OAuth — resource indicator (RFC 8707)</h3>
      <pre className="edu-code">{`Phase 1 — Authorization request
  GET /as/authorize
    ?response_type=code
    &client_id=...
    &redirect_uri=...
    &scope=openid%20banking%3Aread
    &resource=https%3A%2F%2Fapi.example.com%2F   ← binds audience at issuance

Phase 2 — Token request
  POST /as/token
  grant_type=authorization_code
  &code=...
  &resource=https%3A%2F%2Fapi.example.com%2F     ← same resource; AS limits aud

Phase 3 — Resource access
  GET https://api.example.com/accounts
  Authorization: Bearer <AT whose aud = https://api.example.com/>

  RS verifies: aud == its own URL; scope includes required permission.`}</pre>

      <h3>Key API endpoints (this deployment)</h3>
      <pre className="edu-code">{OAUTH_API_CHEATSHEET}</pre>

      <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
        <strong>Chat widget / LangChain:</strong> the embedded chat uses a WebSocket to an agent
        host; that agent uses its own MCP client to the same MCP server. The flow is parallel to{' '}
        <code>/api/mcp/tool</code> but runs in a different process — both ultimately hit the same
        MCP tools and Banking API.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// CibaVsLoginContent — CIBA vs Authorization Code + PKCE comparison
// ---------------------------------------------------------------------------

export function CibaVsLoginContent() {
  return (
    <>
      <h3>CIBA vs Authorization Code + PKCE</h3>
      <p>
        Both are OAuth 2.0 / OIDC flows at PingOne. The key difference is{' '}
        <strong>where the user interaction happens</strong>.
      </p>

      <h3>Authorization Code + PKCE (this app's login)</h3>
      <pre className="edu-code">{`1. BFF generates code_verifier + code_challenge (S256)
2. Browser → GET /as/authorize?response_type=code&code_challenge=...
   ↳ PingOne shows login UI in the BROWSER
3. User enters credentials, MFA if required
4. PingOne → 302 to redirect_uri?code=ABC&state=XYZ
5. BFF validates state, POST /as/token with code + code_verifier
6. Tokens → BFF session; browser gets httpOnly cookie
7. Page loads at /admin or /dashboard

Key property: the user MUST be at a browser to click through the redirect.
Interrupt: YES — page navigates away and back.`}</pre>

      <h3>CIBA (backchannel)</h3>
      <pre className="edu-code">{`1. BFF → POST /as/bc-authorize (login_hint, binding_message)
2. PingOne → { auth_req_id, expires_in, interval }
   ↳ PingOne delivers approval OUT-OF-BAND (email or push per your DaVinci config)
3. BFF polls POST /as/token every ~5s
   → authorization_pending until user acts
4. User approves in email inbox OR on registered device
5. Next poll returns tokens; BFF stores them server-side
6. Chat / agent / dashboard continues with no page load

Key property: the user does NOT navigate away. No redirect_uri needed for the approval.
Interrupt: NONE — user stays on the same page/chat.`}</pre>

      <h3>Side-by-side comparison</h3>
      <pre className="edu-code">{`Feature                  Auth Code + PKCE          CIBA
─────────────────────────────────────────────────────────────────
Browser redirect         YES (to PingOne)           NO
User interaction device  Same browser               Any (email, phone, push)
Suitable for agents      No (needs browser)         Yes (out-of-band)
Suitable for step-up     Disruptive (page reload)   Non-disruptive overlay
redirect_uri required    YES                        NO (for approval step)
PingOne setup            Standard PKCE app          CIBA grant + DaVinci flow
Session established      Immediately on callback    After poll succeeds
binding_message          N/A                        Shown to user on approval
Token location           BFF session (httpOnly)     BFF session (httpOnly)`}</pre>

      <h3>Email vs push — who decides?</h3>
      <p>
        The delivery channel is controlled by your <strong>PingOne / DaVinci flow</strong>, not
        by this app. The BFF sends <code>login_hint</code> and <code>binding_message</code>;
        PingOne decides whether to send an email link or a push notification based on your
        DaVinci configuration and the user's registered authenticators.
      </p>
      <ul>
        <li>
          <strong>Email-only</strong> — approval link in inbox; no push-capable MFA device or
          app required.
        </li>
        <li>
          <strong>Push</strong> — PingOne MFA policy + registered device (PingID, Microsoft
          Authenticator, etc.) required.
        </li>
      </ul>

      <p>
        For sequence diagrams and a live demo, open the floating{' '}
        <strong>CIBA guide</strong> (bottom-right of the screen, "Try It" tab).
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// CibaMcpFlowContent — CIBA in MCP / agent + step-up flows
// ---------------------------------------------------------------------------

export function CibaMcpFlowContent() {
  return (
    <>
      <h3>Why CIBA matters for MCP / AI agents</h3>
      <p>
        When an AI agent needs user tokens to call the Banking API, a browser redirect breaks
        the conversational flow. CIBA is the standard solution: the server initiates the auth
        request directly and the user approves out-of-band while the chat continues.
      </p>

      <h3>MCP agent flow comparison</h3>
      <pre className="edu-code">{MCP_FLOW}</pre>

      <h3>Step-up auth for high-value transactions</h3>
      <p>
        Transactions above <strong>STEP_UP_AMOUNT_THRESHOLD</strong> (default $250) require
        additional authentication. CIBA makes this seamless — no page reload.
      </p>
      <pre className="edu-code">{STEP_UP_FLOW}</pre>

      <h3>CIBA + token exchange together</h3>
      <pre className="edu-code">{`Agent needs to call Banking API:

1. Agent → BFF: "create_transfer $500"
2. BFF checks session tokens — insufficient scope or step-up needed
3. BFF → POST /as/bc-authorize  (login_hint, binding_message="Approve $500 transfer")
4. BFF polls /as/token every 5s
5. User approves in email / push (out-of-band)
6. BFF receives CIBA tokens (subject=user, scopes updated)
7. BFF → POST /as/token  grant_type=token-exchange (RFC 8693)
       subject_token=<CIBA access token>
       audience=<MCP resource>
       scope=banking:write
8. BFF receives MCP-audience token (T2)
9. BFF → MCP server tools/call create_transfer with T2 as Bearer
10. MCP server → Banking API → confirms transfer
11. Agent receives success; chat continues uninterrupted`}</pre>

      <h3>Sequence diagram: step-up with CIBA + MCP</h3>
      <pre className="edu-code">{`Browser      BFF          PingOne       MCP Server    Banking API
   │            │               │              │              │
   │──POST tx──▶│               │              │              │
   │            │──bc-authorize▶│              │              │
   │            │◀──auth_req_id─│              │              │
   │◀──pending──│               │              │              │
   │            │──poll /token─▶│              │              │
   │            │◀─pending──────│              │              │
   │   [User approves in email/push — out of band]           │
   │            │──poll /token─▶│              │              │
   │            │◀──200 tokens──│              │              │
   │            │──token-exch──▶│              │              │
   │            │◀──T2 (MCP)────│              │              │
   │            │──tools/call──────────────────▶│             │
   │            │                              │──GET /tx────▶│
   │            │                              │◀──200─────────│
   │            │◀──tool result────────────────│              │
   │◀──success──│               │              │              │`}</pre>
    </>
  );
}

// ---------------------------------------------------------------------------
// TokenExchangeContent — RFC 8693 token exchange (full HTTP examples)
// ---------------------------------------------------------------------------

export function TokenExchangeContent() {
  return (
    <>
      <h3>Token exchange for MCP (RFC 8693)</h3>
      <p>
        This demo keeps OAuth tokens on the <strong>server</strong>. When the MCP layer needs an
        access token with the right <strong>audience</strong> for tools or delegation, the Banking
        BFF calls PingOne's <code>POST …/as/token</code> with{' '}
        <code>grant_type=token-exchange</code>. Below: what happens{' '}
        <em>before</em> and <em>after</em> that call, typical HTTP status codes, and
        success/error JSON shapes.
      </p>

      <h3>Where this runs</h3>
      <p>
        The browser <strong>never</strong> calls PingOne <code>/token</code> for MCP. The Banking
        API server holds the user's OAuth tokens in the session and, when a tool needs an
        MCP-scoped access token, performs RFC 8693 Token Exchange (
        <code>grant_type=urn:ietf:params:oauth:grant-type:token-exchange</code>) against
        PingOne's <code>POST …/as/token</code> endpoint (same host as your issuer).
      </p>

      <h3>Before the exchange — inputs the BFF already has</h3>
      <ul>
        <li>
          <strong>Session cookie</strong> — identifies the signed-in user (admin or customer).
        </li>
        <li>
          <strong>req.session (server)</strong> — <code>access_token</code> /{' '}
          <code>refresh_token</code> / user from the initial OAuth code flow.
        </li>
        <li>
          <strong>Optional "on behalf of" path</strong> — <code>USE_AGENT_ACTOR_FOR_MCP=true</code>{' '}
          and MCP resource URI set → the BFF may use <code>subject_token</code> (user) +{' '}
          <code>actor_token</code> (agent client-credentials token) so PingOne can mint a
          delegated token (JWT may include an <code>act</code> claim per your AS policy).
        </li>
      </ul>

      <h3>The token request (BFF → PingOne, not visible in browser DevTools)</h3>
      <pre className="edu-code">{`POST {issuer}/as/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:token-exchange
client_id=…  &  client_secret=…          (or other client auth per your app)
subject_token=<user access token from session>
subject_token_type=urn:ietf:params:oauth:token-type:access_token
audience=<MCP resource / API audience PingOne expects>
scope=<space-separated scopes for the MCP layer>

# Optional actor path (delegation):
actor_token=<token from agent client credentials>
actor_token_type=urn:ietf:params:oauth:token-type:access_token
# (PingOne policy must allow this exchange.)`}</pre>

      <h3>After a successful exchange — what the BFF receives</h3>
      <pre className="edu-code">{`HTTP/1.1 200 OK
Content-Type: application/json

{
  "access_token": "<JWT or opaque string — MCP/WebSocket uses this as Bearer>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "…",
  "issued_token_type": "urn:ietf:params:oauth:token-type:access_token"
}`}</pre>
      <p>
        The BFF then opens or reuses the WebSocket to <code>banking_mcp_server</code> and sends
        MCP messages that carry this token. Downstream Banking REST calls still use RS
        audience/scopes as configured.
      </p>

      <h3>HTTP status codes</h3>
      <ul>
        <li><strong>200</strong> — body is JSON with <code>access_token</code> (and usually <code>expires_in</code>).</li>
        <li><strong>400</strong> — invalid grant, wrong token type, audience not allowed, malformed request. Body often: <code>{`{"error":"invalid_grant","error_description":"…"}`}</code></li>
        <li><strong>401</strong> — client authentication failed (wrong <code>client_id</code>/secret or auth method).</li>
        <li><strong>403</strong> — policy or consent blocks the exchange.</li>
        <li><strong>502/503</strong> — BFF could not reach PingOne (network/DNS).</li>
      </ul>

      <h3>BFF API responses you may see in the browser</h3>
      <ul>
        <li><code>POST /api/mcp/tool</code> — 200 with MCP tool result JSON; 401 if no session or no usable token; 5xx if MCP server or PingOne is unreachable.</li>
        <li><code>GET /api/mcp/inspector/tools</code> — 200 with tools list; 401 if not authenticated.</li>
        <li><code>POST /api/mcp/inspector/invoke</code> — same pattern as tool calls.</li>
      </ul>

      <h3>Error JSON shape (OAuth-style, from PingOne through BFF)</h3>
      <pre className="edu-code">{`{ "error": "invalid_grant" | "invalid_client" | …, "error_description": "human-readable" }`}</pre>

      <h3>Mental model</h3>
      <ol>
        <li>User completes OAuth (authorization code) → session has subject token.</li>
        <li>User invokes MCP tool → BFF may exchange subject token for MCP-audience token (RFC 8693).</li>
        <li>Only after step 2 does the MCP layer see a Bearer suited to the tool/RS chain.</li>
      </ol>
      <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
        Open the Config page → "MCP Inspector setup" for env snippets that match your URL.
      </p>

      <h3>Delegation (actor_token path) — "on behalf of"</h3>
      <pre className="edu-code">{`── Delegation request (USE_AGENT_ACTOR_FOR_MCP=true) ──
POST {issuer}/as/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:token-exchange
client_id=<agent-client-id>
client_secret=<agent-client-secret>
subject_token=<user access token>           ← who is acting (human)
subject_token_type=urn:ietf:params:oauth:token-type:access_token
actor_token=<agent client_credentials token> ← who is acting on behalf (agent)
actor_token_type=urn:ietf:params:oauth:token-type:access_token
audience=<MCP resource URI>
scope=banking:read banking:write

── Success — delegated token ──
HTTP/1.1 200 OK
{
  "access_token": "eyJ...",    ← issued for agent acting as user
  "token_type": "Bearer",
  "expires_in": 3600,
  "issued_token_type": "urn:ietf:params:oauth:token-type:access_token"
}
// JWT may contain: { "sub": "<user>", "act": { "sub": "<agent-client-id>" } }

── PingOne policy note ──
  The exchange is only allowed if your PingOne token exchange policy
  permits this client + grant combination. If not configured:
  HTTP/1.1 400 { "error": "invalid_grant", "error_description": "..." }`}</pre>

      <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
        <strong>Related:</strong> the <strong>Sign-in &amp; roles</strong> tab in the CIBA Guide
        explains "on behalf of" and <code>/api/agent/identity/bootstrap</code>.{' '}
        <strong>Application Configuration</strong> includes an MCP Inspector setup wizard that
        generates env snippets and commands for your URLs.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// LoginFlowPkceContent — Rich PKCE deep dive with real HTTP examples
// ---------------------------------------------------------------------------

export function LoginFlowPkceContent() {
  return (
    <>
      <h3>Why PKCE? (RFC 7636)</h3>
      <p>
        PKCE (Proof Key for Code Exchange) prevents authorization code interception attacks.
        An attacker who intercepts the authorization code from the redirect cannot exchange it
        without the original <code>code_verifier</code> — which is only known to the server that
        started the flow.
      </p>
      <p>
        PKCE also makes <em>public clients</em> (apps that cannot store a client secret) safe to
        use with the authorization code flow. Even for confidential clients (like this BFF), PKCE
        is required by OAuth 2.1.
      </p>

      <h3>How the verifier/challenge pair works</h3>
      <pre className="edu-code">{`Server generates:
  code_verifier = base64url(random 32 bytes)   e.g. "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW..."
  code_challenge = base64url(SHA-256(code_verifier))

  The verifier is stored server-side (session).
  Only the challenge is sent to PingOne in step 1.
  The verifier is revealed only in step 2 (server-to-server).

Attack scenario:
  Attacker intercepts redirect: ?code=STOLEN&state=...
  Tries to POST /token with code=STOLEN  ← but has NO verifier
  PingOne: SHA256(nothing) ≠ stored challenge → 400 invalid_grant ✓`}</pre>

      <h3>Step 1 — Authorization request (browser redirect)</h3>
      <pre className="edu-code">{`GET /as/authorize
  ?response_type=code
  &client_id=<your-client-id>
  &redirect_uri=https%3A%2F%2Fapp.example.com%2Fapi%2Fauth%2Foauth%2Fcallback
  &scope=openid%20profile%20email%20banking%3Aread
  &state=<random-csrf-token>               ← CSRF protection; echoed back
  &code_challenge=<BASE64URL(SHA256(verifier))>
  &code_challenge_method=S256
  &resource=https%3A%2F%2Fapi.example.com%2F  ← RFC 8707 audience binding (optional)
  HTTP/1.1 302 Found
  Location: https://auth.pingone.com/.../as/authorize?... (PingOne login UI)`}</pre>

      <h3>Step 2 — Authorization callback (PingOne → BFF)</h3>
      <pre className="edu-code">{`GET /api/auth/oauth/callback
  ?code=<authorization-code>               ← short-lived, one-use
  &state=<same-random-token-from-step-1>   ← BFF validates: must match session
  &iss=https://auth.pingone.com/...        ← issuer identifier (RFC 9207)

  BFF validation:
    1. state matches → CSRF check passes
    2. code is present
    3. Proceed to token exchange`}</pre>

      <h3>Step 3 — Token request (server-to-server, never in browser)</h3>
      <pre className="edu-code">{`POST /as/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic <base64(client_id:client_secret)>

grant_type=authorization_code
&code=<authorization-code>
&redirect_uri=https%3A%2F%2Fapp.example.com%2Fapi%2Fauth%2Foauth%2Fcallback
&code_verifier=<original-code-verifier>    ← PingOne hashes this; must match challenge
&resource=https%3A%2F%2Fapi.example.com%2F  ← RFC 8707 (if used in step 1)

HTTP/1.1 200 OK
Content-Type: application/json

{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid profile email banking:read",
  "id_token": "eyJ...",
  "refresh_token": "...",
  "issued_token_type": "urn:ietf:params:oauth:token-type:access_token"
}`}</pre>

      <h3>Error responses</h3>
      <pre className="edu-code">{`── Bad code_verifier ──
HTTP/1.1 400 Bad Request
{ "error": "invalid_grant", "error_description": "PKCE verification failed" }

── Code already used ──
HTTP/1.1 400 Bad Request
{ "error": "invalid_grant", "error_description": "Authorization code already used" }

── State mismatch (BFF-side check, never reaches PingOne) ──
HTTP/1.1 400 Bad Request (from BFF)
{ "error": "invalid_state", "message": "OAuth state mismatch" }

── Client auth failure ──
HTTP/1.1 401 Unauthorized
{ "error": "invalid_client", "error_description": "Client authentication failed" }`}</pre>

      <h3>What PingOne validates</h3>
      <ul>
        <li><code>code</code> — exists, belongs to this client, not expired (usually 60s).</li>
        <li><code>redirect_uri</code> — exactly matches the registered URI (no trailing slash differences).</li>
        <li><code>code_verifier</code> — <code>BASE64URL(SHA256(verifier))</code> must equal the stored challenge.</li>
        <li><code>client_id</code> / client auth — correct credentials.</li>
      </ul>

      <h3>Why the tokens are stored server-side</h3>
      <p>
        After step 3, the BFF stores <code>access_token</code> and <code>refresh_token</code>{' '}
        in the <strong>server session</strong> and issues an <strong>httpOnly cookie</strong> to
        the browser. This means:
      </p>
      <ul>
        <li>XSS in the SPA cannot read the access token from JavaScript.</li>
        <li>The token is never in <code>localStorage</code>, <code>sessionStorage</code>, or any JS variable.</li>
        <li>Subsequent API calls use the session cookie; the BFF attaches the Bearer token server-side.</li>
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// LoginFlowSecurityContent — security notes: httpOnly, fixation, state, PKCE
// ---------------------------------------------------------------------------

export function LoginFlowSecurityContent() {
  return (
    <>
      <h3>Why T1 never touches the browser</h3>
      <p>
        Access tokens are stored in the BFF session (server memory / Redis / SQLite).
        The browser only holds an <strong>httpOnly, Secure</strong> session cookie. httpOnly
        means JavaScript cannot read it — <code>document.cookie</code> does not include it.
        This defeats a large class of XSS-based token theft.
      </p>
      <pre className="edu-code">{`Set-Cookie: sessionId=abc123; HttpOnly; Secure; SameSite=Lax; Path=/

// JavaScript in the browser:
document.cookie  // → does NOT contain sessionId
fetch('/api/auth/oauth/status', { credentials: 'include' })
  // ↑ cookie is sent automatically by the browser
  // ↓ server reads session, returns user info without exposing token`}</pre>

      <h3>Session fixation defence</h3>
      <p>
        On successful login, the server calls <code>session.regenerate()</code> to issue a new
        session ID. This prevents an attacker from pre-seeding a session ID (e.g. via a link)
        and then waiting for the victim to log in.
      </p>
      <pre className="edu-code">{`// Express session-based pattern:
req.session.regenerate((err) => {
  // new session ID issued — old cookie invalid
  req.session.user = userFromPingOne;
  req.session.access_token = tokens.access_token;
  res.redirect('/admin');
});`}</pre>

      <h3>State parameter (CSRF / mix-up defence)</h3>
      <p>
        A random <code>state</code> value is generated per authorize request, stored in the
        session, and compared on callback. If the returned <code>state</code> does not match,
        the callback is rejected with 400. This prevents:
      </p>
      <ul>
        <li><strong>CSRF</strong> — attacker cannot force your session to link their OAuth code to your account.</li>
        <li><strong>Mix-up attacks</strong> — malicious IDP cannot inject a code from a different provider.</li>
      </ul>
      <pre className="edu-code">{`// Generating state:
const state = crypto.randomBytes(16).toString('hex');
req.session.oauthState = state;

// Validating on callback:
if (req.query.state !== req.session.oauthState) {
  return res.status(400).json({ error: 'invalid_state' });
}
delete req.session.oauthState;`}</pre>

      <h3>PKCE vs implicit flow</h3>
      <pre className="edu-code">{`Implicit flow (deprecated, OAuth 2.1 removed):
  GET /authorize?response_type=token  ← returns access_token in URL fragment
  → Token visible in browser history, referrer headers, server logs
  → No code exchange, no code_verifier
  → Vulnerable to token leakage

Authorization Code + PKCE (current best practice):
  GET /authorize?response_type=code   ← returns short-lived code, not token
  → Token never appears in URL
  → PKCE prevents code interception
  → Code is one-use and expires quickly (typically 60s)`}</pre>

      <h3>Scope minimisation</h3>
      <p>
        Request only the scopes needed for the current flow. The BFF requests{' '}
        <code>openid profile email</code> for login, and adds <code>banking:read</code> or{' '}
        <code>banking:write</code> only when the session requires it. Wider scopes increase
        blast radius if tokens are ever compromised.
      </p>

      <h3>Token lifetime and refresh</h3>
      <pre className="edu-code">{`Access token:  typically 1h (expires_in=3600)
Refresh token: 24h or longer (depends on PingOne policy)

BFF refresh flow:
  access_token expired → BFF calls POST /as/token
    grant_type=refresh_token
    &refresh_token=<stored RT>
    &client_id=...
    &client_secret=...
  → new access_token (+ possibly new refresh_token)
  → silently; browser session cookie unchanged`}</pre>
    </>
  );
}

// ---------------------------------------------------------------------------
// OAuthApiCheatsheet — formatted API endpoint reference
// ---------------------------------------------------------------------------

export function OAuthApiCheatsheet() {
  return (
    <>
      <h3>OAuth / MCP / CIBA API endpoints (this deployment)</h3>
      <pre className="edu-code">{OAUTH_API_CHEATSHEET}</pre>

      <h3>Admin vs customer OAuth routes</h3>
      <pre className="edu-code">{`Admin login:    GET /api/auth/oauth/login
  → uses admin PingOne app (admin redirect URI)
  → after callback: redirect to /admin
  → new users get role=admin in demo store

Customer login: GET /api/auth/oauth/user/login
  → uses end-user PingOne app (customer redirect URI)
  → after callback: redirect to /dashboard
  → new users get role=customer + sample accounts`}</pre>

      <h3>How to read the session status</h3>
      <pre className="edu-code">{`GET /api/auth/oauth/status
Authorization: (session cookie)

200 OK — logged in as admin
{
  "authenticated": true,
  "user": { "id": "...", "email": "...", "role": "admin" },
  "oauthId": "pingone-sub-value",
  "cibaEnabled": true
}

401 Unauthorized — not logged in
{ "authenticated": false }`}</pre>

      <h3>CIBA-specific endpoints</h3>
      <pre className="edu-code">{`POST /api/auth/ciba/initiate
  Body: { login_hint, scope, binding_message, acr_values }
  Response: { auth_req_id, expires_in, login_hint_display }

GET /api/auth/ciba/poll/:authReqId
  Response (pending):  { status: "pending" }
  Response (approved): { status: "approved" }
  Response (denied):   HTTP 400 { status: "denied", message: "..." }
  Response (expired):  HTTP 410 { status: "expired" }

POST /api/auth/ciba/cancel/:authReqId
  → Discards the pending request server-side`}</pre>
    </>
  );
}

// ---------------------------------------------------------------------------
// McpProtocolContent — What MCP is, tool calls, authorization, WebSocket format
// ---------------------------------------------------------------------------

export function McpProtocolContent() {
  return (
    <>
      <h3>What is MCP?</h3>
      <p>
        <strong>Model Context Protocol (MCP)</strong> is an open standard that structures how
        an LLM host discovers and invokes tools exposed by a server. It uses{' '}
        <strong>JSON-RPC 2.0</strong> messages, typically over a WebSocket or stdio transport.
        This demo uses WebSocket to <code>banking_mcp_server</code>.
      </p>
      <p>
        MCP standardises: tool discovery (<code>tools/list</code>), tool invocation (
        <code>tools/call</code>), and (in recent spec versions) OAuth 2.0 authorization
        including resource indicators (RFC 8707) and authorization server metadata discovery
        (RFC 9728).
      </p>

      <h3>tools/list — discover what the server offers</h3>
      <pre className="edu-code">{`→ Client sends:
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "params": {},
  "id": 1
}

← Server responds:
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "get_my_accounts",
        "description": "List all accounts for the authenticated user",
        "inputSchema": {
          "type": "object",
          "properties": {},
          "required": []
        }
      },
      {
        "name": "create_transfer",
        "description": "Transfer funds between accounts",
        "inputSchema": {
          "type": "object",
          "properties": {
            "fromAccountId": { "type": "string" },
            "toAccountId":   { "type": "string" },
            "amount":        { "type": "number" }
          },
          "required": ["fromAccountId", "toAccountId", "amount"]
        }
      }
    ]
  }
}`}</pre>

      <h3>tools/call — invoke a tool</h3>
      <pre className="edu-code">{`→ Client sends:
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "create_transfer",
    "arguments": {
      "fromAccountId": "acc_001",
      "toAccountId":   "acc_002",
      "amount":        150.00
    }
  },
  "id": 2
}

← Server responds (success):
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Transfer of $150.00 confirmed. Transaction ID: txn_abc123"
      }
    ],
    "isError": false
  }
}

← Server responds (tool error):
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      { "type": "text", "text": "Insufficient funds" }
    ],
    "isError": true
  }
}`}</pre>

      <h3>Authorization flow (MCP + OAuth)</h3>
      <p>
        The MCP spec (2025-11-25) requires servers to support OAuth 2.0 with{' '}
        <strong>resource indicators (RFC 8707)</strong> and AS metadata discovery via{' '}
        <code>/.well-known/oauth-authorization-server</code> (RFC 9728).
      </p>
      <pre className="edu-code">{`MCP client → GET {mcp-server}/.well-known/oauth-authorization-server
← { "issuer": "https://auth.pingone.com/...", "token_endpoint": "...", ... }

MCP client performs OAuth flow (PKCE or token exchange)
  → obtains access token with audience = MCP server URL

MCP client → WebSocket ws://mcp-server/mcp
  Headers: Authorization: Bearer <access-token>

MCP server:
  1. Validate Bearer token (introspection or JWKS)
  2. Check aud == MCP server URL         (RFC 8707)
  3. Check required scopes               (e.g. banking:read)
  4. If valid → accept connection; run tools
  5. If invalid → close with 401

Tool execution (server-side, invisible to MCP client):
  MCP server → Banking REST API
    Authorization: Bearer <same token or downstream token>
  Banking API validates token independently`}</pre>

      <h3>How the BFF path works (this demo)</h3>
      <pre className="edu-code">{`Browser  (session cookie)
  ↓
BFF  POST /api/mcp/tool  { name, arguments }
  ↓ (optional) RFC 8693 token exchange → T2 with MCP audience
  ↓
WebSocket  ws://banking_mcp_server  Authorization: Bearer T2
  ↓  tools/call  JSON-RPC
  ↓
MCP server validates T2 + scopes
  ↓
Banking REST API  Authorization: Bearer T2 (or downstream token)
  ↓
Response bubbles back to browser via BFF`}</pre>

      <h3>Why JSON-RPC 2.0?</h3>
      <ul>
        <li>Symmetric — client and server can both initiate requests.</li>
        <li>Stateless per request — <code>id</code> correlates requests to responses.</li>
        <li>Notification support — <code>id: null</code> for fire-and-forget.</li>
        <li>Well-defined error codes — <code>-32600</code> invalid request, <code>-32601</code> method not found, etc.</li>
        <li>Transport-agnostic — works over WebSocket, stdio, HTTP (SSE for streaming).</li>
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// IntrospectionContent — RFC 7662 introspection (why, request, response)
// ---------------------------------------------------------------------------

export function IntrospectionContent() {
  return (
    <>
      <h3>What is token introspection? (RFC 7662)</h3>
      <p>
        Token introspection is a server-to-server call where a resource server or MCP server
        asks the authorization server: <em>"Is this token active, and what are its claims?"</em>{' '}
        PingOne returns <code>active: true/false</code> and the token's claim set.
      </p>
      <p>
        Unlike JWKS-based local validation, introspection always reflects the current state
        at the AS — including revoked tokens, updated scopes, or <code>act</code> claims that
        may not be in the token's JWT body.
      </p>

      <h3>POST /as/introspect — request</h3>
      <pre className="edu-code">{`POST {issuer}/as/introspect
Content-Type: application/x-www-form-urlencoded
Authorization: Basic <base64(client_id:client_secret)>

token=<access-token-to-check>
&token_type_hint=access_token`}</pre>

      <h3>Response — active token</h3>
      <pre className="edu-code">{`HTTP/1.1 200 OK
Content-Type: application/json

{
  "active": true,
  "sub": "user-pingone-id",
  "aud": "https://api.example.com/",      ← resource server audience
  "iss": "https://auth.pingone.com/.../as",
  "client_id": "banking-bff-client-id",
  "scope": "openid banking:read",
  "exp": 1712345678,
  "iat": 1712342078,
  "jti": "unique-token-id",
  "act": {                                 ← delegation claim (if token exchange used)
    "sub": "agent-client-id"
  }
}`}</pre>

      <h3>Response — inactive / revoked / expired token</h3>
      <pre className="edu-code">{`HTTP/1.1 200 OK
Content-Type: application/json

{
  "active": false
}
// No other claims are returned for inactive tokens.
// Treat this as: reject the request with 401.`}</pre>

      <h3>Error responses</h3>
      <pre className="edu-code">{`── Bad client credentials ──
HTTP/1.1 401 Unauthorized
{ "error": "invalid_client", "error_description": "Client authentication failed" }

── Malformed request ──
HTTP/1.1 400 Bad Request
{ "error": "invalid_request", "error_description": "Missing token parameter" }`}</pre>

      <h3>Introspection vs JWKS local validation</h3>
      <pre className="edu-code">{`Feature                  Introspection (RFC 7662)   JWKS local (JWT signature)
─────────────────────────────────────────────────────────────────────────────
Network call per request YES                        NO (cache public keys)
Reflects revocation      YES (always current)       NO (only until exp)
Works with opaque tokens YES                        NO (needs JWT structure)
act / delegation claims  YES (AS adds them)         Only if in JWT body
Latency                  ~50-200ms round trip       <1ms (local verify)
Best for                 MCP / proxy validation,    High-throughput RS,
                         opaque tokens, act claims  JWT access tokens`}</pre>

      <h3>When to use introspection</h3>
      <ul>
        <li>The token is <strong>opaque</strong> (not a JWT) — you cannot decode it locally.</li>
        <li>You need <strong>delegation claims</strong> (<code>act</code>) that may not be in the JWT body.</li>
        <li>You need to check <strong>revocation in real time</strong> (e.g. after a user's session is terminated).</li>
        <li>The resource server does not want to cache JWKS or manage key rotation.</li>
      </ul>

      <h3>Where introspection fits in this demo</h3>
      <p>
        The <code>banking_mcp_server</code> can call PingOne's introspection endpoint with the
        Bearer token presented on WebSocket connection. It checks <code>active</code>,{' '}
        <code>aud</code>, <code>act</code> (delegation from BFF), and <code>scope</code> before
        allowing tool calls. The Banking REST API uses JWKS local validation for performance.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// AgentGatewayContent — Agent gateway pattern, RFC 8707, RFC 9728
// ---------------------------------------------------------------------------

export function AgentGatewayContent() {
  return (
    <>
      <h3>Agent Gateway pattern</h3>
      <p>
        An <strong>Agent Gateway</strong> is a security boundary between the LLM / agent and
        resource servers. It enforces OAuth token validation, scope checks, and token exchange
        so individual tools stay thin and security policy is centralised. This matches the{' '}
        <strong>Agent Gateway demo architecture.vsdx</strong> reference design in this repo.
      </p>

      <h3>Full architecture (swimlanes)</h3>
      <pre className="edu-code">{`
  Web Browser SPA
       │ HTTPS (session cookie only — no OAuth tokens in JS)
       ▼
┌──────────────────────────────────────────────────────────────┐
│ Agent / BFF — security strip                                  │
│  OAuth 2.1 · RFC 8707 · RFC 9728 · RFC 8693 · RFC 7523       │
│  ┌─────┐  ┌────────┐  ┌────────────────┐                     │
│  │ LLM │  │ memory │  │ business logic │                     │
│  └─────┘  └────────┘  └────────────────┘                     │
└────────────────────────┬─────────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          │ Ingress                     │ Egress
          │ Validate Bearer             │ RFC 8693 token exchange
          │ Check aud + scope           │ RFC 8707 resource indicator
          │ RFC 7662 introspection      │ RFC 9728 AS discovery
          ▼                             ▼
┌─────────────────┐          ┌──────────────────────────────────┐
│ IDP / AS        │          │ MCP Server / Tool                │
│ PingOne         │          │ tools/list  ·  tools/call        │
│ /authorize      │          │ Validates Bearer (aud = MCP RS)  │
│ /token          │          └─────────────────┬────────────────┘
│ /introspect     │                            │ Bearer (aud = Banking RS)
│ JWKS            │                            ▼
└─────────────────┘          ┌──────────────────────────────────┐
                             │ Resource Server — Banking API    │
                             │ Validates aud, scope, signature  │
                             └──────────────────────────────────┘
`}</pre>

      <h3>Ingress — validating every inbound tool call</h3>
      <p>
        Every <code>tools/call</code> enters the gateway. The ingress layer:
      </p>
      <pre className="edu-code">{`1. Extract Bearer from Authorization header (or MCP protocol header)
2. Validate token:
   a. Signature check (JWKS) or introspection (RFC 7662)
   b. aud == gateway's own resource URL
   c. scope includes required permission for the requested tool
   d. exp > now (not expired)
3. Extract subject (sub) and optional actor (act) for audit
4. If valid: forward to MCP server with tool arguments
5. If invalid:
   HTTP/1.1 401 Unauthorized
   WWW-Authenticate: Bearer error="invalid_token"
   { "error": "Unauthorized", "detail": "Token validation failed" }`}</pre>

      <h3>Egress — calling an external MCP peer with a peer-scoped token</h3>
      <p>
        When the gateway calls an external MCP server, it cannot reuse the inbound token —
        the audience is wrong. It performs RFC 8693 token exchange to get a token whose
        audience matches the target MCP server.
      </p>
      <pre className="edu-code">{`POST {issuer}/as/token
grant_type=urn:ietf:params:oauth:grant-type:token-exchange
subject_token=<inbound token>
subject_token_type=urn:ietf:params:oauth:token-type:access_token
audience=<target-mcp-server-url>           ← RFC 8707 resource
scope=<scopes needed by target tool>

← 200 { "access_token": "<T2 for target MCP server>", ... }

WebSocket: ws://target-mcp-server/mcp
  Authorization: Bearer <T2>
  tools/call { ... }`}</pre>

      <h3>RFC 8707 — resource indicators</h3>
      <p>
        The <code>resource</code> parameter in <code>/authorize</code> and <code>/token</code>{' '}
        requests binds the issued access token's <code>aud</code> claim to a specific resource
        server URL. This prevents tokens from being replayed against unrelated APIs.
      </p>
      <pre className="edu-code">{`Without RFC 8707:
  Token issued with aud="client-id" or generic audience
  → Could be sent to ANY API that trusts this AS
  → Confused deputy risk

With RFC 8707:
  Phase 1: GET /authorize?...&resource=https://mcp.example.com/
  Phase 2: POST /token        ...&resource=https://mcp.example.com/
  Token:   { "aud": "https://mcp.example.com/" }
  → MCP server accepts; Banking API rejects (wrong aud) ✓
  → Token is bound to its intended audience at issuance`}</pre>

      <h3>RFC 9728 — OAuth 2.0 for MCP (AS metadata discovery)</h3>
      <p>
        MCP clients use RFC 9728 to discover the authorization server that protects an MCP
        server without prior configuration.
      </p>
      <pre className="edu-code">{`Step 1 — Client probes MCP server for AS metadata:
  GET {mcp-server}/.well-known/oauth-authorization-server
  ← {
      "issuer": "https://auth.pingone.com/.../as",
      "authorization_endpoint": ".../as/authorize",
      "token_endpoint": ".../as/token",
      "introspection_endpoint": ".../as/introspect",
      "response_types_supported": ["code"],
      "grant_types_supported": ["authorization_code", "token-exchange"],
      "code_challenge_methods_supported": ["S256"],
      "resource": "https://mcp.example.com/"   ← RFC 8707 resource URI
    }

Step 2 — Client performs PKCE or token exchange using discovered endpoints
Step 3 — Client connects with Bearer whose aud = discovered resource

MCP spec reference:
  https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization`}</pre>

      <h3>Security strip — defence in depth</h3>
      <p>
        The "security strip" in the swimlane diagram represents the set of RFC-enforced checks
        that every request passes through before reaching business logic:
      </p>
      <ul>
        <li><strong>OAuth 2.1</strong> — no implicit flow, PKCE required, no fragment tokens.</li>
        <li><strong>RFC 8707</strong> — audience binding prevents token reuse across APIs.</li>
        <li><strong>RFC 9728</strong> — standardised AS discovery; no hardcoded endpoints.</li>
        <li><strong>RFC 8693</strong> — safe token narrowing for downstream calls.</li>
        <li><strong>RFC 7523</strong> — JWT client authentication (vs shared secret) for machine-to-machine.</li>
        <li><strong>RFC 9449 DPoP</strong> (best practice) — sender-constrained tokens; stolen Bearer unusable.</li>
      </ul>

      <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
        See the <strong>Full stack</strong> tab in the CIBA Guide for how this demo maps
        these RFCs to PingOne, the Banking BFF, and <code>banking_mcp_server</code>.
      </p>
    </>
  );
}
