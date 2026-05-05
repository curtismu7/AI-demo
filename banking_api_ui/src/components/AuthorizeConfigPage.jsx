import React, { useState, useEffect, useCallback } from "react";
import "./AuthorizeConfigPage.css";

const API_BASE = process.env.REACT_APP_API_BASE || "";

function StatusBadge({ activeEngine }) {
  const engineLabel =
    {
      off: "Authorization Off",
      simulated: "Simulated (Mock)",
      pingone: "PingOne Authorize",
      pending_config: "Not Configured",
    }[activeEngine] || "Unknown";

  const cssClass = `azc-badge azc-badge--${activeEngine}`;
  return <span className={cssClass}>{engineLabel}</span>;
}

export default function AuthorizeConfigPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("mock");

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/authorize/config`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const [mockForm, setMockForm] = useState({});
  const [mockSaving, setMockSaving] = useState(false);
  const [mockResult, setMockResult] = useState(null);

  useEffect(() => {
    if (data?.simulated) {
      setMockForm({
        confirmAmount: data.simulated.confirmAmount,
        denyAmount: data.simulated.denyAmount,
        stepUpAmount: data.simulated.stepUpAmount,
        mcpDenyTools: (data.simulated.mcpDenyTools || []).join(", "),
        mcpHitlTools: (data.simulated.mcpHitlTools || []).join(", "),
      });
    }
  }, [data]);

  const handleMockSave = useCallback(async () => {
    setMockSaving(true);
    setMockResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/authorize/config`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          simulated_confirm_amount: mockForm.confirmAmount,
          simulated_deny_amount: mockForm.denyAmount,
          simulated_stepup_amount: mockForm.stepUpAmount,
          simulated_mcp_deny_tools: mockForm.mcpDenyTools,
          simulated_mcp_hitl_tools: mockForm.mcpHitlTools,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setMockResult({
        ok: true,
        msg: "Simulated authorize rules saved successfully",
      });
      fetchConfig();
    } catch (e) {
      setMockResult({ ok: false, msg: e.message });
    } finally {
      setMockSaving(false);
    }
  }, [mockForm, fetchConfig]);

  if (loading)
    return <div className="azc-loading">Loading authorize config…</div>;
  if (error)
    return (
      <div className="azc-error">
        Error: {error} <button onClick={fetchConfig}>Retry</button>
      </div>
    );

  return (
    <div className="azc-root">
      <div className="azc-header">
        <div>
          <h2 className="azc-title">Authorize Configuration</h2>
          <p className="azc-subtitle">
            Configure PingOne Authorize policies and simulated (mock) authorize
            rules for transaction evaluation.
          </p>
        </div>
        <div className="azc-header-badge">
          {data?.status && (
            <StatusBadge activeEngine={data.status.activeEngine} />
          )}
          <button className="azc-refresh-btn" onClick={fetchConfig}>
            ↻ Refresh
          </button>
        </div>
      </div>

      <div className="azc-tabs">
        <button
          className={`azc-tab ${activeTab === "mock" ? "azc-tab--active" : ""}`}
          onClick={() => setActiveTab("mock")}
        >
          Mock Rules (Simulated)
        </button>
        <button
          className={`azc-tab ${activeTab === "pingone" ? "azc-tab--active" : ""}`}
          onClick={() => setActiveTab("pingone")}
        >
          PingOne Authorize
        </button>
        <button
          className={`azc-tab ${activeTab === "mcp" ? "azc-tab--active" : ""}`}
          onClick={() => setActiveTab("mcp")}
        >
          MCP Tool Gate
        </button>
        <button
          className={`azc-tab ${activeTab === "env" ? "azc-tab--active" : ""}`}
          onClick={() => setActiveTab("env")}
        >
          Env Vars
        </button>
      </div>

      {activeTab === "mock" && data && (
        <div className="azc-panel">
          <div className="azc-section">
            <h3>Simulated Authorize Rules</h3>
            <p className="azc-description">
              These thresholds apply when{" "}
              <code>ff_authorize_simulated=true</code> and{" "}
              <code>authorize_enabled=true</code>. Changes take effect
              immediately without server restart.
            </p>

            <div className="azc-form">
              <label className="azc-field">
                <span className="azc-field-label">
                  Hard Deny Threshold (USD)
                </span>
                <input
                  type="number"
                  className="azc-input"
                  value={mockForm.denyAmount || ""}
                  onChange={(e) =>
                    setMockForm({ ...mockForm, denyAmount: e.target.value })
                  }
                  placeholder="2000"
                />
                <span className="azc-field-hint">
                  Transactions exceeding this amount are DENIED. Default: 2000
                </span>
              </label>

              <label className="azc-field">
                <span className="azc-field-label">Confirm Threshold (USD)</span>
                <input
                  type="number"
                  className="azc-input"
                  value={mockForm.confirmAmount || ""}
                  onChange={(e) =>
                    setMockForm({ ...mockForm, confirmAmount: e.target.value })
                  }
                  placeholder="250"
                />
                <span className="azc-field-hint">
                  Transactions at/above this amount require user confirmation
                  (consent only, no MFA). Default: 250
                </span>
              </label>

              <label className="azc-field">
                <span className="azc-field-label">Step-Up Threshold (USD)</span>
                <input
                  type="number"
                  className="azc-input"
                  value={mockForm.stepUpAmount || ""}
                  onChange={(e) =>
                    setMockForm({ ...mockForm, stepUpAmount: e.target.value })
                  }
                  placeholder="500"
                />
                <span className="azc-field-hint">
                  Transactions at/above this amount require elevated authentication (MFA)
                  plus consent. Default: 500
                </span>
              </label>

              <label className="azc-field">
                <span className="azc-field-label">
                  MCP Tools — Hard Deny List
                </span>
                <textarea
                  className="azc-textarea"
                  value={mockForm.mcpDenyTools || ""}
                  onChange={(e) =>
                    setMockForm({ ...mockForm, mcpDenyTools: e.target.value })
                  }
                  placeholder="tool1, tool2, tool3"
                  rows="3"
                />
                <span className="azc-field-hint">
                  Comma-separated tool names. Tools in this list return DENY
                  decision. Leave blank for no denies.
                </span>
              </label>

              <label className="azc-field">
                <span className="azc-field-label">
                  MCP Tools — HITL Approval Required
                </span>
                <textarea
                  className="azc-textarea"
                  value={mockForm.mcpHitlTools || ""}
                  onChange={(e) =>
                    setMockForm({ ...mockForm, mcpHitlTools: e.target.value })
                  }
                  placeholder="tool1, tool2, tool3"
                  rows="3"
                />
                <span className="azc-field-hint">
                  Comma-separated tool names. Tools in this list require
                  human-in-the-loop approval. Leave blank for no HITL gates.
                </span>
              </label>

              <button
                className="azc-save-btn"
                onClick={handleMockSave}
                disabled={mockSaving}
              >
                {mockSaving ? "Saving…" : "Save Simulated Rules"}
              </button>

              {mockResult && (
                <div
                  className={`azc-alert ${mockResult.ok ? "azc-alert--success" : "azc-alert--error"}`}
                >
                  {mockResult.ok ? "✓ " : "✗ "}
                  {mockResult.msg}
                </div>
              )}
            </div>
          </div>

          <div className="azc-section">
            <h4>How Simulated Authorize Works</h4>
            <ol className="azc-rules-list">
              <li>
                <strong>Hard Deny:</strong> Transactions exceeding the deny
                threshold (default $2000) are immediately rejected (DENY decision)
              </li>
              <li>
                <strong>Consent + MFA (Step-Up):</strong> Transactions at/above
                the step-up threshold (default $500) require both human consent
                and elevated authentication (MFA)
              </li>
              <li>
                <strong>Confirmation (Consent Only):</strong> Transactions
                between the confirm threshold (default $250) and step-up threshold
                require user confirmation/consent only (no MFA)
              </li>
              <li>
                <strong>Default Permit:</strong> Transactions below $250 are
                automatically permitted
              </li>
              <li>
                <strong>MCP Tool Gates:</strong> Tool names in the deny list are
                rejected outright; names in the HITL list require human approval
              </li>
            </ol>
          </div>
        </div>
      )}

      {activeTab === "pingone" && data && (
        <div className="azc-panel">
          <div className="azc-alert azc-alert--info">
            ℹ️ PingOne Authorize configuration is set in the main{" "}
            <strong>App Configuration</strong> page (search for "PingOne Setup"
            tab). This tab shows the current state.
          </div>

          <div className="azc-info-grid">
            <div className="azc-info-item">
              <span className="azc-info-label">Worker Client ID</span>
              <code>{data.pingone?.workerClientId || "(not set)"}</code>
            </div>
            <div className="azc-info-item">
              <span className="azc-info-label">Decision Endpoint ID</span>
              <code>{data.pingone?.decisionEndpointId || "(not set)"}</code>
            </div>
            <div className="azc-info-item">
              <span className="azc-info-label">MCP Decision Endpoint ID</span>
              <code>{data.pingone?.mcpDecisionEndpointId || "(not set)"}</code>
            </div>
            <div className="azc-info-item">
              <span className="azc-info-label">Legacy Policy ID</span>
              <code>{data.pingone?.policyId || "(not set)"}</code>
            </div>
          </div>

          <div className="azc-section">
            <h4>PingOne Authorize Setup</h4>
            <p>To configure PingOne Authorize:</p>
            <ol className="azc-rules-list">
              <li>
                Go to <strong>App Configuration</strong> (main app config page)
              </li>
              <li>
                Select the <strong>PingOne Setup</strong> tab
              </li>
              <li>
                Enter your PingOne Authorize worker credentials and decision
                endpoint IDs
              </li>
              <li>Return here to verify the configuration is recognized</li>
            </ol>
          </div>
        </div>
      )}

      {activeTab === "mcp" && data && (
        <div className="azc-panel">
          <div className="azc-alert azc-alert--info">
            ℹ️ MCP tool gate rules are configured in the{" "}
            <strong>Mock Rules</strong> tab above. These apply when simulated
            mode is active.
          </div>
          <p>
            To control MCP tool access with PingOne Authorize, define
            tool-specific rules in your PingOne Authorize policy.
          </p>
        </div>
      )}

      {activeTab === "env" && data && (
        <div className="azc-panel">
          <table className="azc-env-table">
            <tbody>
              {Object.entries(data.envVars || {}).map(([k, v]) => (
                <tr key={k}>
                  <td className="azc-env-key">
                    <code>{k}</code>
                  </td>
                  <td className="azc-env-val">{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="azc-env-note">
            Environment variables set in <code>banking_api_server/.env</code>{" "}
            (local) or Vercel env (production). ConfigStore values override env
            vars at runtime.
          </p>
        </div>
      )}
    </div>
  );
}
