// banking_api_ui/src/components/education/TokenChainPanel.js
import React, { useState, useCallback } from 'react';
import './TokenChainPanel.css';

/**
 * Illustrative RFC 8693 token chain: User token → agent → MCP / transaction tokens → resource.
 * Rows expand to show decoded JWT-shaped examples; copy is demo-only (no live secrets in the browser).
 */
const TOKEN_CHAIN_STEPS = [
  {
    id: 'banking-app',
    label: 'Banking Application Token',
    status: 'active',
    summary: 'User access token after Authorization Code + PKCE — stored in the Backend-for-Frontend (BFF) session (httpOnly cookie). Used for Banking REST calls.',
    payloadPreview: `{
  "sub": "user-uuid",
  "scope": "openid banking:read banking:write",
  "aud": "https://banking-api.example.com",
  "iss": "https://auth.pingone.com/...",
  "exp": 1710000000
}`,
    copySample: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
  },
  {
    id: 'agent',
    label: 'Agent Token',
    status: 'active',
    summary: 'Optional client-credentials or delegated token for the agent OAuth client when the LLM/MCP layer acts with its own client_id.',
    payloadPreview: `{
  "sub": "agent-service",
  "scope": "ai_agent banking:read",
  "aud": "https://mcp.example.com",
  "client_id": "agent-oauth-client"
}`,
    copySample: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
  },
  {
    id: 'exchanged-mcp',
    label: 'Exchanged Token (MCPServer)',
    status: 'acquiring',
    summary: 'PingOne returns this after POST /as/token with grant_type=token-exchange (RFC 8693), subject_token=User token, audience=MCP resource.',
    payloadPreview: '— Issued when exchange completes —',
  },
  {
    id: 'mcp-server',
    label: 'MCPServer Token',
    status: 'acquiring',
    summary: 'Bearer token the MCP server accepts on WebSocket or HTTP for tools/list and tools/call.',
    payloadPreview: '— Same family as exchanged token; aud may match MCP resource URI (RFC 8707). —',
  },
  {
    id: 'resource',
    label: 'MCPServerExchangedToken-ToAccess-Resource',
    status: 'waiting',
    summary: 'Final token scoped to the resource server (Banking API) after optional second exchange or policy narrowing.',
    payloadPreview: '— Waiting on upstream policy / exchange completion in this demo. —',
  },
];

function StatusBadge({ status }) {
  if (status === 'active') {
    return <span className="token-chain-badge token-chain-badge--active">Active</span>;
  }
  if (status === 'acquiring') {
    return (
      <span className="token-chain-badge token-chain-badge--acquiring">
        <span className="token-chain-spinner" aria-hidden />
        Acquiring…
      </span>
    );
  }
  return <span className="token-chain-badge token-chain-badge--waiting">Waiting</span>;
}

export default function TokenChainPanel() {
  const [archOpen, setArchOpen] = useState(true);
  const [chainOpen, setChainOpen] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [copyFlash, setCopyFlash] = useState(null);

  const handleToggleRow = useCallback((id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleCopy = useCallback((id, text) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopyFlash(id);
      setTimeout(() => setCopyFlash(null), 1600);
    });
  }, []);

  return (
    <div className="token-chain-root">
      <div className="token-chain-acc">
        <button
          type="button"
          className="token-chain-acc-head"
          onClick={() => setArchOpen((o) => !o)}
          aria-expanded={archOpen}
        >
          <span className="token-chain-acc-icon" aria-hidden>📖</span>
          <span>Architecture Overview — RFC 8693 Token Exchange</span>
          <span className="token-chain-chev" aria-hidden>{archOpen ? '▾' : '▸'}</span>
        </button>
        {archOpen && (
          <div className="token-chain-acc-body token-chain-acc-body--muted">
            Browser SPA → Banking Backend-for-Frontend (BFF) (session, <strong>User token</strong>) → optional agent delegation →{' '}
            <strong>RFC 8693</strong> token exchange at PingOne → <strong>MCP token</strong> (delegated) →{' '}
            MCP server and Banking API as resource server. Tokens stay on the server; this chain is a
            teaching view of how they relate.
          </div>
        )}
      </div>

      <div className="token-chain-card">
        <button
          type="button"
          className="token-chain-card-head"
          onClick={() => setChainOpen((o) => !o)}
          aria-expanded={chainOpen}
        >
          <div>
            <div className="token-chain-card-title">Token Chain</div>
            <div className="token-chain-card-sub">Acquiring tokens along the Backend-for-Frontend (BFF) → MCP → resource path</div>
          </div>
          <span className="token-chain-chev" aria-hidden>{chainOpen ? '▾' : '▸'}</span>
        </button>

        {chainOpen && (
          <ul className="token-chain-list">
            {TOKEN_CHAIN_STEPS.map((step) => {
              const expanded = expandedId === step.id;
              const showCopy = step.status === 'active' && step.copySample;

              return (
                <li key={step.id} className="token-chain-item">
                  <div className="token-chain-row">
                    <button
                      type="button"
                      className="token-chain-expand"
                      onClick={() => handleToggleRow(step.id)}
                      aria-expanded={expanded}
                      aria-label={expanded ? 'Collapse token details' : 'Expand token details'}
                    >
                      {expanded ? '▾' : '▸'}
                    </button>
                    <span className="token-chain-label">{step.label}</span>
                    <StatusBadge status={step.status} />
                    {showCopy ? (
                      <button
                        type="button"
                        className="token-chain-copy"
                        title="Copy sample token prefix (illustrative)"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(step.id, step.copySample);
                        }}
                        aria-label="Copy sample token"
                      >
                        {copyFlash === step.id ? '✓' : '⎘'}
                      </button>
                    ) : (
                      <span style={{ width: '1.85rem', flexShrink: 0 }} aria-hidden />
                    )}
                  </div>
                  {expanded && (
                    <div className="token-chain-detail">
                      <p style={{ margin: 0 }}>{step.summary}</p>
                      <pre>{step.payloadPreview}</pre>
                      <p className="token-chain-hint">
                        Click the row again to collapse. Live access tokens are not stored in the
                        browser in this app.
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
