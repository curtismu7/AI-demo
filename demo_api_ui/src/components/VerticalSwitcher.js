// banking_api_ui/src/components/VerticalSwitcher.js
import React, { useState, useEffect } from 'react';
import { useVertical } from '../vertical/useVertical';
import './VerticalSwitcher.css';

/**
 * Dropdown/pill selector for switching between demo verticals (Banking, Retail, Workforce).
 * Can be placed in the top nav or on the Config page.
 */
export default function VerticalSwitcher({ variant = 'nav' }) {
  const { activeId } = useVertical();
  const [verticals, setVerticals] = useState([]);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    // GET /api/verticals/list returns a plain array of { id, displayName }.
    fetch('/api/verticals/list', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setVerticals(Array.isArray(data) ? data : []))
      .catch(() => {});
    // Re-fetch on vertical-list-changed (clone / delete) so the switcher stays
    // in sync without a full reload.
    const onListChanged = () => {
      fetch('/api/verticals/list', { credentials: 'include' })
        .then(r => r.ok ? r.json() : [])
        .then(data => setVerticals(Array.isArray(data) ? data : []))
        .catch(() => {});
    };
    window.addEventListener('vertical-list-changed', onListChanged);
    return () => window.removeEventListener('vertical-list-changed', onListChanged);
  }, []);

  const handleSwitch = async (id) => {
    if (id === activeId || switching) return;
    setSwitching(true);
    try {
      await fetch('/api/verticals/active', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch {
      // ignore
    } finally {
      setSwitching(false);
    }
  };

  if (verticals.length < 2) return null;

  if (variant === 'config') {
    return (
      <div className="vertical-switcher vertical-switcher--config">
        <div className="vertical-switcher__pills">
          {verticals.map(v => (
            <button
              type="button"
              key={v.id}
              className={`vertical-switcher__pill${v.id === activeId ? ' vertical-switcher__pill--active' : ''}`}
              onClick={() => handleSwitch(v.id)}
              disabled={switching}
              style={v.id === activeId && v.theme?.primary ? { borderColor: v.theme.primary, background: `${v.theme.primary}10` } : undefined}
            >
              <span
                className="vertical-switcher__dot"
                style={{ background: v.theme?.primary || '#6b7280' }}
              />
              <span className="vertical-switcher__label">{v.displayName}</span>
              <span className="vertical-switcher__tagline">{v.tagline}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Nav variant — compact dropdown
  return (
    <div className="vertical-switcher vertical-switcher--nav">
      <select
        className="vertical-switcher__select"
        value={activeId || 'banking'}
        onChange={(e) => handleSwitch(e.target.value)}
        disabled={switching}
        aria-label="Switch demo vertical"
      >
        {verticals.map(v => (
          <option key={v.id} value={v.id}>{v.displayName}</option>
        ))}
      </select>
    </div>
  );
}
