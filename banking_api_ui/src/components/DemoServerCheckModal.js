/**
 * DemoServerCheckModal.js
 *
 * Shown on startup when one or more required servers are not reachable.
 * Displays exactly which server is missing and the command to start it.
 * No dismiss — the user must start the missing server; the modal retries
 * automatically every 5 seconds until all servers are up.
 */

import { useEffect, useRef, useState } from "react";
import DraggableModal from "./DraggableModal";
import "./DemoServerCheckModal.css";

/**
 * Poll /api/health/demo-status until all servers report up.
 * @param {function} onAllUp - called when every server is healthy
 * @param {function} onStatus - called with the latest status array
 * @param {number} intervalMs
 * @returns cleanup function
 */
function pollDemoStatus(onAllUp, onStatus, intervalMs = 5000) {
  let cancelled = false;

  async function check() {
    if (cancelled) return;
    try {
      const res = await fetch("/api/health/demo-status", {
        credentials: "include",
      });
      const data = await res.json();
      if (!cancelled) {
        onStatus(data.servers || []);
        if (data.ok) onAllUp();
      }
    } catch (_) {
      // BFF itself may be unreachable — surface all as down
      if (!cancelled) {
        onStatus([
          {
            name: "Banking API Server",
            key: "api_server",
            up: false,
            startCmd: "cd banking_api_server && npm start",
            description: "Express BFF",
            port: 3001,
          },
          {
            name: "Banking MCP Server",
            key: "mcp_server",
            up: false,
            startCmd: "cd banking_mcp_server && npm run dev",
            description: "MCP tool server",
            port: 8080,
          },
        ]);
      }
    }
  }

  check();
  const id = setInterval(check, intervalMs);
  return () => {
    cancelled = true;
    clearInterval(id);
  };
}

export default function DemoServerCheckModal({ downServers, onAllUp, onDismiss }) {
  const [servers, setServers] = useState(downServers || []);
  const [copied, setCopied] = useState(null);
  const cleanupRef = useRef(null);

  useEffect(() => {
    // Start polling so the modal auto-dismisses when everything comes up
    cleanupRef.current = pollDemoStatus(
      onAllUp,
      (latest) => {
        const stillDown = latest.filter((s) => !s.up);
        setServers(stillDown);
      },
      5000,
    );
    return () => cleanupRef.current?.();
  }, [onAllUp]);

  function copyCmd(cmd, key) {
    navigator.clipboard?.writeText(cmd).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const footer = (
    <div className="dsm-footer">
      <span className="dsm-pulse" aria-hidden="true" />
      <span className="dsm-checking">Checking every 5 seconds...</span>
    </div>
  );

  return (
    <DraggableModal
      isOpen={servers.length > 0}
      title={`Required server${servers.length > 1 ? "s" : ""} not running`}
      footer={footer}
      defaultWidth={520}
      defaultHeight={480}
      storageKey="dsm-modal"
      zIndex={99999}
      onClose={onDismiss}
      noBackdrop
    >
      <div className="dsm-body">
        <p className="dsm-intro">
          The demo requires all services to be started. The following{" "}
          {servers.length > 1 ? `${servers.length} servers are` : "server is"}{" "}
          not reachable:
        </p>

        <div className="dsm-servers">
          {servers.map((s) => (
            <div key={s.key} className="dsm-server-card">
              <div className="dsm-server-header">
                <span className="dsm-server-name">{s.name}</span>
                {s.port && <span className="dsm-server-port">:{s.port}</span>}
              </div>
              {s.description && (
                <p className="dsm-server-desc">{s.description}</p>
              )}
              <div className="dsm-cmd-row">
                <code className="dsm-cmd">{s.startCmd}</code>
                <button
                  type="button"
                  className={`dsm-copy-btn${copied === s.key ? " dsm-copy-btn--ok" : ""}`}
                  onClick={() => copyCmd(s.startCmd, s.key)}
                  title="Copy command"
                  aria-label={
                    copied === s.key
                      ? "Copied!"
                      : `Copy start command for ${s.name}`
                  }
                >
                  {copied === s.key ? "✓" : "⎘"}
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="dsm-hint">
          Run each command above in a separate terminal from the repo root, then
          this dialog will close automatically.
        </p>
      </div>
    </DraggableModal>
  );
}
