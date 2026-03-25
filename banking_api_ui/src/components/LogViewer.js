/**
 * LogViewer Component
 * Displays application and Vercel logs in a real-time table with filtering
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './LogViewer.css';

const LogViewer = ({ isOpen, onClose }) => {
  // ── Drag-to-move ────────────────────────────────────────────────────────
  const [dragPos, setDragPos] = useState(null); // null = default anchored position
  const panelRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const handleDragStart = useCallback((e) => {
    if (e.target.closest('button, input, select, label')) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    isDraggingRef.current = true;
    dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (!dragPos) setDragPos({ x: rect.left, y: rect.top });
    e.preventDefault();
  }, [dragPos]);

  useEffect(() => {
    const onMove = (e) => {
      if (!isDraggingRef.current) return;
      // No clamping — allow dragging to secondary monitors
      setDragPos({ x: e.clientX - dragOffsetRef.current.x, y: e.clientY - dragOffsetRef.current.y });
    };
    const onUp = () => { isDraggingRef.current = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  const resetPosition = () => setDragPos(null);

  // ── Pop out to new window — live auto-refreshing ─────────────────────────
  const popOut = () => {
    const origin = window.location.origin;
    const w = window.open('', 'logviewer', 'width=1400,height=820,resizable=yes,scrollbars=yes');
    if (!w) { alert('Pop-up blocked — allow pop-ups for this site and try again.'); return; }
    w.document.write(`<!DOCTYPE html><html><head><title>BX Finance — Live Logs</title>
<meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#111;color:#ddd;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;display:flex;flex-direction:column;height:100vh;overflow:hidden}
#toolbar{display:flex;align-items:center;gap:10px;padding:8px 14px;background:#1c1c1c;border-bottom:1px solid #333;flex-shrink:0}
#toolbar h1{font-size:14px;font-weight:700;color:#fff;margin-right:auto}
#toolbar select,#toolbar input{background:#2a2a2a;border:1px solid #444;color:#ddd;padding:4px 8px;border-radius:4px;font-size:12px}
#toolbar button{background:#2a2a2a;border:1px solid #444;color:#aaa;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px}
#toolbar button:hover{background:#383838;color:#fff}
#toolbar button.active{background:#3b82f6;border-color:#3b82f6;color:#fff}
#status{font-size:11px;color:#6b7280;white-space:nowrap}
#wrap{flex:1;overflow-y:auto}
table{width:100%;border-collapse:collapse}
thead{position:sticky;top:0;background:#1c1c1c;z-index:10}
th{text-align:left;padding:8px 12px;color:#777;font-size:10px;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #333}
tr:hover{background:#1a1a1a}
td{padding:6px 12px;border-bottom:1px solid #1e1e1e;vertical-align:top}
.ts{color:#666;font-size:11px;white-space:nowrap;font-family:monospace}
.lv{text-align:center}
.badge{padding:2px 6px;border-radius:3px;color:#fff;font-size:10px;font-weight:700;text-transform:uppercase}
.src{font-size:10px;color:#6b7280;text-transform:uppercase}
.msg{white-space:pre-wrap;word-break:break-word;font-family:'Consolas','Fira Mono',monospace;font-size:12px;color:#ccc}
.lv-error{background:#ef4444} .lv-warn{background:#f59e0b}
.lv-info{background:#3b82f6}  .lv-debug{background:#6b7280}
</style></head><body>
<div id="toolbar">
  <h1>📊 BX Finance — Live Log Viewer</h1>
  <select id="src"><option value="all">All Sources</option><option value="console">Console</option><option value="app">App</option><option value="vercel">Vercel</option></select>
  <select id="lvl"><option value="">All Levels</option><option value="error">Error</option><option value="warn">Warn</option><option value="info">Info</option><option value="debug">Debug</option></select>
  <input id="srch" placeholder="Search…" style="min-width:160px">
  <button id="pauseBtn">⏸ Pause</button>
  <button id="clearBtn">🗑 Clear</button>
  <span id="status">Loading…</span>
</div>
<div id="wrap"><table>
  <thead><tr><th style="width:105px">Time</th><th style="width:65px">Level</th><th style="width:70px">Source</th><th>Message</th></tr></thead>
  <tbody id="tbody"></tbody>
</table></div>
<script>
const API = '${origin}';
let paused = false, seen = new Set(), timer;
const tbody = document.getElementById('tbody');
const wrap  = document.getElementById('wrap');
const status= document.getElementById('status');

document.getElementById('pauseBtn').onclick = function(){
  paused = !paused;
  this.textContent = paused ? '▶ Resume' : '⏸ Pause';
  this.classList.toggle('active', paused);
};
document.getElementById('clearBtn').onclick = () => { tbody.innerHTML=''; seen.clear(); };
['src','lvl','srch'].forEach(id => document.getElementById(id).addEventListener('input', ()=>{ seen.clear(); tbody.innerHTML=''; fetch2(); }));

function ts(t){
  const d=new Date(t);
  return d.toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit',fractionalSecondDigits:3});
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function badge(lv){
  const l=(lv||'info').toLowerCase();
  return '<span class="badge lv-'+l+'">'+l.toUpperCase()+'</span>';
}

async function fetch2(){
  if(paused) return;
  const src=document.getElementById('src').value;
  const lvl=document.getElementById('lvl').value;
  const srch=document.getElementById('srch').value;
  const params=new URLSearchParams({limit:500,...(lvl&&{level:lvl}),...(srch&&{search:srch})});
  const sources = src==='all' ? ['console','app','vercel'] : [src];
  try {
    const results = await Promise.allSettled(sources.map(s=>fetch(API+'/api/logs/'+s+'?'+params).then(r=>r.ok?r.json():Promise.reject())));
    let logs=[];
    results.forEach((r,i)=>{ if(r.status==='fulfilled') (r.value.logs||[]).forEach(l=>logs.push({...l,_src:sources[i]})); });
    logs.sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));
    const atBottom = wrap.scrollHeight-wrap.scrollTop-wrap.clientHeight < 60;
    let added=0;
    logs.forEach(l=>{
      const key=l.timestamp+'|'+l.message;
      if(seen.has(key)) return;
      seen.add(key);
      added++;
      const msg=typeof l.message==='object'?JSON.stringify(l.message,null,2):(l.message||'');
      const tr=document.createElement('tr');
      tr.innerHTML='<td class="ts">'+ts(l.timestamp)+'</td><td class="lv">'+badge(l.level)+'</td><td class="src">'+(l._src||'—')+'</td><td class="msg">'+esc(msg)+'</td>';
      tbody.appendChild(tr);
    });
    if(added>0 && atBottom) wrap.scrollTop=wrap.scrollHeight;
    status.textContent='Last fetch: '+new Date().toLocaleTimeString()+' · '+seen.size+' entries';
  } catch(e){ status.textContent='Fetch error: '+e.message; }
}
fetch2();
timer = setInterval(fetch2, 4000);
</script></body></html>`);
    w.document.close();
  };
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [paused, setPaused] = useState(false);
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

      let incoming = [];
      if (filter.source === 'all') {
        const sources = ['console', 'app', 'vercel'];
        const results = await Promise.allSettled(
          sources.map(src => axios.get(`/api/logs/${src}`, { params }))
        );
        incoming = results
          .flatMap((r, i) =>
            r.status === 'fulfilled'
              ? (r.value.data.logs || []).map(l => ({ ...l, _src: sources[i] }))
              : []
          )
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      } else {
        const response = await axios.get(`/api/logs/${filter.source}`, { params });
        incoming = (response.data.logs || []).map(l => ({ ...l, _src: filter.source }));
      }

      // Merge incoming with existing logs, deduplicating on timestamp+message
      setLogs(prev => {
        const seen = new Set(prev.map(l => `${l.timestamp}|${l.message}`));
        const newEntries = incoming.filter(l => !seen.has(`${l.timestamp}|${l.message}`));
        if (newEntries.length === 0) return prev;
        return [...prev, ...newEntries].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      });
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
      if (!paused) {
        fetchLogs();
        fetchStats();
      }
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [isOpen, autoRefresh, paused, fetchLogs, fetchStats]);

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

  const [copied, setCopied] = useState(false);

  const copyLast10Lines = () => {
    const last10 = logs.slice(-10);
    const text = last10
      .map(log => `[${formatTimestamp(log.timestamp)}] [${(log.level || 'info').toUpperCase()}] ${typeof log.message === 'object' ? JSON.stringify(log.message) : log.message}`)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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

  if (!isOpen) return null;

  const panelStyle = dragPos
    ? { position: 'fixed', left: dragPos.x, top: dragPos.y, right: 'auto', bottom: 'auto', transform: 'none' }
    : {};

  return (
    <div className="log-viewer-float" ref={panelRef} style={panelStyle}>
        <div className="log-viewer-header" onMouseDown={handleDragStart} style={{ cursor: 'grab' }}>
          <h2>📊 Log Viewer</h2>
          <div className="log-viewer-header-actions">
            <button className="log-action-btn" onClick={resetPosition} title="Reset position">⌂</button>
            <button className="log-action-btn" onClick={popOut} title="Pop out to new window">⤢</button>
            <button className="close-button" onClick={onClose}>✕</button>
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

          {autoRefresh && (
            <button
              onClick={() => setPaused(p => !p)}
              className={paused ? 'resume-button' : 'pause-button'}
            >
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
          )}

          <button onClick={downloadLogs} className="download-button">
            💾 Download
          </button>

          <button onClick={copyLast10Lines} className="copy-button" disabled={logs.length === 0}>
            {copied ? '✅ Copied!' : '📋 Copy last 10'}
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
          {autoRefresh && !paused && <span className="refresh-indicator">● Live</span>}
          {autoRefresh && paused && <span className="refresh-indicator paused-indicator">⏸ Paused</span>}
        </div>
    </div>
  );
};

/**
 * Open the log viewer in a standalone popup window, bypassing the inline overlay.
 * Call this from anywhere in the app — no component state needed.
 */
