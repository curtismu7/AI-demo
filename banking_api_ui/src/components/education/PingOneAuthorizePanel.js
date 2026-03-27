// banking_api_ui/src/components/education/PingOneAuthorizePanel.js
import React, { useState, useCallback } from 'react';
import EducationDrawer from '../shared/EducationDrawer';

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

/** Live recent decisions panel — fetches from /api/authorize/recent-decisions. */
function RecentDecisionsViewer() {
  const [decisions, setDecisions]   = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [expanded, setExpanded]     = useState(null);

  const handleFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDecisions(null);
    try {
      const res = await fetch('/api/authorize/recent-decisions?limit=10', { credentials: 'include' });
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
  }, []);

  return (
    <div>
      <p>
        Requires <code>recordRecentRequests: true</code> on the decision endpoint in PingOne
        Authorize and admin sign-in. Shows the last 10 decisions (24-hour window).
      </p>
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
        {loading ? 'Loading…' : '↻ Fetch Recent Decisions'}
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
          {decisions.map((d, i) => (
            <div
              key={d.id || i}
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
                <DecisionBadge decision={d.decision || d.status} />
                <span style={{ fontSize: '0.8rem', color: '#374151', flex: 1 }}>
                  {d.request?.parameters?.TransactionType || d.type || 'evaluation'}
                  {d.request?.parameters?.Amount != null && ` — $${d.request.parameters.Amount}`}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{fmtTime(d.createdAt || d.timestamp)}</span>
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
          ))}
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
   Selects API path:
     • authorize_decision_endpoint_id set → Decision Endpoints API (Phase 2)
     • authorize_policy_id set            → Legacy PDP API (Phase 1 fallback)

3. BFF obtains worker token (client_credentials)
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
            </tbody>
          </table>
          <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 8 }}>
            The BFF picks Phase 2 if <code>authorize_decision_endpoint_id</code> is set; falls back
            to Phase 1 otherwise. Both paths return <code>{'{ decision, stepUpRequired, raw }'}</code>
            so no other code changes.
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
