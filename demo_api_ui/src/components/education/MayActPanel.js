// banking_api_ui/src/components/education/MayActPanel.js
import React from 'react';
import EducationDrawer from '../shared/EducationDrawer';
import { EduImplIntro, SNIP_MAY_ACT_SANITIZE } from './educationImplementationSnippets';

export default function MayActPanel({ isOpen, onClose, initialTabId }) {
  const tabs = [
    {
      id: 'what',
      label: 'Plain English',
      content: (
        <>
          <p>
            When you sign in, PingOne can include a small note inside your security pass that says:{' '}
            <strong>"The AI assistant is allowed to act on your behalf."</strong>
          </p>
          <p>
            That pre-approval note is called <code>may_act</code> — it&apos;s like a landlord writing on a lease:{' '}
            <em>"The building manager may enter the property to make repairs."</em> Nobody has entered yet; the note
            just says they&apos;re allowed to.
          </p>
          <p>
            Later, when the AI actually makes a request on your behalf, it gets a fresh pass of its own that includes
            an <code>act</code> claim. That claim says: <strong>"I am the AI assistant, and I am acting right now for [your User ID]
            on this specific request."</strong>
          </p>
          <p>
            <strong>User ID (sub claim)</strong> — Identifies who the action benefits (you, the account holder).<br />
            <strong>Agent ID (act.sub claim)</strong> — Identifies who is performing the action (the AI assistant).<br />
            Together, these create a complete, auditable chain: <em>who approved the delegation</em> (<code>may_act</code>)
            and <em>who is executing it right now</em> (<code>act</code>).
          </p>
        </>
      ),
    },
    {
      id: 'lifecycle',
      label: 'Step by step',
      content: (
        <>
          <h3>From sign-in to action</h3>
          <ol>
            <li>
              <strong>You sign in</strong> — PingOne issues a security pass that may include a pre-approval note
              (RFC 8693 §4.1 uses <code>sub</code>, not <code>client_id</code>):
              <pre className="edu-code">{`"may_act": { "sub": "<agent-client-id>" }
  ↑ "this specific AI app is allowed to act on your behalf"`}</pre>
            </li>
            <li>
              <strong>You ask the AI to do something</strong> — the BFF performs a token exchange.
              There are two common patterns:
              <ul style={{ marginTop: 6, marginBottom: 6 }}>
                <li>
                  <strong>1-exchange:</strong> user token → agent token in one step.
                  The resulting token carries <code>act.sub</code> (agent ID) and
                  an <code>aud</code> claim scoped to the target MCP server.
                </li>
                <li>
                  <strong>2-exchange (on_behalf_of):</strong> user token → delegated intermediate token →
                  resource-specific service token. Useful when different scopes are needed per resource.
                </li>
              </ul>
            </li>
            <li>
              <strong>PingOne issues the AI&apos;s pass</strong> — it includes:
              <pre className="edu-code">{`"sub": "your-user-id"                 ← User ID (who benefits)
"act": { "sub": "<agent-client-id>" }  ← Agent ID (who acts)
"aud": "https://mcp.bxfinance.io"      ← Target resource (MCP server)`}</pre>
              The Token Chain display shows these as 👤 User ID and 🤖 Agent ID.
            </li>
            <li>
              <strong>The AI uses that pass</strong> — every banking tool call is signed with this pass,
              creating an audit trail showing exactly who did what on whose behalf.
            </li>
          </ol>
          <p style={{ fontSize: '0.82rem', color: '#374151', marginTop: 8 }}>
            The <code>act.sub</code> value is the application&apos;s subject (client ID or user ID returned by PingOne),
            not a human-readable label. Actual values come from your PingOne environment config.
          </p>
        </>
      ),
    },
    {
      id: 'attacks',
      label: "Why it's secure",
      content: (
        <>
          <h3>What stops bad actors</h3>
          <ol>
            <li>
              <strong>A rogue app tries to steal your pass and act as the AI</strong> — rejected:
              PingOne checks that the requesting app&apos;s ID matches the one listed in <code>may_act</code>.
              Any other app gets a &quot;permission denied&quot;.
            </li>
            <li>
              <strong>Someone tries to exchange a pass that has no approval note</strong> — rejected:
              if no <code>may_act</code> (or equivalent policy) exists, no exchange is allowed.
            </li>
            <li>
              <strong>The AI tries to request more permissions than you have</strong> — rejected:
              the new pass can only contain a <em>subset</em> of the permissions in your original pass.
              The AI can never do more than you can.
            </li>
          </ol>
          <p style={{ background: 'rgba(99,102,241,0.08)', borderLeft: '3px solid #6366f1', padding: '8px 12px', borderRadius: 4 }}>
            🔐 These checks are enforced by PingOne automatically — the app doesn&apos;t need to implement them itself.
          </p>
        </>
      ),
    },
    {
      id: 'rfc8693',
      label: 'The standard',
      content: (
        <>
          <p>
            This feature is built on an open internet standard called{' '}
            <a href="https://datatracker.ietf.org/doc/html/rfc8693" target="_blank" rel="noopener noreferrer">
              RFC 8693 — OAuth 2.0 Token Exchange
            </a>. It defines exactly how one security pass can be swapped for another
            in a controlled, auditable way.
          </p>
          <p>
            <strong>subject_token</strong> — identifies who the action benefits (you, the user).<br />
            <strong>actor_token</strong> — identifies who is performing the action (the AI assistant app).<br />
            <strong>act claim</strong> — embedded in the resulting pass; preserved in the audit log.
          </p>
          <p style={{ fontSize: '0.82rem', color: '#374151' }}>
            Many large identity providers (including PingOne) implement RFC 8693. Banks and financial
            institutions use it to let AI agents and automation tools act on behalf of customers without
            compromising security.
          </p>
        </>
      ),
    },
    {
      id: 'ai-agent-app',
      label: 'AI Agent App type',
      content: (
        <>
          <h3 style={{ marginTop: 0 }}>PingOne AI Agent application type</h3>
          <p>
            PingOne has a dedicated <strong>AI Agent</strong> application type for registering AI systems
            as first-class identity clients. Key difference from a standard app: the token endpoint
            authentication method defaults to <strong>Client Secret Post</strong>, not Basic.
          </p>

          <h4>Supported grant types</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginBottom: '1rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: '6px 8px' }}>Grant type</th>
                <th style={{ padding: '6px 8px' }}>Use case</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Authorization Code', 'User-facing login (PKCE recommended)'],
                ['Client Credentials', 'Machine-to-machine — the agent\'s own identity token'],
                ['Token Exchange (RFC 8693)', 'Act on behalf of a user — produces act claim'],
                ['CIBA', 'Out-of-band step-up / consent from a user device'],
                ['Device Authorization', 'Limited-input device flows'],
                ['Refresh Token', 'Keep agent sessions alive without re-auth'],
                ['Implicit', 'Legacy — not recommended'],
              ].map(([grant, use], i) => (
                <tr key={grant} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 ? '#f9fafb' : 'white' }}>
                  <td style={{ padding: '6px 8px' }}><code>{grant}</code></td>
                  <td style={{ padding: '6px 8px' }}>{use}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4>Token endpoint authentication methods</h4>
          <ul style={{ fontSize: '0.82rem' }}>
            <li><code>client_secret_post</code> — <strong>required for AI Agent apps in PingOne</strong>; credentials in POST body</li>
            <li><code>client_secret_basic</code> — HTTP Authorization header; used by Worker/Management apps</li>
            <li><code>client_secret_jwt</code> — signed assertion (stronger, no raw secret over wire)</li>
            <li><code>private_key_jwt</code> — asymmetric assertion; strongest option</li>
            <li><code>none</code> — public client (PKCE only, no secret)</li>
          </ul>

          <div style={{ background: 'rgba(99,102,241,0.08)', borderLeft: '3px solid #6366f1', padding: '8px 12px', borderRadius: 4, fontSize: '0.82rem', marginTop: '0.75rem' }}>
            <strong>Why this matters:</strong> if you configure an AI Agent app in PingOne and call its
            token endpoint with <code>Authorization: Basic …</code> (basic auth), PingOne returns{' '}
            <code>invalid_client: "Unsupported authentication method"</code>. Always use{' '}
            <code>client_secret_post</code> (credentials in the POST body) for AI Agent apps.
          </div>

          <p style={{ fontSize: '0.82rem', color: '#374151', marginTop: '1rem' }}>
            Reference:{' '}
            <a href="https://docs.pingidentity.com/pingone/ai_agents/p1_managing_ai_agents.html" target="_blank" rel="noopener noreferrer">
              Managing AI agents | PingOne
            </a>
          </p>
        </>
      ),
    },
    {
      id: 'inrepo',
      label: 'In this repo',
      content: (
        <>
          <h3 style={{ marginTop: 0 }}>Where <code>may_act</code> / <code>act</code> appear in code</h3>
          <EduImplIntro repoPath="banking_api_server/services/agentMcpTokenService.js">
            Sanitized claims feed the Token Chain UI; exchange uses the real JWT from session.
          </EduImplIntro>
          <pre className="edu-code">{SNIP_MAY_ACT_SANITIZE}</pre>
        </>
      ),
    },
  ];

  return (
    <EducationDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="How the AI acts on your behalf"
      tabs={tabs}
      initialTabId={initialTabId}
    />
  );
}