export function openLogViewerWindow() {
  const origin = window.location.origin;
  const w = window.open('', 'logviewer', 'width=1400,height=820,resizable=yes,scrollbars=yes');
  if (!w) { alert('Pop-up blocked — allow pop-ups for this site and try again.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>BX Finance — Live Logs</title>
<meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#111;color:#ddd;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;display:flex;flex-direction:column;height:100vh;overflow:hidden}
#toolbar{display:flex;align-items:center;gap:10px;padding:8px 14px;background:#1c1c1c;border-bottom:1px solid #333;flex-shrink:0}
#toolbar h1{font-size:14px;font-weight:700;color:#fff;margin-right:auto}
#toolbar select,#toolbar input{background:#2a2a2a;border:1px solid #444;color:#ddd;padding:4px 8px;border-radius:4px;font-size:12px}
#toolbar button{background:#2a2a2a;border:1px solid #444;color:#aaa;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px}
#toolbar button:hover{background:#383838;color:#fff}
#toolbar button.active{background:#3b82f6;border-color:#3b82f6;color:#fff}
#status{font-size:11px;color:#6b7280;white-space:nowrap}
#wrap{flex:1;overflow-y:auto}
table{width:100%;border-collapse:collapse}
thead{position:sticky;top:0;background:#1c1c1c;z-index:10}
th{text-align:left;padding:8px 12px;color:#777;font-size:10px;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #333}
tr:hover{background:#1a1a1a}
td{padding:6px 12px;border-bottom:1px solid #1e1e1e;vertical-align:top}
.ts{color:#666;font-size:11px;white-space:nowrap;font-family:monospace}
.lv{text-align:center}
.badge{padding:2px 6px;border-radius:3px;color:#fff;font-size:10px;font-weight:700;text-transform:uppercase}
.src{font-size:10px;color:#6b7280;text-transform:uppercase}
.msg{white-space:pre-wrap;word-break:break-word;font-family:'Consolas','Fira Mono',monospace;font-size:12px;color:#ccc}
.lv-error{background:#ef4444} .lv-warn{background:#f59e0b}
.lv-info{background:#3b82f6}  .lv-debug{background:#6b7280}
</style></head><body>
<div id="toolbar">
  <h1>📊 BX Finance — Live Log Viewer</h1>
  <select id="src"><option value="all">All Sources</option><option value="console">Console</option><option value="app">App</option><option value="vercel">Vercel</option></select>
  <select id="lvl"><option value="">All Levels</option><option value="error">Error</option><option value="warn">Warn</option><option value="info">Info</option><option value="debug">Debug</option></select>
  <input id="srch" placeholder="Search…" style="min-width:160px">
  <button id="pauseBtn">⏸ Pause</button>
  <button id="clearBtn">🗑 Clear</button>
  <span id="status">Loading…</span>
</div>
<div id="wrap"><table>
  <thead><tr><th style="width:105px">Time</th><th style="width:65px">Level</th><th style="width:70px">Source</th><th>Message</th></tr></thead>
  <tbody id="tbody"></tbody>
</table></div>
<script>
const API = '${origin}';
let paused = false, seen = new Set(), timer;
const tbody = document.getElementById('tbody');
const wrap  = document.getElementById('wrap');
const status= document.getElementById('status');

document.getElementById('pauseBtn').onclick = function(){
  paused = !paused;
  this.textContent = paused ? '▶ Resume' : '⏸ Pause';
  this.classList.toggle('active', paused);
};
document.getElementById('clearBtn').onclick = () => { tbody.innerHTML=''; seen.clear(); };
['src','lvl','srch'].forEach(id => document.getElementById(id).addEventListener('input', ()=>{ seen.clear(); tbody.innerHTML=''; fetch2(); }));

function ts(t){
  const d=new Date(t);
  return d.toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit',fractionalSecondDigits:3});
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function badge(lv){
  const l=(lv||'info').toLowerCase();
  return '<span class="badge lv-'+l+'">'+l.toUpperCase()+'</span>';
}

async function fetch2(){
  if(paused) return;
  const src=document.getElementById('src').value;
  const lvl=document.getElementById('lvl').value;
  const srch=document.getElementById('srch').value;
  const params=new URLSearchParams({limit:500,...(lvl&&{level:lvl}),...(srch&&{search:srch})});
  const sources = src==='all' ? ['console','app','vercel'] : [src];
  try {
    const results = await Promise.allSettled(sources.map(s=>fetch(API+'/api/logs/'+s+'?'+params).then(r=>r.ok?r.json():Promise.reject())));
    let logs=[];
    results.forEach((r,i)=>{ if(r.status==='fulfilled') (r.value.logs||[]).forEach(l=>logs.push({...l,_src:sources[i]})); });
    logs.sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));
    const atBottom = wrap.scrollHeight-wrap.scrollTop-wrap.clientHeight < 60;
    let added=0;
    logs.forEach(l=>{
      const key=l.timestamp+'|'+l.message;
      if(seen.has(key)) return;
      seen.add(key);
      added++;
      const msg=typeof l.message==='object'?JSON.stringify(l.message,null,2):(l.message||'');
      const tr=document.createElement('tr');
      tr.innerHTML='<td class="ts">'+ts(l.timestamp)+'</td><td class="lv">'+badge(l.level)+'</td><td class="src">'+(l._src||'—')+'</td><td class="msg">'+esc(msg)+'</td>';
      tbody.appendChild(tr);
    });
    if(added>0 && atBottom) wrap.scrollTop=wrap.scrollHeight;
    status.textContent='Last fetch: '+new Date().toLocaleTimeString()+' · '+seen.size+' entries';
  } catch(e){ status.textContent='Fetch error: '+e.message; }
}
fetch2();
timer = setInterval(fetch2, 4000);
</script></body></html>`);
  w.document.close();
}

export default LogViewer;
