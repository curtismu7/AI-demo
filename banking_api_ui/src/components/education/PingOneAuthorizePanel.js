// banking_api_ui/src/components/education/PingOneAuthorizePanel.js
import React, { useState, useCallback } from 'react';
import EducationDrawer from '../shared/EducationDrawer';
import { EduImplIntro, SNIP_AUTHORIZE_GATE } from './educationImplementationSnippets';

// ─── Recent Decisions viewer (Phase 3) ───────────────────────────────────────

/** Formats ISO timestamp to a readable short string. */
const fmtTime = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
};

/** Decision badge — coloured pill for PERMIT / DENY / INDETERMINATE. */
function DecisionBadge({ decision }) {
  const colours = {
    PERMIT:        { background: '#dcfce7', color: '#15803d', border: '#86efac' },
    DENY:          { background: '#fee2e2', color: '#b91c1c', border: '#fca5a5' },
    INDETERMINATE: { background: '#fef9c3', color: '#854d0e', border: '#fde047' },
  };
  const style = colours[(decision || '').toUpperCase()] || colours.INDETERMINATE;
  return (
    <span style={{
      ...style,
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: '0.75rem',
      fontWeight: 700,
      border: `1px solid ${style.border}`,
      display: 'inline-block',
    }}>
      {decision || 'INDETERMINATE'}
    </span>
  );
}

/** Normalizes PingOne vs simulated decision rows for list display. */
function decisionRowMeta(d) {
  const params = d.request?.parameters || d.parameters || {};
  const type = params.TransactionType || d.type || 'evaluation';
  const amount = params.Amount;
  const time = d.createdAt || d.timestamp || d.recordedAt;
  return { type, amount, time, decision: d.decision || d.status };
}

