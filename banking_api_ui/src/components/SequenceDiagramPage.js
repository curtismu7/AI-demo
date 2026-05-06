import { useState, useRef, useCallback, useEffect } from "react";
/**

/**
 * SequenceDiagramPage.js — /sequence-diagram
 *
 * Interactive sequence diagram of the i4ai reference architecture.
 * Participants: User → Chatbot → Agent → LLM → PingOne → Agent Gateway → Ping Authorize → MCP → Resource Server
 * 44 steps with simulation, scenarios, and token cards (same UX as ArchitectureFlowPage).
 */

// ─── Token card components (reused from ArchitectureFlowPage) ───────────────

const FLOW_ACCENT = {
  oauth: "#2563eb",
  exchange: "#7c3aed",
  permit: "#16a34a",
  hitl: "#d97706",
  idtoken: "#0891b2",
  mcp: "#475569",
  error: "#dc2626",
};

function FlowClaimRow({ k, v }) {
  const isAud = k === "aud" || k === "audience" || k === "TokenAudience";
  const isAct = k === "act" || k === "may_act" || k === "ActClientId";
  const isDecide = k === "decision" || k === "DecisionContext";
  if (k === "note" || k === "_type" || k === "_rfcs" || k === "_title")
    return null;
  const val = String(v);
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        marginBottom: 4,
        alignItems: "flex-start",
      }}
    >
      <span
        style={{
          fontSize: "0.73rem",
          color: "#64748b",
          minWidth: 100,
          flexShrink: 0,
          lineHeight: 1.5,
          fontFamily: "inherit",
        }}
      >
        {k}
      </span>
      <span
        style={{
          fontSize: "0.8rem",
          fontFamily: "inherit",
          lineHeight: 1.5,
          wordBreak: "break-word",
          color: isAud
            ? "#1d4ed8"
            : isAct
              ? "#15803d"
              : isDecide
                ? "#15803d"
                : "#0f172a",
          fontWeight: isAud || isAct || isDecide ? 700 : 500,
        }}
      >
        {val}
      </span>
    </div>
  );
}

function OneFlowCard({ token }) {
  if (!token) return null;
  const accentType =
    token._type ||
    (token.decision?.includes("PERMIT")
      ? "permit"
      : token.decision?.includes("DENY")
        ? "error"
        : "oauth");
  const accent = FLOW_ACCENT[accentType] || FLOW_ACCENT.oauth;
  const rfcs = token._rfcs || [];
  const title = token.type || "Token";
  const note = token.note;
  const claimEntries = Object.entries(token).filter(
    ([k]) =>
      k !== "type" &&
      k !== "_type" &&
      k !== "_title" &&
      k !== "_rfcs" &&
      k !== "note",
  );
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 10,
        padding: "12px 14px",
        minWidth: 270,
        maxWidth: 340,
        boxShadow: "0 4px 20px rgba(0,0,0,0.14)",
        border: "1px solid #e2e8f0",
        borderLeft: `4px solid ${accent}`,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 5,
          marginBottom: 9,
        }}
      >
        <span
          style={{
            fontSize: "0.86rem",
            fontWeight: 700,
            color: "#0f172a",
            flex: "1 1 auto",
          }}
        >
          {title}
        </span>
        {rfcs.map((r) => (
          <span
            key={r}
            style={{
              fontSize: "0.65rem",
              fontWeight: 700,
              background: "#eff6ff",
              color: "#1d4ed8",
              border: "1px solid #bfdbfe",
              borderRadius: 4,
              padding: "1px 5px",
              whiteSpace: "nowrap",
            }}
          >
            {r}
          </span>
        ))}
      </div>
      {claimEntries.map(([k, v]) => (
        <FlowClaimRow key={k} k={k} v={v} />
      ))}
      {note && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 6,
            borderTop: "1px solid #f1f5f9",
            fontSize: "0.73rem",
            color: "#64748b",
            fontStyle: "italic",
            lineHeight: 1.4,
            fontFamily: "system-ui,sans-serif",
          }}
        >
          ℹ {note}
        </div>
      )}
    </div>
  );
}

