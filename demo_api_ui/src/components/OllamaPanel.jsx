// demo_api_ui/src/components/OllamaPanel.jsx
import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../services/apiClient';
import { notifySuccess, notifyError } from '../utils/appToast';

export default function OllamaPanel() {
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [status, setStatus] = useState(null); // 'available' | 'unreachable' | null
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const res = await apiClient.get('/api/langchain/provider/ollama/status');
      setStatus(res.data?.status ?? null);
    } catch {
      setStatus('unreachable');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.post('/api/langchain/config', { ollama_base_url: baseUrl });
      notifySuccess('Ollama URL saved');
      await checkStatus();
    } catch (err) {
      notifyError(`Failed to save Ollama URL: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const statusColor =
    status === 'available' ? '#166534' :
    status === 'unreachable' ? '#991b1b' :
    '#92400e';

  const statusBg =
    status === 'available' ? '#dcfce7' :
    status === 'unreachable' ? '#fecaca' :
    '#fef3c7';

  const statusLabel =
    status === 'available' ? '✅ Reachable' :
    status === 'unreachable' ? '❌ Unreachable' :
    checking ? '…' : '⚠️ Unknown';

  const codeStyle = {
    display: 'block',
    background: '#f3f4f6',
    border: '1px solid #e5e7eb',
    borderRadius: 4,
    padding: '0.5rem 0.75rem',
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    color: '#1f2937',
    userSelect: 'all',
  };

  return (
    <div style={{ padding: '1.5rem' }}>
      <h3>Ollama Configuration</h3>
      <p style={{ marginBottom: '1.25rem', color: '#666', fontSize: '0.9rem' }}>
        Ollama runs open-source models locally — no API key required.
      </p>

      {/* Install instructions — shown when Ollama is unreachable or unknown */}
      {status !== 'available' && (
        <div style={{
          marginBottom: '1.5rem',
          padding: '1rem 1.25rem',
          background: '#fafafa',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
        }}>
          <p style={{ margin: '0 0 0.75rem', fontWeight: 600, fontSize: '0.9rem' }}>
            Getting started with Ollama
          </p>
          <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: '#374151', lineHeight: 1.7 }}>
            <li>
              Download and install Ollama from{' '}
              <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>
                ollama.com/download
              </a>
              {' '}(macOS, Linux, Windows)
            </li>
            <li>
              Start the Ollama server — it starts automatically after install, or run:
              <code style={{ ...codeStyle, marginTop: '0.4rem' }}>ollama serve</code>
            </li>
            <li>
              Pull a model to use with the agent (recommended — fast and capable):
              <code style={{ ...codeStyle, marginTop: '0.4rem' }}>ollama pull llama3.2</code>
              <span style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginTop: '0.25rem' }}>
                Other options: <code style={{ fontFamily: 'monospace' }}>mistral</code>, <code style={{ fontFamily: 'monospace' }}>gemma2</code>, <code style={{ fontFamily: 'monospace' }}>phi3</code>
              </span>
            </li>
            <li>Click <strong>Test</strong> below to confirm Ollama is reachable, then <strong>Save</strong>.</li>
          </ol>
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <span style={{
          display: 'inline-block',
          padding: '0.25rem 0.75rem',
          borderRadius: 6,
          fontSize: '0.85rem',
          fontWeight: 500,
          backgroundColor: statusBg,
          color: statusColor,
        }}>
          {statusLabel}
        </span>
      </div>

      <div style={{ marginBottom: '1rem', maxWidth: 480 }}>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.35rem' }}>
          Ollama Base URL
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder="http://localhost:11434"
            style={{
              flex: 1,
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              fontSize: '0.9rem',
            }}
          />
          <button
            onClick={handleSave}
            disabled={saving || !baseUrl}
            style={{
              padding: '0.5rem 1rem',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving || !baseUrl ? 0.6 : 1,
              fontSize: '0.9rem',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={checkStatus}
            disabled={checking}
            style={{
              padding: '0.5rem 1rem',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              cursor: checking ? 'not-allowed' : 'pointer',
              opacity: checking ? 0.6 : 1,
              fontSize: '0.9rem',
            }}
          >
            {checking ? '…' : 'Test'}
          </button>
        </div>
        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.35rem' }}>
          Default: http://localhost:11434
        </div>
      </div>
    </div>
  );
}
