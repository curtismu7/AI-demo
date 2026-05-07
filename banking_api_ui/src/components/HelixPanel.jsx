import React, { useState, useCallback, useEffect } from "react";
import apiClient from "../services/apiClient";
import { notifySuccess, notifyError } from "../utils/appToast";

export default function HelixPanel() {
  const [helixConfig, setHelixConfig] = useState({
    base_url: "",
    api_key: "",
    environment_id: "",
    agent_id: "",
  });
  const [helixStatus, setHelixStatus] = useState(null);
  const [helixSaving, setHelixSaving] = useState(false);
  const [helixChecking, setHelixChecking] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const fetchHelixStatus = useCallback(async () => {
    setHelixChecking(true);
    try {
      const statusRes = await apiClient.get(
        "/api/langchain/provider/helix/status",
      );
      console.log("[HelixPanel] Status response:", statusRes);
      setHelixStatus(statusRes.data?.status);

      const configRes = await apiClient.get("/api/langchain/config/status");
      console.log("[HelixPanel] Config response:", configRes.data);
      const cfg = configRes.data;

      setHelixConfig({
        base_url: cfg?.helix_base_url || "",
        api_key: "",
        environment_id: cfg?.helix_environment_id || "",
        agent_id: cfg?.helix_agent_id || "",
      });
      console.log("[HelixPanel] Updated config:", {
        base_url: cfg?.helix_base_url,
        environment_id: cfg?.helix_environment_id,
        agent_id: cfg?.helix_agent_id,
      });
      notifySuccess("Helix configuration loaded");
    } catch (err) {
      console.error("[HelixPanel] Status check failed:", err);
      notifyError(`Failed to load Helix configuration: ${err.message}`);
    } finally {
      setHelixChecking(false);
    }
  }, []);

  const handleHelixSave = async () => {
    if (
      !helixConfig.base_url ||
      !helixConfig.api_key ||
      !helixConfig.environment_id ||
      !helixConfig.agent_id
    ) {
      notifyError("All Helix fields are required");
      return;
    }

    setHelixSaving(true);
    try {
      await apiClient.post("/api/langchain/config", {
        provider: "helix",
        key_type: "helix",
        helix_api_key: helixConfig.api_key,
        helix_base_url: helixConfig.base_url,
        helix_environment_id: helixConfig.environment_id,
        helix_agent_id: helixConfig.agent_id,
      });
      sessionStorage.setItem("helix_config", JSON.stringify(helixConfig));
      notifySuccess("Helix LLM configuration saved");
      await fetchHelixStatus();
    } catch (err) {
      console.error("Helix save failed:", err);
      notifyError("Failed to save Helix configuration");
    } finally {
      setHelixSaving(false);
    }
  };

  const handleHelixClear = async () => {
    setShowClearConfirm(true);
  };

  const confirmHelixClear = async () => {
    setShowClearConfirm(false);
    setHelixSaving(true);
    try {
      await apiClient.delete("/api/langchain/config/key/helix");
      setHelixConfig({
        base_url: "",
        api_key: "",
        environment_id: "",
        agent_id: "",
      });
      setHelixStatus("unconfigured");
      sessionStorage.removeItem("helix_config");
      notifySuccess("Helix configuration cleared");
    } catch (err) {
      console.error("[HelixPanel] Clear failed:", err);
      notifyError("Failed to clear Helix config");
    } finally {
      setHelixSaving(false);
    }
  };

  useEffect(() => {
    // Restore from sessionStorage on mount (persist across tab switches)
    const savedHelix = sessionStorage.getItem("helix_config");
    if (savedHelix) {
      try {
        setHelixConfig(JSON.parse(savedHelix));
      } catch (err) {
        console.warn("Failed to parse Helix config from session:", err);
      }
    }

    // Load status on mount
    const loadStatus = async () => {
      try {
        const statusRes = await apiClient.get(
          "/api/langchain/provider/helix/status",
        );
        console.log("[HelixPanel] Initial status:", statusRes.data?.status);
        setHelixStatus(statusRes.data?.status);
      } catch (err) {
        console.error("[HelixPanel] Failed to load initial status:", err);
      }
    };
    loadStatus();
  }, []);

  // Persist form changes to sessionStorage in real-time
  useEffect(() => {
    sessionStorage.setItem("helix_config", JSON.stringify(helixConfig));
  }, [helixConfig]);

  return (
    <div style={{ padding: "1.5rem" }}>
      <h3>Helix LLM Configuration</h3>
      <p style={{ marginBottom: "1rem", color: "#666", fontSize: "0.9rem" }}>
        Configure Helix as your agent LLM.
        <br />
        <a
          href="https://openam-helix.forgeblocks.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#2563eb" }}
        >
          Open Helix Console ↗
        </a>
      </p>

      {/* Status pill */}
      <div style={{ marginBottom: "1rem" }}>
        <span
          style={{
            display: "inline-block",
            padding: "0.25rem 0.75rem",
            borderRadius: 6,
            fontSize: "0.85rem",
            fontWeight: 500,
            backgroundColor:
              helixStatus === "available"
                ? "#dcfce7"
                : helixStatus === "unconfigured"
                  ? "#fef3c7"
                  : "#fecaca",
            color:
              helixStatus === "available"
                ? "#166534"
                : helixStatus === "unconfigured"
                  ? "#92400e"
                  : "#991b1b",
          }}
        >
          {helixStatus === "available" && "✅ Active"}
          {helixStatus === "unconfigured" && "⚠️ Unconfigured"}
          {helixStatus === null && "…"}
        </span>
      </div>

      {/* Form fields */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.85rem",
              fontWeight: 500,
              marginBottom: "0.35rem",
            }}
          >
            Base URL
          </label>
          <input
            type="text"
            placeholder="https://openam-helix.forgeblocks.com/dpc/jas/helix/v1"
            value={helixConfig.base_url}
            onChange={(e) =>
              setHelixConfig({ ...helixConfig, base_url: e.target.value })
            }
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem",
              border: "1px solid #d1d5db",
              borderRadius: 4,
              fontSize: "0.9rem",
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.85rem",
              fontWeight: 500,
              marginBottom: "0.35rem",
            }}
          >
            API Key
          </label>
          <input
            type="password"
            placeholder="Helix API Key"
            value={helixConfig.api_key}
            onChange={(e) =>
              setHelixConfig({ ...helixConfig, api_key: e.target.value })
            }
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem",
              border: "1px solid #d1d5db",
              borderRadius: 4,
              fontSize: "0.9rem",
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.85rem",
              fontWeight: 500,
              marginBottom: "0.35rem",
            }}
          >
            Environment ID
          </label>
          <input
            type="text"
            placeholder="Environment/Tenant ID"
            value={helixConfig.environment_id}
            onChange={(e) =>
              setHelixConfig({ ...helixConfig, environment_id: e.target.value })
            }
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem",
              border: "1px solid #d1d5db",
              borderRadius: 4,
              fontSize: "0.9rem",
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.85rem",
              fontWeight: 500,
              marginBottom: "0.35rem",
            }}
          >
            Agent Name
          </label>
          <input
            type="text"
            placeholder="Helix Agent Name (e.g. my-banking-agent)"
            value={helixConfig.agent_id}
            onChange={(e) =>
              setHelixConfig({ ...helixConfig, agent_id: e.target.value })
            }
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem",
              border: "1px solid #d1d5db",
              borderRadius: 4,
              fontSize: "0.9rem",
            }}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          onClick={fetchHelixStatus}
          disabled={helixChecking}
          style={{
            padding: "0.5rem 1rem",
            background: "#f3f4f6",
            border: "1px solid #d1d5db",
            borderRadius: 4,
            cursor: helixChecking ? "not-allowed" : "pointer",
            opacity: helixChecking ? 0.6 : 1,
          }}
        >
          {helixChecking ? "Loading…" : "📥 Load from Database"}
        </button>
        <button
          onClick={handleHelixSave}
          disabled={
            helixSaving ||
            !helixConfig.base_url ||
            !helixConfig.api_key ||
            !helixConfig.environment_id ||
            !helixConfig.agent_id
          }
          style={{
            padding: "0.5rem 1rem",
            background: "#3b82f6",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: helixSaving ? "not-allowed" : "pointer",
            opacity: helixSaving || !helixConfig.base_url ? 0.6 : 1,
          }}
        >
          {helixSaving ? "Saving…" : "💾 Save & Activate"}
        </button>
        <button
          onClick={handleHelixClear}
          disabled={helixSaving}
          style={{
            padding: "0.5rem 1rem",
            background: "#fee2e2",
            color: "#dc2626",
            border: "none",
            borderRadius: 4,
            cursor: helixSaving ? "not-allowed" : "pointer",
          }}
        >
          ❌ Clear
        </button>
      </div>

      {/* Clear confirmation modal */}
      {showClearConfirm && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: 8,
              padding: "2rem",
              maxWidth: "400px",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "1rem" }}>
              Clear Helix Configuration?
            </h3>
            <p style={{ color: "#666", marginBottom: "1.5rem" }}>
              This will delete your Helix configuration and cannot be undone.
            </p>
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                disabled={helixSaving}
                style={{
                  padding: "0.5rem 1rem",
                  background: "#f3f4f6",
                  border: "1px solid #d1d5db",
                  borderRadius: 4,
                  cursor: helixSaving ? "not-allowed" : "pointer",
                  opacity: helixSaving ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmHelixClear}
                disabled={helixSaving}
                style={{
                  padding: "0.5rem 1rem",
                  background: "#dc2626",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: helixSaving ? "not-allowed" : "pointer",
                  opacity: helixSaving ? 0.6 : 1,
                }}
              >
                {helixSaving ? "Clearing…" : "Clear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