/** Live recent decisions — user picks PingOne vs simulated via select; plus engine status. */
function RecentDecisionsViewer() {
  const [decisions, setDecisions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [source, setSource] = useState('pingone');
  const [evalStatus, setEvalStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState(null);

  const handleFetchStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const res = await fetch('/api/authorize/evaluation-status', { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      setEvalStatus(await res.json());
    } catch (err) {
      setStatusError(err.message);
      setEvalStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const handleFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDecisions(null);
    setExpanded(null);
    const url =
      source === 'simulated'
        ? '/api/authorize/simulated-recent-decisions?limit=10'
        : '/api/authorize/recent-decisions?limit=10';
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setDecisions(data.decisions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [source]);

  return (
    <div>
      <div
        style={{
          marginBottom: 14,
          padding: '10px 14px',
          background: '#f8fafc',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          fontSize: '0.82rem',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <strong>Authorization engine</strong>
          <button
            type="button"
            onClick={handleFetchStatus}
            disabled={statusLoading}
            style={{
              background: '#475569',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 12px',
              fontWeight: 600,
              fontSize: '0.78rem',
              cursor: 'pointer',
              opacity: statusLoading ? 0.65 : 1,
            }}
          >
            {statusLoading ? 'Loading…' : 'Refresh status'}
          </button>
        </div>
        {statusError && (
          <div style={{ color: '#b91c1c', marginBottom: 6 }}>{statusError}</div>
        )}
        {evalStatus && (
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
            <dt style={{ color: '#64748b' }}>activeEngine</dt>
            <dd style={{ margin: 0, fontFamily: 'monospace' }}>{evalStatus.activeEngine}</dd>
            <dt style={{ color: '#64748b' }}>authorize enabled</dt>
            <dd style={{ margin: 0 }}>{String(evalStatus.authorizeEnabledConfig)}</dd>
            <dt style={{ color: '#64748b' }}>simulated mode</dt>
            <dd style={{ margin: 0 }}>{String(evalStatus.simulatedMode)}</dd>
            <dt style={{ color: '#64748b' }}>PingOne configured</dt>
            <dd style={{ margin: 0 }}>{String(evalStatus.pingoneConfigured)}</dd>
            {evalStatus.mcpFirstToolGateEnabled !== undefined && (
              <>
                <dt style={{ color: '#64748b' }}>MCP first-tool gate</dt>
                <dd style={{ margin: 0 }}>{String(evalStatus.mcpFirstToolGateEnabled)}</dd>
                <dt style={{ color: '#64748b' }}>MCP decision endpoint set</dt>
                <dd style={{ margin: 0 }}>{String(evalStatus.mcpFirstToolDecisionEndpointConfigured)}</dd>
                <dt style={{ color: '#64748b' }}>MCP gate live ready</dt>
                <dd style={{ margin: 0 }}>{String(evalStatus.mcpFirstToolPingOneReady)}</dd>
                <dt style={{ color: '#64748b' }}>MCP gate would run (simulated)</dt>
                <dd style={{ margin: 0 }}>{String(evalStatus.mcpFirstToolWouldRunSimulated)}</dd>
                <dt style={{ color: '#64748b' }}>MCP gate would run (live)</dt>
                <dd style={{ margin: 0 }}>{String(evalStatus.mcpFirstToolWouldRunLive)}</dd>
              </>
            )}
          </dl>
        )}
      </div>

      <p style={{ fontSize: '0.85rem', lineHeight: 1.55 }}>
        Choose which decision history to load. <strong>PingOne</strong> needs{' '}
        <code>recordRecentRequests: true</code> on the endpoint (last 10, 24h window).{' '}
        <strong>Simulated</strong> reads the in-memory ring buffer on the BFF (no PingOne call).
      </p>
      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <label
          htmlFor="pingone-authorize-recent-source"
          style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: '#334155', marginBottom: 6 }}
        >
          Recent decisions source
        </label>
        <select
          id="pingone-authorize-recent-source"
          value={source}
          onChange={(e) => {
            const v = e.target.value === 'simulated' ? 'simulated' : 'pingone';
            setSource(v);
            setDecisions(null);
            setError(null);
            setExpanded(null);
          }}
          style={{
            maxWidth: '100%',
            width: 'min(100%, 22rem)',
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            fontSize: '0.88rem',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          <option value="pingone">PingOne Authorize (live API)</option>
          <option value="simulated">Simulated Authorize (education / in-memory)</option>
        </select>
      </div>
      <button
        type="button"
        onClick={handleFetch}
        disabled={loading}
        style={{
          background: '#1e40af', color: '#fff', border: 'none', borderRadius: 8,
          padding: '8px 18px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
          opacity: loading ? 0.65 : 1,
        }}
      >
        {loading ? 'Loading…' : '↻ Fetch recent decisions'}
      </button>

      {error && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: '#fee2e2', borderRadius: 8, color: '#b91c1c', fontSize: '0.82rem' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {decisions && decisions.length === 0 && (
        <p style={{ color: '#6b7280', marginTop: 12, fontSize: '0.85rem' }}>
          No recent decisions found. Make a transfer or withdrawal with PingOne Authorize enabled,
          then come back here.
        </p>
      )}

      {decisions && decisions.length > 0 && (
        <div style={{ marginTop: 14 }}>
          {decisions.map((d, i) => {
            const row = decisionRowMeta(d);
            return (
            <div
              key={d.id || d.decisionId || i}
              style={{
                border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', background: '#f9fafb', cursor: 'pointer',
                }}
                onClick={() => setExpanded(expanded === i ? null : i)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setExpanded(expanded === i ? null : i)}
              >
                <DecisionBadge decision={row.decision} />
                <span style={{ fontSize: '0.8rem', color: '#374151', flex: 1 }}>
                  {row.type}
                  {row.amount != null && ` — $${row.amount}`}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{fmtTime(row.time)}</span>
                <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>{expanded === i ? '▲' : '▼'}</span>
              </div>
              {expanded === i && (
                <pre style={{
                  margin: 0, padding: '10px 14px',
                  background: '#1e1e2e', color: '#cdd6f4',
                  fontSize: '0.72rem', overflowX: 'auto', lineHeight: 1.5,
                }}>
                  {JSON.stringify(d, null, 2)}
                </pre>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export default function PingOneAuthorizePanel({ isOpen, onClose, initialTabId }) {
  const tabs = [
    // ── What it does ────────────────────────────────────────────────────────
    {
      id: 'what',
      label: 'What it does',
      content: (
        <>
          <p>
            <strong>PingOne Authorize</strong> is a cloud-based, fine-grained authorization
            service. Instead of embedding "if amount &gt; $X deny" logic in your app, you
            define policies in PingOne and the BFF asks PingOne whether the action is
            permitted — in real time, for every transaction.
          </p>
          <p>
            In BX Finance, PingOne Authorize gates every <strong>transfer</strong> and{' '}
            <strong>withdrawal</strong> for non-admin users. The response is one of:
          </p>
          <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>
            <li><strong>PERMIT</strong> — transaction proceeds</li>
            <li><strong>DENY</strong> — transaction is blocked (403)</li>
            <li><strong>INDETERMINATE</strong> — policy could not decide (treated as deny)</li>
            <li><strong>Step-up obligation</strong> — policy permits but requires MFA first (428 + CIBA flow)</li>
          </ul>
          <p style={{ background: '#eff6ff', padding: '10px 14px', borderRadius: 8, fontSize: '0.88rem', border: '1px solid #bfdbfe' }}>
            <strong>Education mode:</strong> Admin → <strong>Feature Flags</strong> → enable <strong>Transaction authorization</strong> and{' '}
            <strong>Simulated Authorize (education)</strong>. The BFF runs a small in-process policy (no PingOne API) that returns the same
            status codes and fields as live Authorize, including <code>authorize_engine: &quot;simulated&quot;</code> on 403/428. Turn simulation{' '}
            <strong>off</strong> and configure a decision endpoint (or policy ID) + worker app to use real PingOne Authorize.
          </p>
          <p>
            Official docs:{' '}
            <a href="https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_overview.html" target="_blank" rel="noopener noreferrer">
              Authorization using PingOne Authorize
            </a>{' '}·{' '}
            <a href="https://developer.pingidentity.com/pingone-api/authorize/authorization-decisions/decision-endpoints.html" target="_blank" rel="noopener noreferrer">
              Decision Endpoints API
            </a>
          </p>
        </>
      ),
    },

    // ── Flow ────────────────────────────────────────────────────────────────
    {
      id: 'flow',
      label: 'Request flow',
      content: (
        <>
          <h3>What happens on every transfer</h3>
          <pre className="edu-code">{`1. Customer initiates transfer ($500)
   POST /api/transactions  { type: "transfer", amount: 500 }

2. BFF checks configStore: authorize_enabled = "true"
   If ff_authorize_simulated = "true" → in-process simulatedAuthorizeService (no PingOne call)
   Else selects API path:
     • authorize_decision_endpoint_id set → Decision Endpoints API (Phase 2)
     • authorize_policy_id set            → Legacy PDP API (Phase 1 fallback)

3. BFF obtains worker token (client_credentials)   [skipped when simulated]
   POST {issuer}/as/token
     client_id=<worker_app>  client_secret=<secret>

4. BFF calls PingOne Authorize (Phase 2 path):
   POST /v1/environments/{envId}/decisionEndpoints/{endpointId}
   {
     "parameters": {
       "Amount": 500,
       "TransactionType": "transfer",
       "UserId": "user-abc123",
       "Acr": "MFA",
       "Timestamp": "2026-03-27T10:00:00Z"
     }
   }

5. PingOne evaluates against your policy + Trust Framework attributes

6. Response:
   { "decision": "PERMIT" }          → transaction executes
   { "decision": "DENY" }            → 403 transaction_denied
   obligation: STEP_UP               → 428 step_up_required → CIBA flow`}</pre>

          <h3>Phase 1 vs Phase 2 API path</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', marginTop: 8 }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #e5e7eb' }}>Phase</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #e5e7eb' }}>URL</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #e5e7eb' }}>Config field</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #e5e7eb' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb' }}>Phase 2</td>
                <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', fontFamily: 'monospace', fontSize: '0.75rem' }}>/decisionEndpoints/{'{endpointId}'}</td>
                <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb' }}><code>authorize_decision_endpoint_id</code></td>
                <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', color: '#15803d', fontWeight: 700 }}>✅ Preferred</td>
              </tr>
              <tr>
                <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb' }}>Phase 1</td>
                <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', fontFamily: 'monospace', fontSize: '0.75rem' }}>/governance/policyDecisionPoints/{'{policyId}'}/evaluate</td>
                <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb' }}><code>authorize_policy_id</code></td>
                <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', color: '#b45309' }}>⚠️ Legacy fallback</td>
              </tr>
              <tr>
                <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb' }}>Phase 2 — MCP</td>
                <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', fontFamily: 'monospace', fontSize: '0.75rem' }}>/decisionEndpoints/{'{endpointId}'}</td>
                <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb' }}><code>authorize_mcp_decision_endpoint_id</code></td>
                <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', color: '#0369a1' }}>Optional — first MCP tool</td>
              </tr>
            </tbody>
          </table>
          <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 8 }}>
            The BFF picks Phase 2 if <code>authorize_decision_endpoint_id</code> is set; falls back
            to Phase 1 otherwise. Both paths return <code>{'{ decision, stepUpRequired, raw }'}</code>
            so no other code changes.
          </p>
          <h3 style={{ marginTop: '1.25rem' }}>MCP first tool (BankingAgent)</h3>
          <p style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
            Feature flag <code>ff_authorize_mcp_first_tool</code> (Admin → Feature Flags) runs Authorize once per session on{' '}
            <code>POST /api/mcp/tool</code> when a delegated MCP access token is used. Live PingOne requires{' '}
            <strong>Application Configuration</strong> → <code>authorize_mcp_decision_endpoint_id</code> (or env{' '}
            <code>PINGONE_AUTHORIZE_MCP_DECISION_ENDPOINT_ID</code>) pointing at a <strong>separate</strong> decision endpoint
            whose policy understands Trust Framework parameters including <code>DecisionContext: McpFirstTool</code>,{' '}
            <code>ToolName</code>, <code>TokenAudience</code>, <code>ActClientId</code>, <code>NestedActClientId</code>,{' '}
            <code>McpResourceUri</code>. With <strong>Simulated Authorize</strong> on, the same flag uses in-process rules;
            optional <code>SIMULATED_MCP_DENY_TOOLS</code> can force DENY per tool name. <strong>Refresh status</strong> on the
            Recent Decisions tab surfaces <code>mcpFirstTool*</code> fields from <code>/api/authorize/evaluation-status</code>.
          </p>
        </>
      ),
    },

    // ── PingOne setup ────────────────────────────────────────────────────────
    {
      id: 'setup',
      label: 'PingOne setup',
      content: (
        <>
          <h3>Prerequisites in PingOne Authorize</h3>
          <ol style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>
              <strong>Create a policy</strong> in PingOne Authorize with your rules (e.g.
              "deny payments &gt; $10,000", "require MFA for transfers &gt; $500").
              See the{' '}
              <a href="https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_overview.html" target="_blank" rel="noopener noreferrer">
                PingOne Authorize overview tutorials
              </a>.
            </li>
            <li>
              <strong>Create a Decision Endpoint</strong> in{' '}
              <em>Authorization → Decision Endpoints</em>. Copy the <strong>Endpoint ID</strong>.
              Enable <code>recordRecentRequests</code> on the <em>Test</em> endpoint for debugging.
            </li>
            <li>
              <strong>Define Trust Framework attributes</strong> that match the parameter names
              the BFF sends: <code>Amount</code>, <code>TransactionType</code>,{' '}
              <code>UserId</code>, <code>Acr</code>, <code>Timestamp</code>.
            </li>
            <li>
              <strong>Create a Worker application</strong> in PingOne (type: Worker, grant:
              client_credentials). Grant it the <em>PingOne Authorize Evaluator</em> role
              (or equivalent). Copy the Client ID and Secret.
            </li>
          </ol>

          <h3>BX Finance config fields</h3>
          <p>Set these in <strong>Admin → Config → PingOne Authorize</strong>:</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #e5e7eb' }}>Field</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #e5e7eb' }}>Where to get it</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Enable PingOne Authorize', 'Set to Enabled'],
                ['Decision Endpoint ID', 'PingOne → Authorization → Decision Endpoints → (endpoint) → ID'],
                ['Worker App Client ID', 'PingOne → Applications → (worker app) → Client ID'],
                ['Worker App Client Secret', 'PingOne → Applications → (worker app) → Client Secret'],
              ].map(([field, source]) => (
                <tr key={field}>
                  <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', fontWeight: 600 }}>{field}</td>
                  <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', color: '#4b5563' }}>{source}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 10 }}>
            Or set <code>PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID</code>,{' '}
            <code>PINGONE_AUTHORIZE_WORKER_CLIENT_ID</code>, and{' '}
            <code>PINGONE_AUTHORIZE_WORKER_CLIENT_SECRET</code> as environment variables.
          </p>
        </>
      ),
    },

    // ── Trust Framework attributes ────────────────────────────────────────
    {
      id: 'attributes',
      label: 'Trust Framework',
      content: (
        <>
          <p>
            PingOne Authorize evaluates policies using <strong>attributes</strong> defined in the
            Trust Framework. The BFF sends these as <code>parameters</code> in the decision request.
            Create matching attribute definitions in{' '}
            <em>Authorization → Trust Framework → Attributes</em>.
          </p>

          <pre className="edu-code">{`// Decision request body (Phase 2)
POST /v1/environments/{envId}/decisionEndpoints/{endpointId}
{
  "parameters": {
    "Amount":          500,            // Number — transaction amount
    "TransactionType": "transfer",     // String — "transfer" | "withdrawal"
    "UserId":          "user-abc123",  // String — PingOne subject ID
    "Acr":             "MFA",          // String — ACR from user token
    "Timestamp":       "2026-03-27T10:00:00Z"
  }
}`}</pre>

          <h3>Example policy rules</h3>
          <ul style={{ paddingLeft: 20, lineHeight: 1.9 }}>
            <li>
              <strong>Deny high value:</strong>{' '}
              <code>Amount &gt; 10000 → DENY</code>
            </li>
            <li>
              <strong>Step-up MFA:</strong>{' '}
              <code>Amount &gt; 500 AND Acr != "MFA" → obligation: STEP_UP</code>
            </li>
            <li>
              <strong>Permit routine:</strong>{' '}
              <code>Amount ≤ 500 → PERMIT</code>
            </li>
          </ul>

          <p>
            See the tutorial:{' '}
            <a href="https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_tutorial_decision_requests_and_recent_decisions.html" target="_blank" rel="noopener noreferrer">
              Making decision requests and examining recent decisions
            </a>.
          </p>
        </>
      ),
    },

    {
      id: 'inrepo',
      label: 'In this repo',
      content: (
        <>
          <h3 style={{ marginTop: 0 }}>MCP first-tool gate (optional)</h3>
          <EduImplIntro repoPath="banking_api_server/services/mcpToolAuthorizationService.js">
            Transactions use a separate path in <code>routes/transactions.js</code>; this snippet is the MCP mirror when <code>ff_authorize_mcp_first_tool</code> is on.
          </EduImplIntro>
          <pre className="edu-code">{SNIP_AUTHORIZE_GATE}</pre>
        </>
      ),
    },

    // ── Recent decisions ─────────────────────────────────────────────────
    {
      id: 'recent',
      label: '🔍 Recent Decisions',
      content: <RecentDecisionsViewer />,
    },
  ];

  return (
    <EducationDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="PingOne Authorize — Policy-Based Authorization"
      tabs={tabs}
      initialTabId={initialTabId}
    />
  );
}
