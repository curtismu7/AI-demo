// banking_api_ui/src/components/education/MayActPanel.js
import React from 'react';
import EducationDrawer from '../shared/EducationDrawer';

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
            an <code>act</code> claim. That claim says: <strong>"I am the AI assistant, and I am acting right now for [your name]
            on this specific request."</strong>
          </p>
          <p>
            Together, these two claims create a complete, auditable chain: <em>who approved the delegation</em> (<code>may_act</code>)
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
              <strong>You sign in</strong> — PingOne issues a security pass that may include a note:
              <pre className="edu-code">{`"may_act": { "client_id": "ai-banking-agent", ... }
  ↑ "this specific AI app is allowed to act on your behalf"`}</pre>
            </li>
            <li>
              <strong>You ask the AI to do something</strong> — the app requests a new, restricted pass
              specifically for the AI banking tools.
            </li>
            <li>
              <strong>PingOne issues the AI&apos;s pass</strong> — it includes:
              <pre className="edu-code">{`"sub": "your-user-id"       ← the action benefits you
"act": { "sub": "ai-banking-agent" }  ← the AI is doing it`}</pre>
            </li>
            <li>
              <strong>The AI uses that pass</strong> — every banking tool call is signed with this pass,
              creating an audit trail showing exactly who did what on whose behalf.
            </li>
          </ol>
        </>
      ),
    },
    {
      id: 'attacks',
      label: 'Why it&apos;s secure',
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
          <p style={{ fontSize: '0.82rem', color: '#6b7280' }}>
            Many large identity providers (including PingOne) implement RFC 8693. Banks and financial
            institutions use it to let AI agents and automation tools act on behalf of customers without
            compromising security.
          </p>
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
