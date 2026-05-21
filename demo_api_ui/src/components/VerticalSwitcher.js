// banking_api_ui/src/components/VerticalSwitcher.js
import React, { useState, useEffect } from 'react';
import { useVertical } from '../context/VerticalContext';
import './VerticalSwitcher.css';

/**
 * Dropdown/pill selector for switching between demo verticals (Banking, Retail, Workforce).
 * Can be placed in the top nav or on the Config page.
 */
export default function VerticalSwitcher({ variant = 'nav' }) {
  const { vertical, switchVertical } = useVertical();
  const [verticals, setVerticals] = useState([]);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    fetch('/api/config/verticals/list', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { verticals: [] })
      .then(data => setVerticals(data.verticals || []))
      .catch(() => {});
  }, []);

  const handleSwitch = async (id) => {
    if (id === vertical?.id || switching) return;
    setSwitching(true);
    try {
      await switchVertical(id);
    } catch {
      // error is set in context
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
              className={`vertical-switcher__pill${v.id === vertical?.id ? ' vertical-switcher__pill--active' : ''}`}
              onClick={() => handleSwitch(v.id)}
              disabled={switching}
              style={v.id === vertical?.id && v.theme?.primary ? { borderColor: v.theme.primary, background: `${v.theme.primary}10` } : undefined}
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
        value={vertical?.id || 'banking'}
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
