/**
 * InteractiveArchDiagram — 5-node simplified diagram driven by TokenChainContext.
 *
 * NOTE (Phase 270): This component is intentionally PARTIAL. It renders only 5 of the
 * 14 distinct nodes the system actually runs (User, BFF, PingOne, LLM, MCP) so the
 * inline "live highlighting" stays compact when token-chain events fire. It is NOT
 * the authoritative architecture view.
 *
 * For the COMPLETE system picture, see:
 *   - Mermaid source:  architecture-simple.mmd  (repo root)
 *   - Rendered PNG:    banking_api_ui/public/architecture/overview.png
 *   - Detailed view:   architecture.mmd → overview2.png
 *
 * The Jest sync test
 *   banking_api_ui/src/components/__tests__/ArchitectureDiagram.completeness.test.js
 * enforces "every service in run-bank.sh SVC_LIST appears in at least one .mmd source"
 * — DO NOT add nodes here to satisfy that test; add them to the .mmd sources instead.
 *
 * Why this component was retained (Phase 270 user decision): it drives off
 * TokenChainContext to highlight which boxes have been touched during the current
 * agent flow. That live behaviour is not replicated by a static PNG. If you find
 * yourself maintaining two parallel diagrams, prefer the PNG and remove this
 * component in a future phase.
 */
// banking_api_ui/src/components/education/InteractiveArchDiagram.js
import React, { useState } from "react";
import { useTokenChainOptional } from "../../context/TokenChainContext";
import RfcLink from "../shared/RfcLink";
import "./InteractiveArchDiagram.css";

// Real architecture nodes — three parties: Identity, BFF+Agent, and downstream services
const NODES = {
  user: { icon: "USR", label: "User / Browser", sub: "End user", type: "user" },
  bff: {
    icon: "BFF",
    label: "BFF / AI Agent",
    sub: "Express + LangGraph :3001",
    type: "bff",
  },
  idp: {
    icon: "IDP",
    label: "PingOne",
    sub: "OAuth 2.0 AS / OIDC",
    type: "idp",
  },
  llm: {
    icon: "LLM",
    label: "LLM Provider",
    sub: "OpenAI, Anthropic, Groq, Gemini, Helix",
    type: "llm",
  },
  mcp: {
    icon: "MCP",
    label: "banking_mcp_server",
    sub: "TypeScript MCP ws://:8080",
    type: "mcp",
  },
};

const ARROWS = [
  {
    id: "login",
    label: "PKCE Login + RFC 8693",
    claims: {
      grant: "authorization_code + PKCE",
      exchange: "RFC 8693 token exchange",
    },
    rfc: "RFC_7636",
  },
  {
    id: "agent_calls",
    label: "LLM inference + MCP tools",
    claims: {
      llm: "Tool selection / inference",
      mcp: "tools/call (WebSocket)",
    },
    rfc: "MCP_SPEC",
  },
];

function Node({ nodeKey, isActive, onClick }) {
  const n = NODES[nodeKey];
  if (!n) return null;
  return (
    <div
      className={`iad-node iad-node--${n.type}`}
      onClick={() => onClick(nodeKey)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick(nodeKey)}
      title={`${n.label} — ${n.sub}`}
      style={
        isActive
          ? { boxShadow: "0 0 0 3px #2563eb44", borderColor: "#2563eb" }
          : undefined
      }
    >
      <div className="iad-node-icon">{n.icon}</div>
      <div className="iad-node-label">{n.label}</div>
      <div className="iad-node-sublabel">{n.sub}</div>
    </div>
  );
}

