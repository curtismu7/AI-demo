// banking_api_ui/src/components/TokenChainDisplay.js
import React, { useState, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useTokenChainOptional } from '../context/TokenChainContext';
import { useDraggablePanel } from '../hooks/useDraggablePanel';
import './TokenChainDisplay.css';

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    active:    { cls: 'tcd-badge--active',    label: 'Active' },
    acquired:  { cls: 'tcd-badge--active',    label: 'Active' },
    exchanged: { cls: 'tcd-badge--exchanged', label: 'Exchanged' },
    acquiring: { cls: 'tcd-badge--acquiring', label: 'Acquiring…' },
    skipped:   { cls: 'tcd-badge--skipped',   label: 'Skipped' },
    failed:    { cls: 'tcd-badge--failed',     label: 'Failed' },
    waiting:   { cls: 'tcd-badge--waiting',   label: 'Waiting' },
  };
  const s = map[status] || { cls: 'tcd-badge--waiting', label: status || 'Unknown' };
  const spinning = status === 'acquiring';
  return (
    <span className={`tcd-badge ${s.cls}`}>
      {spinning ? <span className="tcd-spinner"></span> : null}
      {s.label}
    </span>
  );
}

// ─── Claims viewer ────────────────────────────────────────────────────────────

function ClaimsPanel({ claims, alg }) {
  if (!claims) { return <p className="tcd-no-claims">No decoded claims available.</p>; }

  const highlight = (key) => {
    if (key === 'may_act') { return 'tcd-claim--may-act'; }
    if (key === 'act')     { return 'tcd-claim--act'; }
    if (key === 'scope')   { return 'tcd-claim--scope'; }
    if (key === 'aud')     { return 'tcd-claim--aud'; }
    return '';
  };

  const fmtVal = (key, val) => {
    if (typeof val === 'object') { return JSON.stringify(val, null, 2); }
    if (key === 'exp' || key === 'iat' || key === 'nbf') {
      const d = new Date(val * 1000);
      return `${val}  (${d.toLocaleTimeString()})`;
    }
    return String(val);
  };

  return (
    <div className="tcd-claims">
      {alg && <div className="tcd-claims-alg">alg: {alg}</div>}
      {Object.entries(claims).map(([k, v]) => (
        <div key={k} className={`tcd-claim ${highlight(k, v)}`}>
          <span className="tcd-claim-key">{k}</span>
          <span className="tcd-claim-sep">:</span>
          <pre className="tcd-claim-val">{fmtVal(k, v)}</pre>
        </div>
      ))}
    </div>
  );
}

// ─── Educational boxes ─────────────────────────────────────────────────────

/**
 * Rich educational callout for the may_act claim (RFC 8693 §4.1).
 * Shows valid / mismatch / absent states with fix steps. Renders on user-token events.
 */
