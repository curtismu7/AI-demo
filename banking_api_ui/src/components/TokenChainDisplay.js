// banking_api_ui/src/components/TokenChainDisplay.js
import React, { useState, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useTokenChainOptional } from '../context/TokenChainContext';
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

// ─── Event detail content (shared between inline + inspector panel) ──────────

/** Renders the full detail for a token chain event. */
function EventDetail({ event }) {
  return (
    <>
      {event.explanation && (
        <p className="tcd-explanation">{event.explanation}</p>
      )}
      {event.mayActPresent === true && (
        <div className="tcd-pill tcd-pill--may-act">
          may_act ✅ present — {event.mayActDetails}
        </div>
      )}
      {event.mayActPresent === false && (
        <div className="tcd-pill tcd-pill--warn">
          may_act absent — exchange may be rejected by PingOne
        </div>
      )}
      {/* In-app consent pill — shown on user-token events */}
      {event.id === 'user-token' && event.consentGiven === true && (
        <div className="tcd-pill tcd-pill--consent">
          consent ✅ user accepted in-app agent delegation — {event.consentedAt ? new Date(event.consentedAt).toLocaleTimeString() : 'this session'}
        </div>
      )}
      {event.id === 'user-token' && event.consentGiven === false && (
        <div className="tcd-pill tcd-pill--warn">
          consent ⚠️ — user has not yet accepted the agent delegation agreement
        </div>
      )}
      {event.actPresent === true && (
        <div className="tcd-pill tcd-pill--act">
          act ✅ {event.actDetails} — Backend-for-Frontend (BFF) is the current actor
        </div>
      )}
      {event.exchangeRequest && (
        <div className="tcd-exchange-req">
          <div className="tcd-exchange-req-title">Exchange request (RFC 8693)</div>
          <pre>{JSON.stringify(event.exchangeRequest, null, 2)}</pre>
        </div>
      )}
      {event.jwtFullDecode && (
        <div className="tcd-exchange-req">
          <div className="tcd-exchange-req-title">JWT decode — full JSON (header + claims)</div>
          <pre className="tcd-jwt-dump">{JSON.stringify(event.jwtFullDecode, null, 2)}</pre>
        </div>
      )}
      {event.claims && (
        <>
          <div className="tcd-section-title">Decoded JWT claims</div>
          <ClaimsPanel claims={event.claims} alg={event.alg} />
        </>
      )}
    </>
  );
}

// ─── Floating inspector panel (portal, draggable, resizable, collapsible) ────

/**
 * Floats above the page as a draggable, resizable, collapsible inspector.
 * Rendered via createPortal into document.body so it can go off-screen.
 */
function TokenInspectorPanel({ event, initialPos, onClose }) {
  const [pos, setPos] = useState(initialPos);
  const [size, setSize] = useState({ w: 400, h: 520 });
  const [collapsed, setCollapsed] = useState(false);

  /** Drag from header. */
  const handleDragStart = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX - pos.x;
    const startY = e.clientY - pos.y;
    const onMove = (ev) => setPos({ x: ev.clientX - startX, y: ev.clientY - startY });
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [pos.x, pos.y]);

  /** Resize from bottom-right corner. */
  const handleResizeStart = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.w;
    const startH = size.h;
    const onMove = (ev) => setSize({
      w: Math.max(300, startW + ev.clientX - startX),
      h: Math.max(200, startH + ev.clientY - startY),
    });
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'se-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [size.w, size.h]);

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

