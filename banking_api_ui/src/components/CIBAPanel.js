/**
 * CIBAPanel.js — Floating CIBA (Client-Initiated Backchannel Authentication) panel
 *
 * A persistent floating button in the bottom-right corner that opens a
 * slide-in drawer explaining CIBA and letting the user trigger / monitor
 * a live CIBA authentication flow.
 *
 * Tabs:
 *   1. What is CIBA  — explainer with sequence diagram
 *   2. Sign-in & roles — admin vs customer, where each lands, banking agent vs login
 *   3. Try It        — initiate a live CIBA request and watch it poll
 *   4. How This App Uses It — MCP agent flow, step-up transactions
 *   5. PingOne Setup — what needs to be configured in the admin console
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import './CIBAPanel.css';
import {
  CibaWhatContent,
  CibaFullStackContent,
  TokenExchangeContent,
} from './education/educationContent';

// ---------------------------------------------------------------------------
// Static content
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

/**
 * Same swimlane pattern + RFC callouts as Agent Gateway demo architecture.vsdx:
 * Web Browser SPA → Agent (security strip) → MCP ingress / egress gateway behavior
 * → MCP Server / Tool → Resource Server; 401 → OAuth flows → Bearer retry;
 * OAuth phased with resource indicator (RFC 8707).
 */
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
Agent identity (optional “on behalf of”):
  GET  /api/agent/identity/status         Actor bootstrap / mapping status
  POST /api/agent/identity/bootstrap      Optional ROPC + PingOne user for agent client
CIBA (when enabled):
  POST /api/auth/ciba/initiate            Start backchannel auth
  GET  /api/auth/ciba/poll/:authReqId     Poll until approved or denied
`;

/** RFC 8693 token exchange as used by the Banking BFF before MCP calls — see Token exchange tab. */
const TOKEN_EXCHANGE_EDU = `
── Where this runs ──
  The browser never calls PingOne /token for MCP. The Banking API server holds the user’s
  OAuth tokens in the session and, when a tool needs an MCP-scoped access token, performs
  RFC 8693 Token Exchange (grant_type=urn:ietf:params:oauth:grant-type:token-exchange)
  against PingOne’s POST …/as/token endpoint (same host as your issuer).

── BEFORE the token exchange (inputs the BFF already has) ──
  • Session cookie → identifies the signed-in user (admin or customer).
  • req.session (server) → access_token / refresh_token / user from the initial OAuth code flow.
  • Optional “on behalf of” path: USE_AGENT_ACTOR_FOR_MCP=true and MCP resource URI set →
    the BFF may use subject_token (user) + actor_token (AGENT_OAUTH_CLIENT_* client-credentials
    token) so PingOne can mint a delegated token (JWT may include an “act” claim per your AS policy).

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
  Open the Config page → “MCP Inspector setup” for commands and env snippets that match your URL.
