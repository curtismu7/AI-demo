// banking_api_ui/src/components/OAuthTokenDisplayPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import bffAxios from '../services/bffAxios';
import { fetchEnrichedUserInfo } from '../services/userInfoService';
import './OAuthTokenDisplayPage.css';

const CLAIM_GLOSSARY = {
  sub: 'Subject — unique identifier of the authenticated user',
  iss: 'Issuer — the PingOne authorization server that issued this token',
  aud: 'Audience — the resource server(s) this token is valid for',
  exp: 'Expiration — Unix epoch time after which the token MUST be rejected',
  iat: 'Issued At — Unix epoch time when the token was created',
  scope: 'Scopes — permissions granted to the bearer',
  client_id: 'Client ID — the OAuth 2.0 application that requested this token',
  env: 'PingOne Environment ID',
  org: 'PingOne Organization ID',
  act: 'Actor claim (RFC 8693) — identifies the party acting on behalf of the subject',
  may_act: 'May Act — allows the named client to perform a Token Exchange with this token',
  acr: 'Authentication Context Class Reference — level of assurance (e.g. Multi_Factor)',
  amr: 'Authentication Methods References — how the user authenticated',
  sid: 'Session ID — PingOne session identifier',
  auth_time: 'Authentication Time — when the user last authenticated',
};

function formatTimestamp(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts * 1000).toLocaleString();
  } catch {
    return String(ts);
  }
}

function calculateTimeRemaining(expTs) {
  if (!expTs) return null;
  const diffMs = expTs * 1000 - Date.now();
  if (diffMs <= 0) return 'Expired';
  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  if (minutes > 0) return `${minutes}m ${seconds}s remaining`;
  return `${seconds}s remaining`;
}

function ScopesBadges({ scope }) {
  if (!scope) return <span className="otdp-muted">No scopes</span>;
  const scopes = typeof scope === 'string' ? scope.split(' ') : scope;
  return (
    <div className="otdp-scopes">
      {scopes.map((s) => (
        <span key={s} className="otdp-scope-badge">{s}</span>
      ))}
    </div>
  );
}

function ClaimRow({ label, value, glossary }) {
  if (value === undefined || value === null) return null;
  const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return (
    <div className="otdp-claim-row">
      <span
        className="otdp-claim-key"
        title={glossary || ''}
        style={{ cursor: glossary ? 'help' : 'default', borderBottom: glossary ? '1px dotted #94a3b8' : 'none' }}
      >
        {label}
      </span>
      <span className="otdp-claim-value">{displayValue}</span>
    </div>
  );
}

function hasAnyField(data) {
  if (!data) return false;
  return Object.values(data).some((v) => v !== undefined && v !== null);
}

/** Step states for the unauthenticated "start the flow" UI */
const MCP_FLOW_STEPS = {
  idle: null,
  calling: { label: 'Sending request to MCP server…', color: '#3b82f6' },
  got_401: { label: 'MCP server → 401 Unauthenticated', color: '#f59e0b' },
  redirecting: { label: 'Redirecting to PingOne login…', color: '#10b981' },
};

