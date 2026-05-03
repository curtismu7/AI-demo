// ThresholdControls.js
// Comprehensive "Demo Controls" widget with thresholds, feature flags, MFA/consent modes.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import './ThresholdControls.css';

export default function ThresholdControls() {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });
  const [confirm, setConfirm] = useState('');
  const [mfa, setMfa] = useState('');
  const [flags, setFlags] = useState([]);
  const [flagSaving, setFlagSaving] = useState(null);
  const [mayActEnabled, setMayActEnabled] = useState(null);
  const [mayActSaving, setMayActSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  const loadAll = useCallback(async () => {
    try {
      // Load thresholds
      const threshRes = await fetch('/api/config/thresholds', { credentials: 'include' });
      if (threshRes.ok) {
        const data = await threshRes.json();
        setConfirm(String(data.confirm_threshold_usd ?? 500));
        setMfa(String(data.mfa_threshold_usd ?? 500));
      }

      // Load feature flags
      const flagRes = await fetch('/api/admin/feature-flags', { credentials: 'include' });
      if (flagRes.ok) {
        const data = await flagRes.json();
        setFlags(data.flags || []);
      }

      // Load may_act status
      const mayActRes = await fetch('/api/demo/may-act', { credentials: 'include' });
      if (mayActRes.ok) {
        const data = await mayActRes.json();
        setMayActEnabled(data.enabled ?? null);
      }
    } catch (_) {
      // silent
    }
  }, []);

  useEffect(() => {
    if (open) loadAll();
  }, [open, loadAll]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      const inBtn = btnRef.current && btnRef.current.closest('.thresh-ctrl').contains(e.target);
      const inPanel = panelRef.current && panelRef.current.contains(e.target);
      if (!inBtn && !inPanel) setOpen(false);
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

  const saveThresholds = async () => {
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

  const toggleFlag = async (flagId, nextValue) => {
    setFlagSaving(flagId);
    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ updates: { [flagId]: nextValue } }),
      });
      if (res.ok) {
        const data = await res.json();
        const flagMap = new Map((data.flags || []).map((f) => [f.id, f]));
        setFlags((prev) => prev.map((f) => flagMap.get(f.id) || f));
      }
    } catch (_) {
      // error
    } finally {
      setFlagSaving(null);
    }
  };

  const toggleMayAct = async (nextBool) => {
    setMayActSaving(true);
    try {
      const res = await fetch('/api/demo/may-act', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: nextBool }),
      });
      if (res.ok) {
        const data = await res.json();
        setMayActEnabled(data.enabled);
      }
    } catch (_) {
      // error
    } finally {
      setMayActSaving(false);
    }
  };

  const panel = open ? createPortal(
    <div
      ref={panelRef}
      className="thresh-ctrl__panel"
      role="dialog"
      aria-label="Demo controls"
      style={{ top: panelPos.top, right: panelPos.right }}
    >
      <div className="thresh-ctrl__title">Demo Controls</div>

      {/* Thresholds */}
      <div className="thresh-ctrl__section">
        <div className="thresh-ctrl__section-title">Step-up Thresholds</div>
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
        <button
          type="button"
          className="thresh-ctrl__save"
          onClick={saveThresholds}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Thresholds'}
        </button>
        {status === 'saved' && <span className="thresh-ctrl__ok">✓ Saved</span>}
        {status === 'error' && <span className="thresh-ctrl__err">Error</span>}
      </div>

      {/* Feature Flags */}
      {flags.length > 0 && (
        <div className="thresh-ctrl__section">
          <div className="thresh-ctrl__section-title">Feature Flags</div>
          {flags.map((flag) => (
            <label key={flag.id} className="thresh-ctrl__checkbox">
              <input
                type="checkbox"
                checked={flag.value === true}
                onChange={(e) => toggleFlag(flag.id, e.target.checked)}
                disabled={flagSaving === flag.id}
              />
              <span>{flag.label || flag.id}</span>
            </label>
          ))}
        </div>
      )}

      {/* may_act Control */}
      {mayActEnabled !== null && (
        <div className="thresh-ctrl__section">
          <div className="thresh-ctrl__section-title">Token Exchange</div>
          <button
            type="button"
            className="thresh-ctrl__btn-toggle"
            onClick={() => toggleMayAct(!mayActEnabled)}
            disabled={mayActSaving}
          >
            {mayActSaving ? 'Saving…' : mayActEnabled ? '✅ Disable may_act' : '❌ Enable may_act'}
          </button>
        </div>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div className="thresh-ctrl">
      <button
        ref={btnRef}
        type="button"
        className="thresh-ctrl__toggle dashboard-toolbar-btn"
        title="Demo: Controls (thresholds, flags, MFA/consent)"
        aria-expanded={open}
        onClick={handleToggle}
      >
        ⚙️ Controls
      </button>
      {panel}
    </div>
  );
}
