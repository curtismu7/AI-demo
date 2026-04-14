import React, { useState, useEffect } from 'react';
import '../styles/appShellPages.css';

/**
 * ScopeReferencePage — Renders SCOPE_VOCABULARY.md from the BFF
 * as a preformatted reference document for admins / developers.
 */
export default function ScopeReferencePage() {
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/scope-vocabulary', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (!cancelled) setMarkdown(data.markdown);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="app-shell-page">
      <h2>Scope Vocabulary Reference</h2>
      <p className="app-shell-page-subtitle">
        Canonical scope registry — single source of truth for PingOne resource scopes.
      </p>

      {loading && <p>Loading scope vocabulary…</p>}
      {error && <p className="text-danger">Error: {error}</p>}
      {!loading && !error && (
        <pre style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          background: 'var(--bg-secondary, #f5f5f5)',
          padding: '1rem',
          borderRadius: '8px',
          fontSize: '0.85rem',
          lineHeight: '1.5',
          maxHeight: '75vh',
          overflow: 'auto',
        }}>
          {markdown}
        </pre>
      )}
    </div>
  );
}
