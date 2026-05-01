import React, { useState, useEffect, useRef } from 'react';
import './RunServersModal.css';

export default function RunServersModal({ onClose }) {
  const [status, setStatus] = useState('confirm'); // confirm | starting | up | already_running | error
  const pollRef = useRef(null);

  // Stop polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function startPolling() {
    // Poll /api/healthz every 2s — when it responds the servers are back up
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch('/api/healthz', { credentials: 'include' });
        if (r.ok) {
          clearInterval(pollRef.current);
          setStatus('up');
        }
      } catch (_) {
        // still down — keep polling
      }
    }, 2000);
  }

  async function handleConfirm() {
    setStatus('starting');
    try {
      const res = await fetch('/api/dev/run-servers', { method: 'POST', credentials: 'include' });
      if (res.status === 409) { setStatus('already_running'); return; }
      if (!res.ok) { setStatus('error'); return; }
      // 202 accepted — start polling for the server to come back
      startPolling();
    } catch (_) {
      setStatus('error');
    }
  }

  return (
    <div className="rsm-overlay" role="dialog" aria-modal="true">
      <div className="rsm-box">
        <div className="rsm-header">
          <span className="rsm-title">▶ Run Servers</span>
          <button type="button" className="rsm-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="rsm-body">
          {status === 'confirm' && (
            <>
              <p>This will stop and restart all banking demo servers.</p>
              <p className="rsm-note">The page will show a link when servers are ready.</p>
              <div className="rsm-actions">
                <button type="button" className="rsm-btn rsm-btn--primary" onClick={handleConfirm}>Yes, restart</button>
                <button type="button" className="rsm-btn rsm-btn--secondary" onClick={onClose}>Cancel</button>
              </div>
            </>
          )}
          {status === 'starting' && (
            <p className="rsm-waiting">⏳ Restarting servers, please wait…</p>
          )}
          {status === 'up' && (
            <>
              <p>✅ Servers are up!</p>
              <div className="rsm-actions">
                <a
                  href={window.location.origin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rsm-btn rsm-btn--primary"
                >
                  Open App ↗
                </a>
                <button type="button" className="rsm-btn rsm-btn--secondary" onClick={onClose}>Close</button>
              </div>
            </>
          )}
          {status === 'already_running' && (
            <>
              <p>⚠ Already starting, please wait.</p>
              <div className="rsm-actions">
                <button type="button" className="rsm-btn rsm-btn--secondary" onClick={onClose}>Close</button>
              </div>
            </>
          )}
          {status === 'error' && (
            <>
              <p>❌ Could not reach the server. Check the console.</p>
              <div className="rsm-actions">
                <button type="button" className="rsm-btn rsm-btn--secondary" onClick={onClose}>Close</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
