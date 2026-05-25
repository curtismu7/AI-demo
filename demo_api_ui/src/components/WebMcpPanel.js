// banking_api_ui/src/components/WebMcpPanel.js
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  listMcpTools,
  callMcpTool,
  openMcpToolStream,
} from "../services/webMcpClient";
import { useAgentUiMode } from "../context/AgentUiModeContext";
import { useEducationUI } from "../context/EducationUIContext";
import { EDU } from "./education/educationIds";
import PageNav from "./PageNav";
import "../styles/appShellPages.css";
import "./WebMcpPanel.css";

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Tools that always require HITL browser consent (can't execute inline)
const HITL_TOOLS = new Set(["create_deposit", "create_withdrawal", "create_transfer"]);
// Tools that require step-up MFA
const STEPUP_TOOLS = new Set(["get_sensitive_account_details"]);

/**
 * Interpret what a tool result means so we can show context alongside the raw JSON.
 * Returns null for clean success, or an object describing what gate fired.
 */
function interpretResult(result) {
  if (!result) return null;

  // HITL consent required
  if (result.error === "hitl_required" || result.hitl) {
    const threshold = result.hitl_threshold_usd;
    return {
      kind: "hitl",
      title: "Human-in-the-Loop (HITL) consent required",
      detail:
        threshold != null
          ? `Transactions above $${threshold} require explicit human approval before the MCP server will execute them. ` +
            `This is a security control — the agent cannot bypass it. ` +
            `To approve this action, use the Banking Agent on the dashboard: it will present a consent dialog before executing the tool.`
          : `Transfers always require explicit human approval regardless of amount. ` +
            `Use the Banking Agent on the dashboard to complete this action through the consent screen.`,
    };
  }

  // Step-up MFA required
  if (result.error === "step_up_required" || result.step_up_required) {
    const method = result.step_up_method || "email";
    return {
      kind: "stepup",
      title: "Step-up MFA verification required",
      detail:
        `This tool requires elevated authentication (${method} OTP or MFA challenge) before the MCP server will execute it. ` +
        `Complete a step-up challenge via the Banking Agent on the dashboard — once verified, ` +
        `your session will be elevated and this tool will execute.`,
    };
  }

  // Success
  if (result.success === true || result.result?.success === true) {
    return { kind: "success" };
  }

  // Generic error from the tool (bad params, not found, etc.)
  if (result.error && result.error !== "hitl_required" && result.error !== "step_up_required") {
    return { kind: "tool_error", title: "Tool returned an error", detail: result.message || result.error };
  }

  return null;
}

export default function WebMcpPanel() {
  const [tools, setTools] = useState([]);
  const [selectedTool, setSelectedTool] = useState(null);
  const [params, setParams] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [streamEvents, setStreamEvents] = useState([]);
  const [error, setError] = useState(null);
  const streamLogRef = useRef(null);
  const disconnectRef = useRef(null);
  const { setWebMcpLastResult } = useAgentUiMode();
  const { open } = useEducationUI();

  // Load tools on mount
  useEffect(() => {
    setLoading(true);
    listMcpTools()
      .then((data) => {
        setTools(data.tools || []);
        setError(null);
      })
      .catch((err) => {
        setError({
          message:
            "Could not load MCP tools — check that the MCP server is running.",
          details: `${err.message}${err.body ? "\n" + err.body : ""}`,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  // Auto-scroll stream log
  useEffect(() => {
    if (streamLogRef.current) {
      streamLogRef.current.scrollTop = streamLogRef.current.scrollHeight;
    }
  }, [streamEvents]);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (disconnectRef.current) disconnectRef.current();
    };
  }, []);

  const selectTool = useCallback((tool) => {
    setSelectedTool(tool);
    setParams({});
    setResult(null);
    setStreamEvents([]);
    setError(null);
  }, []);

  const handleParamChange = useCallback((key, value) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  const callSelectedTool = useCallback(async () => {
    if (!selectedTool) return;
    setLoading(true);
    setResult(null);
    setStreamEvents([]);
    setError(null);

    const flowTraceId = uuid();

    if (disconnectRef.current) disconnectRef.current();
    disconnectRef.current = openMcpToolStream(flowTraceId, (data) => {
      setStreamEvents((prev) => [
        ...prev,
        { key: `${flowTraceId}-${prev.length}`, data },
      ]);
    });

    try {
      const res = await callMcpTool(selectedTool.name, params, flowTraceId);
      setResult(res);
      if (setWebMcpLastResult) setWebMcpLastResult(res);
    } catch (err) {
      setError({
        message: "Tool call failed — check connection or permissions.",
        details: `${err.message}${err.body ? "\n" + err.body : ""}`,
      });
    } finally {
      setLoading(false);
    }
  }, [selectedTool, params, setWebMcpLastResult]);

  const schemaProps = selectedTool?.inputSchema?.properties || {};
  const requiredFields = selectedTool?.inputSchema?.required || [];

  // Unwrap result — the BFF wraps the actual tool result in a `result` key
  const toolResult = result?.result ?? result;
  const interpretation = interpretResult(toolResult);

  return (
    <div className="app-page-shell">
      <div className="app-page-shell__body">
        <PageNav title="WebMCP — Tool Inspector" />

        <div className="app-page-toolbar app-page-toolbar--start">
          <button
            type="button"
            className="app-page-toolbar-btn"
            onClick={() => open(EDU.WEB_MCP, "overview")}
          >
            What is WebMCP?
          </button>
          <button
            type="button"
            className="app-page-toolbar-btn"
            onClick={() => open(EDU.WEB_MCP, "architecture")}
          >
            Architecture
          </button>
          <button
            type="button"
            className="app-page-toolbar-btn"
            onClick={() => open(EDU.MCP_PROTOCOL, "what")}
          >
            MCP Protocol
          </button>
          <button
            type="button"
            className="app-page-toolbar-btn"
            onClick={() => open(EDU.TOKEN_EXCHANGE, "why")}
          >
            Token Exchange
          </button>
        </div>

        <div className="webmcp-panel">
          {loading && !selectedTool && (
            <div className="webmcp-loading">Loading tools…</div>
          )}

          {error && !selectedTool && (
            <div className="webmcp-error">
              <p>{error.message}</p>
              <details>
                <summary>Technical details</summary>
                <pre>{error.details}</pre>
              </details>
            </div>
          )}

          <div className="webmcp-body">
            {/* ── Left column: tool list ── */}
            <div className="webmcp-tool-list">
              <h4>Available Tools ({tools.length})</h4>
              {tools.length > 0 && (
                <p className="webmcp-tool-hint">Select a tool to inspect and call it</p>
              )}
              {tools.map((tool) => {
                const isHitl = HITL_TOOLS.has(tool.name);
                const isStepUp = STEPUP_TOOLS.has(tool.name);
                return (
                  <button
                    key={tool.name}
                    type="button"
                    className={`webmcp-tool-item${selectedTool?.name === tool.name ? " active" : ""}`}
                    onClick={() => selectTool(tool)}
                  >
                    <span className="webmcp-tool-name">{tool.name}</span>
                    <span className="webmcp-tool-desc">{tool.description}</span>
                    {isHitl && (
                      <span className="webmcp-tool-badge webmcp-tool-badge--hitl">
                        Requires consent
                      </span>
                    )}
                    {isStepUp && (
                      <span className="webmcp-tool-badge webmcp-tool-badge--stepup">
                        Requires step-up
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Right column: placeholder or tool detail ── */}
            {!selectedTool && tools.length > 0 && (
              <div className="webmcp-tool-placeholder">
                <p>
                  Select a tool from the list to inspect its schema, fill in
                  parameters, and call it live through the MCP pipeline.
                </p>
              </div>
            )}

            {selectedTool && (
              <div className="webmcp-tool-detail">
                <h4>{selectedTool.name}</h4>
                <p className="webmcp-tool-detail-desc">
                  {selectedTool.description}
                </p>

                {/* Upfront gate notice for tools that will always hit a gate */}
                {HITL_TOOLS.has(selectedTool.name) && (
                  <div className="webmcp-gate-notice webmcp-gate-notice--hitl">
                    <span className="webmcp-gate-notice__icon">⚠️</span>
                    <div>
                      <strong>Human-in-the-Loop (HITL) required</strong>
                      <p>
                        {selectedTool.name === "create_transfer"
                          ? "Transfers always require explicit human approval — the MCP server enforces this regardless of amount."
                          : "Deposits and withdrawals above the configured threshold require human approval."}
                        {" "}You can still call this tool here to see exactly what the server returns.
                      </p>
                    </div>
                  </div>
                )}
                {STEPUP_TOOLS.has(selectedTool.name) && (
                  <div className="webmcp-gate-notice webmcp-gate-notice--stepup">
                    <span className="webmcp-gate-notice__icon">⚠️</span>
                    <div>
                      <strong>Step-up MFA required</strong>
                      <p>
                        This tool requires elevated authentication. Complete a step-up challenge
                        via the Banking Agent on the dashboard first.
                        You can still call it here to see the server response.
                      </p>
                    </div>
                  </div>
                )}

                {/* Parameter form */}
                {Object.keys(schemaProps).length > 0 && (
                  <div className="webmcp-params">
                    <h5>Parameters</h5>
                    {Object.entries(schemaProps).map(([key, schema]) => (
                      <label key={key} className="webmcp-param-label">
                        <span>
                          {key}
                          {requiredFields.includes(key) && (
                            <span className="webmcp-required">*</span>
                          )}
                          {schema.description && (
                            <span className="webmcp-param-hint">
                              {" "}— {schema.description}
                            </span>
                          )}
                        </span>
                        <input
                          type="text"
                          className="webmcp-param-input"
                          value={params[key] || ""}
                          onChange={(e) =>
                            handleParamChange(key, e.target.value)
                          }
                          placeholder={schema.type || ""}
                        />
                      </label>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  className={`webmcp-call-btn${loading ? " webmcp-call-btn--loading" : ""}`}
                  onClick={callSelectedTool}
                  disabled={loading}
                >
                  {loading && <span className="webmcp-btn-spinner" aria-hidden="true" />}
                  {loading ? "Calling…" : "Call Tool"}
                </button>

                {loading && (
                  <div className="webmcp-calling-status">
                    <span className="webmcp-calling-spinner" aria-hidden="true" />
                    <span>
                      Calling <strong>{selectedTool.name}</strong> — waiting for response…
                    </span>
                  </div>
                )}

                {/* Stream events */}
                {streamEvents.length > 0 && (
                  <div className="webmcp-stream-log" ref={streamLogRef}>
                    <h5>Pipeline Events</h5>
                    {streamEvents.map((item) => (
                      <div key={item.key} className="webmcp-stream-event">
                        {JSON.stringify(item.data, null, 2)}
                      </div>
                    ))}
                  </div>
                )}

                {/* Result area */}
                {result && (
                  <div className="webmcp-result">
                    {/* Interpretation banner */}
                    {interpretation && interpretation.kind !== "success" && (
                      <div className={`webmcp-result-context webmcp-result-context--${interpretation.kind}`}>
                        <span className="webmcp-result-context__icon">
                          {interpretation.kind === "hitl" || interpretation.kind === "stepup" ? "⚠️" : "❌"}
                        </span>
                        <div>
                          <strong>{interpretation.title}</strong>
                          {interpretation.detail && <p>{interpretation.detail}</p>}
                        </div>
                      </div>
                    )}
                    {interpretation && interpretation.kind === "success" && (
                      <div className="webmcp-result-context webmcp-result-context--success">
                        <span className="webmcp-result-context__icon">✅</span>
                        <strong>Tool executed successfully</strong>
                      </div>
                    )}

                    {/* Raw JSON always shown */}
                    <h5>Server Response</h5>
                    <pre>{JSON.stringify(result, null, 2)}</pre>
                  </div>
                )}

                {/* HTTP-level error */}
                {error && (
                  <div className="webmcp-error">
                    <p>{error.message}</p>
                    <details>
                      <summary>Technical details</summary>
                      <pre>{error.details}</pre>
                    </details>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
