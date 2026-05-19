import React, { useState, useEffect } from "react";
import TokenSecurityTester from "../components/TokenSecurityTester";
import RedButton from "../components/RedButton";
import KillSwitchConfirmModal from "../components/KillSwitchConfirmModal";
import ForensicAuditDashboard from "../components/ForensicAuditDashboard";
import ThemePicker from "../components/ThemePicker";
import apiClient from "../services/apiClient";
import "./Admin.css";

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [showKillModal, setShowKillModal] = useState(false);
  const [agentRevoked, setAgentRevoked] = useState(false);

  useEffect(() => {
    loadAdminStats();
  }, []);

  const loadAdminStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get("/api/admin/stats");
      setStats(response.data.stats);
    } catch (err) {
      console.error("[Admin] Error loading stats:", err);
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          err.message ||
          "Failed to load admin statistics",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>Admin Dashboard</h1>
        <p className="admin-subtitle">
          System management and security configuration
        </p>
      </div>

      <div className="admin-tabs">
        <button
          type="button"
          className={`admin-tab ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          System Overview
        </button>
        <button
          type="button"
          className={`admin-tab ${activeTab === "security" ? "active" : ""}`}
          onClick={() => setActiveTab("security")}
        >
          Security Testing
        </button>
        <button
          type="button"
          className={`admin-tab ${activeTab === "safety" ? "active" : ""}`}
          onClick={() => setActiveTab("safety")}
        >
          Agent Safety
        </button>
        <button
          type="button"
          className={`admin-tab ${activeTab === "branding" ? "active" : ""}`}
          onClick={() => setActiveTab("branding")}
        >
          Branding
        </button>
      </div>

      {activeTab === "overview" && (
        <div className="admin-section">
          <h2>System Overview</h2>

          {loading && (
            <div className="admin-loading">
              <p>Loading system statistics...</p>
            </div>
          )}

          {error && (
            <div className="admin-error">
              <strong>Error:</strong> {error}
              <button
                type="button"
                onClick={loadAdminStats}
                className="admin-retry-button"
              >
                Try Again
              </button>
            </div>
          )}

          {stats && (
            <div className="admin-stats-grid">
              <div className="stat-card">
                <div className="stat-value">{stats.totalUsers}</div>
                <div className="stat-label">Total Users</div>
                <div className="stat-subtext">{stats.activeUsers} active</div>
              </div>

              <div className="stat-card">
                <div className="stat-value">{stats.totalAccounts}</div>
                <div className="stat-label">Bank Accounts</div>
                <div className="stat-subtext">
                  {stats.activeAccounts} active
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-value">
                  ${(stats.totalBalance / 1000).toFixed(0)}K
                </div>
                <div className="stat-label">Total Balance</div>
                <div className="stat-subtext">
                  Avg: ${stats.averageBalance?.toFixed(0)}
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-value">{stats.totalTransactions}</div>
                <div className="stat-label">Transactions</div>
                <div className="stat-subtext">All time</div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "security" && (
        <div className="admin-section">
          <h2>Token Security Testing</h2>
          <p className="admin-section-description">
            Test how the MCP server validates tokens and rejects requests that
            violate security controls. Each scenario demonstrates a different
            security validation.
          </p>
          <div className="admin-token-tester-wrapper">
            <TokenSecurityTester />
          </div>
        </div>
      )}

      {activeTab === "safety" && (
        <div className="admin-section">
          <h2>Agent Safety Control Center</h2>
          <p className="admin-section-description">
            Immediate agent revocation and forensic audit trail. Click the red
            button to stop an agent. All kill events are logged immutably for
            compliance and analysis.
          </p>

          <div
            style={{
              display: "flex",
              gap: "32px",
              marginTop: "24px",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                padding: "24px",
                backgroundColor: "#fef2f2",
                border: "2px solid #ef4444",
                borderRadius: "8px",
                textAlign: "center",
                flex: "0 0 200px",
              }}
            >
              <h3 style={{ margin: "0 0 16px 0", fontSize: "14px" }}>
                Emergency Kill Switch
              </h3>
              <RedButton
                agentId="demo-agent"
                isRevoked={agentRevoked}
                onKillClick={() => setShowKillModal(true)}
              />
              <p
                style={{
                  margin: "12px 0 0 0",
                  fontSize: "12px",
                  color: "#666",
                }}
              >
                {agentRevoked ? "Agent revoked" : "Click to revoke"}
              </p>
            </div>

            <div style={{ flex: "1", minWidth: "300px" }}>
              <ForensicAuditDashboard agentId="demo-agent" />
            </div>
          </div>
        </div>
      )}

      {activeTab === "branding" && (
        <div className="admin-section">
          <h2>Demo Branding</h2>
          <p className="admin-section-description">
            Switch the demo branding to show different industry verticals. Selecting
            Great Buy changes the logo, color scheme, and AI assistant prompt chips to
            retail-relevant actions (e.g. List My Orders instead of My Accounts).
          </p>
          <div style={{ marginTop: "24px", maxWidth: "320px" }}>
            <ThemePicker variant="toolbar" />
          </div>
        </div>
      )}

      <KillSwitchConfirmModal
        isOpen={showKillModal}
        agentId="demo-agent"
        onConfirm={async (agentId, reason) => {
          try {
            await apiClient.post(`/api/admin/agent/${agentId}/kill-switch`, {
              reason,
            });
            setAgentRevoked(true);
            setShowKillModal(false);
          } catch (err) {
            console.error("Kill switch failed:", err);
          }
        }}
        onCancel={() => setShowKillModal(false)}
      />
    </div>
  );
}
