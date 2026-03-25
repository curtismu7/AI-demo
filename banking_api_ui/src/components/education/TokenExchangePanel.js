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
      id: 'flow',
      label: 'Token Flow',
      content: (
        <>
          <h3>Where each token lives and travels</h3>
          <p style={{ marginBottom: 16, color: '#6b7280', fontSize: '0.9rem' }}>
            The User Token never crosses the BFF boundary. Depending on your configuration, the BFF
            sends either an <strong>Agent Token</strong> (M2M) or a scoped <strong>MCP Token</strong> to the MCP server.
          </p>

          {/* Flow diagram */}
          <div style={{ fontFamily: 'inherit', fontSize: '0.85rem' }}>

            {/* Row 1: User */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
              <div style={{ background: '#e0f2fe', border: '2px solid #0284c7', borderRadius: 8, padding: '10px 20px', textAlign: 'center', minWidth: 240 }}>
                <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: 4 }}>🧑 User (Browser)</div>
                <div style={{ background: '#fff', border: '1px solid #93c5fd', borderRadius: 5, padding: '6px 12px', display: 'inline-block' }}>
                  <span style={{ fontWeight: 600 }}>User Token</span>
                  <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>Authorization Code + PKCE</div>
                </div>
              </div>
            </div>

            {/* Arrow down */}
            <div style={{ textAlign: 'center', color: '#6b7280', lineHeight: 1, marginBottom: 4 }}>
              <div style={{ fontSize: '1.2rem' }}>↓</div>
              <div style={{ fontSize: '0.75rem' }}>stored server-side only</div>
            </div>

            {/* Row 2: BFF */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
              <div style={{ background: '#fef9c3', border: '2px solid #ca8a04', borderRadius: 8, padding: '12px 16px', textAlign: 'center', minWidth: 320 }}>
                <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 8 }}>🏦 Backend For Frontend (BFF)</div>
                <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 5, padding: '6px 12px', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}>User Token</span>
                  <span style={{ marginLeft: 8, background: '#dcfce7', color: '#166534', borderRadius: 4, padding: '1px 6px', fontSize: '0.75rem', fontWeight: 600 }}>STAYS HERE ✓</span>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  {/* Path A */}
                  <div style={{ background: '#ede9fe', border: '1px solid #7c3aed', borderRadius: 6, padding: '8px 10px', flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, color: '#5b21b6', fontSize: '0.8rem', marginBottom: 4 }}>Path A — M2M</div>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Agent Token</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>client_credentials grant</div>
                    <div style={{ fontSize: '0.72rem', color: '#7c3aed', marginTop: 4 }}>AGENT_OAUTH_CLIENT_ID set</div>
                  </div>
                  {/* Path B */}
                  <div style={{ background: '#ecfdf5', border: '1px solid #059669', borderRadius: 6, padding: '8px 10px', flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, color: '#065f46', fontSize: '0.8rem', marginBottom: 4 }}>Path B — Delegated</div>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>MCP Token</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>RFC 8693 exchange</div>
                    <div style={{ fontSize: '0.72rem', color: '#059669', marginTop: 4 }}>MCP_RESOURCE_URI set</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Arrow down */}
            <div style={{ textAlign: 'center', color: '#6b7280', lineHeight: 1, marginBottom: 4 }}>
              <div style={{ fontSize: '1.2rem' }}>↓</div>
              <div style={{ fontSize: '0.75rem' }}>Agent Token or MCP Token only</div>
            </div>

            {/* Row 3: MCP Server */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: 8, padding: '10px 20px', textAlign: 'center', minWidth: 240 }}>
                <div style={{ fontWeight: 700, color: '#15803d', marginBottom: 4 }}>🤖 MCP Server</div>
                <div style={{ fontSize: '0.8rem', color: '#374151' }}>
                  Validates incoming token · executes banking tool
                </div>
                <div style={{ marginTop: 6, background: '#fee2e2', border: '1px solid #f87171', borderRadius: 4, padding: '3px 8px', display: 'inline-block', fontSize: '0.75rem', color: '#b91c1c', fontWeight: 600 }}>
                  User Token: never arrives here ✗
                </div>
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.78rem', color: '#374151' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, background: '#e0f2fe', border: '1px solid #0284c7', borderRadius: 2, display: 'inline-block' }} /> User session</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, background: '#fef9c3', border: '1px solid #ca8a04', borderRadius: 2, display: 'inline-block' }} /> BFF (server-side)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, background: '#ede9fe', border: '1px solid #7c3aed', borderRadius: 2, display: 'inline-block' }} /> Agent Token (M2M)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, background: '#ecfdf5', border: '1px solid #059669', borderRadius: 2, display: 'inline-block' }} /> MCP Token (delegated)</div>
            </div>
          </div>
        </>
      ),
    },
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
          <pre className="edu-code">{`User Token (stays in BFF session)
  → BFF requests exchange from PingOne: "issue an MCP Token for this user"
  → PingOne verifies may_act policy allows this
  → PingOne issues a scoped MCP Token (narrowed audience + scope)
  → AI assistant uses MCP Token to access banking tools
  (Alternative: BFF uses its own Agent Token when no exchange is configured)`}</pre>
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
              <p><strong>Your User Token (decoded)</strong></p>
              <pre className="edu-code">{JSON.stringify(live.t1.payload, null, 2)}</pre>
              <p style={{ fontSize: '0.82rem', color: '#6b7280' }}>
                The Agent Token or MCP Token is created fresh for each AI request and stays server-side only.
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
