// banking_api_ui/src/components/education/ArchitectureDiagramPanel.js
import React from 'react';
import EducationDrawer from '../shared/EducationDrawer';

function ContextTab() {
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>C4 Level 1 — System Context</h3>
      <p>The highest-level view: who uses the system and what external systems it depends on.</p>

      <pre className="edu-code">{`
                    ┌─────────────────────┐
                    │    Banking User      │
                    │  (Customer / Admin)  │
                    └──────────┬──────────┘
                               │ uses
                               ▼
                    ┌─────────────────────┐
                    │  Super Banking      │
                    │      Demo           │
                    │                     │
                    │  AI-powered banking  │
                    │  with identity-aware │
                    │  agent delegation   │
                    └───┬──────────┬──────┘
                        │          │
              authenticates via     │ AI queries
                        │          │
                        ▼          ▼
              ┌──────────────┐  ┌──────────────┐
              │   PingOne    │  │ LLM Provider │
              │  (SSO, MFA,  │  │ (OpenAI,     │
              │  Management) │  │  Anthropic,  │
              │              │  │  Groq, etc.) │
              └──────────────┘  └──────────────┘`}</pre>

      <h4>Key relationships</h4>
      <ul>
        <li><strong>Banking User → Demo</strong>: Authenticates via PingOne, manages accounts, interacts with AI agent</li>
        <li><strong>Demo → PingOne</strong>: OAuth 2.0 + OIDC for login, CIBA for backchannel, Management API for user/app config</li>
        <li><strong>Demo → LLM Provider</strong>: AI agent uses LLM for natural language understanding and tool selection</li>
      </ul>
    </div>
  );
}

function ContainerTab() {
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>C4 Level 2 — Container Diagram</h3>
      <p>The major deployable units and how they communicate.</p>

      <pre className="edu-code">{`
  ┌───────────────────────────────────────────────────────┐
  │                    Vercel Platform                     │
  │                                                       │
  │  ┌─────────────────┐      ┌──────────────────────┐   │
  │  │  banking_api_ui  │      │  banking_api_server   │   │
  │  │  (React SPA)     │─────▶│  (Express BFF)        │   │
  │  │                  │      │                       │   │
  │  │  • Session cookie│      │  • OAuth routes       │   │
  │  │  • No raw tokens │      │  • Token exchange     │   │
  │  │  • Education UI  │      │  • CIBA / MFA         │   │
  │  │                  │      │  • Agent orchestration │   │
  │  └─────────────────┘      └───────┬───────────────┘   │
  │                                    │                   │
  └────────────────────────────────────┼───────────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                   │
                    ▼                  ▼                   ▼
          ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
          │ Upstash Redis│   │banking_mcp_  │   │   PingOne    │
          │              │   │server (TS)   │   │              │
          │ Session store│   │              │   │ auth.pingone │
          │              │   │ • WebSocket  │   │ api.pingone  │
          └──────────────┘   │ • Tool reg.  │   └──────────────┘
                             │ • Auth chall.│
                             └──────────────┘`}</pre>

      <h4>Containers</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
            <th style={{ padding: '6px' }}>Container</th>
            <th style={{ padding: '6px' }}>Technology</th>
            <th style={{ padding: '6px' }}>Role</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['banking_api_ui', 'React 18 (CRA)', 'SPA — session cookies only, never sees raw tokens'],
            ['banking_api_server', 'Express (Node.js CJS)', 'BFF — holds all tokens server-side, proxies to PingOne'],
            ['banking_mcp_server', 'TypeScript (strict)', 'MCP WebSocket server — tool registry, auth challenges'],
            ['Upstash Redis', 'Redis (managed)', 'Session store for Vercel serverless cross-instance persistence'],
            ['PingOne', 'Cloud service', 'OAuth 2.0 AS, OIDC, Management API, MFA'],
          ].map(([name, tech, role], i) => (
            <tr key={name} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 ? '#f9fafb' : 'white' }}>
              <td style={{ padding: '6px', fontWeight: 600, fontFamily: 'monospace', fontSize: '0.8rem' }}>{name}</td>
              <td style={{ padding: '6px' }}>{tech}</td>
              <td style={{ padding: '6px' }}>{role}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComponentTab() {
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>C4 Level 3 — Component (BFF internals)</h3>
      <p>Inside <code>banking_api_server</code> — the major modules and their responsibilities.</p>

      <pre className="edu-code">{`
  ┌─────────────────────────────────────────────────────┐
  │              banking_api_server (BFF)                 │
  │                                                      │
  │  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
  │  │ OAuth Routes │  │ Token Exchange│  │ CIBA Service│ │
  │  │ login,       │  │ 1-exchange   │  │ backchannel │ │
  │  │ callback,    │  │ 2-exchange   │  │ auth + poll │ │
  │  │ logout,      │  │ RFC 8693     │  │             │ │
  │  │ refresh      │  └──────────────┘  └────────────┘ │
  │  └─────────────┘                                     │
  │                                                      │
  │  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
  │  │ MFA Service  │  │ Agent Service│  │ ConfigStore│ │
  │  │ deviceAuth   │  │ LangChain    │  │ SQLite / KV│ │
  │  │ OTP, TOTP,   │  │ tool calling │  │ persistence│ │
  │  │ FIDO2, push  │  │ MCP client   │  │            │ │
  │  └─────────────┘  └──────────────┘  └────────────┘ │
  │                                                      │
  │  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
  │  │ DataStore    │  │ Session MW   │  │ Delegation  │ │
  │  │ accounts,    │  │ Upstash Redis│  │ act/may_act │ │
  │  │ transactions │  │ PKCE cookie  │  │ audit trail │ │
  │  └─────────────┘  └──────────────┘  └────────────┘ │
  └─────────────────────────────────────────────────────┘`}</pre>

      <h4>Component responsibilities</h4>
      <ul>
        <li><strong>OAuth Routes</strong> — PKCE login, callback (code→token), logout with revocation, auto-refresh</li>
        <li><strong>Token Exchange</strong> — RFC 8693 1-exchange (user→MCP) and 2-exchange (user+agent→MCP)</li>
        <li><strong>CIBA Service</strong> — backchannel authentication initiation and polling</li>
        <li><strong>MFA Service</strong> — PingOne deviceAuthentications API (email OTP, TOTP, FIDO2, push)</li>
        <li><strong>Agent Service</strong> — LangChain 0.3.x agent with tool calling, MCP WebSocket client</li>
        <li><strong>ConfigStore</strong> — persistent config (SQLite local, Vercel KV in production)</li>
        <li><strong>DataStore</strong> — in-memory demo accounts and transactions</li>
        <li><strong>Session MW</strong> — express-session with Upstash Redis store, PKCE state cookies</li>
        <li><strong>Delegation</strong> — act/may_act claim validation, delegation chain audit logging</li>
      </ul>
    </div>
  );
}