function Arrow({ arrow, isActive }) {
  const claimLines = arrow.claims
    ? Object.entries(arrow.claims)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n")
    : null;

  return (
    <div className="iad-arrow-wrapper">
      <div className={`iad-arrow${isActive ? " iad-arrow--active" : ""}`}>
        <div className="iad-arrow-line" />
        <div className="iad-arrow-head">→</div>
        <div className="iad-arrow-label">
          <span>{arrow.label}</span>
          {arrow.claims &&
            Object.entries(arrow.claims)
              .slice(0, 2)
              .map(([k, v]) => (
                <span key={k} className="iad-arrow-claim">
                  <strong>{k}:</strong> {String(v).slice(0, 28)}
                  {String(v).length > 28 ? "…" : ""}
                </span>
              ))}
        </div>
      </div>
      {claimLines && <div className="iad-claim-popup">{claimLines}</div>}
    </div>
  );
}

export default function InteractiveArchDiagram() {
  const ctx = useTokenChainOptional();
  const events = ctx?.events || [];
  const [, setSelectedNode] = useState(null);

  const activeNodes = new Set();
  if (events.some((ev) => ev.status === "active" || ev.status === "acquired")) {
    activeNodes.add("user");
    activeNodes.add("bff");
  }
  if (events.some((ev) => ev.id?.includes("agent") || ev.id?.includes("cc"))) {
    activeNodes.add("idp");
  }
  if (events.some((ev) => ev.id?.includes("mcp") && ev.status === "acquired")) {
    activeNodes.add("mcp");
  }

  const hasExchange = activeNodes.has("idp");

  return (
    <div className="iad-root">
      <div className="iad-title">RFC 8693 Token Exchange Architecture</div>
      <div className="iad-subtitle">
        Hover arrows for token claim details · Live token state reflected from
        Token Chain · <RfcLink rfc="RFC_8693" />
      </div>

      <div className="iad-canvas">
        {/* Col 1: User + PingOne */}
        <div className="iad-col">
          <Node
            nodeKey="user"
            isActive={activeNodes.has("user")}
            onClick={setSelectedNode}
          />
          <Node
            nodeKey="idp"
            isActive={activeNodes.has("idp")}
            onClick={setSelectedNode}
          />
        </div>

        <Arrow arrow={ARROWS[0]} isActive={activeNodes.has("bff")} />

        {/* Col 2: BFF (Express :3001) — also hosts the LangGraph AI agent */}
        <div className="iad-col">
          <Node
            nodeKey="bff"
            isActive={activeNodes.has("bff")}
            onClick={setSelectedNode}
          />
        </div>

        <Arrow arrow={ARROWS[1]} isActive={activeNodes.has("mcp")} />

        {/* Col 3: LLM Provider + MCP Server */}
        <div className="iad-col">
          <Node nodeKey="llm" isActive={false} onClick={setSelectedNode} />
          <Node
            nodeKey="mcp"
            isActive={activeNodes.has("mcp")}
            onClick={setSelectedNode}
          />
        </div>
      </div>

      {hasExchange && (
        <div className="iad-exchange-banner">
          <strong>RFC 8693 Exchange Flow:</strong> BFF sends user token + agent
          CC token to PingOne, which issues an MCP-scoped token (aud:
          banking_mcp_server, act: bff-client-id). Subject identity is preserved
          throughout. <RfcLink rfc="RFC_8693" section="§4" />
        </div>
      )}

      <div className="iad-legend">
        {[
          ["#60a5fa", "User/Browser"],
          ["#34d399", "BFF / AI Agent"],
          ["#f59e0b", "Identity Provider (PingOne)"],
          ["#f472b6", "LLM Provider"],
          ["#2dd4bf", "MCP Server"],
        ].map(([color, label]) => (
          <div key={label} className="iad-legend-item">
            <div className="iad-legend-dot" style={{ background: color }} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="iad-rfc-row">
        <span>Standards:</span>
        <RfcLink rfc="RFC_8693" /> · <RfcLink rfc="RFC_7636" /> ·{" "}
        <RfcLink rfc="MCP_SPEC" /> · <RfcLink rfc="RFC_9728" />
      </div>
    </div>
  );
}