// StepInfoPanel: left sidebar showing current step number, description, and details
function StepInfoPanel({
  activeStep,
  currentStepIdx,
  steps,
  isPaused,
  onStepClick,
}) {
  const arrowSteps = steps.filter((s) => s.step);
  const totalSteps = arrowSteps.length;
  const stepListRef = useRef(null);

  // Auto-scroll active step into view
  const activeStepNum = activeStep?.step;
  const activeIdx = arrowSteps.findIndex((s) => s.step === activeStepNum);
  useEffect(() => {
    if (activeIdx >= 0 && stepListRef.current) {
      const activeElem = stepListRef.current.querySelector(
        `[data-step="${activeStepNum}"]`,
      );
      if (activeElem) {
        activeElem.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [activeStepNum, activeIdx]);

  if (!activeStep) {
    return (
      <div
        style={{
          width: "220px",
          flexShrink: 0,
          padding: "1.5rem 1rem",
          background: "#f8fafc",
          borderRight: "1px solid #e2e8f0",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          overflowY: "auto",
          maxHeight: "800px",
        }}
      >
        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>
          Flow Steps
        </div>
        <div style={{ fontSize: "0.75rem", color: "#94a3b8", lineHeight: 1.6 }}>
          Press Simulate to begin. Then Pause to navigate steps with Prev/Next
          or click a step in this list.
        </div>
        <div
          style={{
            marginTop: "0.5rem",
            fontSize: "0.75rem",
            color: "#cbd5e1",
            fontStyle: "italic",
          }}
        >
          {totalSteps} steps total
        </div>
      </div>
    );
  }

  const fromParticipant = PARTICIPANTS.find((p) => p.id === activeStep.from);
  const toParticipant = PARTICIPANTS.find((p) => p.id === activeStep.to);

  return (
    <div
      style={{
        width: "220px",
        flexShrink: 0,
        padding: "1.5rem 1rem",
        background: "#f8fafc",
        borderRight: "1px solid #e2e8f0",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        overflowY: "auto",
        maxHeight: "800px",
      }}
    >
      {/* Active step details */}
      <div
        style={{
          paddingBottom: "1rem",
          borderBottom: "1px solid #e2e8f0",
          marginBottom: "0.5rem",
        }}
      >
        <div
          style={{
            fontSize: "0.75rem",
            color: "#94a3b8",
            marginBottom: "0.25rem",
          }}
        >
          Step {activeStep.step} of {totalSteps}
        </div>
        <div
          style={{
            fontSize: "0.9rem",
            fontWeight: 700,
            color: "#004687",
            marginBottom: "0.5rem",
          }}
        >
          {activeStep.description}
        </div>
        {fromParticipant && toParticipant && (
          <div
            style={{
              fontSize: "0.75rem",
              color: "#475569",
              marginBottom: "0.4rem",
            }}
          >
            {fromParticipant.label} → {toParticipant.label}
          </div>
        )}
        <div
          style={{
            fontSize: "0.7rem",
            color: "#64748b",
            lineHeight: 1.4,
            marginBottom: "0.5rem",
          }}
        >
          {activeStep.label}
        </div>
        {activeStep.scopes && activeStep.scopes.length > 0 && (
          <div
            style={{
              paddingTop: "0.5rem",
              borderTop: "1px solid #e2e8f0",
              marginTop: "0.5rem",
            }}
          >
            <div
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                color: "#475569",
                marginBottom: "0.3rem",
              }}
            >
              Scopes:
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
              }}
            >
              {activeStep.scopes.map((scope) => (
                <div
                  key={scope}
                  style={{
                    fontSize: "0.7rem",
                    color: "#1d4ed8",
                    fontWeight: 500,
                    background: "#eff6ff",
                    padding: "0.3rem 0.5rem",
                    borderRadius: 3,
                  }}
                >
                  {scope}
                </div>
              ))}
            </div>
          </div>
        )}
        {activeStep.tokenChanges && activeStep.tokenChanges.length > 0 && (
          <div
            style={{
              paddingTop: "0.5rem",
              marginTop: "0.5rem",
              borderTop: "1px solid #e2e8f0",
            }}
          >
            <div
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                color: "#475569",
                marginBottom: "0.3rem",
              }}
            >
              Token Changes:
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
              }}
            >
              {activeStep.tokenChanges.map((change) => (
                <div
                  key={`${activeStep.step}-${change}`}
                  style={{
                    fontSize: "0.7rem",
                    color: "#92400e",
                    fontWeight: 500,
                    background: "#fef08a",
                    padding: "0.35rem 0.5rem",
                    borderRadius: 3,
                    border: "1px solid #fcd34d",
                  }}
                >
                  • {change}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Step list */}
      <div
        style={{
          fontSize: "0.75rem",
          fontWeight: 600,
          color: "#475569",
          marginBottom: "0.5rem",
        }}
      >
        Steps:
      </div>
      <div
        ref={stepListRef}
        style={{
          flex: 1,
          overflowY: "auto",
          fontSize: "0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.25rem",
        }}
      >
        {arrowSteps.map((step, idx) => {
          const isActive = step.step === activeStepNum;
          return (
            <button
              key={step.step}
              data-step={step.step}
              onClick={() => {
                if (isPaused) {
                  onStepClick(idx);
                }
              }}
              style={{
                padding: "0.35rem 0.5rem",
                borderRadius: 4,
                border: "none",
                background: isActive ? "#dbeafe" : "#fff",
                color: isActive ? "#004687" : "#475569",
                fontWeight: isActive ? 600 : 400,
                cursor: isPaused ? "pointer" : "default",
                textAlign: "left",
                fontSize: "0.75rem",
                opacity: isPaused ? 1 : 0.6,
                transition: "all 0.2s",
              }}
              disabled={!isPaused}
            >
              <span style={{ color: "#94a3b8", marginRight: "0.25rem" }}>
                {step.step}.
              </span>
              {step.description}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// IMPORTANT: No emojis in any UI text (participant labels, step labels, notes).
// All labels and notes must match i4ai-ref-arch.mmd exactly, including multi-line formatting.

// PARTICIPANTS (from i4ai-ref-arch.mmd, see https://api.pingdemo.com:4000/architecture/flow)
const PARTICIPANTS = [
  // Mermaid: actor U as User
  { id: "U", label: "User", icon: "" },
  // Mermaid: participant WA as Web Application
  { id: "WA", label: "Web Application", icon: "" },
  // Mermaid: participant CB as Chatbot
  { id: "CB", label: "Chatbot", icon: "" },
  // Mermaid: participant A as Agent (Digital Assistant)
  { id: "A", label: "Agent (Digital Assistant)", icon: "" },
  // Mermaid: participant LLM as LLM
  { id: "LLM", label: "LLM", icon: "" },
  // Mermaid: participant PID as Ping Identity IDM/IAM
  { id: "PID", label: "Ping Identity IDM/IAM", icon: "" },
  // Mermaid: participant AG as Agent Gateway
  { id: "AG", label: "Agent Gateway", icon: "" },
  // Mermaid: participant PA as Ping Authorize
  { id: "PA", label: "Ping Authorize", icon: "" },
  // Mermaid: participant MCP as MCP
  { id: "MCP", label: "MCP", icon: "" },
  // Mermaid: participant RS as Resource Server (OAuth 2.1)
  { id: "RS", label: "Resource Server (OAuth 2.1)", icon: "" },
];

// ALL_STEPS: 1:1 with i4ai-ref-arch.mmd (see https://api.pingdemo.com:4000/architecture/flow)
// Each step/note references the corresponding Mermaid line in a comment.
// description field: brief human-readable title for the left step panel (2-5 words)
const ALL_STEPS = [
  // Note over U,CB: User submits prompt
  {
    type: "note",
    participants: ["U", "CB"],
    text: "User submits prompt",
    description: "User submits prompt",
  },
  // U->>CB: "What is my current account balance\nand recent transactions?"
  {
    step: 1,
    from: "U",
    to: "CB",
    label: '"What is my current account balance\nand recent transactions?"',
    type: "request",
    description: "User Prompt",
  },
  // CB->>A: Process user request via Agent
  {
    step: 2,
    from: "CB",
    to: "A",
    label: "Process user request via Agent",
    type: "request",
    description: "Agent Handoff",
  },
  // Note over A: Agent initializes
  {
    type: "note",
    participants: ["A"],
    text: "Agent initializes",
    description: "Agent initializes",
  },
  // A->>PID: Token request (client_credentials)
  {
    step: 3,
    from: "A",
    to: "PID",
    label: "Token request (client_credentials)",
    type: "request",
    description: "CC Token Request",
  },
  // PID-->>A: Access token
  {
    step: 4,
    from: "PID",
    to: "A",
    label: "Access token",
    type: "response",
    description: "Access Token",
  },
  // Note over A: Request tool list
  {
    type: "note",
    participants: ["A"],
    text: "Request tool list",
    description: "Request tool list",
  },
  // A->>AG: tools/list (JSON-RPC)
  {
    step: 5,
    from: "A",
    to: "AG",
    label: "tools/list (JSON-RPC)",
    type: "request",
    description: "Tools List Request",
  },
  // AG->>PA: Authorization check (agent token)
  {
    step: 6,
    from: "AG",
    to: "PA",
    label: "Authorization check (agent token)",
    type: "request",
    description: "Auth Check (Agent)",
  },
  // PA->>PID: Introspect agent token
  {
    step: 7,
    from: "PA",
    to: "PID",
    label: "Introspect agent token",
    type: "request",
    description: "Token Introspect",
  },
  // PID-->>PA: Token claims (sub, aud, scope)
  {
    step: 8,
    from: "PID",
    to: "PA",
    label: "Token claims (sub, aud, scope)",
    type: "response",
    description: "Token Claims",
  },
  // Note over PA: Fine-grained policy evaluation:<br/>return allowed tools for this agent
  {
    type: "note",
    participants: ["PA"],
    text: "Fine-grained policy evaluation:\nreturn allowed tools for this agent",
    description: "Fine-grained policy evaluation",
  },
  // PA-->>AG: Permitted tool list for agent
  {
    step: 9,
    from: "PA",
    to: "AG",
    label: "Permitted tool list for agent",
    type: "response",
    description: "Tool List (Filtered)",
  },
  // AG-->>A: List of available tools
  {
    step: 10,
    from: "AG",
    to: "A",
    label: "List of available tools",
    type: "response",
    description: "Available Tools",
  },
  // CB->>A: Pass user prompt to agent
  {
    step: 11,
    from: "CB",
    to: "A",
    label: "Pass user prompt to agent",
    type: "request",
    description: "Forward Prompt to Agent",
  },
  // A->>LLM: Tool list + chatbot prompt
  {
    step: 12,
    from: "A",
    to: "LLM",
    label: "Tool list + chatbot prompt",
    type: "request",
    description: "Pass Prompt to LLM",
  },
  // LLM-->>A: Determine tool to use (check_balance)
  {
    step: 13,
    from: "LLM",
    to: "A",
    label: "Determine tool to use (check_balance)",
    type: "response",
    description: "Tool Decision",
  },
  // Note over A: Tool call — agent context only <br/> (no user subject token)
  {
    type: "note",
    participants: ["A"],
    text: "Tool call — agent context only\n(no user subject token)",
    description: "Tool call — agent context only",
  },
  // A->>AG: tools/call check_balance (JSON-RPC)
  {
    step: 14,
    from: "A",
    to: "AG",
    label: "tools/call check_balance (JSON-RPC)",
    type: "request",
    description: "Tool Call (No Subject)",
  },
  // AG->>PA: Authorization check
  {
    step: 15,
    from: "AG",
    to: "PA",
    label: "Authorization check",
    type: "request",
    description: "Auth Check (No Subject)",
  },
  // PA-->>AG: Deny (insufficient_scope: balance, no subject token)
  {
    step: 16,
    from: "PA",
    to: "AG",
    label: "Deny (insufficient_scope: balance, no subject token)",
    type: "response",
    description: "DENY — No Subject Token",
  },
  // AG-->>A: HTTP 403 Forbidden (insufficient_scope: balance, no subject token)
  {
    step: 17,
    from: "AG",
    to: "A",
    label: "HTTP 403 Forbidden (insufficient_scope: balance, no subject token)",
    type: "response",
    description: "403 Forbidden",
  },
  // A-->>CB: User context required (resource: agent1, scope: balance)
  {
    step: 18,
    from: "A",
    to: "CB",
    label: "User context required (resource: agent1, scope: balance)",
    type: "response",
    description: "User Context Required",
  },
  // Note over CB,WA: EITHER: User already authenticated (skip to step 19)
  {
    type: "note",
    participants: ["CB", "WA"],
    text: "EITHER: User already authenticated\nObtain scoped subject token (skip to step 19)",
    description: "User already authenticated",
  },
  // Note over CB,WA: OR: If user is not authenticated
  {
    type: "note",
    participants: ["CB", "WA"],
    text: "OR: If user is not authenticated,\nPingOne authentication is triggered",
    description: "If user is not authenticated",
  },
  // CB-->>U: Redirect to PingOne login
  {
    step: "18a",
    from: "CB",
    to: "U",
    label: "Redirect to PingOne login (OIDC authorize)",
    type: "response",
    description: "Redirect to PingOne",
  },
  // U->>PID: Authenticate with PingOne
  {
    step: "18b",
    from: "U",
    to: "PID",
    label: "Authenticate (email, password, MFA)",
    type: "request",
    description: "PingOne Authentication",
  },
  // PID-->>U: Session established, redirect to app callback
  {
    step: "18c",
    from: "PID",
    to: "U",
    label: "Session established, redirect to callback URL",
    type: "response",
    description: "Session Established",
  },
  // U-->>CB: User returns authenticated
  {
    step: "18d",
    from: "U",
    to: "CB",
    label: "User authenticated, session cookie set",
    type: "response",
    description: "Authenticated Session",
  },
  // CB->>WA: Request token (resource: agent1, scope: balance)
  {
    step: 19,
    from: "CB",
    to: "WA",
    label: "Request token (resource: agent1, scope: balance)",
    type: "request",
    description: "Scoped Token Request",
  },
  // WA->>PID: Token request (resource: agent1, scope: balance)
  {
    step: 20,
    from: "WA",
    to: "PID",
    label: "Token request (resource: agent1, scope: balance)",
    type: "request",
    description: "PingOne Token Request",
    scopes: ["banking:read"],
  },
  // PID-->>WA: Subject token (sub: user, aud: agent1, may_act: {sub: agent1}, scope: balance)
  {
    step: 21,
    from: "PID",
    to: "WA",
    label:
      "Subject token (sub: user, aud: agent1, may_act: {sub: agent1}, scope: balance)",
    type: "response",
    description: "Subject Token Issued",
    scopes: ["banking:read"],
  },
  // WA-->>CB: Subject token
  {
    step: 22,
    from: "WA",
    to: "CB",
    label: "Subject token",
    type: "response",
    description: "Subject Token Return",
  },
  // CB->>A: Subject token (sub: user, may_act: {sub: agent1})
  {
    step: 23,
    from: "CB",
    to: "A",
    label: "Subject token (sub: user, may_act: {sub: agent1})",
    type: "request",
    description: "Subject Token to Agent",
  },
  // Note over A,PID: Exchange token for Agent Gateway (RFC 8693)
  {
    type: "note",
    participants: ["A", "PID"],
    text: "Exchange token for Agent Gateway (RFC 8693)",
    description: "Exchange token — Agent Gateway",
  },
  // A->>PID: Token exchange (actor_token: agent token, subject_token: user token)
  {
    step: 24,
    from: "A",
    to: "PID",
    label:
      "Token exchange (actor_token: agent token, subject_token: user token)",
    type: "request",
    description: "RFC 8693 Exchange #1",
    tokenChanges: [
      "Add act claim (agent1)",
      "Change aud to mcp-gw",
      "Keep scope: banking:read",
    ],
  },
  // PID-->>A: TX token (sub: user, act: {sub: agent1}, aud: mcp-gw, scope: balance)
  {
    step: 25,
    from: "PID",
    to: "A",
    label:
      "TX token (sub: user, act: {sub: agent1}, aud: mcp-gw, scope: balance)",
    type: "response",
    description: "TX Token (Agent GW)",
    tokenChanges: [
      "Add act claim (agent1)",
      "Change aud to mcp-gw",
      "Keep scope: banking:read",
    ],
  },
  // Note over A: sub=user, act=agent1 — Agent acts on behalf of user
  {
    type: "note",
    participants: ["A"],
    text: "sub=user, act=agent1 — Agent acts on behalf of user",
    description: "sub=user, act=agent1",
  },
  // Note over A: Option: aud: mcp-olb<br/>(requires assurance only path to MCP is via gateway)
  {
    type: "note",
    participants: ["A"],
    text: "Option: aud: mcp-olb\n(requires assurance only path to MCP is via gateway)",
    description: "aud: mcp-olb option",
  },
  // A->>AG: tools/call check_balance (JSON-RPC) with TX token
  {
    step: 26,
    from: "A",
    to: "AG",
    label: "tools/call check_balance (JSON-RPC) with TX token",
    type: "request",
    description: "Tool Call with TX Token",
  },
  // Note over AG,PA: Gateway authorizes TX token + tool call
  {
    type: "note",
    participants: ["AG", "PA"],
    text: "Gateway authorizes TX token + tool call",
    description: "Gateway authorizes TX token",
  },
  // AG->>PA: Authorization check (TX token, tool: check_balance)
  {
    step: 27,
    from: "AG",
    to: "PA",
    label: "Authorization check (TX token, tool: check_balance)",
    type: "request",
    description: "Auth Check (TX Token)",
  },
  // PA->>PID: Introspect TX token
  {
    step: 28,
    from: "PA",
    to: "PID",
    label: "Introspect TX token",
    type: "request",
    description: "TX Token Introspect",
  },
  // PID-->>PA: Token claims (sub, act, aud, scope)
  {
    step: 29,
    from: "PID",
    to: "PA",
    label: "Token claims (sub, act, aud, scope)",
    type: "response",
    description: "TX Token Claims",
  },
  // Note over PA: Validate: aud, scope: balance,<br/>tool call details vs. policy
  {
    type: "note",
    participants: ["PA"],
    text: "Validate: aud, scope: balance,\ntool call details vs. policy",
    description: "Validate policy",
  },
  // PA-->>AG: Permit
  {
    step: 30,
    from: "PA",
    to: "AG",
    label: "Permit",
    type: "response",
    description: "PERMIT",
  },
  // Note over AG,PID: Exchange token for MCP
  {
    type: "note",
    participants: ["AG", "PID"],
    text: "Exchange token for MCP",
    description: "Exchange token — MCP",
  },
  // AG->>PID: Token exchange (TX token → aud: mcp)
  {
    step: 31,
    from: "AG",
    to: "PID",
    label: "Token exchange (TX token → aud: mcp)",
    type: "request",
    description: "RFC 8693 Exchange #2",
    scopes: ["banking:mcp:invoke"],
    tokenChanges: [
      "Keep act claim (agent1)",
      "Change aud to mcp",
      "Keep scope: banking:read",
    ],
  },
  // PID-->>AG: MCP token (sub: user, act: {sub: agent1}, aud: mcp, scope: balance)
  {
    step: 32,
    from: "PID",
    to: "AG",
    label:
      "MCP token (sub: user, act: {sub: agent1}, aud: mcp, scope: balance)",
    type: "response",
    description: "MCP Token",
    scopes: ["banking:mcp:invoke"],
    tokenChanges: [
      "Keep act claim (agent1)",
      "Change aud to mcp",
      "Keep scope: banking:read",
    ],
  },
  // AG->>MCP: tools/call check_balance (JSON-RPC) with MCP token
  {
    step: 33,
    from: "AG",
    to: "MCP",
    label: "tools/call check_balance (JSON-RPC) with MCP token",
    type: "request",
    description: "Tool Call to MCP",
  },
  // Note over MCP,PID: Exchange token for Resource Server
  {
    type: "note",
    participants: ["MCP", "PID"],
    text: "Exchange token for Resource Server",
    description: "Exchange token — Resource Server",
  },
  // MCP->>PID: Token exchange (MCP token → aud: resource-server)
  {
    step: 34,
    from: "MCP",
    to: "PID",
    label: "Token exchange (MCP token → aud: resource-server)",
    type: "request",
    description: "RFC 8693 Exchange #3",
    tokenChanges: [
      "Keep act claim (agent1)",
      "Change aud to resource-server",
      "Keep scope: banking:read",
    ],
  },
  // PID-->>MCP: RS token (sub: user, act: {sub: agent1}, aud: resource-server, scope: balance)
  {
    step: 35,
    from: "PID",
    to: "MCP",
    label:
      "RS token (sub: user, act: {sub: agent1}, aud: resource-server, scope: balance)",
    type: "response",
    description: "RS Token",
    tokenChanges: [
      "Keep act claim (agent1)",
      "Change aud to resource-server",
      "Keep scope: banking:read",
    ],
  },
  // MCP->>RS: GET /balance (RS token)
  {
    step: 36,
    from: "MCP",
    to: "RS",
    label: "GET /balance (RS token)",
    type: "request",
    description: "GET /balance",
  },
  // RS->>PID: Introspect RS token
  {
    step: 37,
    from: "RS",
    to: "PID",
    label: "Introspect RS token",
    type: "request",
    description: "RS Token Introspect",
  },
  // PID-->>RS: Token claims (sub, act, aud, scope)
  {
    step: 38,
    from: "PID",
    to: "RS",
    label: "Token claims (sub, act, aud, scope)",
    type: "response",
    description: "RS Token Claims",
  },
  // Note over RS: Validate: aud=resource-server,<br/>scope: balance, act: agent1
  {
    type: "note",
    participants: ["RS"],
    text: "Validate: aud=resource-server,\nscope: balance, act: agent1",
    description: "Validate RS token",
  },
  // RS-->>MCP: Balance data
  {
    step: 39,
    from: "RS",
    to: "MCP",
    label: "Balance data",
    type: "response",
    description: "Balance Data",
  },
  // MCP-->>AG: Tool result
  {
    step: 40,
    from: "MCP",
    to: "AG",
    label: "Tool result",
    type: "response",
    description: "Tool Result (MCP → GW)",
  },
  // AG-->>A: Tool result
  {
    step: 41,
    from: "AG",
    to: "A",
    label: "Tool result",
    type: "response",
    description: "Tool Result (GW → Agent)",
  },
  // A->>LLM: Tool result + context
  {
    step: 42,
    from: "A",
    to: "LLM",
    label: "Tool result + context",
    type: "request",
    description: "LLM Context",
  },
  // LLM-->>A: Natural language response
  {
    step: 43,
    from: "LLM",
    to: "A",
    label: "Natural language response",
    type: "response",
    description: "Natural Language Response",
  },
  // A-->>CB: Response
  {
    step: 44,
    from: "A",
    to: "CB",
    label: "Response",
    type: "response",
    description: "Agent → Chatbot",
  },
  // Note over CB,U: Chatbot shows AI response:<br/>"Your checking account balance is $2,450.32.<br/>Recent transactions: Purchase at Starbucks ($5.42),<br/>Direct deposit from employer ($2,500.00)..."
  {
    type: "note",
    participants: ["CB", "U"],
    text: 'Chatbot shows AI response:\n"Your checking account balance is $2,450.32.\nRecent transactions: Purchase at Starbucks ($5.42),\nDirect deposit from employer ($2,500.00)..."',
    description: "Chatbot shows AI response",
  },
  // CB-->>U: Display in chatbot interface
  {
    step: 45,
    from: "CB",
    to: "U",
    label: "Display in chatbot interface",
    type: "response",
    description: "Display in Chatbot",
  },
  // CB-->>WA: Response + context
  {
    step: 46,
    from: "CB",
    to: "WA",
    label: "Response + context",
    type: "response",
    description: "Sync to Web App",
  },
  // WA-->>U: Also sync to dashboard/full UI
  {
    step: 47,
    from: "WA",
    to: "U",
    label: "Also sync to dashboard/full UI",
    type: "response",
    description: "Dashboard Update",
  },
  // Note over U: User can view in both<br/>chatbot interface and main dashboard
  {
    type: "note",
    participants: ["U"],
    text: "User can view in both\nchatbot interface and main dashboard",
    description: "User can view in both",
  },
];

const SCENARIOS = {
  "full-flow": ALL_STEPS,
  "agent-init": ALL_STEPS.filter((s) => s.step && s.step <= 10),
  "no-subject-token": ALL_STEPS.filter(
    (s) => s.step && s.step >= 11 && s.step <= 18,
  ),
  "obtain-subject": ALL_STEPS.filter(
    (s) => s.step && s.step >= 19 && s.step <= 23,
  ),
  "token-exchanges": ALL_STEPS.filter(
    (s) =>
      s.step &&
      ([24, 25, 31, 32, 34, 35].includes(s.step) ||
        (s.step >= 26 && s.step <= 30)),
  ),
  "full-auth": ALL_STEPS.filter((s) => s.step && s.step >= 26 && s.step <= 30),
  "data-return": ALL_STEPS.filter(
    (s) => s.step && s.step >= 36 && s.step <= 47,
  ),
};

// ─── Main Component ────────────────────────────────────────────────────────

export default function SequenceDiagramPage() {
  const [selectedScenario, setSelectedScenario] = useState("full-flow");
  const [authScenario, setAuthScenario] = useState("authenticated"); // 'authenticated' or 'not-authenticated'
  const [isSimulating, setIsSimulating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentStepIdx, setCurrentStepIdx] = useState(-1);
  const pausedStepIdx = useRef(-1);
  const simTimeouts = useRef([]);

  // Filter steps based on authentication scenario
  let scenarioSteps = SCENARIOS[selectedScenario] || ALL_STEPS;
  const steps =
    authScenario === "not-authenticated"
      ? scenarioSteps // Show all steps including 18a-18d
      : scenarioSteps.filter(
          (s) => !["18a", "18b", "18c", "18d"].includes(String(s.step)),
        ); // Hide auth steps if already authenticated

  const activeStep = currentStepIdx >= 0 ? steps[currentStepIdx] : null;

  const applyStep = useCallback((idx) => {
    setCurrentStepIdx(idx);
  }, []);

  const resetDiagram = useCallback(() => {
    setCurrentStepIdx(-1);
    setIsPaused(false);
    pausedStepIdx.current = -1;
  }, []);

  const scheduleSteps = useCallback(
    (startIdx) => {
      simTimeouts.current.forEach(clearTimeout);
      simTimeouts.current = [];
      steps.slice(startIdx).forEach((_, offset) => {
        const i = startIdx + offset;
        const t = setTimeout(
          () => {
            applyStep(i);
            if (i === steps.length - 1) {
              const done = setTimeout(() => {
                resetDiagram();
                setIsSimulating(false);
              }, 4000);
              simTimeouts.current.push(done);
            }
          },
          (offset + (startIdx === 0 ? 0 : 1)) * 2500,
        );
        simTimeouts.current.push(t);
      });
    },
    [steps, applyStep, resetDiagram],
  );

  const runSimulation = useCallback(() => {
    if (isSimulating) return;
    setCurrentStepIdx(-1);
    setIsSimulating(true);
    setIsPaused(false);
    scheduleSteps(0);
  }, [isSimulating, scheduleSteps]);

  const pause = useCallback(() => {
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];
    pausedStepIdx.current = currentStepIdx;
    setIsPaused(true);
  }, [currentStepIdx]);

  const resume = useCallback(() => {
    if (!isPaused) return;
    setIsPaused(false);
    scheduleSteps(pausedStepIdx.current + 1);
  }, [isPaused, scheduleSteps]);

  const prevStep = useCallback(() => {
    if (!isPaused) return;
    const prev = pausedStepIdx.current - 1;
    if (prev < 0) return;
    applyStep(prev);
    pausedStepIdx.current = prev;
  }, [isPaused, applyStep]);

  const nextStep = useCallback(() => {
    if (!isPaused) return;
    const next = pausedStepIdx.current + 1;
    if (next >= steps.length) {
      resetDiagram();
      setIsSimulating(false);
      return;
    }
    applyStep(next);
    pausedStepIdx.current = next;
  }, [isPaused, steps.length, applyStep, resetDiagram]);

  const handleStepClick = useCallback(
    (idx) => {
      if (!isPaused) return;
      applyStep(idx);
      pausedStepIdx.current = idx;
    },
    [isPaused, applyStep],
  );

  const stopSim = useCallback(() => {
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];
    resetDiagram();
    setIsSimulating(false);
  }, [resetDiagram]);

  const participantIndex = (id) => PARTICIPANTS.findIndex((p) => p.id === id);

  return (
    <div style={{ padding: "1rem", background: "#fff" }}>
      {/* Toolbar */}
      <div
        style={{
          marginBottom: "1rem",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "1.1rem",
            fontWeight: 700,
            color: "#1e293b",
          }}
        >
          Sequence Diagram — i4ai Token Exchange Flow
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label
            htmlFor="scenario-select"
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#475569",
              whiteSpace: "nowrap",
            }}
          >
            Scenario:
          </label>
          <select
            id="scenario-select"
            value={selectedScenario}
            onChange={(e) => setSelectedScenario(e.target.value)}
            disabled={isSimulating}
            style={{
              fontSize: "0.78rem",
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              background: "#fff",
              color: "#1e293b",
              cursor: isSimulating ? "not-allowed" : "pointer",
            }}
          >
            <option value="full-flow">Full Flow</option>
            <option value="agent-init">
              Agent Init (CC Token + Tool List)
            </option>
            <option value="no-subject-token">No Subject Token (DENY)</option>
            <option value="obtain-subject">Obtain Subject Token</option>
            <option value="token-exchanges">RFC 8693 Exchanges</option>
            <option value="full-auth">Full Auth (tools/call + PA)</option>
            <option value="data-return">Data Return (RS → Results)</option>
          </select>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            borderLeft: "1px solid #e2e8f0",
            paddingLeft: "1rem",
            marginLeft: "0.5rem",
          }}
        >
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#475569",
              whiteSpace: "nowrap",
            }}
          >
            Authentication:
          </div>
          <button
            type="button"
            onClick={() => setAuthScenario("authenticated")}
            disabled={isSimulating}
            style={{
              padding: "0.4rem 0.8rem",
              borderRadius: 6,
              fontSize: "0.78rem",
              fontWeight: 600,
              border:
                authScenario === "authenticated"
                  ? "2px solid #004687"
                  : "1px solid #cbd5e1",
              background: authScenario === "authenticated" ? "#dbeafe" : "#fff",
              color: authScenario === "authenticated" ? "#004687" : "#475569",
              cursor: isSimulating ? "not-allowed" : "pointer",
            }}
          >
            User Already Authenticated
          </button>
          <button
            type="button"
            onClick={() => setAuthScenario("not-authenticated")}
            disabled={isSimulating}
            style={{
              padding: "0.4rem 0.8rem",
              borderRadius: 6,
              fontSize: "0.78rem",
              fontWeight: 600,
              border:
                authScenario === "not-authenticated"
                  ? "2px solid #004687"
                  : "1px solid #cbd5e1",
              background:
                authScenario === "not-authenticated" ? "#dbeafe" : "#fff",
              color:
                authScenario === "not-authenticated" ? "#004687" : "#475569",
              cursor: isSimulating ? "not-allowed" : "pointer",
            }}
          >
            User NOT Authenticated
          </button>
        </div>
        {!isSimulating && (
          <button
            type="button"
            onClick={runSimulation}
            style={{
              padding: "0.4rem 0.8rem",
              border: "none",
              borderRadius: 6,
              background: "#004687",
              color: "#fff",
              fontSize: "0.82rem",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            ▶ Simulate
          </button>
        )}
        {isSimulating && !isPaused && (
          <>
            <button
              type="button"
              disabled
              style={{
                padding: "0.4rem 0.8rem",
                borderRadius: 6,
                background: "#004687",
                color: "#fff",
                fontSize: "0.82rem",
                fontWeight: 600,
                opacity: 0.6,
              }}
            >
              ▶ Step {currentStepIdx + 1} / {steps.length}
            </button>
            <button
              type="button"
              onClick={pause}
              style={{
                padding: "0.4rem 0.8rem",
                border: "1px solid #94a3b8",
                borderRadius: 6,
                background: "#fff",
                fontSize: "0.82rem",
                cursor: "pointer",
                fontWeight: 600,
                color: "#475569",
              }}
            >
              ⏸ Pause
            </button>
          </>
        )}
        {isSimulating && isPaused && (
          <>
            <button
              type="button"
              onClick={prevStep}
              disabled={currentStepIdx <= 0}
              style={{
                padding: "0.4rem 0.8rem",
                border: "1px solid #94a3b8",
                borderRadius: 6,
                background: "#fff",
                fontSize: "0.82rem",
                cursor: "pointer",
                fontWeight: 600,
                color: "#475569",
                opacity: currentStepIdx <= 0 ? 0.4 : 1,
              }}
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={resume}
              style={{
                padding: "0.4rem 1rem",
                border: "none",
                borderRadius: 6,
                background: "#004687",
                color: "#fff",
                fontSize: "0.82rem",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              ▶ Resume
            </button>
            <button
              type="button"
              onClick={nextStep}
              style={{
                padding: "0.4rem 0.9rem",
                border: "1px solid #004687",
                borderRadius: 6,
                background: "#fff",
                color: "#004687",
                fontSize: "0.82rem",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Next →
            </button>
          </>
        )}
        {isSimulating && (
          <>
            <button
              type="button"
              onClick={stopSim}
              style={{
                padding: "0.4rem 0.8rem",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                background: "#fff",
                fontSize: "0.82rem",
                cursor: "pointer",
                color: "#94a3b8",
              }}
            >
              ✕ Stop
            </button>
            <button
              type="button"
              onClick={stopSim}
              style={{
                padding: "0.4rem 0.8rem",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                background: "#fff",
                fontSize: "0.82rem",
                cursor: "pointer",
                fontWeight: 600,
                color: "#475569",
              }}
              title="Reset and start over"
            >
              ↻ Restart
            </button>
          </>
        )}
      </div>

      {/* Diagram + Left Panel Flex Row */}
      <div
        style={{
          display: "flex",
          gap: 0,
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          background: "#f8fafc",
          minHeight: "800px",
          position: "relative",
          maxHeight: "90vh",
          overflow: "hidden",
        }}
      >
        {/* Left Step Panel */}
        <StepInfoPanel
          activeStep={activeStep}
          currentStepIdx={currentStepIdx}
          steps={steps}
          isPaused={isPaused}
          onStepClick={handleStepClick}
        />

        {/* Right Diagram Area */}
        <div
          style={{
            flex: 1,
            padding: "2rem 1rem",
            overflowY: "auto",
            overflowX: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <svg
            width="100%"
            style={{
              display: "block",
              minHeight: `${120 + steps.length * 20 + 100}px`,
            }}
            aria-label="Sequence diagram flow"
            role="img"
          >
            <title>Sequence diagram flow</title>
            {/* Participant boxes and lifelines */}
            {PARTICIPANTS.map((p, i) => {
              const x = 100 + i * 120;
              // Split long labels into multiple lines (max 12 chars per line for wrap)
              const words = p.label.split(" ");
              const lines = [];
              let currentLine = "";
              words.forEach((word) => {
                if ((currentLine + word).length > 12) {
                  if (currentLine) lines.push(currentLine.trim());
                  currentLine = word;
                } else {
                  currentLine += (currentLine ? " " : "") + word;
                }
              });
              if (currentLine) lines.push(currentLine.trim());

              return (
                <g key={p.id}>
                  {/* Participant box — size adjusts for text height */}
                  <rect
                    x={x - 50}
                    y="20"
                    width="100"
                    height={20 + lines.length * 16}
                    fill="#f1f5f9"
                    stroke="#cbd5e1"
                    strokeWidth="1"
                    rx="4"
                  />
                  {/* Wrapped text */}
                  {lines.map((line, idx) => (
                    <text
                      key={`${p.id}-line-${idx}`}
                      x={x}
                      y={40 + idx * 16}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="600"
                      fill="#334155"
                    >
                      {line}
                    </text>
                  ))}
                  {/* Lifeline */}
                  <line
                    x1={x}
                    y1={20 + lines.length * 16 + 10}
                    x2={x}
                    y2={120 + steps.length * 20 + 50}
                    stroke="#cbd5e1"
                    strokeDasharray="4"
                    strokeWidth="1"
                  />
                </g>
              );
            })}

            {/* Steps */}
            {steps.map((step, idx) => {
              const isActive = idx === currentStepIdx;
              const isPast = idx < currentStepIdx;
              const y = 120 + idx * 20;
              if (step.type === "note") {
                // Render note as amber callout band spanning participant columns
                const partIndexes = step.participants
                  .map(participantIndex)
                  .filter((i) => i >= 0);
                if (partIndexes.length === 0) return null;
                const minX = 100 + Math.min(...partIndexes) * 120 - 40;
                const maxX = 100 + Math.max(...partIndexes) * 120 + 40;
                // Use a stable key for notes: text + participants
                const noteKey = `note-${step.text.replace(/\W+/g, "-")}-${step.participants.join("-")}`;
                return (
                  <g key={noteKey}>
                    <rect
                      x={minX}
                      y={y - 12}
                      width={maxX - minX}
                      height={24}
                      rx={7}
                      fill="#fef3c7"
                      stroke="#fbbf24"
                      strokeWidth="1.5"
                    />
                    <text
                      x={(minX + maxX) / 2}
                      y={y + 3}
                      textAnchor="middle"
                      fontSize="11"
                      fontStyle="italic"
                      fill="#b45309"
                      fontWeight="600"
                    >
                      {step.text}
                    </text>
                  </g>
                );
              }
              // Arrow step
              const fromX = 100 + participantIndex(step.from) * 120;
              const toX = 100 + participantIndex(step.to) * 120;
              const minX = Math.min(fromX, toX);
              const maxX = Math.max(fromX, toX);
              // Use a stable key for arrows: step number + from + to
              const arrowKey = step.step
                ? `arrow-${step.step}-${step.from}-${step.to}`
                : `arrow-${idx}`;
              return (
                <g key={arrowKey}>
                  {/* Arrow */}
                  <line
                    x1={fromX}
                    y1={y}
                    x2={toX}
                    y2={y}
                    stroke={
                      isActive ? "#004687" : isPast ? "#dbeafe" : "#cbd5e1"
                    }
                    strokeWidth={isActive ? 3 : 1.5}
                    markerEnd={
                      step.type === "response"
                        ? "url(#markerDashed)"
                        : "url(#markerSolid)"
                    }
                    opacity={isPast ? 0.5 : 1}
                  />
                  {/* Label */}
                  <text
                    x={(minX + maxX) / 2}
                    y={y - 3}
                    textAnchor="middle"
                    fontSize="10"
                    fill={isActive ? "#004687" : isPast ? "#94a3b8" : "#475569"}
                    fontWeight={isActive ? 700 : 400}
                  >
                    {step.step ? `${step.step}. ` : ""}
                    {step.label}
                  </text>
                </g>
              );
            })}

            {/* Arrow markers */}
            <defs>
              <marker
                id="markerSolid"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L0,6 L9,3 z" fill="#cbd5e1" />
              </marker>
              <marker
                id="markerDashed"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L0,6 L9,3 z" fill="#cbd5e1" />
              </marker>
            </defs>
          </svg>
        </div>
      </div>

      {/* Token card */}
      {activeStep && (
        <div
          style={{
            marginTop: "1rem",
            padding: "1rem",
            background: "#f8fafc",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
          }}
        >
          <OneFlowCard token={activeStep.token} />
        </div>
      )}

      <p style={{ marginTop: "0.4rem", fontSize: "0.7rem", color: "#94a3b8" }}>
        Hit <strong>▶ Simulate</strong> then <strong>⏸ Pause</strong> at any
        step to read the token card.
      </p>
    </div>
  );
}
