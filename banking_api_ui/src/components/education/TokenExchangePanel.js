// banking_api_ui/src/components/education/TokenExchangePanel.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import EducationDrawer from '../shared/EducationDrawer';

export default function TokenExchangePanel({ isOpen, onClose, initialTabId }) {
  const [live, setLive] = useState({ loading: false, error: null, t1: null });

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      setLive((s) => ({ ...s, loading: true, error: null }));
      try {
        let r = await axios.get('/api/auth/oauth/status');
        if (!r.data?.authenticated) r = await axios.get('/api/auth/oauth/user/status');
        if (cancelled) return;
        if (r.data?.authenticated && r.data?.accessToken) {
          const parts = r.data.accessToken.split('.');
          let payload = null;
          if (parts.length === 3) {
            try {
              payload = JSON.parse(atob(parts[1]));
            } catch (_) {}
          }
          setLive({ loading: false, error: null, t1: { raw: r.data.accessToken, payload, expiresAt: r.data.expiresAt } });
        } else {
          setLive({ loading: false, error: 'No session token available.', t1: null });
        }
      } catch (e) {
        if (!cancelled) setLive({ loading: false, error: e.message, t1: null });
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  const tabs = [
    {
      id: 'why',
      label: 'What & Why',
      content: (
        <>
          <h3>Plain English</h3>
          <p>
            When you sign in, the app gets a digital <strong>"visitor pass"</strong> — think of it like a hotel key card
            that proves who you are. But the AI assistant working behind the scenes lives in a separate, more secure
            area that needs its <em>own</em> pass with different, tighter access.
          </p>
          <p>
            <strong>Token Exchange</strong> is how the app silently swaps your visitor pass for the right pass — without
            asking you to sign in a second time. You never see it happen, but it&apos;s what keeps your account secure
            and limits exactly what the AI can and cannot do on your behalf.
          </p>
          <p style={{ background: 'rgba(99,102,241,0.08)', borderLeft: '3px solid #6366f1', padding: '8px 12px', borderRadius: 4 }}>
            🔑 <strong>Why it matters:</strong> Without this exchange, the AI would have to use your master sign-in pass for
            everything — like handing a delivery driver your house key instead of a one-time access code.
          </p>
        </>
      ),
    },
    {
      id: 'before',
      label: 'Without the swap',
      content: (
        <>
          <h3>The problem (without token exchange)</h3>
          <p>
            Imagine the app just handed your sign-in pass directly to the AI assistant. Here&apos;s what goes wrong:
          </p>
          <ul>
            <li>🚫 <strong>Wrong door</strong> — your pass is for the user area; the AI tools area needs a pass addressed specifically to it.</li>
            <li>🚫 <strong>No paper trail</strong> — there&apos;s no record that <em>the AI</em> was the one acting, only that <em>you</em> did.</li>
            <li>🚫 <strong>Too many permissions</strong> — your pass might allow things the AI should never be able to do alone.</li>
            <li>🚫 <strong>Security risk</strong> — if the AI were ever compromised, an attacker could use your broad pass to access anything.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'after',
      label: 'How it works',
      content: (
        <>
          <h3>The secure swap</h3>
          <p>
            The app asks PingOne (our identity provider) to exchange your sign-in pass for a fresh, limited-access pass.
            The new pass is:
          </p>
          <ul>
            <li>✅ <strong>Addressed to the AI tools area only</strong> — it won&apos;t work anywhere else</li>
            <li>✅ <strong>Scoped to just what&apos;s needed</strong> — read accounts, make transfers, nothing more</li>
            <li>✅ <strong>Labeled "acting on behalf of you"</strong> — so every action is clearly attributed</li>
            <li>✅ <strong>Short-lived</strong> — expires quickly to reduce exposure if anything goes wrong</li>
          </ul>
          <p>
            This happens automatically in the background every time you ask the AI assistant to do something for you.
          </p>
          <pre className="edu-code">{`Your sign-in pass (T1)
  → sent to PingOne with a request: "please exchange for an AI tools pass"
  → PingOne verifies policy allows this
  → PingOne issues a new, restricted pass (T2)
  → AI assistant uses T2 to access banking tools`}</pre>
        </>
      ),
    },
    {
      id: 'mayact',
      label: 'Permission check',
      content: (
        <>
          <h3>How PingOne decides whether to allow the swap</h3>
          <p>
            Before issuing the new AI pass, PingOne runs through a quick checklist — like a hotel front desk verifying
            that a contractor is on the approved vendor list before handing over a staff key:
          </p>
          <ol>
            <li><strong>Is your sign-in pass still valid?</strong> Not expired, not revoked.</li>
            <li><strong>Is this app on the approved list?</strong> Only registered apps can request a swap.</li>
            <li><strong>Has the app been granted permission to act on your behalf?</strong> This is pre-configured by the bank&apos;s security policy.</li>
            <li><strong>Is the requested access area allowed?</strong> Can only exchange for destinations the policy permits.</li>
            <li><strong>Are the requested permissions a subset of what you already have?</strong> The AI can never get more access than you have.</li>
          </ol>
          <p>If any check fails, the exchange is rejected and the AI cannot proceed.</p>
        </>
      ),
    },
    {
      id: 'live',
      label: 'See it live',
      content: (
        <>
          <h3>Your current session</h3>
          <p>
            If you are signed in, here is a peek at the "visitor pass" your browser session holds.
            The AI tools pass is never stored in the browser — it lives only on the server for the duration of each request.
          </p>
          {live.loading && <p>Loading…</p>}
          {live.error && <p style={{ color: '#b91c1c' }}>{live.error}</p>}
          {!live.loading && live.t1?.payload && (
            <>
              <p><strong>Your sign-in pass (decoded)</strong></p>
              <pre className="edu-code">{JSON.stringify(live.t1.payload, null, 2)}</pre>
              <p style={{ fontSize: '0.82rem', color: '#6b7280' }}>
                The AI tools pass is created fresh for each AI request and stays server-side.
                You can watch it happen in the browser&apos;s Network tab — look for <code>/api/mcp/tool</code>.
              </p>
            </>
          )}
          {!live.loading && !live.t1 && !live.error && (
            <p style={{ color: '#6b7280' }}>Sign in to see your live session details here.</p>
          )}
        </>
      ),
    },
  ];

  return (
    <EducationDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Token exchange (RFC 8693)"
      tabs={tabs}
      initialTabId={initialTabId}
    />
  );
}
