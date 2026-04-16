// banking_api_ui/src/components/OAuthTokenDisplayPage.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
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

export default function OAuthTokenDisplayPage() {
  const [userStatus, setUserStatus] = useState(null);
  const [tokenClaims, setTokenClaims] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTokenData() {
      try {
        // Fetch user status (who is logged in)
        const statusRes = await axios.get('/api/auth/oauth/user/status');
        if (!cancelled) setUserStatus(statusRes.data);

        if (!statusRes.data.authenticated) {
          if (!cancelled) {
            setError('no_session');
            setLoading(false);
          }
          return;
        }

        // Fetch session token preview (decoded claims from BFF)
        const previewRes = await axios.get('/api/tokens/session-preview');
        const events = previewRes.data?.tokenEvents || [];
        // Find the user token event (has decoded claims)
        const userTokenEvent = events.find(
          (e) => e.decoded && (e.id === 'user-token' || e.label?.toLowerCase().includes('user'))
        );
        if (!cancelled) {
          setTokenClaims(userTokenEvent?.decoded || null);
          setLoading(false);
        }
      } catch (err) {
        console.error('OAuthTokenDisplayPage fetch error:', err);
        if (!cancelled) {
          setError('fetch_failed');
          setLoading(false);
        }
      }
    }

    fetchTokenData();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="otdp-container">
        <div className="otdp-loading">Loading token information…</div>
      </div>
    );
  }

  if (error === 'no_session') {
    return (
      <div className="otdp-container">
        <div className="otdp-header">
          <h2>OAuth Token Information</h2>
        </div>
        <div className="otdp-card otdp-card--error">
          <div className="otdp-error-icon">🔒</div>
          <h3>No Active OAuth Session</h3>
          <p>Log in with PingOne OAuth to view your token information.</p>
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
  const isExpired = payload.exp ? (payload.exp * 1000 < Date.now()) : false;
  const timeRemaining = calculateTimeRemaining(payload.exp);

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