/** Renders one step in the token chain. The inspect icon (right side) opens the floating inspector panel. */
function EventRow({ event, isLast, onInspect }) {
  const inspectBtnRef = useRef(null);
  const hasDetail = event.claims || event.explanation || event.exchangeRequest || event.jwtFullDecode;

  const handleOpen = () => {
    if (!hasDetail) return;
    onInspect(event, inspectBtnRef.current);
  };

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
    label: 'User Token',
    status: 'waiting',
    claims: null,
    explanation: 'Issued by PingOne after Authorization Code + PKCE login. Stored securely in the Backend-for-Frontend (BFF) session (server-side, httpOnly cookie — never exposed to the browser). Contains may_act authorising the Backend-for-Frontend (BFF) to exchange it on the user\'s behalf.',
    rfc: 'RFC 7519 · RFC 9068',
  },
  {
    id: 'exchange',
    label: 'Token Exchange (RFC 8693): User Token → MCP Token',
    status: 'waiting',
    claims: null,
    explanation: 'Backend-for-Frontend (BFF) presents the User Token to PingOne as subject_token. PingOne validates may_act, narrows the scope to the tool\'s required scopes, and issues the MCP Token with an act claim identifying the Backend-for-Frontend (BFF) as the actor. The User Token NEVER leaves the Backend-for-Frontend (BFF).',
    rfc: 'RFC 8693 · RFC 8707',
  },
  {
    id: 'exchanged-token',
    label: 'MCP Token (Delegated) → MCP Server',
    status: 'waiting',
    claims: null,
    explanation: 'The MCP Token is scoped to the MCP server audience with narrowed scopes. Contains act: { client_id: bff } — proves delegation chain. The User Token stays in the Backend-for-Frontend (BFF); only the MCP Token reaches the MCP Server and Banking API.',
    rfc: 'RFC 8693',
  },
];

/** Computes the initial panel position to the right of the trigger element. */
function calcInitialPos(triggerEl) {
  if (triggerEl) {
    const rect = triggerEl.getBoundingClientRect();
    const x = Math.min(rect.right + 16, window.innerWidth - 420);
    const y = Math.max(60, rect.top - 40);
    return { x, y };
  }
  return { x: Math.max(60, window.innerWidth - 460), y: 100 };
}

const TokenChainDisplay = () => {
  const ctx = useTokenChainOptional();
  const [tab, setTab] = useState('current');
  const [sessionPreviewEvents, setSessionPreviewEvents] = useState(null);
  const [inspectedEvent, setInspectedEvent] = useState(null);
  const [inspectorPos, setInspectorPos] = useState({ x: 420, y: 100 });

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

  /** Run on mount and whenever ctx events reset (e.g. after page navigation). */
  React.useEffect(() => {
    void fetchSessionPreview();
  }, [fetchSessionPreview]);

  /** Also re-fetch immediately after a successful PingOne login. */
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

  return (
    <>
      <div className="tcd-root">
        <div className="tcd-header">
          <div className="tcd-header-title">
            Token Chain
            {isLive && <span className="tcd-live-dot" title="Live data from last tool call" />}
            {isSessionPreview && (
              <span
                className="tcd-session-dot"
                title="User token loaded from your Backend-for-Frontend (BFF) session. Use the AI Agent to run RFC 8693 exchange and see MCP token claims."
              />
            )}
          </div>
          <p className="tcd-header-sub">
            User Token stays in Backend-for-Frontend (BFF) → RFC 8693 Exchange → MCP Token → MCP Server → Banking API
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
                  ? 'You are signed in — the User Token row is decoded from your Backend-for-Frontend (BFF) session (no raw JWT in the browser). Use the AI Agent (e.g. list accounts) to run the flow and see RFC 8693 exchange + MCP token rows update live.'
                  : 'Sign in and load the dashboard to see your User Token, or make a banking / AI Agent request to see the full chain after exchange.'}
              </div>
            )}
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

        <div className="tcd-legend">
          <span className="tcd-legend-item tcd-pill--may-act">may_act — prospective permission</span>
          <span className="tcd-legend-item tcd-pill--act">act — current actor fact</span>
          <span className="tcd-legend-item tcd-pill--consent">consent ✅ — agent delegation accepted</span>
          <span className="tcd-legend-item tcd-pill--warn">consent ⚠️ — user has not accepted</span>
        </div>
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
