// demo_api_ui/src/components/ProviderSelector.jsx
import React from 'react';

/**
 * ProviderSelector — two-button strip: Helix (default) | Ollama
 *
 * Props:
 *   provider: 'helix' | 'ollama'       — currently active provider
 *   onSelect: (provider: string) => void — called when user clicks a button
 *   helixStatus: string | null          — 'available' | 'unconfigured' | null
 *   ollamaStatus: string | null         — 'available' | 'unreachable' | null
 */
export default function ProviderSelector({ provider, onSelect, helixStatus, ollamaStatus }) {
  const statusLabel = (s) => {
    if (s === 'available') return '✅ Active';
    if (s === 'unconfigured') return '⚠️ Unconfigured';
    if (s === 'unreachable') return '❌ Unreachable';
    return '';
  };

  const btnStyle = (name) => ({
    padding: '0.5rem 1.25rem',
    border: provider === name ? '2px solid #3b82f6' : '1px solid #d1d5db',
    borderRadius: 6,
    background: provider === name ? '#eff6ff' : '#fff',
    color: provider === name ? '#1d4ed8' : '#374151',
    fontWeight: provider === name ? 600 : 400,
    cursor: 'pointer',
    fontSize: '0.9rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '0.2rem',
    minWidth: 140,
  });

  const pillStyle = (s) => ({
    fontSize: '0.75rem',
    color:
      s === 'available' ? '#166534' :
      s === 'unconfigured' ? '#92400e' :
      s === 'unreachable' ? '#991b1b' :
      '#6b7280',
  });

  return (
    <div style={{ padding: '1.5rem 1.5rem 0' }}>
      <h3 style={{ marginBottom: '0.75rem' }}>LLM Provider</h3>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button style={btnStyle('helix')} onClick={() => onSelect('helix')}>
          <span>Helix</span>
          {helixStatus && (
            <span style={pillStyle(helixStatus)}>{statusLabel(helixStatus)}</span>
          )}
        </button>
        <button style={btnStyle('ollama')} onClick={() => onSelect('ollama')}>
          <span>Ollama</span>
          {ollamaStatus && (
            <span style={pillStyle(ollamaStatus)}>{statusLabel(ollamaStatus)}</span>
          )}
        </button>
      </div>
    </div>
  );
}