function CodeTab() {
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>C4 Level 4 — Code (key services)</h3>
      <p>The critical service files and their interactions.</p>

      <pre className="edu-code">{`
  oauthService.js ──────────┐
    │ PKCE, token mgmt       │
    │                        ▼
    │                  agentMcpTokenService.js
    │                    │ Token exchange orchestration
    │                    │ 1-exchange or 2-exchange
    │                    │
    ▼                    ▼
  pingOneClientService.js ◀── mfaService.js
    │ Management API           │ deviceAuthentications
    │ Worker token             │ OTP / TOTP / FIDO2
    │                          │
    ▼                          ▼
  configStore.js          bankingAgentService.js
    │ SQLite / KV            │ LangChain agent
    │ Persistent config      │ Tool → MCP mapping
    │                        │
    ▼                        ▼
  dataStore.js           mcpWebSocketClient.js
    │ Accounts, txns        │ WebSocket to MCP server
    │ In-memory              │ tools/call, auth challenges`}</pre>

      <h4>Key service files</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
            <th style={{ padding: '6px' }}>Service</th>
            <th style={{ padding: '6px' }}>Purpose</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['oauthService.js', 'PKCE code generation, token exchange, refresh, revocation'],
            ['agentMcpTokenService.js', 'Orchestrates 1-exchange or 2-exchange for MCP tool calls'],
            ['mfaService.js', 'PingOne MFA — OTP/TOTP/FIDO2/push via deviceAuthentications API'],
            ['tokenChainService.js', 'Tracks token events — sub, act, token types through exchange'],
            ['bankingAgentService.js', 'LangChain 0.3.x agent with tool calling and MCP integration'],
            ['pingOneClientService.js', 'Management API client — worker token, user CRUD'],
            ['configStore.js', 'Persistent config — SQLite local, Vercel KV in production'],
            ['dataStore.js', 'In-memory demo data — accounts, transactions, users'],
          ].map(([svc, purpose], i) => (
            <tr key={svc} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 ? '#f9fafb' : 'white' }}>
              <td style={{ padding: '6px', fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 600 }}>{svc}</td>
              <td style={{ padding: '6px' }}>{purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ArchitectureDiagramPanel({ isOpen, onClose, initialTabId }) {
  const tabs = [
    { id: 'context', label: '1. Context', content: <ContextTab /> },
    { id: 'container', label: '2. Container', content: <ContainerTab /> },
    { id: 'component', label: '3. Component', content: <ComponentTab /> },
    { id: 'code', label: '4. Code', content: <CodeTab /> },
  ];

  return (
    <EducationDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="C4 Architecture — Super Banking Demo"
      tabs={tabs}
      initialTabId={initialTabId}
      width="min(720px, 100vw)"
    />
  );
}