function MayActEduBox({ event }) {
  const { mayActPresent, mayActValid, mayActDetails } = event;
  if (mayActPresent === undefined) return null;
  const mayActValue = event.claims?.may_act;

  if (mayActPresent && mayActValid) {
    return (
      <div className="tcd-edu-box tcd-edu-box--ok">
        <div className="tcd-edu-box-hd">
          <span className="tcd-edu-icon">✅</span>
          <strong>may_act — delegation permission granted</strong>
          <span className="tcd-edu-ref">RFC 8693 §4.1</span>
        </div>
        {mayActValue && <pre className="tcd-edu-code">{JSON.stringify({ may_act: mayActValue }, null, 2)}</pre>}
        <div className="tcd-edu-body">
          <p>This claim pre-authorises the BFF to exchange this token on the user's behalf. PingOne validates it during RFC 8693 Token Exchange.</p>
          <ul>
            <li><code>client_id</code> must equal the BFF OAuth app client ID — ✅ matches</li>
            <li>BFF presents its own credentials as <code>actor_token</code></li>
            <li>PingOne issues an MCP token with an <code>act</code> claim (the delegation fact)</li>
          </ul>
          {mayActDetails && <p className="tcd-edu-detail">{mayActDetails}</p>}
        </div>
      </div>
    );
  }

  if (mayActPresent && !mayActValid) {
    return (
      <div className="tcd-edu-box tcd-edu-box--error">
        <div className="tcd-edu-box-hd">
          <span className="tcd-edu-icon">❌</span>
          <strong>may_act — client_id mismatch</strong>
          <span className="tcd-edu-ref">RFC 8693 §4.1</span>
        </div>
        {mayActValue && <pre className="tcd-edu-code">{JSON.stringify({ may_act: mayActValue }, null, 2)}</pre>}
        <div className="tcd-edu-body">
          <p>The claim is present but <code>may_act.client_id</code> does not match this BFF's OAuth app. PingOne will reject the RFC 8693 exchange.</p>
          {mayActDetails && <p className="tcd-edu-detail">❌ {mayActDetails}</p>}
        </div>
        <div className="tcd-edu-fix">
          <strong>Fix:</strong> In PingOne → token policy, update the <code>may_act</code> expression to reference your BFF client ID, then sign out and sign in again.
        </div>
      </div>
    );
  }

  // absent
  return (
    <div className="tcd-edu-box tcd-edu-box--warn">
      <div className="tcd-edu-box-hd">
        <span className="tcd-edu-icon">⚠️</span>
        <strong>may_act absent — exchange may fail</strong>
        <span className="tcd-edu-ref">RFC 8693 §4.1</span>
      </div>
      <div className="tcd-edu-body">
        <p>The user token has no <code>may_act</code> claim. The RFC 8693 Token Exchange will be attempted — whether PingOne accepts it depends on your token policy. Without <code>may_act</code>, PingOne may reject the exchange.</p>
        <p><strong>may_act</strong> is a prospective permission: it pre-authorises the BFF to exchange this token. It must be added by PingOne at login time via a token policy expression.</p>
        <div className="tcd-edu-steps">
          <strong>Fix steps:</strong>
          <ol>
            <li>Go to <strong>/demo-data</strong> → click <strong>Enable may_act</strong></li>
            <li>Sign out and sign in again (the token is only updated at login)</li>
            <li>Re-run the tool — this row will show ✅ may_act valid</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

/**
 * Rich educational callout for the act claim (RFC 8693 §4.4).
 * Shows delegation proven / absent states. Renders on MCP token events.
 */
function ActEduBox({ event }) {
  if (event.actPresent === undefined) return null;
  const actValue = event.claims?.act;

  if (event.actPresent) {
    return (
      <div className="tcd-edu-box tcd-edu-box--ok">
        <div className="tcd-edu-box-hd">
          <span className="tcd-edu-icon">✅</span>
          <strong>act — delegation chain proven (current actor)</strong>
          <span className="tcd-edu-ref">RFC 8693 §4.4</span>
        </div>
        {actValue && <pre className="tcd-edu-code">{JSON.stringify({ act: actValue }, null, 2)}</pre>}
        <div className="tcd-edu-body">
          <p><code>act</code> is the <em>current delegation fact</em>. Compare with <code>may_act</code> on the user token:</p>
          <ul>
            <li><code>may_act</code> (user token) — <em>prospective:</em> "this client is allowed to act"</li>
            <li><code>act</code> (MCP token) — <em>current fact:</em> "this client IS acting right now"</li>
          </ul>
          <p>The MCP server validates <code>act.client_id</code> to confirm the BFF — not any random client — made this call, establishing a verifiable audit trail.</p>
          {event.actDetails && <p className="tcd-edu-detail">✅ {event.actDetails} — BFF is confirmed current actor</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="tcd-edu-box tcd-edu-box--warn">
      <div className="tcd-edu-box-hd">
        <span className="tcd-edu-icon">⚠️</span>
        <strong>act absent — delegation not proven in MCP token</strong>
        <span className="tcd-edu-ref">RFC 8693 §4.4</span>
      </div>
      <div className="tcd-edu-body">
        <p>The MCP token has no <code>act</code> claim. The exchange ran, but PingOne did not include delegation evidence. The MCP server and audit logs cannot confirm which client acted.</p>
        <p><strong>Typical cause:</strong> exchange ran without an <code>actor_token</code> (subject-only mode). Set <code>AGENT_OAUTH_CLIENT_ID</code> + <code>AGENT_OAUTH_CLIENT_SECRET</code> for full on-behalf-of semantics.</p>
      </div>
    </div>
  );
}

/**
 * Rich educational callout for the aud (audience) claim (RFC 7519 §4.1.3, RFC 8707).
 * Three contexts:
 *   user-token:           broad aud from PingOne (informational)
 *   exchange-in-progress: explains audience= parameter → RFC 8707 resource indicator
 *   exchanged-token:      aud narrowed to mcp_resource_uri — validate match
 */
function AudienceEduBox({ event }) {
  const audValue = event.claims?.aud;

  // ── User token: informational aud explanation ─────────────────────────────
  if (event.id === 'user-token') {
    if (!audValue) return null;
    const audDisplay = Array.isArray(audValue) ? audValue.join(', ') : String(audValue);
    return (
      <div className="tcd-edu-box tcd-edu-box--neutral">
        <div className="tcd-edu-box-hd">
          <span className="tcd-edu-icon">🎯</span>
          <strong>aud — audience (which resource server accepts this token)</strong>
          <span className="tcd-edu-ref">RFC 7519 §4.1.3</span>
        </div>
        <pre className="tcd-edu-code">{JSON.stringify({ aud: audValue }, null, 2)}</pre>
        <div className="tcd-edu-body">
          <p><code>aud</code> identifies the intended recipient(s) of the token. A resource server <strong>must reject</strong> any token whose <code>aud</code> does not include its own identifier.</p>
          <ul>
            <li>Current value: <strong>{audDisplay}</strong> — this token is accepted by the banking API</li>
            <li>After RFC 8693 exchange, <code>aud</code> is <em>narrowed</em> to the MCP server audience only (principle of least privilege)</li>
            <li>The MCP server will reject the user token directly — it only accepts tokens with its own audience</li>
          </ul>
        </div>
      </div>
    );
  }

  // ── Exchange-in-progress / exchange-failed: explain audience= parameter ──
  if (event.id === 'exchange-in-progress' || event.id === 'exchange-failed') {
    const requestedAud = event.exchangeRequest?.audience;
    const failed = event.id === 'exchange-failed';
    return (
      <div className={`tcd-edu-box ${failed ? 'tcd-edu-box--error' : 'tcd-edu-box--neutral'}`}>
        <div className="tcd-edu-box-hd">
          <span className="tcd-edu-icon">{failed ? '❌' : '🎯'}</span>
          <strong>audience= parameter — RFC 8707 Resource Indicator</strong>
          <span className="tcd-edu-ref">RFC 8707</span>
        </div>
        {requestedAud && <pre className="tcd-edu-code">{JSON.stringify({ audience: requestedAud }, null, 2)}</pre>}
        <div className="tcd-edu-body">
          <p>The <code>audience</code> parameter in the token exchange request is a <strong>Resource Indicator</strong> (RFC 8707). It tells PingOne:</p>
          <ul>
            <li><em>"Issue a token whose <code>aud</code> is <code>{requestedAud || 'not set'}</code>"</em></li>
            <li>Only a registered PingOne Resource Server with this audience will be accepted</li>
            <li>Scopes are automatically narrowed to only what that Resource Server defines</li>
          </ul>
          {!requestedAud && (
            <div className="tcd-edu-fix">
              <strong>Fix:</strong> Set <code>mcp_resource_uri</code> in Config UI (or <code>MCP_RESOURCE_URI</code> env) to the MCP Resource Server audience — e.g. <code>banking_mcp_server</code>.
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Exchanged MCP token: validate aud was narrowed correctly ──────────────
  if (event.id === 'exchanged-token' || event.id === 'exchanged-token-fallback') {
    if (audValue === undefined && event.audExpected === undefined) return null;
    const audDisplay = Array.isArray(audValue) ? audValue.join(', ') : (audValue ? String(audValue) : 'not present');

    if (event.audMatches) {
      return (
        <div className="tcd-edu-box tcd-edu-box--ok">
          <div className="tcd-edu-box-hd">
            <span className="tcd-edu-icon">✅</span>
            <strong>aud — audience narrowed correctly to MCP server</strong>
            <span className="tcd-edu-ref">RFC 8707 · RFC 7519 §4.1.3</span>
          </div>
          <pre className="tcd-edu-code">{JSON.stringify({ aud: audValue }, null, 2)}</pre>
          <div className="tcd-edu-body">
            <p>The MCP token's <code>aud</code> matches the expected MCP Resource Server audience. This means:</p>
            <ul>
              <li>✅ The MCP server will <strong>accept</strong> this token (aud matches its own identifier)</li>
              <li>✅ The banking API will <strong>reject</strong> this token (wrong audience — prevents token reuse)</li>
              <li>✅ Audience narrowing enforces <strong>least privilege</strong> — one token, one service</li>
            </ul>
            <p className="tcd-edu-detail">aud: {audDisplay} ✅ matches expected: {event.audExpected}</p>
          </div>
        </div>
      );
    }

    // aud mismatch or absent
    return (
      <div className="tcd-edu-box tcd-edu-box--error">
        <div className="tcd-edu-box-hd">
          <span className="tcd-edu-icon">❌</span>
          <strong>aud mismatch — MCP server will reject this token</strong>
          <span className="tcd-edu-ref">RFC 8707 · RFC 7519 §4.1.3</span>
        </div>
        {audValue && <pre className="tcd-edu-code">{JSON.stringify({ aud: audValue }, null, 2)}</pre>}
        <div className="tcd-edu-body">
          <p>The token's <code>aud</code> (<strong>{audDisplay}</strong>) does not match the requested audience (<strong>{event.audExpected}</strong>).</p>
          <p>The MCP server validates <code>aud</code> on every request and will return 401 Unauthorized.</p>
        </div>
        <div className="tcd-edu-fix">
          <strong>Fix:</strong> In PingOne, ensure a Resource Server exists with audience <code>{event.audExpected}</code> and that the token exchange policy maps to it. Check <code>MCP_RESOURCE_URI</code> matches the Resource Server audience exactly.
        </div>
      </div>
    );
  }

  return null;
}

/**
 * Shows the validation checks PingOne performs during RFC 8693 exchange.
 * Renders on exchange-in-progress and exchange-failed events.
 */
function ExchangeCheckList({ event }) {
  if (event.id !== 'exchange-in-progress' && event.id !== 'exchange-failed') return null;
  const failed = event.id === 'exchange-failed';
  const hasActorToken = event.exchangeRequest?.has_actor_token;

  return (
    <div className={`tcd-edu-box ${failed ? 'tcd-edu-box--error' : 'tcd-edu-box--neutral'}`}>
      <div className="tcd-edu-box-hd">
        <span className="tcd-edu-icon">{failed ? '❌' : '🔍'}</span>
        <strong>{failed ? 'Exchange failed — PingOne validation' : 'What PingOne validates during exchange'}</strong>
        <span className="tcd-edu-ref">RFC 8693 §2.1</span>
      </div>
      <div className="tcd-edu-body">
        {failed && event.error && (
          <p className="tcd-edu-detail" style={{ marginBottom: 8 }}>Error: {event.error}</p>
        )}
        {failed && event.mayActPresent === false && (
          <p className="tcd-edu-absent-warn">⚠️ may_act was absent from the user token — this is likely why exchange failed. Go to /demo-data → Enable may_act → re-login, then try again.</p>
        )}
        <ul className="tcd-edu-checklist">
          <li><span className="tcd-edu-check-lbl">1.</span><span><code>may_act.client_id</code> on subject token must match the requesting BFF client</span></li>
          <li><span className="tcd-edu-check-lbl">2.</span><span><code>audience</code> must match a registered PingOne Resource Server</span></li>
          <li><span className="tcd-edu-check-lbl">3.</span><span>Requested <code>scope</code> must be a subset of the subject token's scopes (PingOne narrows)</span></li>
          {hasActorToken && (
            <li><span className="tcd-edu-check-lbl">4.</span><span><code>actor_token</code> (client credentials) included → <code>act</code> claim added to the MCP token</span></li>
          )}
        </ul>
      </div>
    </div>
  );
}

// ─── Event detail content (shared between inline + inspector panel) ──────────

/** Renders the full detail for a token chain event. */
function EventDetail({ event }) {
  return (
    <>
      {/* Claims + JWT decode first — most useful content visible without scrolling */}
      {event.claims && (
        <>
          <div className="tcd-section-title">Decoded JWT claims</div>
          <ClaimsPanel claims={event.claims} alg={event.alg} />
        </>
      )}
      {event.jwtFullDecode && (
        <div className="tcd-exchange-req">
          <div className="tcd-exchange-req-title">JWT decode — full JSON (header + claims)</div>
          <pre className="tcd-jwt-dump">{JSON.stringify(event.jwtFullDecode, null, 2)}</pre>
        </div>
      )}
      {event.exchangeRequest && (
        <div className="tcd-exchange-req">
          <div className="tcd-exchange-req-title">Exchange request (RFC 8693)</div>
          <pre>{JSON.stringify(event.exchangeRequest, null, 2)}</pre>
        </div>
      )}
      {/* Educational sections — aud, may_act, act, exchange validation */}
      <AudienceEduBox event={event} />
      <MayActEduBox event={event} />
      <ActEduBox event={event} />
      <ExchangeCheckList event={event} />
      {event.explanation && (
        <p className="tcd-explanation">{event.explanation}</p>
      )}
    </>
  );
}

// ─── Floating inspector panel (portal, draggable, resizable, collapsible) ────

/**
 * Opens the token event in a standalone browser window.
 * The user can move that window to any physical screen.
 */
function openInNewWindow(event) {
  const claimsHtml = event.claims
    ? Object.entries(event.claims).map(([k, v]) => {
        const highlight = { may_act: '#1e40af', act: '#0f766e', scope: '#6d28d9', aud: '#166534' }[k] || '';
        const bg = highlight ? `background:${highlight}22;` : '';
        return `<div class="claim" style="${bg}">
          <span class="key">${k}</span>
          <span class="sep">:</span>
          <span class="val">${typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
        </div>`;
      }).join('')
    : '';

  const jwtHtml = event.jwtFullDecode
    ? `<div class="section-title">JWT Decode — full JSON (header + claims)</div>
       <pre class="pre">${JSON.stringify(event.jwtFullDecode, null, 2)}</pre>`
    : '';

  const exchangeHtml = event.exchangeRequest
    ? `<div class="section-title">Exchange request (RFC 8693)</div>
       <pre class="pre">${JSON.stringify(event.exchangeRequest, null, 2)}</pre>`
    : '';

  const pillHtml = [
    event.mayActPresent === true  ? `<div class="pill pill-may">may_act ✅ present — ${event.mayActDetails}</div>` : '',
    event.mayActPresent === false ? `<div class="pill pill-warn">may_act absent — exchange may be rejected by PingOne</div>` : '',
    event.actPresent  === true    ? `<div class="pill pill-act">act ✅ ${event.actDetails} — BFF is current actor</div>` : '',
  ].join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Token Inspector — ${event.label}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0f172a;color:#e2e8f0;font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:0}
    .header{background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:14px 18px;display:flex;flex-direction:column;gap:2px}
    .title{font-size:1rem;font-weight:800;color:#fff}
    .subtitle{font-size:0.78rem;color:#93c5fd}
    .body{padding:16px;display:flex;flex-direction:column;gap:14px;overflow:auto;height:calc(100vh - 70px)}
    .section-title{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#64748b;margin-bottom:4px}
    .claims{background:#080f1e;border:1px solid #1e293b;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:2px}
    .claim{display:flex;gap:6px;padding:3px 6px;border-radius:5px;font-size:.8rem}
    .key{color:#93c5fd;font-weight:700;font-family:monospace;white-space:nowrap}
    .sep{color:#475569}
    .val{color:#e2e8f0;font-family:monospace;word-break:break-all}
    .pre{background:#080f1e;border:1px solid #1e293b;border-radius:8px;padding:12px;font-size:.76rem;color:#86efac;white-space:pre-wrap;word-break:break-all;font-family:monospace;max-height:600px;overflow:auto}
    .pill{font-size:.75rem;font-weight:600;padding:5px 12px;border-radius:8px;width:fit-content}
    .pill-may{background:rgba(37,99,235,.2);color:#bfdbfe;border:1px solid rgba(37,99,235,.4)}
    .pill-act{background:rgba(20,184,166,.15);color:#99f6e4;border:1px solid rgba(20,184,166,.3)}
    .pill-warn{background:rgba(239,68,68,.15);color:#fca5a5;border:1px solid rgba(239,68,68,.3)}
    .explanation{font-size:.82rem;color:#94a3b8;line-height:1.6}
    .alg{font-size:.7rem;color:#475569;margin-bottom:4px}
    ::-webkit-scrollbar{width:6px;height:6px}
    ::-webkit-scrollbar-track{background:#1e293b}
    ::-webkit-scrollbar-thumb{background:#334155;border-radius:3px}
  </style>
</head>
<body>
  <div class="header">
    <div class="title">⊕ OAuth Token Inspector</div>
    <div class="subtitle">${event.label}${event.status ? ` · ${event.status}` : ''}</div>
  </div>
  <div class="body">
    ${event.claims ? `<div>
      ${event.alg ? `<div class="alg">alg: ${event.alg}</div>` : ''}
      <div class="section-title">Decoded JWT claims</div>
      <div class="claims">${claimsHtml}</div>
    </div>` : ''}
    ${jwtHtml}
    ${exchangeHtml}
    ${pillHtml}
    ${event.explanation ? `<div class="explanation">${event.explanation}</div>` : ''}
  </div>
</body>
</html>`;

  const win = window.open(
    '',
    `tci-${event.id || 'token'}-${Date.now()}`,
    `width=1040,height=960,resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no`
  );
  if (!win) return; // popup blocker
  win.document.write(html);
  win.document.close();
  win.focus();
}

/**
 * Floats above the page as a draggable, resizable, collapsible inspector.
 * Rendered via createPortal into document.body so it can go off-screen.
 */
function TokenInspectorPanel({ event, initialPos, onClose }) {
  const { pos, size, handleDragStart, handleResizeStart } = useDraggablePanel(
    initialPos,
    { w: 800, h: 960 },
    { minW: 400, minH: 320, storageKey: 'tci-inspector-panel' }
  );
  const [collapsed, setCollapsed] = useState(false);

  const panel = (
    <div
      className={`tci-panel${collapsed ? ' tci-panel--collapsed' : ''}`}
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        ...(collapsed ? {} : { height: size.h }),
      }}
      role="dialog"
      aria-label="OAuth Token Inspector"
    >
      {/* Header — drag handle */}
      <div className="tci-header" onMouseDown={handleDragStart}>
        <span className="tci-header-icon" aria-hidden>⊕</span>
        <div className="tci-header-text">
          <span className="tci-title">OAuth Token Inspector</span>
          <span className="tci-subtitle">{event.label}</span>
        </div>
        <div className="tci-header-actions">
          <button
            type="button"
            className="tci-btn"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand' : 'Collapse'}
            aria-label={collapsed ? 'Expand inspector' : 'Collapse inspector'}
          >
            {collapsed ? '□' : '—'}
          </button>
          <button
            type="button"
            className="tci-btn"
            onClick={() => openInNewWindow(event)}
            title="Pop out to new window (move to any screen)"
            aria-label="Pop out to new window"
          >
            ⤢
          </button>
          <button
            type="button"
            className="tci-btn tci-btn--close"
            onClick={onClose}
            title="Close"
            aria-label="Close inspector"
          >
            ×
          </button>
        </div>
      </div>

      {/* Body — scrollable content */}
      {!collapsed && (
        <div className="tci-body">
          <EventDetail event={event} />
        </div>
      )}

      {/* Resize grip — bottom-right corner */}
      {!collapsed && (
        <div
          className="tci-resize-grip"
          onMouseDown={handleResizeStart}
          aria-hidden
          title="Drag to resize"
        />
      )}
    </div>
  );

  return ReactDOM.createPortal(panel, document.body);
}

// ─── Inspect icon SVG ────────────────────────────────────────────────────────

/** Magnifying-glass + arrow-out icon to indicate "inspect / pop out". */
const InspectIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.5" />
    <line x1="9.7" y1="9.7" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M10 3h3v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="10" y1="6" x2="13" y2="3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

// ─── Single event row ─────────────────────────────────────────────────────────

// ---------- Inline claims strip ------------------------------------------

const CLAIMS_STRIP_IDS = new Set(['user-token', 'exchanged-token', 'agent-actor-token', 'exchanged-token-fallback']);

function fmtSub(sub) {
  if (!sub) return null;
  const s = String(sub);
  return s.length > 14 ? s.slice(0, 12) + '…' : s;
}
function fmtAud(aud) {
  if (!aud) return null;
  const flat = Array.isArray(aud) ? aud[aud.length - 1] : String(aud);
  return flat.split('/').pop() || flat;
}
function fmtScope(scope) {
  if (!scope) return null;
  const s = String(scope);
  return s.length > 60 ? s.slice(0, 58) + '…' : s;
}
function fmtExpiry(exp) {
  if (!exp) return null;
  const secsLeft = Math.round(exp - Date.now() / 1000);
  if (secsLeft < 0) return 'expired ' + Math.abs(secsLeft) + 's ago';
  if (secsLeft < 60) return secsLeft + 's';
  if (secsLeft < 3600) return Math.round(secsLeft / 60) + 'm';
  return Math.round(secsLeft / 3600) + 'h';
}
function fmtAct(act) {
  if (!act) return null;
  if (typeof act === 'object') {
    if (act.client_id) return act.client_id;
    if (act.sub) return 'sub:' + act.sub;
    return JSON.stringify(act).slice(0, 40);
  }
  return String(act).slice(0, 40);
}

/** Compact inline strip showing key claims without opening the inspector. */
function ClaimsStrip({ event }) {
  if (!CLAIMS_STRIP_IDS.has(event.id)) return null;
  const cl = event.claims;
  if (!cl) return null;
  const sub    = fmtSub(cl.sub);
  const act    = fmtAct(cl.act);
  const mayAct = cl.may_act && cl.may_act.client_id ? String(cl.may_act.client_id) : null;
  const aud    = fmtAud(cl.aud);
  const scope  = fmtScope(cl.scope);
  const expiry = fmtExpiry(cl.exp);
  const rows = [
    sub    ? { key: 'sub',     val: sub,    cls: '' }             : null,
    act    ? { key: 'act',     val: act,    cls: 'tcd-cs-act' }   : null,
    mayAct ? { key: 'may_act', val: mayAct, cls: 'tcd-cs-may' }   : null,
    aud    ? { key: 'aud',     val: aud,    cls: 'tcd-cs-aud' }   : null,
    scope  ? { key: 'scope',   val: scope,  cls: 'tcd-cs-scope' } : null,
    expiry ? { key: 'exp',     val: expiry, cls: expiry.includes('ago') ? 'tcd-cs-expired' : '' } : null,
  ].filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <div className="tcd-claims-strip">
      {rows.map(r => (
        <span key={r.key} className={'tcd-cs-item' + (r.cls ? ' ' + r.cls : '')}>
          <span className="tcd-cs-key">{r.key}</span>
          <span className="tcd-cs-val">{r.val}</span>
        </span>
      ))}
    </div>
  );
}

/** Renders one step in the token chain. The inspect icon (right side) opens the floating inspector panel. */
function EventRow({ event, isLast, onInspect }) {
  const inspectBtnRef = useRef(null);
  const hasDetail = event.claims || event.explanation || event.exchangeRequest || event.jwtFullDecode
    || event.mayActPresent !== undefined || event.actPresent !== undefined;

  const handleOpen = () => {
    if (!hasDetail) return;
    onInspect(event, inspectBtnRef.current);
  };

  // Compact hints shown on the row — click inspect for full educational detail
  const triggerHint =
    event.trigger === 'high_risk' ? { text: '⚡ High-Risk Transaction', cls: 'warn' }
    : null;
  const mayActHint =
    event.mayActPresent === true
      ? (event.mayActValid ? { text: '✅ may_act valid', cls: 'ok' } : { text: '❌ may_act mismatch', cls: 'error' })
      : event.mayActPresent === false
        ? { text: '⚠️ may_act absent', cls: 'warn' }
        : null;
  const actHint =
    event.actPresent === true  ? { text: '✅ act claimed', cls: 'ok' }
    : event.actPresent === false ? { text: '⚠️ no act claim', cls: 'warn' }
    : null;
  // aud hint — only on tokens where we have explicit validation data
  const audHintRaw = event.claims?.aud;
  const audShort = audHintRaw
    ? (Array.isArray(audHintRaw) ? audHintRaw[audHintRaw.length - 1] : String(audHintRaw)).split('/').pop()
    : null;
  const audHint =
    (event.id === 'exchanged-token' || event.id === 'exchanged-token-fallback') && event.audExpected !== undefined
      ? (event.audMatches
          ? { text: `✅ aud: ${audShort || event.audExpected}`, cls: 'ok' }
          : { text: `❌ aud mismatch`, cls: 'error' })
      : event.id === 'user-token' && audHintRaw
        ? { text: `aud: ${audShort || audHintRaw}`, cls: 'info' }
        : null;

  return (
    <div className="tcd-event-wrap">
      <div className={`tcd-event ${event.status}`}>
        <div className="tcd-event-content">
          <div className="tcd-event-title-row">
            <span className="tcd-event-label">{event.label}</span>
            {hasDetail && (
              <button
                ref={inspectBtnRef}
                type="button"
                className="tcd-inspect-btn"
                onClick={handleOpen}
                aria-label={`Inspect ${event.label}`}
                title="Open token inspector"
              >
                <InspectIcon />
              </button>
            )}
          </div>
          <div className={`tcd-event-meta-row${event.rfc ? '' : ' tcd-event-meta-row--no-rfc'}`}>
            {event.rfc ? <span className="tcd-event-rfc">{event.rfc}</span> : null}
            <StatusBadge status={event.status} />
          </div>
          {(triggerHint || mayActHint || actHint || audHint) && (
            <div className="tcd-event-hints">
              {triggerHint && <span className={`tcd-event-hint tcd-event-hint--${triggerHint.cls}`}>{triggerHint.text}</span>}
              {audHint    && <span className={`tcd-event-hint tcd-event-hint--${audHint.cls}`}>{audHint.text}</span>}
              {mayActHint && <span className={`tcd-event-hint tcd-event-hint--${mayActHint.cls}`}>{mayActHint.text}</span>}
              {actHint    && <span className={`tcd-event-hint tcd-event-hint--${actHint.cls}`}>{actHint.text}</span>}
            </div>
          )}
          <ClaimsStrip event={event} />
        </div>
      </div>

      {!isLast && <div className="tcd-connector"><div className="tcd-connector-line" /><span className="tcd-connector-arrow">↓</span></div>}
    </div>
  );
}

// ─── History entry ─────────────────────────────────────────────────────────────

function HistoryEntry({ entry, index, onInspect }) {
  const [open, setOpen] = useState(index === 0);
  const ts = new Date(entry.timestamp).toLocaleTimeString();
  return (
    <div className="tcd-hist-entry">
      <button type="button" className="tcd-hist-head" onClick={() => setOpen(o => !o)}>
        <span className="tcd-hist-tool">{entry.tool}</span>
        <span className="tcd-hist-ts">{ts}</span>
        <span className="tcd-hist-chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && entry.events.map((ev, i) => (
        <EventRow key={ev.id} event={ev} isLast={i === entry.events.length - 1} onInspect={onInspect} />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const PLACEHOLDER_EVENTS = [
  {
    id: 'user-token',
    label: 'User access token',
    status: 'waiting',
    claims: null,
    explanation: 'Issued by PingOne after Authorization Code + PKCE login. Stored securely in the Backend-for-Frontend (BFF) session (server-side, httpOnly cookie — never exposed to the browser). Contains may_act authorising the Backend-for-Frontend (BFF) to exchange it on the user\'s behalf.',
    rfc: 'RFC 7519 · RFC 9068',
  },
  {
    id: 'exchange',
    label: 'Token exchange (RFC 8693): user access token → MCP access token',
    status: 'waiting',
    claims: null,
    explanation: 'Backend-for-Frontend (BFF) presents the user access token to PingOne as subject_token. PingOne validates may_act, narrows the scope to the tool\'s required scopes, and issues the MCP access token with an act claim identifying the Backend-for-Frontend (BFF) as the actor. The user access token NEVER leaves the Backend-for-Frontend (BFF).',
    rfc: 'RFC 8693 · RFC 8707',
  },
  {
    id: 'exchanged-token',
    label: 'MCP access token (delegated) → MCP server',
    status: 'waiting',
    claims: null,
    explanation: 'The MCP access token is scoped to the MCP server audience with narrowed scopes. Contains act: { client_id: bff } — proves delegation chain. The user access token stays in the Backend-for-Frontend (BFF); only the MCP access token reaches the MCP server and Banking API.',
    rfc: 'RFC 8693',
  },
];

/** Computes the initial panel position to the right of the trigger element. */
function calcInitialPos(triggerEl) {
  if (triggerEl) {
    const rect = triggerEl.getBoundingClientRect();
    const x = Math.min(rect.right + 16, window.innerWidth - 820);
    const y = Math.max(60, rect.top - 40);
    return { x, y };
  }
  return { x: Math.max(60, window.innerWidth - 900), y: 100 };
}

// ---------- Exchange mode banner -----------------------------------------

const EXCHANGE_MODE_MAP = {
  '2-exchange':   { label: '2-Exchange Delegation',    cls: 'tcd-exc-banner--teal',  desc: 'Nested act: subject → agent → MCP (RFC 8693)' },
  'with-actor':   { label: '1-Exchange + actor token', cls: 'tcd-exc-banner--blue',  desc: 'act claim present — BFF delegated per RFC 8693' },
  'subject-only': { label: '1-Exchange (no actor)',    cls: 'tcd-exc-banner--slate', desc: 'No act claim — subject-only RFC 8693' },
};

function ExchangeModeBanner({ events }) {
  if (!events || events.length === 0) return null;
  const ev = events.find(e => e.id === 'exchanged-token' && e.exchangeMethod);
  if (!ev) return null;
  const info = EXCHANGE_MODE_MAP[ev.exchangeMethod];
  if (!info) return null;
  return (
    <div className={'tcd-exc-banner ' + info.cls}>
      <span className="tcd-exc-badge">{info.label}</span>
      <span className="tcd-exc-desc">{info.desc}</span>
    </div>
  );
}

const TokenChainDisplay = () => {
  const ctx = useTokenChainOptional();
  const [tab, setTab] = useState('current');
  const [sessionPreviewEvents, setSessionPreviewEvents] = useState(null);
  const [inspectedEvent, setInspectedEvent] = useState(null);
  const [inspectorPos, setInspectorPos] = useState({ x: 120, y: 100 });
  const [copied, setCopied] = useState(false);

  /** Fetch session preview (called on mount, on login, and when live events reset). */
  const fetchSessionPreview = useCallback(async () => {
    if (ctx && ctx.events.length > 0) return; // live data present — skip
    try {
      const res = await fetch('/api/tokens/session-preview', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.tokenEvents) && data.tokenEvents.length > 0) {
        setSessionPreviewEvents(data.tokenEvents);
      }
    } catch (_err) {
      /* non-fatal — keep placeholder */
    }
  }, [ctx]);

  /**
   * Fetch on mount — App.js dispatches 'userAuthenticated' and sets loading=false
   * BEFORE this component renders, so the event always fires before mount.
   * fetchSessionPreview handles 401/non-OK gracefully (returns early, keeps placeholder).
   */
  React.useEffect(() => {
    void fetchSessionPreview();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only runs once on mount
  }, []);

  /** Also re-fetch immediately after a successful PingOne login (e.g. session expiry re-auth). */
  React.useEffect(() => {
    const onAuth = () => {
      setSessionPreviewEvents(null); // clear stale preview so new fetch replaces it
      void fetchSessionPreview();
    };
    window.addEventListener('userAuthenticated', onAuth);
    return () => window.removeEventListener('userAuthenticated', onAuth);
  }, [fetchSessionPreview]);

  const isLive = ctx && ctx.events.length > 0;
  const isSessionPreview = !isLive && Array.isArray(sessionPreviewEvents) && sessionPreviewEvents.length > 0;
  const currentEvents = isLive ? ctx.events : (isSessionPreview ? sessionPreviewEvents : PLACEHOLDER_EVENTS);
  const history = ctx ? ctx.history : [];

  /** Open the inspector for a given event, positioning near the trigger element. */
  const handleInspect = useCallback((event, triggerEl) => {
    setInspectorPos(calcInitialPos(triggerEl));
    setInspectedEvent(event);
  }, []);

  /** Copy the full token chain (current events + history) to the clipboard as pretty JSON. */
  const handleCopyAll = useCallback(() => {
    const payload = {
      copied_at: new Date().toISOString(),
      source: isLive ? 'live' : isSessionPreview ? 'session-preview' : 'placeholder',
      current_events: currentEvents.map(ev => ({
        id: ev.id,
        label: ev.label,
        status: ev.status,
        alg: ev.alg,
        claims: ev.claims,
        jwtFullDecode: ev.jwtFullDecode,
        mayActPresent: ev.mayActPresent,
        mayActValid: ev.mayActValid,
        mayActDetails: ev.mayActDetails,
        actPresent: ev.actPresent,
        actDetails: ev.actDetails,
        audExpected: ev.audExpected,
        audActual: ev.audActual,
        audMatches: ev.audMatches,
        exchangeRequest: ev.exchangeRequest,
        explanation: ev.explanation,
      })),
      history: (ctx?.history || []).map(h => ({
        tool: h.tool,
        timestamp: h.timestamp,
        events: h.events.map(ev => ({
          id: ev.id,
          label: ev.label,
          status: ev.status,
          claims: ev.claims,
          mayActPresent: ev.mayActPresent,
          mayActValid: ev.mayActValid,
          actPresent: ev.actPresent,
        })),
      })),
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // fallback for older browsers / non-HTTPS
      const ta = document.createElement('textarea');
      ta.value = JSON.stringify(payload, null, 2);
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [currentEvents, ctx, isLive, isSessionPreview]);

  return (
    <>
      <div className="tcd-root">
        <div className="tcd-header">
          <div className="tcd-header-title-row">
            <div className="tcd-header-title">
              Token Chain
              {isLive && <span className="tcd-live-dot" title="Live data from last tool call" />}
              {isSessionPreview && (
                <span
                  className="tcd-session-dot"
                  title="User access token loaded from your Backend-for-Frontend (BFF) session. Use the AI Agent to run RFC 8693 exchange and see MCP access token claims."
                />
              )}
            </div>
            <button
              type="button"
              className={`tcd-copy-btn${copied ? ' tcd-copy-btn--ok' : ''}`}
              onClick={handleCopyAll}
              title="Copy full token chain as JSON (for debugging)"
              aria-label="Copy token chain to clipboard"
            >
              {copied ? '✅ Copied' : '📋 Copy'}
            </button>
          </div>
          <p className="tcd-header-sub">
            User access token stays in Backend-for-Frontend (BFF) → RFC 8693 exchange → MCP access token → MCP server → Banking API
          </p>
        </div>

        <div className="tcd-tabs">
          <button type="button" className={`tcd-tab ${tab === 'current' ? 'active' : ''}`} onClick={() => setTab('current')}>
            Current call
          </button>
          <button type="button" className={`tcd-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
            History {history.length > 0 && <span className="tcd-hist-count">{history.length}</span>}
          </button>
        </div>

        {tab === 'current' && (
          <div className="tcd-events">
            {!isLive && (
              <div className="tcd-placeholder-note">
                {isSessionPreview
                  ? 'You are signed in — the user access token row is decoded from your Backend-for-Frontend (BFF) session (no raw JWT in the browser). Use the AI Agent (e.g. list accounts) to run the flow and see RFC 8693 exchange + MCP access token rows update live.'
                  : 'Sign in and load the dashboard to see your user access token, or make a banking / AI Agent request to see the full chain after exchange.'}
              </div>
            )}
            {isLive && <ExchangeModeBanner events={currentEvents} />}
            {currentEvents.map((ev, i) => (
              <EventRow key={ev.id} event={ev} isLast={i === currentEvents.length - 1} onInspect={handleInspect} />
            ))}
          </div>
        )}

        {tab === 'history' && (
          <div className="tcd-history">
            {history.length === 0
              ? <div className="tcd-placeholder-note">No history yet</div>
              : history.map((entry, i) => (
                  <HistoryEntry key={`${entry.timestamp}-${entry.tool}`} entry={entry} index={i} onInspect={handleInspect} />
                ))
            }
          </div>
        )}


      </div>

      {/* Inspector panel — portalled to document.body, draggable, resizable, collapsible */}
      {inspectedEvent && (
        <TokenInspectorPanel
          key={inspectedEvent.id}
          event={inspectedEvent}
          initialPos={inspectorPos}
          onClose={() => setInspectedEvent(null)}
        />
      )}
    </>
  );
};

export default TokenChainDisplay;
