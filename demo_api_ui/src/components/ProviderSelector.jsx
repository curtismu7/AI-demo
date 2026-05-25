// demo_api_ui/src/components/ProviderSelector.jsx

/**
 * ProviderSelector — two-button strip: Helix | LM Studio
 *
 * Props:
 *   provider: 'helix' | 'anthropic-lmstudio'
 *   onSelect: (provider: string) => void
 *   helixStatus:    'available' | 'unconfigured' | 'unreachable' | null
 *   lmstudioStatus: 'available' | 'unreachable' | null
 */
export default function ProviderSelector({ provider, onSelect, helixStatus, lmstudioStatus }) {
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
      s === 'available'    ? '#166534' :
      s === 'unconfigured' ? '#92400e' :
      s === 'unreachable'  ? '#991b1b' :
      '#6b7280',
  });

  return (
    <div style={{ padding: '1.5rem 1.5rem 0' }}>
      <h3 style={{ marginBottom: '0.75rem' }}>LLM Provider</h3>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" style={btnStyle('helix')} onClick={() => onSelect('helix')}>
          <span>Helix</span>
          {helixStatus && <span style={pillStyle(helixStatus)}>{statusLabel(helixStatus)}</span>}
        </button>

        <button type="button" style={btnStyle('anthropic-lmstudio')} onClick={() => onSelect('anthropic-lmstudio')}>
          <span>LM Studio</span>
          <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>Anthropic API</span>
          {lmstudioStatus && <span style={pillStyle(lmstudioStatus)}>{statusLabel(lmstudioStatus)}</span>}
        </button>
      </div>
    </div>
  );
}
