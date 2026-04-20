// banking_api_ui/src/components/UnifiedTokenFlowInspector.jsx
/**
 * Combined Agent Request Flow + OAuth Token Inspector panel
 * - Left side: Agent request flow (step-by-step trace)
 * - Right side: OAuth token inspector (claims, scopes, validity)
 * - Responsive: side-by-side on desktop, stacked on mobile
 * - Can toggle between floating (draggable) and fixed (inline) modes
 */
import React, { useState, useEffect, useCallback } from 'react';
import bffAxios from '../services/bffAxios';
import { fetchEnrichedUserInfo } from '../services/userInfoService';
import { createPortal } from 'react-dom';
import { useDraggablePanel } from '../hooks/useDraggablePanel';
import { agentFlowDiagram } from '../services/agentFlowDiagramService';
import { useExchangeMode } from '../context/ExchangeModeContext';
import { useEducationUIOptional } from '../context/EducationUIContext';
import { useTokenChainOptional } from '../context/TokenChainContext';
import TokenExchangeFlowDiagram from './TokenExchangeFlowDiagram';
import OidcFlowTimeline from './OidcFlowTimeline';
import './UnifiedTokenFlowInspector.css';

// ============================================================================
// CLAIM CONFIGURATION & UTILITIES
// ============================================================================

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
  if (!scope) return <span className="utfi-muted">No scopes</span>;
  const scopes = typeof scope === 'string' ? scope.split(' ') : scope;
  return (
    <div className="utfi-scopes">
      {scopes.map((s) => (
        <span key={s} className="utfi-scope-badge">{s}</span>
      ))}
    </div>
  );
}

function ClaimRow({ label, value, glossary }) {
  if (value === undefined || value === null) return null;
  const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return (
    <div className="utfi-claim-row">
      <span
        className="utfi-claim-key"
        title={glossary || ''}
        style={{ cursor: glossary ? 'help' : 'default', borderBottom: glossary ? '1px dotted #94a3b8' : 'none' }}
      >
        {label}
      </span>
      <span className="utfi-claim-value">{displayValue}</span>
    </div>
  );
}

function hasAnyField(data) {
  if (!data) return false;
  return Object.values(data).some((v) => v !== undefined && v !== null);
}

function statusBadge(status) {
  const labels = { pending: 'Waiting', active: 'In progress', done: 'Done', error: 'Issue' };
  const cls = `utfi-badge utfi-badge--${status}`;
  return <span className={cls}>{labels[status] || status}</span>;
}

// ============================================================================
// LEFT: AGENT REQUEST FLOW SECTION
// ============================================================================

