import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './AuditPage.css';

const EVENT_TYPES = ['', 'banking_operation', 'authentication', 'authorization', 'session_management'];
const OUTCOMES = ['', 'success', 'failure', 'partial'];

const MIN_W = 420;
const MIN_H = 300;
const DEFAULT_W = 920;
const DEFAULT_H = 620;

export default function AuditPage({ onClose } = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPopout = searchParams.get('popout') === '1';

  const [events, setEvents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterEventType, setFilterEventType] = useState('');
  const [filterOutcome, setFilterOutcome] = useState('');

  // Floating window position + size — centred on first render (not used in popout mode)
  const [pos, setPos] = useState(() => ({
    x: Math.max(0, (window.innerWidth - DEFAULT_W) / 2),
    y: Math.max(0, (window.innerHeight - DEFAULT_H) / 2),
  }));
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });

  const dragRef = useRef(null);
  const resizeRef = useRef(null);

  useEffect(() => {
    if (isPopout) {
      document.title = 'MCP Audit Trail';
      return;
    }
    const onMove = (e) => {
      if (dragRef.current) {
        const { startX, startY, origX, origY } = dragRef.current;
        setPos({ x: origX + (e.clientX - startX), y: origY + (e.clientY - startY) });
      }
      if (resizeRef.current) {
        const { dir, startX, startY, origX, origY, origW, origH } = resizeRef.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        let nx = origX, ny = origY, nw = origW, nh = origH;
        if (dir.includes('e')) nw = Math.max(MIN_W, origW + dx);
        if (dir.includes('s')) nh = Math.max(MIN_H, origH + dy);
        if (dir.includes('w')) { nw = Math.max(MIN_W, origW - dx); nx = origX + origW - nw; }
        if (dir.includes('n')) { nh = Math.max(MIN_H, origH - dy); ny = origY + origH - nh; }
        setPos({ x: nx, y: ny });
        setSize({ w: nw, h: nh });
      }
    };
    const onUp = () => { dragRef.current = null; resizeRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isPopout]);

  const onTitleBarMouseDown = useCallback((e) => {
    if (isPopout || e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  }, [isPopout, pos]);

  const onResizeMouseDown = (dir) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { dir, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, origW: size.w, origH: size.h };
  };

  const openPopout = useCallback(() => {
    window.open(
      '/audit?popout=1',
      'mcpAuditTrail',
      `width=${DEFAULT_W},height=${DEFAULT_H},resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no`
    );
    // Close the in-browser floating window after launching the OS popup
    if (onClose) onClose(); else navigate(-1);
  }, [onClose, navigate]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterEventType) params.set('eventType', filterEventType);
      if (filterOutcome) params.set('outcome', filterOutcome);
      const paramStr = params.toString();
      const [eventsRes, summaryRes] = await Promise.all([
        fetch(`/api/mcp/audit${paramStr ? '?' + paramStr : ''}`, { credentials: 'include' }),
        fetch('/api/mcp/audit?summary=1', { credentials: 'include' }),
      ]);
      if (!eventsRes.ok) throw new Error(`HTTP ${eventsRes.status}`);
      const [eventsData, summaryData] = await Promise.all([
        eventsRes.json(),
        summaryRes.ok ? summaryRes.json() : null,
      ]);
      setEvents(Array.isArray(eventsData) ? eventsData : []);
      setSummary(summaryData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterEventType, filterOutcome]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  function formatTime(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString();
  }

  const auditContent = (
    <>
      {summary && (
        <div className="audit-page__summary">
          <div className="audit-stat">
            <span className="audit-stat__value">{summary.totalEvents ?? 0}</span>
            <span className="audit-stat__label">Total Events</span>
          </div>
          {Object.entries(summary.byOutcome ?? {}).map(([k, v]) => (
            <div key={k} className={`audit-stat audit-stat--${k}`}>
              <span className="audit-stat__value">{v}</span>
              <span className="audit-stat__label">{k}</span>
            </div>
          ))}
          {Object.entries(summary.byEventType ?? {}).map(([k, v]) => (
            <div key={k} className="audit-stat audit-stat--type">
              <span className="audit-stat__value">{v}</span>
              <span className="audit-stat__label">{k}</span>
            </div>
          ))}
        </div>
      )}
      <div className="audit-page__filters">
        <select value={filterEventType} onChange={e => setFilterEventType(e.target.value)} className="audit-filter-select" aria-label="Filter by event type">
          <option value="">All event types</option>
          {EVENT_TYPES.filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)} className="audit-filter-select" aria-label="Filter by outcome">
          <option value="">All outcomes</option>
          {OUTCOMES.filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      {error && (
        <div className="audit-page__error">
          Failed to load audit log: {error}
          {(error.includes('401') || error.includes('403')) ? ' — admin access required.' : ''}
        </div>
      )}
      {!error && (
        <div className="audit-page__table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Time</th><th>Event Type</th><th>User ID</th><th>Outcome</th><th>Resource / Tool</th><th>Details</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="audit-table__empty">Loading…</td></tr>}
              {!loading && events.length === 0 && <tr><td colSpan={6} className="audit-table__empty">No audit events found.</td></tr>}
              {!loading && events.map((ev, i) => (
                <tr key={ev.eventId ?? i} className={`audit-row audit-row--${ev.outcome}`}>
                  <td className="audit-cell--time">{formatTime(ev.timestamp)}</td>
                  <td><span className="audit-badge audit-badge--type">{ev.eventType}</span></td>
                  <td className="audit-cell--user">{ev.userId ?? '—'}</td>
                  <td><span className={`audit-badge audit-badge--outcome audit-badge--outcome--${ev.outcome}`}>{ev.outcome}</span></td>
                  <td>{ev.resourceType ?? ev.operation ?? '—'}</td>
                  <td className="audit-cell--details">
                    {ev.details ? (
                      <details><summary>show</summary><pre className="audit-details-pre">{JSON.stringify(ev.details, null, 2)}</pre></details>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  // ── Popout mode: plain page layout (OS window handles positioning/sizing) ──
  if (isPopout) {
    return (
      <div className="audit-popout-page">
        <div className="audit-popout-titlebar">
          <span className="audit-float-title">🔍 MCP Audit Trail</span>
          <button type="button" className="audit-float-btn" onClick={fetchEvents} disabled={loading} title="Refresh" aria-label="Refresh">
            {loading ? '…' : '↻'}
          </button>
        </div>
        <div className="audit-popout-content">{auditContent}</div>
      </div>
    );
  }

  // ── Floating window mode (within-browser, draggable + resizable) ──
  return (
    <div
      className="audit-float-window"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
      role="dialog"
      aria-modal="true"
      aria-label="MCP Audit Trail"
    >
      {['n','ne','e','se','s','sw','w','nw'].map(dir => (
        <div key={dir} className={`audit-resize-handle audit-resize-${dir}`} onMouseDown={onResizeMouseDown(dir)} />
      ))}
      <div className="audit-float-titlebar" onMouseDown={onTitleBarMouseDown}>
        <span className="audit-float-title">🔍 MCP Audit Trail</span>
        <div className="audit-float-titlebar-actions">
          <button type="button" className="audit-float-btn" onClick={fetchEvents} disabled={loading} title="Refresh" aria-label="Refresh audit log">
            {loading ? '…' : '↻'}
          </button>
          <button type="button" className="audit-float-btn" onClick={openPopout} title="Open in new window (move to any screen)" aria-label="Pop out to new window">
            ⧉
          </button>
          <button type="button" className="audit-float-close" onClick={() => onClose ? onClose() : navigate(-1)} title="Close" aria-label="Close audit log">
            ×
          </button>
        </div>
      </div>
      <div className="audit-float-content">{auditContent}</div>
    </div>
  );
}
