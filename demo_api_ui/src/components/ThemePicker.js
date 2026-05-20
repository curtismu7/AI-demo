// banking_api_ui/src/components/ThemePicker.js
// Server-wide theme switcher. Same PUT /api/config/vertical path as the admin
// Config UI (single source of truth). variant: 'toolbar' | 'config'.
import React, { useEffect, useState } from 'react';
import './ThemePicker.css';
import { useTheme } from '../context/ThemeContext';

export default function ThemePicker({ variant = 'toolbar' }) {
  const { themeId, switchTheme } = useTheme();
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/config/verticals/list', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { verticals: [] }))
      .then((d) => { if (!cancelled) setList(d.verticals || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const onChange = async (e) => {
    const id = e.target.value;
    setBusy(true);
    setErr(null);
    try {
      await switchTheme(id);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  if (!list.length) return null;

  return (
    <div className={`theme-picker theme-picker--${variant}`}>
      <label className="theme-picker__label" htmlFor="theme-picker-select">
        Theme
      </label>
      <select
        id="theme-picker-select"
        className="theme-picker__select"
        value={themeId || ''}
        onChange={onChange}
        disabled={busy}
      >
        {list.map((v) => (
          <option key={v.id} value={v.id}>{v.displayName}</option>
        ))}
      </select>
      {err ? <span className="theme-picker__err">{err}</span> : null}
    </div>
  );
}