`;

const PINGONE_STEPS = [
  {
    step: '1',
    title: 'Enable CIBA Grant Type',
    detail: 'PingOne Admin → Applications → (your app) → Grant Types → enable "urn:openid:params:grant-type:ciba"',
  },
  {
    step: '2',
    title: 'Set Token Delivery Mode',
    detail: 'In the CIBA section: Token Delivery Mode = "Poll" (simplest). Set Auth Request Expiry = 300s.',
  },
  {
    step: '3',
    title: 'Email-only CIBA = no MFA push required',
    detail:
      'In DaVinci, configure the CIBA flow to send an approval email (notification template with approve link). Users confirm in their inbox — you do not need PingOne MFA push or a registered authenticator app for that path.',
  },
  {
    step: '4',
    title: 'Optional — push approval instead of email',
    detail:
      'If your DaVinci flow delivers CIBA via push to a device, enable Push Notification in your MFA policy and register PingID / MS Authenticator (or your IdP’s device MFA). Email vs push is chosen in PingOne, not in this app.',
  },
  {
    step: '5',
    title: 'Set CIBA_ENABLED=true',
    detail: 'In your .env or Vercel environment variables, add: CIBA_ENABLED=true',
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TabButton({ id, label, active, onClick }) {
  return (
    <button
      className={`ciba-tab${active ? ' ciba-tab--active' : ''}`}
      onClick={() => onClick(id)}
    >
      {label}
    </button>
  );
}

function CodeBlock({ children }) {
  return (
    <pre className="ciba-code">
      <code>{children}</code>
    </pre>
  );
}

function StatusBadge({ status }) {
  const map = {
    idle:     { color: '#6b7280', label: 'Idle' },
    loading:  { color: '#2563eb', label: 'Initiating…' },
    pending:  { color: '#d97706', label: '⏳ Waiting for approval' },
    approved: { color: '#16a34a', label: '✅ Approved' },
    denied:   { color: '#dc2626', label: '❌ Denied' },
    error:    { color: '#dc2626', label: '⚠ Error' },
    expired:  { color: '#9ca3af', label: 'Expired' },
  };
  const s = map[status] || map.idle;
  return (
    <span style={{ color: s.color, fontWeight: 600, fontSize: '0.9rem' }}>
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// "Try It" tab — live CIBA demo
// ---------------------------------------------------------------------------

function TryItTab({ cibaStatus }) {
  const [emailHint, setEmailHint]   = useState('');
  const [scope, setScope]           = useState('openid profile email');
  const [message, setMessage]       = useState('Banking App - Demo Authentication');
  const [acrValues, setAcrValues]   = useState('');
  const [status, setStatus]         = useState('idle'); // idle|loading|pending|approved|denied|error|expired
  const [authReqId, setAuthReqId]   = useState(null);
  const [errorMsg, setErrorMsg]     = useState('');
  const [pollLog, setPollLog]       = useState([]);
  const [expiresAt, setExpiresAt]   = useState(null);
  const [timeLeft, setTimeLeft]     = useState(null);
  const pollRef = useRef(null);
  const timerRef = useRef(null);

  const log = (msg) => setPollLog((prev) => [`${new Date().toLocaleTimeString()} — ${msg}`, ...prev].slice(0, 20));

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    pollRef.current = null;
    timerRef.current = null;
  }, []);

  const cancel = useCallback(async () => {
    stopPolling();
    if (authReqId) {
      try { await axios.post(`/api/auth/ciba/cancel/${authReqId}`); } catch (_) {}
    }
    setStatus('idle');
    setAuthReqId(null);
    setPollLog([]);
    setExpiresAt(null);
    setTimeLeft(null);
  }, [authReqId, stopPolling]);

  // Poll effect
  useEffect(() => {
    if (status !== 'pending' || !authReqId) return;
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await axios.get(`/api/auth/ciba/poll/${authReqId}`);
        log(`poll → ${data.status}${data.slow_down ? ' (slow_down)' : ''}`);
        if (data.status === 'approved') {
          stopPolling();
          setStatus('approved');
        }
      } catch (err) {
        const s = err.response?.data?.status;
        if (s === 'denied') {
          stopPolling();
          setStatus('denied');
          setErrorMsg(err.response?.data?.message || 'User denied the request');
          log('denied by user');
        } else if (err.response?.status === 410) {
          stopPolling();
          setStatus('expired');
          log('request expired');
        } else {
          log(`poll error: ${err.message}`);
        }
      }
    }, 5000);
    return stopPolling;
  }, [status, authReqId, stopPolling]);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;
    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0) stopPolling();
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [expiresAt, stopPolling]);

  const initiate = async () => {
    if (!cibaStatus?.enabled) return;
    setStatus('loading');
    setErrorMsg('');
    setPollLog([]);
    setAuthReqId(null);
    log('initiating CIBA request…');
    try {
      const { data } = await axios.post('/api/auth/ciba/initiate', {
        login_hint: emailHint || undefined,
        scope,
        binding_message: message,
        acr_values: acrValues || undefined,
      });
      setAuthReqId(data.auth_req_id);
      setExpiresAt(Date.now() + data.expires_in * 1000);
      setStatus('pending');
      log(`auth_req_id: ${data.auth_req_id.slice(0, 12)}…  expires in ${data.expires_in}s`);
      log(`CIBA requested for: ${data.login_hint_display}`);
    } catch (err) {
      setStatus('error');
      const d = err.response?.data;
      setErrorMsg(d?.message || d?.error || err.message);
      log(`error: ${d?.message || err.message}`);
    }
  };

  if (!cibaStatus?.enabled) {
    return (
      <div className="ciba-tab-content">
        <div className="ciba-notice ciba-notice--warning">
          <strong>CIBA is not enabled.</strong> Set <code>CIBA_ENABLED=true</code> and
          configure PingOne (see the Setup tab) to try a live demo.
        </div>
        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '1rem' }}>
          Once enabled, this tab lets you initiate a live CIBA request (approval is by email or push
          depending on your PingOne / DaVinci setup) and watch the polling loop in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="ciba-tab-content">
      <p className="ciba-section-desc">
        <strong>What you are exercising:</strong> <code>POST /api/auth/ciba/initiate</code> starts a CIBA request at PingOne
        (backchannel). The server returns an <code>auth_req_id</code>. This UI then calls{' '}
        <code>GET /api/auth/ciba/poll/:id</code> until PingOne issues tokens (approved) or returns denied / expired.
        Tokens are written to the <strong>BFF session</strong> — they are not returned to the browser.
      </p>
      <p className="ciba-section-desc">
        Initiate a live CIBA request. PingOne will deliver the approval step by <strong>email</strong> or{' '}
        <strong>push</strong> depending on how you configured DaVinci — this app only sends{' '}
        <code>login_hint</code> and <code>binding_message</code>.
      </p>

      {/* Form */}
      {status === 'idle' || status === 'error' ? (
        <div className="ciba-form">
          <label className="ciba-label">
            User email (login_hint)
            <input
              className="ciba-input"
              type="email"
              value={emailHint}
              onChange={(e) => setEmailHint(e.target.value)}
              placeholder="Defaults to currently logged-in user's email"
            />
          </label>
          <label className="ciba-label">
            Scopes
            <input
              className="ciba-input"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="openid profile email"
            />
          </label>
          <label className="ciba-label">
            Binding message (shown in email or on device push)
            <input
              className="ciba-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          <label className="ciba-label">
            ACR values (step-up, optional)
            <input
              className="ciba-input"
              value={acrValues}
              onChange={(e) => setAcrValues(e.target.value)}
              placeholder="e.g. Multi_factor"
            />
          </label>
          {status === 'error' && (
            <div className="ciba-notice ciba-notice--error">{errorMsg}</div>
          )}
          <button className="ciba-btn ciba-btn--primary" onClick={initiate}>
            📲 Start CIBA request
          </button>
        </div>
      ) : (
        <div className="ciba-live">
          <div className="ciba-live-status">
            <StatusBadge status={status} />
            {timeLeft !== null && status === 'pending' && (
              <span className="ciba-timer">Expires in {timeLeft}s</span>
            )}
          </div>

          {status === 'pending' && (
            <div className="ciba-notice ciba-notice--info">
              Complete approval where PingOne sent it — <strong>email inbox</strong> or <strong>device push</strong> (your PingOne setup).<br />
              This panel polls <code>/api/auth/ciba/poll/{authReqId?.slice(0,12)}…</code> every 5 seconds.
            </div>
          )}

          {status === 'approved' && (
            <div className="ciba-notice ciba-notice--success">
              ✅ User approved! Tokens stored server-side in the BFF session.
              They are never sent to this browser.
            </div>
          )}

          {status === 'denied' && (
            <div className="ciba-notice ciba-notice--error">
              ❌ {errorMsg || 'User denied the request or it expired.'}
            </div>
          )}

          {/* Poll log */}
          <div className="ciba-poll-log">
            <div className="ciba-poll-log-title">Poll log</div>
            {pollLog.map((line, i) => (
              <div key={i} className="ciba-poll-line">{line}</div>
            ))}
          </div>

          <button className="ciba-btn ciba-btn--secondary" onClick={cancel}>
            Cancel / Reset
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main CIBAPanel component
// ---------------------------------------------------------------------------

export default function CIBAPanel() {
  const [open, setOpen]           = useState(false);
  const [activeTab, setActiveTab] = useState('what');
  const [cibaStatus, setCibaStatus] = useState(null);

  // Fetch CIBA enabled status once
  useEffect(() => {
    axios.get('/api/auth/ciba/status')
      .then(({ data }) => setCibaStatus(data))
      .catch(() => setCibaStatus({ enabled: false }));
  }, []);

  const tabs = [
    { id: 'what',      label: 'What is CIBA' },
    { id: 'roles',     label: 'Sign-in & roles' },
    { id: 'fullstack', label: 'Full stack' },
    { id: 'tokenx',    label: 'Token exchange' },
    { id: 'vslogin',   label: 'vs Login Flow' },
    { id: 'tryit',     label: '▶ Try It' },
    { id: 'appflow',   label: 'App Flows' },
    { id: 'setup',     label: 'PingOne Setup' },
  ];

  useEffect(() => {
    const valid = new Set(['what', 'roles', 'fullstack', 'tokenx', 'vslogin', 'tryit', 'appflow', 'setup']);
    const onEdu = (e) => {
      setOpen(true);
      const t = e.detail?.tab;
      setActiveTab(valid.has(t) ? t : 'what');
    };
    window.addEventListener('education-open-ciba', onEdu);
    return () => window.removeEventListener('education-open-ciba', onEdu);
  }, []);

  return (
    <>
      {/* Floating trigger button */}
      <button
        className={`ciba-fab${open ? ' ciba-fab--open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Learn CIBA — backchannel authentication & app flows"
        aria-label="Open CIBA guide and try backchannel authentication"
      >
        <span className="ciba-fab-icon">📲</span>
        <span className="ciba-fab-label">CIBA guide</span>
        {cibaStatus?.enabled && <span className="ciba-fab-dot" title="CIBA enabled" />}
      </button>

      {/* Drawer overlay */}
      {open && (
        <div className="ciba-overlay" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      {/* Drawer */}
      <div className={`ciba-drawer${open ? ' ciba-drawer--open' : ''}`} role="dialog" aria-modal="true" aria-label="CIBA Panel">
        {/* Header */}
        <div className="ciba-header">
          <div>
            <h2 className="ciba-title">
              Backchannel Authentication
              {cibaStatus?.enabled
                ? <span className="ciba-badge ciba-badge--on">Enabled</span>
                : <span className="ciba-badge ciba-badge--off">Disabled</span>}
            </h2>
            <p className="ciba-subtitle">
              OIDC CIBA plus OAuth tokens, BFF session, MCP, and RFC 8693 token exchange — open <strong>Full stack</strong> for the map and <strong>Token exchange</strong> for before/after <code>/token</code>, statuses, and responses.
            </p>
          </div>
          <button className="ciba-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
        </div>

        {/* Tabs */}
        <div className="ciba-tabs">
          {tabs.map((t) => (
            <TabButton key={t.id} id={t.id} label={t.label} active={activeTab === t.id} onClick={setActiveTab} />
          ))}
        </div>

        {/* Tab content */}
          <div className="ciba-body">

          {/* ── Full stack (platform map) ── */}
          {activeTab === 'fullstack' && (
            <div className="ciba-tab-content">
              <CibaFullStackContent />
            </div>
          )}

          {/* ── Token exchange (RFC 8693) — before/after token, HTTP, responses ── */}
          {activeTab === 'tokenx' && (
            <div className="ciba-tab-content">
              <TokenExchangeContent />
            </div>
          )}

          {activeTab === 'vslogin' && (
            <div className="ciba-tab-content">
              <h3 className="ciba-section-title">CIBA vs Authorization Code (login flow)</h3>
              <div className="ciba-cards" style={{ marginBottom: '1rem' }}>
                <div className="ciba-card">
                  <div className="ciba-card-icon">📲</div>
                  <div>
                    <strong>CIBA</strong><br />
                    No browser redirect to PingOne for the approval step. User gets out-of-band approval (email or push per your PingOne config); server polls{' '}
                    <code>POST /token</code> with <code>grant_type=ciba</code>. Good for agents and step-up without breaking chat.
                  </div>
                </div>
                <div className="ciba-card">
                  <div className="ciba-card-icon">🔐</div>
                  <div>
                    <strong>Authorization Code + PKCE</strong><br />
                    Full browser redirect to PingOne login page, then redirect back with <code>code</code>. Immediate session establishment;
                    standard for SPAs with BFF. See <strong>Learn → Login Flow</strong> in the top bar.
                  </div>
                </div>
              </div>
              <p className="ciba-section-desc">
                Both are OAuth-family flows at PingOne; this app can use CIBA when enabled for high-value actions and uses Authorization Code for sign-in.
              </p>
            </div>
          )}

          {/* ── Sign-in, admin vs customer, banking agent ── */}
          {activeTab === 'roles' && (
            <div className="ciba-tab-content">
              <h3 className="ciba-section-title">Two different OAuth sign-ins</h3>
              <p className="ciba-section-desc">
                Each button on the login page starts a <em>different</em> authorization flow (admin PingOne app vs end-user app). On <strong>Vercel</strong>, those clients and secrets are <strong>pre-configured on the server</strong> — visitors do not type OAuth credentials in Application Configuration — but <strong>both</strong> Admin and Customer sign-in are still available. On <strong>localhost</strong>, you configure those apps in the Config UI (SQLite).
              </p>
              <div className="ciba-cards" style={{ marginBottom: '1rem' }}>
                <div className="ciba-card">
                  <div className="ciba-card-icon">👑</div>
                  <div>
                    <strong>Admin sign-in</strong> — <code>GET /api/auth/oauth/login</code><br />
                    Uses the <strong>admin</strong> PingOne application (admin redirect URI). After PingOne returns, the browser is redirected to the <strong>Admin Dashboard</strong> at <code>/admin</code> (or <code>FRONTEND_ADMIN_URL</code> if set). In this demo, <strong>new</strong> users created through this flow get the <strong>admin</strong> role in the local user store.
                  </div>
                </div>
                <div className="ciba-card">
                  <div className="ciba-card-icon">👤</div>
                  <div>
                    <strong>Customer sign-in</strong> — <code>GET /api/auth/oauth/user/login</code><br />
                    Uses the <strong>end-user</strong> PingOne application (customer redirect URI). After callback, customers go to <strong>Personal Account Dashboard</strong> at <code>/dashboard</code>. New users get the <strong>customer</strong> role and sample accounts. The demo store may still list you as <strong>admin</strong> if you also use Admin sign-in, but the <strong>customer</strong> app session always uses the end-user role for the SPA (not the admin dashboard).
                  </div>
                </div>
              </div>

              <h3 className="ciba-section-title">What admins can do that customers cannot</h3>
              <ul className="ciba-flow-list">
                <li><strong>Admin</strong> (<code>role === &apos;admin&apos;</code>): Activity logs, manage users, view <em>all</em> accounts and transactions, Security Settings (thresholds / PingOne Authorize integration), Application Configuration link, full MCP Inspector. Routed to <code>/admin</code> and admin-only routes.</li>
                <li><strong>Customer</strong> (<code>role === &apos;customer&apos;</code>): Personal dashboard only — own accounts, deposits, transfers, withdrawals within normal policy; MCP Inspector in read-oriented use; no tenant-wide admin screens.</li>
              </ul>
              <p className="ciba-section-desc" style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                The UI loads the signed-in user from <code>GET /api/auth/oauth/status</code> (admin PingOne app only) and <code>GET /api/auth/oauth/user/status</code> (end-user app). End-user sessions are not treated as admin SPA sessions, so customer sign-in does not open the admin dashboard.
              </p>

              <h3 className="ciba-section-title">Banking Agent (robot button) vs signing in</h3>
              <p className="ciba-section-desc">
                The <strong>Banking Agent</strong> panel is <em>not</em> a third identity. It does not log you in by itself. When you <strong>are</strong> signed in, the Agent calls <code>POST /api/mcp/tool</code>; the API server attaches your <strong>current session&apos;s OAuth access token</strong> and forwards MCP tool calls (accounts, transactions, etc.) <strong>as you</strong>. So the Agent is the same user as the browser session — just a different UI (MCP tools) on top of the same BFF session cookie.
              </p>
              <p className="ciba-section-desc">
                When you are <strong>not</strong> signed in, the Agent only offers Configure and the two login buttons — it cannot run banking tools until a session exists.
              </p>
              <div className="ciba-notice ciba-notice--info">
                <strong>How we know who you are:</strong> the server reads <code>req.session.user</code> for the human. For MCP tool calls, the BFF can optionally issue a <strong>delegated token</strong> where the <strong>agent OAuth client</strong> is the actor and you remain the subject (RFC 8693 with <code>actor_token</code> + <code>subject_token</code>) — configure <code>USE_AGENT_ACTOR_FOR_MCP</code>, <code>AGENT_OAUTH_CLIENT_*</code>, and optional PingOne directory provisioning via <code>/api/agent/identity/bootstrap</code>. That is “on behalf of,” not impersonation.
              </div>
            </div>
          )}

          {/* ── What is CIBA ── */}
          {activeTab === 'what' && (
            <div className="ciba-tab-content">
              <CibaWhatContent />
            </div>
          )}

          {/* ── Try It ── */}
          {activeTab === 'tryit' && <TryItTab cibaStatus={cibaStatus} />}

          {/* ── App Flows ── */}
          {activeTab === 'appflow' && (
            <div className="ciba-tab-content">
              <h3 className="ciba-section-title">MCP / AI Agent authentication</h3>
              <p className="ciba-section-desc">
                When the AI Banking Agent needs user tokens to call the Banking API,
                CIBA replaces the awkward "open this URL in your browser" redirect.
                The <strong>Full stack</strong> tab shows how MCP tools, token exchange, and REST APIs connect; here we focus on why CIBA helps chat and agent flows.
              </p>
              <CodeBlock>{MCP_FLOW}</CodeBlock>

              <h3 className="ciba-section-title">Step-up auth for high-value transactions</h3>
              <p className="ciba-section-desc">
                Transactions above <strong>STEP_UP_AMOUNT_THRESHOLD</strong> (default $250) require
                additional authentication. CIBA makes this seamless.
              </p>
              <CodeBlock>{STEP_UP_FLOW}</CodeBlock>

              <h3 className="ciba-section-title">API endpoints (this server)</h3>
              <div className="ciba-endpoint-table">
                <div className="ciba-endpoint-row">
                  <span className="ciba-method ciba-method--post">POST</span>
                  <code>/api/auth/ciba/initiate</code>
                  <span className="ciba-endpoint-desc">Start CIBA (PingOne delivers approval by email or push)</span>
                </div>
                <div className="ciba-endpoint-row">
                  <span className="ciba-method ciba-method--get">GET</span>
                  <code>/api/auth/ciba/poll/:id</code>
                  <span className="ciba-endpoint-desc">Check approval status — returns pending / approved / denied</span>
                </div>
                <div className="ciba-endpoint-row">
                  <span className="ciba-method ciba-method--get">GET</span>
                  <code>/api/auth/ciba/status</code>
                  <span className="ciba-endpoint-desc">Returns whether CIBA is enabled and the delivery mode</span>
                </div>
                <div className="ciba-endpoint-row">
                  <span className="ciba-method ciba-method--post">POST</span>
                  <code>/api/auth/ciba/cancel/:id</code>
                  <span className="ciba-endpoint-desc">Cancel a pending request</span>
                </div>
                <div className="ciba-endpoint-row">
                  <span className="ciba-method ciba-method--post">POST</span>
                  <code>/api/auth/ciba/notify</code>
                  <span className="ciba-endpoint-desc">Ping-mode callback from PingOne (user approved out-of-band)</span>
                </div>
              </div>
            </div>
          )}

          {/* ── PingOne Setup ── */}
          {activeTab === 'setup' && (
            <div className="ciba-tab-content">
              <p className="ciba-section-desc">
                These steps are done in the <strong>PingOne Admin Console</strong> — no code changes.
              </p>
              <div className="ciba-setup-steps">
                {PINGONE_STEPS.map((s) => (
                  <div key={s.step} className="ciba-setup-step">
                    <div className="ciba-setup-num">{s.step}</div>
                    <div>
                      <strong>{s.title}</strong>
                      <p>{s.detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              <h3 className="ciba-section-title">Environment variables</h3>
              <CodeBlock>{`CIBA_ENABLED=true
CIBA_TOKEN_DELIVERY_MODE=poll
CIBA_BINDING_MESSAGE=Banking App Authentication
CIBA_POLL_INTERVAL_MS=5000
CIBA_AUTH_REQUEST_EXPIRY=300`}</CodeBlock>

              <div className="ciba-notice ciba-notice--info" style={{ marginTop: '1rem' }}>
                <strong>Azure AD users?</strong> If PingOne federates to Azure AD, <code>login_hint</code> (email)
                still resolves the user. For <strong>email-only</strong> CIBA, no extra device is required. For a{' '}
                <strong>push</strong> path, users may already have Microsoft Authenticator via Azure AD — depends on your IdP and DaVinci flow.
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
