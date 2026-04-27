// banking_api_ui/src/components/education/GleanPanel.js
import React from 'react';
import EducationDrawer from '../shared/EducationDrawer';

function OverviewTab() {
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Glean + PingOne: Enterprise AI Authorization</h3>
      <p>
        Glean is an enterprise AI assistant and search platform. When deployed at organizations
        like eBay, it connects to dozens of internal data sources and exposes a chat interface
        backed by retrieval-augmented generation (RAG). The identity and authorization layer
        ensures Glean only surfaces data the requesting user is entitled to see.
      </p>

      <img
        src="/images/glean-architecture.png"
        alt="Glean integration architecture with PingFed, PingAuthorize, CIBA, and MCP Gateway"
        style={{ width: '100%', borderRadius: 8, marginBottom: 16, border: '1px solid var(--border-light, #ddd)' }}
        onError={(e) => { e.target.style.display = 'none'; }}
      />

      <pre className="edu-code">{`
  ┌─────────────────────────────────────────────────┐
  │               eBay Enterprise                    │
  │                                                  │
  │  ┌──────────┐   CIBA/OIDC   ┌──────────────┐   │
  │  │  Glean   │◄─────────────►│   PingFed    │   │
  │  │ Platform │               │ (Enterprise  │   │
  │  │          │               │   IdP/SSO)   │   │
  │  └────┬─────┘               └──────────────┘   │
  │       │ tool calls                              │
  │       ▼                                         │
  │  ┌──────────┐  policy eval  ┌──────────────┐   │
  │  │   MCP    │◄─────────────►│  PingAuthorize│  │
  │  │ Gateway  │               │ (Fine-grained │  │
  │  │          │               │    authz)    │   │
  │  └──────────┘               └──────────────┘   │
  │                                                 │
  └─────────────────────────────────────────────────┘`}</pre>

      <h4>Key components</h4>
      <ul>
        <li>
          <strong>Glean Platform</strong> — Enterprise AI search and assistant; acts as the
          AI agent orchestrating tool calls across internal services.
        </li>
        <li>
          <strong>PingFed</strong> — Enterprise identity provider handling SSO, OIDC token
          issuance, and CIBA for delegated authorization flows.
        </li>
        <li>
          <strong>PingAuthorize</strong> — Evaluates fine-grained access policies before
          any MCP tool call proceeds; PERMIT/DENY per-request based on user identity,
          resource attributes, and contextual signals.
        </li>
        <li>
          <strong>MCP Gateway</strong> — Sits between Glean and backend MCP servers;
          validates inbound tokens, calls PingAuthorize, performs RFC 8693 token exchange
          for per-hop audience isolation.
        </li>
      </ul>
    </div>
  );
}

function CibaTab() {
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>CIBA for Agent Authorization</h3>
      <p>
        Client-Initiated Backchannel Authentication (CIBA) lets Glean request user approval
        out-of-band — without interrupting the browser session. This is critical for
        enterprise AI agents that may need elevated permissions for a specific action.
      </p>

      <pre className="edu-code">{`
  1. Glean agent needs elevated access
        │
        ▼
  2. Glean sends CIBA initiation to PingFed
     POST /backchannel/authentication
     { login_hint: "user@ebay.com",
       scope: "openid write:records",
       binding_message: "Approve export?" }
        │
        ▼
  3. PingFed pushes approval request to user
     (mobile push / authenticator app)
        │
        ▼
  4. User approves on device
        │
        ▼
  5. PingFed issues delegated access token
        │
        ▼
  6. Glean proceeds with authorized tool call`}</pre>

      <p>
        This pattern keeps the AI agent honest — it cannot act with elevated scope without
        explicit human approval, even if the LLM requests it. Human-in-the-loop approval
        is enforced at the IdP layer, not just the application layer.
      </p>
    </div>
  );
}

function McpGatewayTab() {
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>MCP Gateway Security Pipeline</h3>
      <p>
        The MCP Gateway is the enforcement boundary between Glean's AI layer and backend
        tool servers. Every tool call passes through the full pipeline:
      </p>

      <pre className="edu-code">{`
  Glean → [1] Validate inbound token (aud = gateway)
       → [2] GatewayTokenPolicy (sub, act.sub, anti-bypass)
       → [3] PingAuthorize PERMIT/DENY
       → [4] RFC 8693 exchange (gateway aud → tool server aud)
       → [5] Forward to MCP server with next-hop token

  Key invariants:
  • Original bearer token never leaves gateway boundary
  • Each hop gets a token scoped to that hop's audience only
  • DENY from PingAuthorize = 403, no upstream call made
  • PingAuthorize unreachable = fail closed (403)`}</pre>

      <h4>Why this matters</h4>
      <ul>
        <li>
          <strong>No token leakage to LLM</strong> — Glean's LLM component never sees
          the actual OAuth tokens; only the gateway handles bearer credentials.
        </li>
        <li>
          <strong>Per-hop audience isolation</strong> — A token issued for the MCP Gateway
          cannot be replayed directly against a backend MCP server (RFC 8707 resource
          indicators enforced).
        </li>
        <li>
          <strong>Fine-grained policy</strong> — PingAuthorize can evaluate user attributes,
          resource sensitivity, time-of-day, and risk signals — not just scope strings.
        </li>
      </ul>
    </div>
  );
}

export default function GleanPanel({ isOpen, onClose, initialTabId }) {
  const tabs = [
    {
      id: 'overview',
      label: 'Overview',
      content: <OverviewTab />,
    },
    {
      id: 'ciba',
      label: 'CIBA flow',
      content: <CibaTab />,
    },
    {
      id: 'gateway',
      label: 'MCP Gateway',
      content: <McpGatewayTab />,
    },
  ];

  return (
    <EducationDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Glean + PingOne Integration"
      tabs={tabs}
      initialTabId={initialTabId}
      width="min(660px, 100vw)"
    />
  );
}
