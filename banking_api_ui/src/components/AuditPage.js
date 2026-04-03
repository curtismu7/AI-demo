import React, { useState, useEffect, useCallback } from 'react';
import './AuditPage.css';

const EVENT_TYPES = ['', 'banking_operation', 'authentication', 'authorization', 'session_management'];
const OUTCOMES = ['', 'success', 'failure', 'partial'];

export default function AuditPage() {
  const [events, setEvents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterEventType, setFilterEventType] = useState('');
  const [filterOutcome, setFilterOutcome] = useState('');

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

  return (
    <div className="app-page-shell audit-page">
      <div className="audit-page__header">
        <h1 className="audit-page__title">MCP Audit Trail</h1>
        <p className="audit-page__subtitle">MCP tool call activity log from AuditLogger</p>
      </div>

      {/* Summary stats */}
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

      {/* Filters */}
      <div className="audit-page__filters">
        <select
          value={filterEventType}
          onChange={e => setFilterEventType(e.target.value)}
          className="audit-filter-select"
          aria-label="Filter by event type"
        >
          <option value="">All event types</option>
          {EVENT_TYPES.filter(Boolean).map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={filterOutcome}
          onChange={e => setFilterOutcome(e.target.value)}
          className="audit-filter-select"
          aria-label="Filter by outcome"
        >
          <option value="">All outcomes</option>
          {OUTCOMES.filter(Boolean).map(o => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <button
          type="button"
          className="audit-refresh-btn"
          onClick={fetchEvents}
          disabled={loading}
          aria-label="Refresh audit log"
        >
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="audit-page__error">
          Failed to load audit log: {error}
          {(error.includes('401') || error.includes('403')) ? ' — admin access required.' : ''}
        </div>
      )}

      {/* Table */}
      {!error && (
        <div className="audit-page__table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Event Type</th>
                <th>User ID</th>
                <th>Outcome</th>
                <th>Resource / Tool</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="audit-table__empty">Loading…</td></tr>
              )}
              {!loading && events.length === 0 && (
                <tr><td colSpan={6} className="audit-table__empty">No audit events found.</td></tr>
              )}
              {!loading && events.map((ev, i) => (
                <tr key={ev.eventId ?? i} className={`audit-row audit-row--${ev.outcome}`}>
                  <td className="audit-cell--time">{formatTime(ev.timestamp)}</td>
                  <td><span className="audit-badge audit-badge--type">{ev.eventType}</span></td>
                  <td className="audit-cell--user">{ev.userId ?? '—'}</td>
                  <td>
                    <span className={`audit-badge audit-badge--outcome audit-badge--outcome--${ev.outcome}`}>
                      {ev.outcome}
                    </span>
                  </td>
                  <td>{ev.resourceType ?? ev.operation ?? '—'}</td>
                  <td className="audit-cell--details">
                    {ev.details ? (
                      <details>
                        <summary>show</summary>
                        <pre className="audit-details-pre">
                          {JSON.stringify(ev.details, null, 2)}
                        </pre>
                      </details>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
