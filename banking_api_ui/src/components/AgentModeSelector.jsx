// banking_api_ui/src/components/AgentModeSelector.jsx
import React from "react";
import useLangchainProvider from "../hooks/useLangchainProvider";
import "./AgentModeSelector.css";

// Shared 5-mode agent selector (spec 2026-05-18-five-mode-agent-provider §6).
// `compact` = condensed variant for the BankingAgent header.
export default function AgentModeSelector({ compact = false }) {
  const {
    mode, externalWiring, modeOptions, saving, setMode, setExternalWiring,
  } = useLangchainProvider();

  const current = modeOptions.find((m) => m.id === mode);
  const isExternal = !!current && current.external;
  const showDegraded = isExternal && externalWiring === "platform";

  return (
    <div className={`ams${compact ? " ams--compact" : ""}`}>
      <label className="ams-label">
        Agent mode
        <select
          aria-label="Agent mode"
          value={mode}
          disabled={saving}
          onChange={(e) => setMode(e.target.value, externalWiring ?? "bff")}
          className="ams-select"
        >
          {modeOptions.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </label>

      {isExternal && (
        <label className="ams-label ams-wiring">
          Wiring
          <select
            aria-label="External wiring"
            value={externalWiring || "bff"}
            disabled={saving}
            onChange={(e) => setExternalWiring(e.target.value)}
            className="ams-select"
          >
            <option value="bff">via BFF (token chain intact)</option>
            <option value="platform">platform-driven (token chain lost)</option>
          </select>
        </label>
      )}

      {showDegraded && (
        <p className="ams-degraded" role="status">
          ⚠️ Delegation lost here — a third party holds a broad gateway token.
          No per-tool RFC 8693 exchange, no <code>act</code> claim, Token Chain
          dark before the gateway. The MCP Gateway + PingAuthorize still
          enforce policy on every tool call.
        </p>
      )}
    </div>
  );
}
