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
            <div className="webmcp-tool-list">
              <h4>Available Tools ({tools.length})</h4>
              {tools.map((tool) => (
                <button
                  key={tool.name}
                  type="button"
                  className={`webmcp-tool-item${selectedTool?.name === tool.name ? " active" : ""}`}
                  onClick={() => selectTool(tool)}
                >
                  <span className="webmcp-tool-name">{tool.name}</span>
                  <span className="webmcp-tool-desc">{tool.description}</span>
                </button>
              ))}
            </div>

            {selectedTool && (
              <div className="webmcp-tool-detail">
                <h4>{selectedTool.name}</h4>
                <p className="webmcp-tool-detail-desc">
                  {selectedTool.description}
                </p>

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
                              {" "}
                              — {schema.description}
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
                  className="webmcp-call-btn"
                  onClick={callSelectedTool}
                  disabled={loading}
                >
                  {loading ? "Calling…" : "Call Tool"}
                </button>

                {streamEvents.length > 0 && (
                  <div className="webmcp-stream-log" ref={streamLogRef}>
                    <h5>Stream Events</h5>
                    {streamEvents.map((item) => (
                      <div key={item.key} className="webmcp-stream-event">
                        {JSON.stringify(item.data, null, 2)}
                      </div>
                    ))}
                  </div>
                )}

                {result && (
                  <div className="webmcp-result">
                    <h5>Result</h5>
                    <pre>{JSON.stringify(result, null, 2)}</pre>
                  </div>
                )}

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