function AgentFlowSection({ compact = false }) {
  const [snap, setSnap] = useState(() => agentFlowDiagram.getState());
  const [tokenChain, setTokenChain] = useState([]);
  const [showTokenChain, setShowTokenChain] = useState(false);
  const [showFlowDiagram, setShowFlowDiagram] = useState(false);
  const { mode } = useExchangeMode();
  const tokenChainCtx = useTokenChainOptional();
  const resolvedIdentity = tokenChainCtx?.resolvedIdentity ?? null;

  const loadTokenChain = useCallback(async () => {
    try {
      const res = await fetch('/api/token-chain/current', {
        credentials: 'include',
        _silent: true,
      });
      if (res.ok) {
        const data = await res.json();
        setTokenChain(data.currentTokens || []);
      }
    } catch (err) {
      console.error('Failed to load token chain:', err);
    }
  }, []);

  useEffect(() => {
    const unsub = agentFlowDiagram.subscribe(setSnap);
    return unsub;
  }, []);

  useEffect(() => {
    if (snap.visible) {
      loadTokenChain();
      setShowTokenChain(true);
    }
  }, [snap.visible, loadTokenChain]);

  useEffect(() => {
    const onAgentResult = () => {
      if (agentFlowDiagram.getState().visible) {
        loadTokenChain();
      }
    };
    window.addEventListener('banking-agent-result', onAgentResult);
    return () => window.removeEventListener('banking-agent-result', onAgentResult);
  }, [loadTokenChain]);

  useEffect(() => {
    if (!snap.visible) return undefined;
    const id = setInterval(loadTokenChain, 10000);
    return () => clearInterval(id);
  }, [snap.visible, loadTokenChain]);

  if (compact && !snap.visible) {
    return (
      <div className="utfi-agent-flow-section utfi-agent-flow-section--empty">
        <div className="utfi-empty-state">
          <p>Use the Banking Agent (e.g. My Accounts) to see the request flow here.</p>
        </div>
      </div>
    );
  }

  const { steps, hint, phase, toolName } = snap;

  return (
    <div className="utfi-agent-flow-section">
      <div className="utfi-section-header">
        <span className="utfi-section-icon">🔀</span>
        <h3>Agent Request Flow</h3>
        {toolName && <span className="utfi-tool-name">{toolName}</span>}
      </div>

      <div className="utfi-agent-flow-body">
        {hint && steps.length === 0 && <p className="utfi-hint">{hint}</p>}
        {steps.length === 0 && !hint && <p className="utfi-empty-msg">Ready for agent requests…</p>}

        {/* Token Exchange Flow Diagram */}
        {steps.length > 0 && (
          <div className="utfi-flow-section">
            <div className="utfi-flow-section-header">
              <span>
                {mode === 'double' ? '2-Exchange Flow (RFC 8693 §4)' : '1-Exchange Flow (RFC 8693 §2.1)'}
              </span>
              <button
                className="utfi-btn utfi-btn-sm"
                onClick={() => setShowFlowDiagram(!showFlowDiagram)}
                aria-pressed={showFlowDiagram}
              >
                {showFlowDiagram ? '▼' : '▶'}
              </button>
            </div>
            {showFlowDiagram && (
              <div className="utfi-flow-diagram">
                <TokenExchangeFlowDiagram phase={phase} steps={steps} />
              </div>
            )}
          </div>
        )}

        {/* Step breakdown */}
        {steps.length > 0 && (
          <div className="utfi-steps">
            <div className="utfi-steps-header">Steps</div>
            <div className="utfi-steps-list">
              {steps.map((step, i) => (
                <div key={i} className="utfi-step">
                  <div className="utfi-step-num">{i + 1}</div>
                  <div className="utfi-step-info">
                    <div className="utfi-step-title">{step.title}</div>
                    {step.detail && <div className="utfi-step-detail">{step.detail}</div>}
                  </div>
                  <div className="utfi-step-status">{statusBadge(step.status)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Token chain */}
        {showTokenChain && tokenChain.length > 0 && (
          <div className="utfi-token-chain-section">
            <div className="utfi-token-chain-header">
              <span>Current Token Chain</span>
              <button
                className="utfi-btn utfi-btn-sm"
                onClick={() => setShowTokenChain(!showTokenChain)}
                aria-pressed={showTokenChain}
              >
                {showTokenChain ? '▼' : '▶'}
              </button>
            </div>
            {showTokenChain && (
              <div className="utfi-token-chain">
                {tokenChain.map((token) => (
                  <div key={token.id} className="utfi-token-event">
                    <div className="utfi-token-meta">
                      <span className={`utfi-token-type utfi-token-type--${token.tokenType}`}>
                        {token.tokenType?.replace('_', ' ').toUpperCase() || 'TOKEN'}
                      </span>
                      <span className="utfi-token-time">
                        {new Date(token.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    {token.tokenSub && (
                      <div className="utfi-token-claim">User: <code>{token.tokenSub.slice(0, 8)}…</code></div>
                    )}
                    {token.tokenAct && (
                      <div className="utfi-token-claim">Actor: <code>{String(token.tokenAct).slice(0, 12)}…</code></div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// RIGHT: OAUTH TOKEN INSPECTOR SECTION
// ============================================================================

function OAuthInspectorSection() {
  const [userStatus, setUserStatus] = useState(null);
  const [tokenClaims, setTokenClaims] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [enrichedInfo, setEnrichedInfo] = useState(null);
  const [enrichedLoading, setEnrichedLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [isExpired, setIsExpired] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    identity: true,
    authorization: true,
    validity: true,
    provider: true,
    account: true,
    rawJson: false,
  });

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
        console.error('OAuthInspectorSection fetch error:', err.message);
        if (!cancelled) {
          setError('fetch_failed');
          setLoading(false);
        }
      }
    }

    fetchTokenData();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!userStatus?.authenticated) return;
    let cancelled = false;
    setEnrichedLoading(true);
    fetchEnrichedUserInfo()
      .then((result) => { if (!cancelled) setEnrichedInfo(result); })
      .finally(() => { if (!cancelled) setEnrichedLoading(false); });
    return () => { cancelled = true; };
  }, [userStatus?.authenticated]);

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

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const renderSection = (key, title, icon, content) => (
    <div className="utfi-card" key={key}>
      <div className="utfi-card-header" onClick={() => toggleSection(key)}>
        <div className="utfi-card-title">
          <span className="utfi-section-icon">{icon}</span>
          {title}
        </div>
        <span className="utfi-toggle-icon">{expandedSections[key] ? '▼' : '▶'}</span>
      </div>
      {expandedSections[key] && (
        <div className="utfi-card-content">
          {content}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="utfi-inspector-section">
        <div className="utfi-section-header">
          <span className="utfi-section-icon">🔑</span>
          <h3>OAuth Token Inspector</h3>
        </div>
        <div className="utfi-loading">Loading token information…</div>
      </div>
    );
  }

  if (error === 'no_session') {
    return (
      <div className="utfi-inspector-section">
        <div className="utfi-section-header">
          <span className="utfi-section-icon">🔑</span>
          <h3>OAuth Token Inspector</h3>
        </div>
        <div className="utfi-card utfi-card--error">
          <div className="utfi-error-content">
            <div className="utfi-error-icon">🔒</div>
            <div>
              <h4>No Active OAuth Session</h4>
              <p>Log in with PingOne OAuth to view your token information.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error === 'fetch_failed') {
    return (
      <div className="utfi-inspector-section">
        <div className="utfi-section-header">
          <span className="utfi-section-icon">🔑</span>
          <h3>OAuth Token Inspector</h3>
        </div>
        <div className="utfi-card utfi-card--error">
          <div className="utfi-error-content">
            <div className="utfi-error-icon">⚠️</div>
            <div>
              <h4>Failed to Load Token Data</h4>
              <p>Could not retrieve token information from the server. Please try again.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const payload = tokenClaims?.payload || {};
  const header = tokenClaims?.header || {};
  const user = userStatus?.user;

  return (
    <div className="utfi-inspector-section">
      <div className="utfi-section-header">
        <span className="utfi-section-icon">🔑</span>
        <h3>OAuth Token Inspector</h3>
        <div className="utfi-status-badges">
          {isExpired ? (
            <span className="utfi-badge utfi-badge--expired">⚠ Expired</span>
          ) : (
            <span className="utfi-badge utfi-badge--active">✓ Active</span>
          )}
          {userStatus?.oauthProvider && (
            <span className="utfi-badge utfi-badge--provider">{userStatus.oauthProvider}</span>
          )}
        </div>
      </div>

      <div className="utfi-sections">
        {renderSection('identity', 'Identity & Profile', '👤', (
          <>
            <ClaimRow label="Username" value={user?.username} />
            <ClaimRow label="Email" value={user?.email} />
            <ClaimRow label="Name" value={user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : null} />
            <ClaimRow label="Subject (sub)" value={payload.sub} glossary={CLAIM_GLOSSARY.sub} />
          </>
        ))}

        {renderSection('authorization', 'Authorization', '🔑', (
          <>
            <div className="utfi-claim-row">
              <span className="utfi-claim-key" title={CLAIM_GLOSSARY.scope} style={{ cursor: 'help', borderBottom: '1px dotted #94a3b8' }}>
                Scopes
              </span>
              <ScopesBadges scope={payload.scope} />
            </div>
            <ClaimRow label="Audience (aud)" value={Array.isArray(payload.aud) ? payload.aud.join(', ') : payload.aud} glossary={CLAIM_GLOSSARY.aud} />
            <ClaimRow label="Client ID" value={payload.client_id} glossary={CLAIM_GLOSSARY.client_id} />
            {payload.may_act && <ClaimRow label="May Act" value={payload.may_act} glossary={CLAIM_GLOSSARY.may_act} />}
            {payload.act && <ClaimRow label="Actor (act)" value={payload.act} glossary={CLAIM_GLOSSARY.act} />}
          </>
        ))}

        {renderSection('validity', 'Token Validity', '⏱', (
          <>
            <ClaimRow label="Issued At" value={payload.iat ? formatTimestamp(payload.iat) : null} glossary={CLAIM_GLOSSARY.iat} />
            <ClaimRow label="Expires At" value={payload.exp ? formatTimestamp(payload.exp) : null} glossary={CLAIM_GLOSSARY.exp} />
            {timeRemaining && (
              <div className="utfi-claim-row">
                <span className="utfi-claim-key">Time Remaining</span>
                <span className={`utfi-claim-value ${isExpired ? 'utfi-expired-text' : 'utfi-active-text'}`}>
                  {timeRemaining}
                </span>
              </div>
            )}
          </>
        ))}

        {renderSection('provider', 'Provider', '🏛', (
          <>
            <ClaimRow label="Issuer (iss)" value={payload.iss} glossary={CLAIM_GLOSSARY.iss} />
            <ClaimRow label="Algorithm" value={header.alg} />
            <ClaimRow label="Environment" value={payload.env} glossary={CLAIM_GLOSSARY.env} />
          </>
        ))}

        {(enrichedLoading || enrichedInfo?.error || hasAnyField(enrichedInfo?.data)) && renderSection('account', 'Account Information', '📋', (
          <>
            {enrichedLoading && <div className="utfi-muted">Loading PingOne profile…</div>}
            {enrichedInfo?.error && <div className="utfi-muted">⚠ {enrichedInfo.error}</div>}
            {enrichedInfo?.data && hasAnyField(enrichedInfo.data) && (
              <>
                <ClaimRow label="Email" value={enrichedInfo.data.email} />
                <ClaimRow label="Email Verified" value={enrichedInfo.data.email_verified != null ? String(enrichedInfo.data.email_verified) : null} />
                <ClaimRow label="Phone" value={enrichedInfo.data.phone_number || enrichedInfo.data.phone} />
              </>
            )}
          </>
        ))}

        {Object.keys(payload).length > 0 && renderSection('rawJson', 'Raw Claims (JSON)', '{ }', (
          <pre className="utfi-raw-json">{JSON.stringify(payload, null, 2)}</pre>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN UNIFIED COMPONENT
// ============================================================================

export default function UnifiedTokenFlowInspector({ floatingByDefault = false, showToggle = true }) {
  const [isFloating, setIsFloating] = useState(floatingByDefault);
  const [snap, setSnap] = useState(() => agentFlowDiagram.getState());

  const { pos, size, handleDragStart } = useDraggablePanel(
    () => ({
      x: Math.max(16, window.innerWidth - 900),
      y: Math.max(72, (window.innerHeight - 600) / 2),
    }),
    { w: 860, h: 560 }
  );

  useEffect(() => {
    const unsub = agentFlowDiagram.subscribe(setSnap);
    return unsub;
  }, []);

  useEffect(() => {
    const onOpen = () => {
      agentFlowDiagram.open();
      if (!agentFlowDiagram.getState().steps?.length) {
        agentFlowDiagram.reset();
      }
    };
    window.addEventListener('agent-flow-diagram-open', onOpen);
    return () => window.removeEventListener('agent-flow-diagram-open', onOpen);
  }, []);

  const handleEsc = useCallback((e) => {
    if (e.key === 'Escape' && isFloating) {
      agentFlowDiagram.close();
    }
  }, [isFloating]);

  useEffect(() => {
    if (!isFloating) return;
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isFloating, handleEsc]);

  const content = (
    <div className={`utfi-container ${isFloating ? 'utfi-floating' : 'utfi-fixed'}`}>
      <div className="utfi-header" onPointerDown={isFloating ? handleDragStart : undefined}>
        <div className="utfi-header-content">
          <h2 className="utfi-title">🔐 Agent & Token Flow Inspector</h2>
          <p className="utfi-subtitle">Real-time visibility into agent execution and OAuth token lifecycle</p>
        </div>
        <div className="utfi-header-actions">
          {showToggle && (
            <button
              className="utfi-btn utfi-btn-primary"
              onClick={() => setIsFloating(!isFloating)}
              title={isFloating ? 'Dock panel' : 'Float panel'}
              aria-label={isFloating ? 'Dock' : 'Float'}
            >
              {isFloating ? '📌' : '⛓'}
            </button>
          )}
          {isFloating && (
            <button
              className="utfi-btn"
              onClick={() => agentFlowDiagram.close()}
              title="Close (Esc)"
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="utfi-content">
        <div className="utfi-left">
          <AgentFlowSection />
        </div>
        <div className="utfi-divider"></div>
        <div className="utfi-right">
          <OAuthInspectorSection />
        </div>
      </div>
    </div>
  );

  if (isFloating) {
    return snap.visible ? createPortal(
      <div
        className="utfi-floating-wrapper"
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          width: size.w,
          height: size.h,
          zIndex: 10000,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="utfi-title"
      >
        {content}
      </div>,
      document.body
    ) : null;
  }

  return content;
}