export default function OAuthTokenDisplayPage() {
  const [userStatus, setUserStatus] = useState(null);
  const [tokenClaims, setTokenClaims] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [enrichedInfo, setEnrichedInfo] = useState(null);
  const [enrichedLoading, setEnrichedLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [isExpired, setIsExpired] = useState(false);
  const [mcpFlowStep, setMcpFlowStep] = useState('idle');

  useEffect(() => {
    let cancelled = false;

    async function fetchTokenData() {
      try {
        const statusRes = await bffAxios.get('/api/auth/oauth/user/status');
        if (!cancelled) setUserStatus(statusRes.data);

        if (!statusRes.data.authenticated) {
          if (!cancelled) {
            setError('no_session');
            setLoading(false);
          }
          return;
        }

        const previewRes = await bffAxios.get('/api/tokens/session-preview');
        const events = previewRes.data?.tokenEvents || [];
        const userTokenEvent = events.find(
          (e) => e.decoded && (e.id === 'user-token' || e.label?.toLowerCase().includes('user'))
        );
        if (!cancelled) {
          setTokenClaims(userTokenEvent?.decoded || null);
          setLoading(false);
        }
      } catch (err) {
        console.error('OAuthTokenDisplayPage fetch error:', err.message);
        if (!cancelled) {
          setError('fetch_failed');
          setLoading(false);
        }
      }
    }

    fetchTokenData();
    return () => { cancelled = true; };
  }, []);

  // Fetch enriched user info from PingOne userinfo endpoint (optional)
  useEffect(() => {
    if (!userStatus?.authenticated) return;
    let cancelled = false;
    setEnrichedLoading(true);
    fetchEnrichedUserInfo()
      .then((result) => { if (!cancelled) setEnrichedInfo(result); })
      .finally(() => { if (!cancelled) setEnrichedLoading(false); });
    return () => { cancelled = true; };
  }, [userStatus?.authenticated]);

  /**
   * Demonstrate the MCP → 401 → OAuth login flow.
   * 1. POST /api/mcp/tool (get_my_accounts) — no session, expect 401
   * 2. Show the 401 step visually for 1.2 s
   * 3. Redirect to the BFF user login endpoint
   */
  const startMcpFlow = useCallback(async () => {
    setMcpFlowStep('calling');
    try {
      await fetch('/api/mcp/tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tool: 'get_my_accounts', params: {} }),
      });
      // Any response (401 expected) — show the 401 step then redirect
    } catch {
      // Network error still means we should try to log in
    }
    setMcpFlowStep('got_401');
    setTimeout(() => {
      setMcpFlowStep('redirecting');
      setTimeout(() => {
        window.location.href = '/api/auth/oauth/user/login';
      }, 800);
    }, 1200);
  }, []);

  // Refresh time-remaining display every 30s
  const expTs = tokenClaims?.payload?.exp;
  const updateTimeRemaining = useCallback(() => {
    setTimeRemaining(calculateTimeRemaining(expTs));
    setIsExpired(expTs ? (expTs * 1000 < Date.now()) : false);
  }, [expTs]);

  useEffect(() => {
    if (!expTs) return;
    updateTimeRemaining();
    const interval = setInterval(updateTimeRemaining, 30000);
    return () => clearInterval(interval);
  }, [expTs, updateTimeRemaining]);

  if (loading) {
    return (
      <div className="otdp-container">
        <div className="otdp-loading">Loading token information…</div>
      </div>
    );
  }

  if (error === 'no_session') {
    const step = MCP_FLOW_STEPS[mcpFlowStep];
    const isBusy = mcpFlowStep !== 'idle';
    return (
      <div className="otdp-container">
        <div className="otdp-header">
          <h2>OAuth Token Information</h2>
        </div>
        <div className="otdp-card otdp-flow-start-card">
          <div className="otdp-flow-icon">🔒</div>
          <h3>No Active Session</h3>
          <p className="otdp-flow-desc">
            Click <strong>Log In</strong> to see the live token flow — the browser POSTs to the MCP
            server, receives a&nbsp;<code>401&nbsp;Unauthenticated</code>, then follows the OAuth
            redirect to PingOne. Once you log in, this page shows your decoded token claims.
          </p>

          {/* Step flow diagram */}
          <div className="otdp-flow-steps">
            <div className={`otdp-flow-step ${mcpFlowStep === 'calling' ? 'otdp-flow-step--active' : ''} ${['got_401','redirecting'].includes(mcpFlowStep) ? 'otdp-flow-step--done' : ''}`}>
              <span className="otdp-flow-step-num">1</span>
              <div>
                <div className="otdp-flow-step-title">POST /api/mcp/tool</div>
                <div className="otdp-flow-step-sub">get_my_accounts — no token yet</div>
              </div>
            </div>
            <div className="otdp-flow-arrow">→</div>
            <div className={`otdp-flow-step ${mcpFlowStep === 'got_401' ? 'otdp-flow-step--active otdp-flow-step--warn' : ''} ${mcpFlowStep === 'redirecting' ? 'otdp-flow-step--done' : ''}`}>
              <span className="otdp-flow-step-num">2</span>
              <div>
                <div className="otdp-flow-step-title">401 Unauthenticated</div>
                <div className="otdp-flow-step-sub">MCP server rejects the request</div>
              </div>
            </div>
            <div className="otdp-flow-arrow">→</div>
            <div className={`otdp-flow-step ${mcpFlowStep === 'redirecting' ? 'otdp-flow-step--active otdp-flow-step--ok' : ''}`}>
              <span className="otdp-flow-step-num">3</span>
              <div>
                <div className="otdp-flow-step-title">PingOne OAuth Login</div>
                <div className="otdp-flow-step-sub">Auth Code + PKCE → tokens issued</div>
              </div>
            </div>
          </div>

          {step && (
            <div className="otdp-flow-status" style={{ color: step.color }}>
              {step.label}
            </div>
          )}

          <button
            className="otdp-flow-login-btn"
            onClick={startMcpFlow}
            disabled={isBusy}
          >
            {isBusy ? 'Starting…' : 'Log In via MCP Flow'}
          </button>
        </div>
      </div>
    );
  }

  if (error === 'fetch_failed') {
    return (
      <div className="otdp-container">
        <div className="otdp-header">
          <h2>OAuth Token Information</h2>
        </div>
        <div className="otdp-card otdp-card--error">
          <div className="otdp-error-icon">⚠️</div>
          <h3>Failed to Load Token Data</h3>
          <p>Could not retrieve token information from the server. Please try again.</p>
        </div>
      </div>
    );
  }

  const payload = tokenClaims?.payload || {};
  const header = tokenClaims?.header || {};
  const user = userStatus?.user;

  return (
    <div className="otdp-container">
      <div className="otdp-header">
        <h2>OAuth Token Information</h2>
        <div className="otdp-status">
          {isExpired ? (
            <span className="otdp-badge otdp-badge--expired">⚠ Token Expired</span>
          ) : (
            <span className="otdp-badge otdp-badge--active">✓ Active Session</span>
          )}
          {userStatus?.oauthProvider && (
            <span className="otdp-badge otdp-badge--provider">{userStatus.oauthProvider}</span>
          )}
        </div>
      </div>

      <div className="otdp-grid">
        {/* Identity & Profile */}
        <div className="otdp-card">
          <div className="otdp-card-title">👤 Identity & Profile</div>
          <ClaimRow label="Username" value={user?.username} />
          <ClaimRow label="Email" value={user?.email} />
          <ClaimRow label="Name" value={user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : null} />
          <ClaimRow label="Role" value={user?.role} />
          <ClaimRow label="Subject (sub)" value={payload.sub} glossary={CLAIM_GLOSSARY.sub} />
          <ClaimRow label="Session ID (sid)" value={payload.sid} glossary={CLAIM_GLOSSARY.sid} />
        </div>

        {/* Authorization */}
        <div className="otdp-card">
          <div className="otdp-card-title">🔑 Authorization</div>
          <div className="otdp-claim-row">
            <span className="otdp-claim-key" title={CLAIM_GLOSSARY.scope} style={{ cursor: 'help', borderBottom: '1px dotted #94a3b8' }}>
              Scopes
            </span>
            <ScopesBadges scope={payload.scope} />
          </div>
          <ClaimRow label="Audience (aud)" value={Array.isArray(payload.aud) ? payload.aud.join(', ') : payload.aud} glossary={CLAIM_GLOSSARY.aud} />
          <ClaimRow label="Client ID" value={payload.client_id} glossary={CLAIM_GLOSSARY.client_id} />
          <ClaimRow label="ACR" value={payload.acr} glossary={CLAIM_GLOSSARY.acr} />
          {payload.may_act && (
            <ClaimRow label="May Act" value={payload.may_act} glossary={CLAIM_GLOSSARY.may_act} />
          )}
          {payload.act && (
            <ClaimRow label="Actor (act)" value={payload.act} glossary={CLAIM_GLOSSARY.act} />
          )}
        </div>

        {/* Token Validity */}
        <div className="otdp-card">
          <div className="otdp-card-title">⏱ Token Validity</div>
          <ClaimRow label="Issued At" value={payload.iat ? formatTimestamp(payload.iat) : null} glossary={CLAIM_GLOSSARY.iat} />
          <ClaimRow label="Expires At" value={payload.exp ? formatTimestamp(payload.exp) : null} glossary={CLAIM_GLOSSARY.exp} />
          {timeRemaining && (
            <div className="otdp-claim-row">
              <span className="otdp-claim-key">Time Remaining</span>
              <span className={`otdp-claim-value ${isExpired ? 'otdp-expired-text' : 'otdp-active-text'}`}>
                {timeRemaining}
              </span>
            </div>
          )}
          <ClaimRow label="Auth Time" value={payload.auth_time ? formatTimestamp(payload.auth_time) : null} glossary={CLAIM_GLOSSARY.auth_time} />
        </div>

        {/* Provider / Token Metadata */}
        <div className="otdp-card">
          <div className="otdp-card-title">🏛 Provider</div>
          <ClaimRow label="Issuer (iss)" value={payload.iss} glossary={CLAIM_GLOSSARY.iss} />
          <ClaimRow label="Algorithm" value={header.alg} />
          <ClaimRow label="Key ID (kid)" value={header.kid} />
          <ClaimRow label="Environment" value={payload.env} glossary={CLAIM_GLOSSARY.env} />
          <ClaimRow label="Organization" value={payload.org} glossary={CLAIM_GLOSSARY.org} />
        </div>
      </div>

      {/* PingOne Userinfo Enrichment — only render card if loading, error, or has data */}
      {(enrichedLoading || enrichedInfo?.error || hasAnyField(enrichedInfo?.data)) && (
        <div className="otdp-card">
          <div className="otdp-card-title">📋 Account Information <span className="otdp-source-label">(from PingOne userinfo)</span></div>
          {enrichedLoading && <div className="otdp-muted">Loading PingOne profile…</div>}
          {enrichedInfo?.error && (
            <div className="otdp-muted">⚠ {enrichedInfo.error} — showing token data only</div>
          )}
          {enrichedInfo?.data && hasAnyField(enrichedInfo.data) && (
            <>
              <ClaimRow label="Email" value={enrichedInfo.data.email} />
              <ClaimRow label="Email Verified" value={enrichedInfo.data.email_verified != null ? String(enrichedInfo.data.email_verified) : null} />
              <ClaimRow label="Given Name" value={enrichedInfo.data.given_name} />
              <ClaimRow label="Family Name" value={enrichedInfo.data.family_name} />
              <ClaimRow label="Phone" value={enrichedInfo.data.phone_number || enrichedInfo.data.phone} />
              <ClaimRow label="Locale" value={enrichedInfo.data.locale} />
              <ClaimRow label="Address" value={enrichedInfo.data.address?.formatted} />
              <ClaimRow label="Updated At" value={enrichedInfo.data.updated_at ? formatTimestamp(enrichedInfo.data.updated_at) : null} />
              {enrichedInfo.timestamp && (
                <div className="otdp-claim-row">
                  <span className="otdp-claim-key otdp-muted">Fetched</span>
                  <span className="otdp-claim-value otdp-muted">{new Date(enrichedInfo.timestamp).toLocaleString()}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Raw payload toggle */}
      {Object.keys(payload).length > 0 && (
        <div className="otdp-card otdp-raw-section">
          <details>
            <summary className="otdp-raw-toggle">View Raw Token Claims (JSON)</summary>
            <pre className="otdp-raw-json">{JSON.stringify(payload, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
