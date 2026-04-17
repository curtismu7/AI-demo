/**
 * AdminErrorAuditLog
 * Admin panel component showing error audit trail
 * Filters and displays all security errors with expandable details
 */

import React, { useState, useEffect } from 'react';
import ErrorDisplayService from '../services/errorDisplayService';
import './AdminErrorAuditLog.css';

export default function AdminErrorAuditLog() {
  const [entries, setEntries] = useState([]);
  const [filter, setFilter] = useState('all');  // all, critical, warning, info
  const [expanded, setExpanded] = useState(null);  // Expand one entry at a time
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Load from localStorage on mount
  useEffect(() => {
    loadAuditLog();
  }, []);

  // Auto-refresh every 5 seconds if enabled
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadAuditLog();
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const loadAuditLog = () => {
    const audit = ErrorDisplayService.getAuditLog();
    setEntries(audit.reverse());  // Most recent first
  };

  const filtered = entries.filter(entry => {
    if (filter === 'all') return true;

    const severity = ErrorDisplayService.getSeverity(entry.error_code);
    return severity === filter;
  });

  const handleClearLog = () => {
    if (window.confirm('Are you sure you want to clear the error audit log?')) {
      ErrorDisplayService.clearAuditLog();
      setEntries([]);
      setExpanded(null);
    }
  };

  const handleRefresh = () => {
    loadAuditLog();
  };

  return (
    <div className="error-audit-log">
      <div className="audit-header">
        <h2>Error Audit Log</h2>
        <div className="audit-controls">
          <label className="audit-auto-refresh">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (5s)
          </label>
          <button className="btn btn-secondary" onClick={handleRefresh} type="button">
            🔄 Refresh
          </button>
          <button className="btn btn-danger" onClick={handleClearLog} type="button">
            Clear log
          </button>
        </div>
      </div>

      {/* Filter buttons */}
      <div className="audit-filters">
        {['all', 'critical', 'warning', 'info'].map(f => (
          <button
            key={f}
            className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              setFilter(f);
              setExpanded(null);
            }}
            type="button"
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {' '}
            <span className="badge">
              {entries.filter(e => f === 'all' || ErrorDisplayService.getSeverity(e.error_code) === f).length}
            </span>
          </button>
        ))}
      </div>

      {/* Error entries */}
      <div className="audit-entries">
        {filtered.length === 0 ? (
          <div className="audit-empty">
            <p>No errors recorded.</p>
          </div>
        ) : (
          filtered.map((entry, idx) => (
            <div key={idx} className="audit-entry">
              {/* Row: timestamp, error code, message, expand button */}
              <div
                className="audit-entry__header"
                onClick={() => setExpanded(expanded === idx ? null : idx)}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setExpanded(expanded === idx ? null : idx);
                  }
                }}
              >
                <span className="audit-entry__timestamp">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span className={`audit-entry__code audit-entry__code--${ErrorDisplayService.getSeverity(entry.error_code).toLowerCase()}`}>
                  {entry.error_code}
                </span>
                <span className="audit-entry__message">
                  {entry.message}
                </span>
                <span className="audit-entry__toggle" aria-hidden="true">
                  {expanded === idx ? '▼' : '▶'}
                </span>
              </div>

              {/* Expanded details */}
              {expanded === idx && (
                <div className="audit-entry__details">
                  <div className="detail-row">
                    <strong>What failed:</strong>
                    <p>{entry.details.what_failed}</p>
                  </div>
                  {entry.details.why && (
                    <div className="detail-row">
                      <strong>Why:</strong>
                      <p>{entry.details.why}</p>
                    </div>
                  )}
                  {entry.details.teaching && (
                    <div className="detail-row">
                      <strong>Teaching:</strong>
                      <p>{entry.details.teaching}</p>
                    </div>
                  )}
                  <div className="detail-row">
                    <strong>Fix:</strong>
                    <p>{entry.details.fix}</p>
                  </div>
                  {entry.user_email && (
                    <div className="detail-row">
                      <strong>User:</strong>
                      <p>{entry.user_email}</p>
                    </div>
                  )}
                  {entry.agent_name && (
                    <div className="detail-row">
                      <strong>Agent:</strong>
                      <p>{entry.agent_name}</p>
                    </div>
                  )}
                  {entry.endpoint && (
                    <div className="detail-row">
                      <strong>Endpoint:</strong>
                      <p>{entry.endpoint}</p>
                    </div>
                  )}
                  {entry.http_status && (
                    <div className="detail-row">
                      <strong>HTTP Status:</strong>
                      <p>{entry.http_status}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="audit-footer">
        <small>
          Showing {filtered.length} of {entries.length} errors.
          {' '}
          Latest: {entries.length > 0 ? new Date(entries[0].timestamp).toLocaleString() : 'N/A'}
        </small>
      </div>
    </div>
  );
}
