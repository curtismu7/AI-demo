/**
 * LogViewer Component
 * Displays application and Vercel logs in a real-time table with filtering
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './LogViewer.css';

const LogViewer = ({ isOpen, onClose, standalone = false }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState({
    level: '',
    search: '',
    source: 'all' // all, console, app, vercel
  });
  const [stats, setStats] = useState(null);
  const logContainerRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        limit: 500,
        ...(filter.level && { level: filter.level }),
        ...(filter.search && { search: filter.search })
      };

      if (filter.source === 'all') {
        const sources = ['console', 'app', 'vercel'];
        const results = await Promise.allSettled(
          sources.map(src => axios.get(`/api/logs/${src}`, { params }))
        );
        const merged = results
          .flatMap((r, i) =>
            r.status === 'fulfilled'
              ? (r.value.data.logs || []).map(l => ({ ...l, _src: sources[i] }))
              : []
          )
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        setLogs(merged);
      } else {
        const response = await axios.get(`/api/logs/${filter.source}`, { params });
        setLogs((response.data.logs || []).map(l => ({ ...l, _src: filter.source })));
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await axios.get('/api/logs/stats');
      setStats(response.data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
      fetchStats();
    }
  }, [isOpen, fetchLogs, fetchStats]);

  useEffect(() => {
    if (!isOpen || !autoRefresh) return;

    const interval = setInterval(() => {
      fetchLogs();
      fetchStats();
    }, 2000); // Refresh every 2 seconds

    return () => clearInterval(interval);
  }, [isOpen, autoRefresh, fetchLogs, fetchStats]);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const clearLogs = async () => {
    if (!window.confirm('Clear all console logs?')) return;

    try {
      await axios.delete('/api/logs/console');
      setLogs([]);
      fetchStats();
    } catch (err) {
      console.error('Error clearing logs:', err);
      setError(err.message);
    }
  };

  const downloadLogs = () => {
    const content = logs.map(log => JSON.stringify(log)).join('\n');
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getLevelColor = (level) => {
    switch (level?.toLowerCase()) {
      case 'error': return '#ef4444';
      case 'warn': return '#f59e0b';
      case 'info': return '#3b82f6';
      case 'debug': return '#6b7280';
      default: return '#9ca3af';
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  if (!standalone && !isOpen) return null;

  const inner = (
    <div className={standalone ? 'log-viewer-standalone' : 'log-viewer-modal'}>
        <div className="log-viewer-header">
          <h2>📊 Log Viewer</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {!standalone && (
              <button
                className="close-button"
                title="Open in new window"
                onClick={() => window.open('/logs', 'BankingLogs', 'width=1400,height=900,scrollbars=yes,resizable=yes')}
                style={{ fontSize: '16px', padding: '4px 10px' }}
              >
                ⊞
              </button>
            )}
            {!standalone && <button className="close-button" onClick={onClose}>✕</button>}
          </div>
        </div>

        <div className="log-viewer-controls">
          <div className="control-group">
            <label>Source:</label>
            <select 
              value={filter.source} 
              onChange={(e) => setFilter({ ...filter, source: e.target.value })}
            >
              <option value="all">All Sources</option>
              <option value="console">Console Logs</option>
              <option value="app">Application Logs</option>
              <option value="vercel">Vercel Logs</option>
            </select>
          </div>

          <div className="control-group">
            <label>Level:</label>
            <select 
              value={filter.level} 
              onChange={(e) => setFilter({ ...filter, level: e.target.value })}
            >
              <option value="">All</option>
              <option value="error">Error</option>
              <option value="warn">Warning</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
            </select>
          </div>

          <div className="control-group search-group">
            <label>Search:</label>
            <input
              type="text"
              placeholder="Filter logs..."
              value={filter.search}
              onChange={(e) => setFilter({ ...filter, search: e.target.value })}
            />
          </div>

          <div className="control-group">
            <label>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>
          </div>

          <div className="control-group">
            <label>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              Auto-scroll
            </label>
          </div>

          <button onClick={fetchLogs} disabled={loading} className="refresh-button">
            🔄 Refresh
          </button>

          <button onClick={downloadLogs} className="download-button">
            💾 Download
          </button>

          {(filter.source === 'console' || filter.source === 'all') && (
            <button onClick={clearLogs} className="clear-button">
              🗑️ Clear
            </button>
          )}
        </div>

        {stats && (
          <div className="log-stats">
            <span>Total: {stats.total}</span>
            <span style={{ color: '#ef4444' }}>Errors: {stats.byLevel?.error || 0}</span>
            <span style={{ color: '#f59e0b' }}>Warnings: {stats.byLevel?.warn || 0}</span>
            <span style={{ color: '#3b82f6' }}>Info: {stats.byLevel?.info || 0}</span>
          </div>
        )}

        {error && (
          <div className="log-error">
            ⚠️ Error: {error}
          </div>
        )}

        <div className="log-table-container" ref={logContainerRef}>
          <table className="log-table">
            <thead>
              <tr>
                <th style={{ width: '120px' }}>Time</th>
                <th style={{ width: '80px' }}>Level</th>
                <th style={{ width: '70px' }}>Source</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan="3" className="loading-cell">Loading logs...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="3" className="empty-cell">No logs found</td>
                </tr>
              ) : (
                logs.map((log, index) => (
                  <tr key={index} className={`log-row log-${log.level}`}>
                    <td className="log-time">{formatTimestamp(log.timestamp)}</td>
                    <td className="log-level">
                      <span 
                        className="level-badge" 
                        style={{ backgroundColor: getLevelColor(log.level) }}
                      >
                        {log.level?.toUpperCase() || 'INFO'}
                      </span>
                    </td>
                    <td className="log-source" style={{ fontSize: '0.7rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{log._src || '—'}</td>
                    <td className="log-message">
                      {typeof log.message === 'object' 
                        ? JSON.stringify(log.message, null, 2)
                        : log.message}
                      {log.correlationId && (
                        <span className="correlation-id">
                          🔗 {log.correlationId}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="log-viewer-footer">
          <span>{logs.length} logs displayed</span>
          {autoRefresh && <span className="refresh-indicator">● Live</span>}
        </div>
      </div>
  );

  if (standalone) return inner;

  return (
    <div className="log-viewer-overlay">
      {inner}
    </div>
  );
};

export default LogViewer;
