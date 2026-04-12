import React, { useState } from 'react';
import './TokenDisplay.css';

/**
 * DecodedTokenPanel — Renders pre-decoded JWT claims from BFF server response.
 * Accepts { header, payload } directly — no token value needed, no API call.
 * @param {{ decoded: { header: object, payload: object } | null, label: string }} props
 */
export default function DecodedTokenPanel({ decoded, label }) {
  const [expanded, setExpanded] = useState(false);

  if (!decoded) return null;

  const { header = {}, payload = {} } = decoded;

  const formatTs = (ts) => {
    if (!ts) return '—';
    try {
      return new Date(ts * 1000).toLocaleString();
    } catch {
      return String(ts);
    }
  };

  const fmtScope = (scope) => {
    if (!scope) return null;
    const scopes = typeof scope === 'string' ? scope.split(' ') : scope;
    return scopes.map((s) => (
      <span key={s} className="decoded-scope-badge">{s}</span>
    ));
  };

  const KEY_CLAIMS = ['sub', 'aud', 'iss', 'act', 'may_act', 'env', 'org'];

  return (
    <div className="token-display decoded-token-panel">
      <div
        className="token-display-header"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="token-display-label">🔍 {label} — Decoded Claims</span>
        <span className="token-display-toggle">{expanded ? '▲ hide' : '▼ show'}</span>
      </div>

      {expanded && (
        <div className="decoded-token-body">
          {/* Algorithm / Type row */}
          <div className="decoded-section">
            <div className="decoded-section-title">Header</div>
            <div className="decoded-claims-row">
              {header.alg && <span className="decoded-badge decoded-badge--alg">{header.alg}</span>}
              {header.typ && <span className="decoded-badge decoded-badge--typ">{header.typ}</span>}
              {header.kid && (
                <span className="decoded-kv">
                  <span className="decoded-key">kid:</span>
                  <span className="decoded-val decoded-val--mono">{header.kid}</span>
                </span>
              )}
            </div>
          </div>

          {/* Key identity claims */}
          <div className="decoded-section">
            <div className="decoded-section-title">Identity</div>
            {KEY_CLAIMS.filter((k) => payload[k]).map((k) => (
              <div key={k} className="decoded-kv">
                <span className="decoded-key">{k}:</span>
                <span className="decoded-val decoded-val--mono">
                  {typeof payload[k] === 'object'
                    ? JSON.stringify(payload[k])
                    : String(payload[k])}
                </span>
              </div>
            ))}
          </div>

          {/* Scopes */}
          {payload.scope && (
            <div className="decoded-section">
              <div className="decoded-section-title">Scopes</div>
              <div className="decoded-scopes">{fmtScope(payload.scope)}</div>
            </div>
          )}

          {/* Timing */}
          <div className="decoded-section">
            <div className="decoded-section-title">Timing</div>
            {payload.iat && (
              <div className="decoded-kv">
                <span className="decoded-key">issued:</span>
                <span className="decoded-val">{formatTs(payload.iat)}</span>
              </div>
            )}
            {payload.exp && (
              <div className="decoded-kv">
                <span className="decoded-key">expires:</span>
                <span className="decoded-val">{formatTs(payload.exp)}</span>
              </div>
            )}
          </div>

          {/* Full payload (raw) */}
          <div className="decoded-section decoded-section--raw">
            <details>
              <summary className="decoded-raw-toggle">Raw payload JSON</summary>
              <pre className="decoded-raw">{JSON.stringify(payload, null, 2)}</pre>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
