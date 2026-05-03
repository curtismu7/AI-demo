import React, { useState, useCallback, useEffect } from 'react';
import apiClient from '../services/apiClient';
import { notifySuccess, notifyError } from '../utils/appToast';

export default function HelixPanel() {
  const [helixConfig, setHelixConfig] = useState({ base_url: '', api_key: '', environment_id: '', agent_id: '' });
  const [helixStatus, setHelixStatus] = useState(null);
  const [helixSaving, setHelixSaving] = useState(false);
  const [helixChecking, setHelixChecking] = useState(false);

  const fetchHelixStatus = useCallback(async () => {
    setHelixChecking(true);
    try {
      const statusRes = await apiClient.get('/api/langchain/provider/helix/status');
      setHelixStatus(statusRes.data.status);

      const configRes = await apiClient.get('/api/langchain/config/status');
      const cfg = configRes.data;

      setHelixConfig((prev) => {
        const newConfig = {
          base_url: cfg.helix_base_url || prev.base_url || '',
          api_key: prev.api_key || '',
          environment_id: cfg.helix_environment_id || prev.environment_id || '',
          agent_id: cfg.helix_agent_id || prev.agent_id || '',
        };
        localStorage.setItem('helix_config', JSON.stringify(newConfig));
        return newConfig;
      });
    } catch (err) {
      console.error('Helix status check failed:', err);
    } finally {
      setHelixChecking(false);
    }
  }, []);

  const handleHelixSave = async () => {
    if (!helixConfig.base_url || !helixConfig.api_key || !helixConfig.environment_id || !helixConfig.agent_id) {
      notifyError('All Helix fields are required');
      return;
    }

    setHelixSaving(true);
    try {
      await apiClient.post('/api/langchain/config', {
        provider: 'helix',
        key_type: 'helix',
        helix_api_key: helixConfig.api_key,
        helix_base_url: helixConfig.base_url,
        helix_environment_id: helixConfig.environment_id,
        helix_agent_id: helixConfig.agent_id,
      });
      localStorage.setItem('helix_config', JSON.stringify(helixConfig));
      notifySuccess('Helix LLM configuration saved');
      await fetchHelixStatus();
    } catch (err) {
      console.error('Helix save failed:', err);
      notifyError('Failed to save Helix configuration');
    } finally {
      setHelixSaving(false);
    }
  };

  const handleHelixClear = async () => {
    if (!window.confirm('Are you sure you want to clear Helix configuration? This cannot be undone.')) return;

    setHelixSaving(true);
    try {
      await apiClient.delete('/api/langchain/config/key/helix');
      setHelixConfig({ base_url: '', api_key: '', environment_id: '', agent_id: '' });
      setHelixStatus('unconfigured');
      localStorage.removeItem('helix_config');
      notifySuccess('Helix configuration cleared');
    } catch (err) {
      notifyError('Failed to clear Helix config');
    } finally {
      setHelixSaving(false);
    }
  };

  useEffect(() => {
    const savedHelix = localStorage.getItem('helix_config');
    if (savedHelix) {
      try {
        setHelixConfig(JSON.parse(savedHelix));
      } catch (err) {
        console.warn('Failed to parse Helix config:', err);
      }
    }
    fetchHelixStatus();
  }, []);

  return (
    <div style={{ padding: '1.5rem' }}>
      <h3>Helix LLM Configuration</h3>
      <p style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>
        Configure Helix as your agent LLM.
        <br />
        <a href="https://openam-helix.forgeblocks.com" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>
          Open Helix Console ↗
        </a>
      </p>

      {/* Status pill */}
      <div style={{ marginBottom: '1rem' }}>
        <span style={{
          display: 'inline-block',
          padding: '0.25rem 0.75rem',
          borderRadius: 6,
          fontSize: '0.85rem',
          fontWeight: 500,
          backgroundColor: helixStatus === 'available' ? '#dcfce7' : helixStatus === 'unconfigured' ? '#fef3c7' : '#fecaca',
          color: helixStatus === 'available' ? '#166534' : helixStatus === 'unconfigured' ? '#92400e' : '#991b1b',
        }}>
          {helixStatus === 'available' && '✅ Active'}
          {helixStatus === 'unconfigured' && '⚠️ Unconfigured'}
          {helixStatus === null && '…'}
        </span>
      </div>

      {/* Form fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.35rem' }}>
            Base URL
          </label>
          <input
            type="text"
            placeholder="https://openam-helix.forgeblocks.com"
            value={helixConfig.base_url}
            onChange={(e) => setHelixConfig({ ...helixConfig, base_url: e.target.value })}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              fontSize: '0.9rem',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.35rem' }}>
            API Key
          </label>
          <input
            type="password"
            placeholder="Helix API Key"
            value={helixConfig.api_key}
            onChange={(e) => setHelixConfig({ ...helixConfig, api_key: e.target.value })}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              fontSize: '0.9rem',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.35rem' }}>
            Environment ID
          </label>
          <input
            type="text"
            placeholder="Environment/Tenant ID"
            value={helixConfig.environment_id}
            onChange={(e) => setHelixConfig({ ...helixConfig, environment_id: e.target.value })}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              fontSize: '0.9rem',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.35rem' }}>
            Agent ID
          </label>
          <input
            type="text"
            placeholder="Helix Agent ID"
            value={helixConfig.agent_id}
            onChange={(e) => setHelixConfig({ ...helixConfig, agent_id: e.target.value })}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              fontSize: '0.9rem',
            }}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={fetchHelixStatus}
          disabled={helixChecking}
          style={{
            padding: '0.5rem 1rem',
            background: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            cursor: helixChecking ? 'not-allowed' : 'pointer',
            opacity: helixChecking ? 0.6 : 1,
          }}
        >
          {helixChecking ? 'Loading…' : '📥 Load from Database'}
        </button>
        <button
          onClick={handleHelixSave}
          disabled={helixSaving || !helixConfig.base_url || !helixConfig.api_key || !helixConfig.environment_id || !helixConfig.agent_id}
          style={{
            padding: '0.5rem 1rem',
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: helixSaving ? 'not-allowed' : 'pointer',
            opacity: helixSaving || !helixConfig.base_url ? 0.6 : 1,
          }}
        >
          {helixSaving ? 'Saving…' : '💾 Save & Activate'}
        </button>
        <button
          onClick={handleHelixClear}
          disabled={helixSaving}
          style={{
            padding: '0.5rem 1rem',
            background: '#fee2e2',
            color: '#dc2626',
            border: 'none',
            borderRadius: 4,
            cursor: helixSaving ? 'not-allowed' : 'pointer',
          }}
        >
          ❌ Clear
        </button>
      </div>
    </div>
  );
}
