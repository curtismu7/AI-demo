// ThresholdControls.js
// Compact "Demo Controls" widget for adjusting step-up thresholds at runtime.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import './ThresholdControls.css';

export default function ThresholdControls() {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });
  const [confirm, setConfirm] = useState('');
  const [mfa, setMfa] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // 'saved' | 'error'
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  const loadThresholds = useCallback(async () => {
    try {
      const res = await fetch('/api/config/thresholds', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setConfirm(String(data.confirm_threshold_usd ?? 500));
      setMfa(String(data.mfa_threshold_usd ?? 500));
    } catch (_) {
      // silent — not critical
    }
  }, []);

  useEffect(() => {
    if (open) loadThresholds();
  }, [open, loadThresholds]);

  // Close on outside click — must check both the button container AND the portalled panel
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      const inBtn = btnRef.current && btnRef.current.closest('.thresh-ctrl').contains(e.target);
      const inPanel = panelRef.current && panelRef.current.contains(e.target);
      if (!inBtn && !inPanel) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPanelPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen((p) => !p);
  };

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const body = {};
      if (confirm) body.confirm_threshold_usd = Number(confirm);
      if (mfa) body.mfa_threshold_usd = Number(mfa);
      const res = await fetch('/api/config/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setConfirm(String(data.confirm_threshold_usd));
        setMfa(String(data.mfa_threshold_usd));
        setStatus('saved');
        setTimeout(() => setStatus(null), 2000);
      } else {
        setStatus('error');
      }
    } catch (_) {
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const panel = open ? createPortal(
    <div
      ref={panelRef}
      className="thresh-ctrl__panel"
      role="dialog"
      aria-label="Step-up thresholds"
      style={{ top: panelPos.top, right: panelPos.right }}
    >
      <div className="thresh-ctrl__title">Step-up Thresholds</div>

      <label className="thresh-ctrl__label">
        Confirm (consent) $
        <input
          className="thresh-ctrl__input"
          type="number"
          min="1"
          step="50"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>

      <label className="thresh-ctrl__label">
        MFA step-up $
        <input
          className="thresh-ctrl__input"
          type="number"
          min="1"
          step="50"
          value={mfa}
          onChange={(e) => setMfa(e.target.value)}
        />
      </label>

      <div className="thresh-ctrl__actions">
        <button
          type="button"
          className="thresh-ctrl__save"
          onClick={save}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {status === 'saved' && <span className="thresh-ctrl__ok">✓ Saved</span>}
        {status === 'error' && <span className="thresh-ctrl__err">Error</span>}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="thresh-ctrl">
      <button
        ref={btnRef}
        type="button"
        className="thresh-ctrl__toggle dashboard-toolbar-btn"
        title="Demo: Step-up thresholds"
        aria-expanded={open}
        onClick={handleToggle}
      >
        $ Thresholds
      </button>
      {panel}
    </div>
  );
}
