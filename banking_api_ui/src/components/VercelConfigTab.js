import React, { useState, useEffect, useCallback } from 'react';
import '../styles/VercelConfig.css';

// ─── Category detection ───────────────────────────────────────────────────────
const APP_KEYS = new Set([
  'FRONTEND_URL', 'SESSION_SECRET', 'PUBLIC_APP_URL', 'VERCEL_URL',
  'NODE_ENV', 'PORT',
]);

function getCategory(key) {
  if (key.startsWith('PINGONE_AUTHORIZE_') || key.startsWith('AUTHORIZE_')) return 'PingOne Authorize';
  if (key.startsWith('PINGONE_')) return 'PingOne';
  if (key.startsWith('MCP_') || key.includes('MCP')) return 'MCP Server';
  if (key.startsWith('CIBA_') || key.startsWith('STEP_UP_')) return 'Step-Up / CIBA';
  if (APP_KEYS.has(key)) return 'App';
  return 'Other';
}

const CATEGORY_ORDER = ['PingOne', 'PingOne Authorize', 'MCP Server', 'Step-Up / CIBA', 'App', 'Other'];

// ─── VarRow sub-component ─────────────────────────────────────────────────────
function VarRow({ v, editValue, onEditChange, savingState, onSave }) {
  const isSecret = v.type === 'secret' || v.type === 'encrypted';

  if (isSecret) {
    return (
      <tr>
        <td className="vc-tab__key">{v.key}</td>
        <td>
          <span className="vc-tab__secret-badge">
            {v.hasValue ? '🔒 set' : '⚠ not set'}
          </span>
        </td>
        <td className="vc-tab__action-cell">
          <a
            href="https://vercel.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="vc-tab__vercel-link"
          >
            Manage in Vercel ↗
          </a>
        </td>
      </tr>
    );
  }

  const status = savingState || 'idle';

  return (
    <tr>
      <td className="vc-tab__key">{v.key}</td>
      <td>
        <input
          type="text"
          value={editValue}
          onChange={(e) => onEditChange(v.key, e.target.value)}
          className="vc-tab__input"
          aria-label={`Value for ${v.key}`}
        />
      </td>
      <td className="vc-tab__action-cell">
        {status === 'idle' && (
          <button className="vc-tab__save-btn" onClick={() => onSave(v.key)}>
            Save
          </button>
        )}
        {status === 'saving' && (
          <button className="vc-tab__save-btn vc-tab__save-btn--saving" disabled>
            Saving…
          </button>
        )}
        {status === 'success' && (
          <span className="vc-tab__status vc-tab__status--ok">✓ Saved</span>
        )}
        {status === 'error' && (
          <span className="vc-tab__status vc-tab__status--err">⚠ Failed</span>
        )}
      </td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function VercelConfigTab() {
  const [vars, setVars]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [saving, setSaving]   = useState({}); // key → 'idle'|'saving'|'success'|'error'
  const [edits, setEdits]     = useState({}); // key → pending string value

  const fetchVars = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/vercel-config', { credentials: 'include' });
      const data = await res.json();
      if (!data.ok) {
        setError(data.message || 'Failed to load Vercel environment variables.');
        return;
      }
      setVars(data.vars || []);
      // Seed edit state with current plain values
      const seeds = {};
      for (const v of (data.vars || [])) {
        if (v.type !== 'secret' && v.type !== 'encrypted') {
          seeds[v.key] = v.value || '';
        }
      }
      setEdits(seeds);
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVars(); }, [fetchVars]);

  const handleEditChange = (key, value) => {
    setEdits((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (key) => {
    setSaving((prev) => ({ ...prev, [key]: 'saving' }));
    try {
      const res = await fetch(`/api/admin/vercel-config/${encodeURIComponent(key)}`, {
        method:      'PATCH',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ value: edits[key] || '' }),
      });
      const data = await res.json();
      if (data.ok) {
        setSaving((prev) => ({ ...prev, [key]: 'success' }));
        setTimeout(() => setSaving((prev) => ({ ...prev, [key]: 'idle' })), 3000);
      } else {
        setSaving((prev) => ({ ...prev, [key]: 'error' }));
        setTimeout(() => setSaving((prev) => ({ ...prev, [key]: 'idle' })), 4000);
      }
    } catch {
      setSaving((prev) => ({ ...prev, [key]: 'error' }));
      setTimeout(() => setSaving((prev) => ({ ...prev, [key]: 'idle' })), 4000);
    }
  };

  if (loading) {
    return <div className="vc-tab__loading">Loading Vercel environment variables…</div>;
  }

  if (error) {
    return (
      <div className="vc-tab__error">
        <p>{error}</p>
        <button className="vc-tab__retry-btn" onClick={fetchVars}>Retry</button>
      </div>
    );
  }

  // Group vars by category
  const grouped = {};
  for (const v of vars) {
    const cat = getCategory(v.key);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(v);
  }

  const categories = CATEGORY_ORDER.filter((c) => grouped[c]);

  return (
    <div className="vc-tab">
      <p className="vc-tab__description">
        Environment variables for this Vercel project. <strong>Secret</strong> values are never shown — manage them in the
        {' '}<a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer">Vercel Dashboard</a>.
        Changes to plain variables take effect on the next deployment or function invocation.
      </p>

      {categories.map((cat) => (
        <section key={cat}>
          <h3 className="vc-tab__category">{cat}</h3>
          <table className="vc-tab__table">
            <thead>
              <tr>
                <th>Variable</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {grouped[cat].map((v) => (
                <VarRow
                  key={v.key}
                  v={v}
                  editValue={edits[v.key] ?? ''}
                  onEditChange={handleEditChange}
                  savingState={saving[v.key]}
                  onSave={handleSave}
                />
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {vars.length === 0 && (
        <div className="vc-tab__loading">No environment variables found for this project.</div>
      )}
    </div>
  );
}
