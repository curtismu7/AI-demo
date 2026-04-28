// banking_api_ui/src/components/FeatureFlagsPage.js
import React, { useState, useEffect, useCallback } from 'react';
import '../styles/appShellPages.css';
import './FeatureFlagsPage.css';

// ─── Flag toggle card ─────────────────────────────────────────────────────────

function FlagCard({ flag, onToggle, saving }) {
  const isOn     = flag.value === true;
  const isSaving = saving === flag.id;
  const showWarn = (!isOn && flag.warnIfDisabled) || (isOn && flag.warnIfEnabled);
  const warnMsg  = flag.warnIfDisabled
    ? 'Disabling this flag may break transactions or reduce security.'
    : 'Enabling this flag may reduce security. Use with care.';

  return (
    <div className={`ff-card${isOn ? ' ff-card--on' : ''}${isSaving ? ' ff-card--saving' : ''}`}>
      <div className="ff-card__header">
        <div className="ff-card__meta">
          <span className={`ff-badge ${isOn ? 'ff-badge--on' : 'ff-badge--off'}`}>
            {isOn ? 'ENABLED' : 'DISABLED'}
          </span>
          <h3 className="ff-card__name">{flag.name}</h3>
          <code className="ff-card__id">{flag.id}</code>
        </div>

        <button
          type="button"
          className={`ff-toggle${isOn ? ' ff-toggle--on' : ''}${isSaving ? ' ff-toggle--saving' : ''}`}
          onClick={() => onToggle(flag.id, !isOn)}
          disabled={isSaving}
          aria-label={`${isOn ? 'Disable' : 'Enable'} ${flag.name}`}
          aria-pressed={isOn}
        >
          <span className="ff-toggle__thumb" />
        </button>
      </div>

      <p className="ff-card__desc">{flag.description}</p>

      {flag.impact && (
        <p className="ff-card__impact-inline">
          <span className="ff-card__impact-label">Impact</span>
          {flag.impact}
        </p>
      )}

      {showWarn && (
        <div className="ff-card__warn">⚠️ {warnMsg}</div>
      )}

      <div className="ff-card__footer">
        {flag.docsUrl && (
          <a
            href={flag.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ff-card__docs-link"
          >
            PingOne docs ↗
          </a>
        )}
        {isSaving && <span className="ff-card__saving">Saving…</span>}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FeatureFlagsPage() {
  const [flags,      setFlags]      = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [saving,     setSaving]     = useState(null);
  const [lastSaved,  setLastSaved]  = useState(null);

  /** Auto-dismiss the save toast after 2.5 s */
  useEffect(() => {
    if (!lastSaved) return;
    const t = setTimeout(() => setLastSaved(null), 2500);
    return () => clearTimeout(t);
  }, [lastSaved]);

  const loadFlags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/admin/feature-flags', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setFlags(data.flags || []);
      setCategories(data.categories || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFlags(); }, [loadFlags]);

  const handleToggle = useCallback(async (flagId, newValue) => {
    setSaving(flagId);
    setFlags(prev => prev.map(f => f.id === flagId ? { ...f, value: newValue } : f));
    try {
      const res  = await fetch('/api/admin/feature-flags', {
        method:      'PATCH',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ updates: { [flagId]: newValue } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setFlags(prev => prev.map(f => {
        const confirmed = data.flags?.find(u => u.id === f.id);
        return confirmed ? { ...f, value: confirmed.value } : f;
      }));
      setLastSaved({ flagId, timestamp: Date.now() });
    } catch (err) {
      setFlags(prev => prev.map(f => f.id === flagId ? { ...f, value: !newValue } : f));
      setError(`Failed to save "${flagId}": ${err.message}`);
    } finally {
      setSaving(null);
    }
  }, []);

  const groupedFlags  = categories.map(cat => ({ category: cat, flags: flags.filter(f => f.category === cat) }));
  const enabledCount  = flags.filter(f => f.value === true).length;
  const disabledCount = flags.filter(f => f.value === false).length;

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div className="app-page-header__left">
          <h1 className="app-page-title">Feature Flags</h1>
          <p className="app-page-subtitle">
            Toggle in-development features without a redeploy. Changes persist immediately.
          </p>
        </div>
        <div className="ff-page-stats">
          <span className="ff-stat ff-stat--on">{enabledCount} enabled</span>
          <span className="ff-stat ff-stat--off">{disabledCount} disabled</span>
          <button
            type="button"
            className="app-page-toolbar-btn"
            onClick={loadFlags}
            disabled={loading}
            title="Refresh flags from server"
          >
            {loading ? '…' : '↺ Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="ff-error" role="alert">
          <strong>Error:</strong> {error}
          <button type="button" className="ff-error__dismiss" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {lastSaved && (
        <div className="ff-saved-toast" key={lastSaved.timestamp}>
          ✅ <strong>{lastSaved.flagId}</strong> saved
        </div>
      )}

      {loading && flags.length === 0 ? (
        <div className="ff-loading">Loading feature flags…</div>
      ) : (
        <div className="ff-groups">
          {groupedFlags.map(({ category, flags: catFlags }) => (
            <section key={category} className="ff-group">
              <div className="ff-group__header">
                <h2 className="ff-group__title">{category}</h2>
                <span className="ff-group__count">
                  {catFlags.filter(f => f.value).length}/{catFlags.length} enabled
                </span>
              </div>
              <div className="ff-group__cards">
                {catFlags.map(flag => (
                  <FlagCard
                    key={flag.id}
                    flag={flag}
                    onToggle={handleToggle}
                    saving={saving}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="ff-footer">
        <p>
          Flags are persisted in the server configuration store and survive restarts.
          Some flags (e.g. <strong>PingOne Authorize</strong>) also require related settings on the{' '}
          <a href="/config">Config page</a> to take full effect.
        </p>
      </div>
    </div>
  );
}
