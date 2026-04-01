// banking_api_ui/src/components/ExchangeModeToggle.js
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './ExchangeModeToggle.css';

const LABELS = {
  single: { short: '1-Exchange', full: 'Subject Token → MCP Token (act claim)', rfc: 'RFC 8693 §2.1' },
  double: { short: '2-Exchange', full: 'Subject → Agent → MCP Token (nested act)', rfc: 'RFC 8693 chained' },
};

export default function ExchangeModeToggle() {
  const [mode, setMode] = useState('single');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    axios.get('/api/mcp/exchange-mode')
      .then(r => setMode(r.data.mode === 'double' ? 'double' : 'single'))
      .catch(() => {}); // silent — dashboard still works without this enhancement
  }, []);

  const toggle = useCallback(async (target) => {
    if (target === mode || loading) return;
    setLoading(true);
    try {
      const r = await axios.post('/api/mcp/exchange-mode', { mode: target });
      setMode(r.data.mode);
    } catch (_) {
      // silent failure — the next tool call will use whichever mode the BFF has
    } finally {
      setLoading(false);
    }
  }, [mode, loading]);

  const active = LABELS[mode];

  return (
    <div className="emt-root">
      <div className="emt-header">
        <span className="emt-label">Token Exchange Mode</span>
        <span className="emt-rfc">{active.rfc}</span>
      </div>
      <div className="emt-pills">
        {['single', 'double'].map(m => (
          <button
            key={m}
            type="button"
            className={`emt-pill${mode === m ? ' emt-pill--active' : ''}${loading ? ' emt-pill--loading' : ''}`}
            onClick={() => toggle(m)}
            disabled={loading}
            aria-pressed={mode === m}
          >
            {LABELS[m].short}
          </button>
        ))}
      </div>
      <p className="emt-desc">{active.full}</p>
    </div>
  );
}
