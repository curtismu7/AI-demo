import React, { useState } from 'react';
import './RunServersModal.css';

export default function RunServersModal({ onClose }) {
  const [status, setStatus] = useState('confirm'); // 'confirm' | 'starting' | 'already_running' | 'error'

  async function handleConfirm() {
    setStatus('starting');
    try {
      const res = await fetch('/api/dev/run-servers', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.status === 409) { setStatus('already_running'); return; }
      if (!res.ok) { setStatus('error'); return; }
      // 202 — servers restarting, run-bank.sh will open a new tab when ready
      onClose();
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
              <p className="rsm-note">A new browser tab will open automatically when the servers are ready.</p>
              <div className="rsm-actions">
                <button type="button" className="rsm-btn rsm-btn--primary" onClick={handleConfirm}>Yes, restart</button>
                <button type="button" className="rsm-btn rsm-btn--secondary" onClick={onClose}>Cancel</button>
              </div>
            </>
          )}
          {status === 'starting' && <p>⏳ Restarting servers — a new tab will open when ready.</p>}
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
              <p>❌ Could not contact the server. Check the console.</p>
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
