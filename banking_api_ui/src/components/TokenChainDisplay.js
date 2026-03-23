import React, { useState } from 'react';
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

// ─── Single event row ─────────────────────────────────────────────────────────

function EventRow({ event, isLast }) {
  const [open, setOpen] = useState(false);
  const hasDetail = event.claims || event.explanation || event.exchangeRequest;

  return (
    <div className="tcd-event-wrap">
      <div className={`tcd-event ${event.status}`}>
        <button
          type="button"
          className="tcd-event-toggle"
          onClick={() => setOpen(o => !o)}
          disabled={!hasDetail}
          aria-expanded={open}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          {hasDetail ? (open ? '▾' : '▸') : <span style={{ opacity: 0 }}>▸</span>}
        </button>

        <div className="tcd-event-main">
          <span className="tcd-event-label">{event.label}</span>
          {event.rfc && <span className="tcd-event-rfc">{event.rfc}</span>}
        </div>

        <StatusBadge status={event.status} />
      </div>

      {open && (
        <div className="tcd-event-detail">
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
          {event.actPresent === true && (
            <div className="tcd-pill tcd-pill--act">
              act ✅ {event.actDetails} — BFF is the current actor
            </div>
          )}

          {event.exchangeRequest && (
            <div className="tcd-exchange-req">
              <div className="tcd-exchange-req-title">Exchange request (RFC 8693)</div>
              <pre>{JSON.stringify(event.exchangeRequest, null, 2)}</pre>
            </div>
          )}

          {event.claims && (
            <>
              <div className="tcd-section-title">Decoded JWT claims</div>
              <ClaimsPanel claims={event.claims} alg={event.alg} />
            </>
          )}
        </div>
      )}

      {!isLast && <div className="tcd-connector"><div className="tcd-connector-line" /><span className="tcd-connector-arrow">↓</span></div>}
    </div>
  );
}

// ─── History entry ─────────────────────────────────────────────────────────────

function HistoryEntry({ entry, index }) {
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
        <EventRow key={ev.id} event={ev} isLast={i === entry.events.length - 1} />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const PLACEHOLDER_EVENTS = [
  {
    id: 'user-token',
    label: 'User Token (T1)',
    status: 'waiting',
    claims: null,
    explanation: 'Issued after Authorization Code + PKCE login. Stored in BFF session. Contains may_act authorising this server to exchange it.',
    rfc: 'RFC 7519 · RFC 9068',
  },
  {
    id: 'exchange',
    label: 'RFC 8693 Token Exchange → T2',
    status: 'waiting',
    claims: null,
    explanation: 'BFF presents T1 to PingOne. PingOne validates may_act, narrows scope to the tool\'s required scopes, and issues T2 with act claim.',
    rfc: 'RFC 8693 · RFC 8707',
  },
  {
    id: 'exchanged-token',
    label: 'Exchanged Token (T2) → MCP Server',
    status: 'waiting',
    claims: null,
    explanation: 'T2 is scoped to the MCP server audience. Contains act: { client_id: bff } — proves delegation. T1 never leaves the BFF.',
    rfc: 'RFC 8693',
  },
];

const TokenChainDisplay = () => {
  const ctx = useTokenChainOptional();
  const [tab, setTab] = useState('current');

  const currentEvents = (ctx && ctx.events.length > 0) ? ctx.events : PLACEHOLDER_EVENTS;
  const history = ctx ? ctx.history : [];
  const isLive = ctx && ctx.events.length > 0;

  return (
    <div className="tcd-root">
      <div className="tcd-header">
        <div className="tcd-header-title">
          Token Chain
          {isLive && <span className="tcd-live-dot" title="Live data from last tool call" />}
        </div>
        <p className="tcd-header-sub">
          RFC 8693 token exchange — BFF → PingOne → MCP Server → Banking API
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
              Make a banking request to see live token events
            </div>
          )}
          {currentEvents.map((ev, i) => (
            <EventRow key={ev.id} event={ev} isLast={i === currentEvents.length - 1} />
          ))}
        </div>
      )}

      {tab === 'history' && (
        <div className="tcd-history">
          {history.length === 0
            ? <div className="tcd-placeholder-note">No history yet</div>
            : history.map((entry, i) => <HistoryEntry key={`${entry.timestamp}-${entry.tool}`} entry={entry} index={i} />)
          }
        </div>
      )}

      <div className="tcd-legend">
        <span className="tcd-legend-item tcd-pill--may-act">may_act — prospective permission</span>
        <span className="tcd-legend-item tcd-pill--act">act — current actor fact</span>
      </div>
    </div>
  );
};

export default TokenChainDisplay;
