import React, { useState } from 'react';
import axios from 'axios';
import { notifySuccess, notifyError, notifyWarning } from '../utils/appToast';

export default function HelixPanel() {
  const [helixConfig, setHelixConfig] = useState({ base_url: '', api_key: '', environment_id: '', agent_id: '' });
  const [helixStatus, setHelixStatus] = useState(null);
  const [helixSaving, setHelixSaving] = useState(false);
  const [helixChecking, setHelixChecking] = useState(false);

  const fetchHelixStatus = async () => {
    setHelixChecking(true);
    setHelixStatus(null);
    try {
      const { data } = await axios.get('/api/langchain/provider/helix/status');
      setHelixStatus(data.status);
      const cfg = await axios.get('/api/langchain/config/status');
      setHelixConfig({
        base_url: cfg.data.helix_base_url || '',
        api_key: cfg.data.helix_api_key || '',
        environment_id: cfg.data.helix_environment_id || '',
        agent_id: cfg.data.helix_agent_id || '',
      });
    } catch (e) {
      setHelixStatus('unconfigured');
    } finally {
      setHelixChecking(false);
    }
  };

  const handleHelixSave = async () => {
    if (!helixConfig.base_url || !helixConfig.api_key || !helixConfig.environment_id || !helixConfig.agent_id) {
      notifyWarning('Please fill in all four Helix fields');
      return;
    }
    setHelixSaving(true);
    try {
      await axios.post('/api/langchain/config', {
        provider: 'helix',
        key_type: 'helix',
        helix_base_url: helixConfig.base_url,
        helix_api_key: helixConfig.api_key,
        helix_environment_id: helixConfig.environment_id,
        helix_agent_id: helixConfig.agent_id,
      });
      notifySuccess('Helix configuration saved and activated');
      await fetchHelixStatus();
    } catch (e) {
      notifyError(`Failed to save Helix config: ${e.response?.data?.error || e.message}`);
    } finally {
      setHelixSaving(false);
    }
  };

  return (
    <div className="cfg-section">
      <p className="cfg-section-desc">
        Sign up at <strong>openam-helix.forgeblocks.com</strong>. Get your API Key from the Helix Admin section.
        Configure all four fields to use Helix as the banking agent LLM.
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
      <form style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '1rem',
        marginBottom: '1rem',
      }} onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="dsp-helix-base-url" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.35rem' }}>
            Helix Base URL
          </label>
          <input
            id="dsp-helix-base-url"
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
              fontFamily: 'monospace',
            }}
          />
        </div>

        <div>
          <label htmlFor="dsp-helix-api-key" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.35rem' }}>
            API Key
          </label>
          <input
            id="dsp-helix-api-key"
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
              fontFamily: 'monospace',
            }}
          />
        </div>

        <div>
          <label htmlFor="dsp-helix-env-id" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.35rem' }}>
            Environment ID
          </label>
          <input
            id="dsp-helix-env-id"
            type="text"
            placeholder="Helix environment/tenant ID"
            value={helixConfig.environment_id}
            onChange={(e) => setHelixConfig({ ...helixConfig, environment_id: e.target.value })}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              fontSize: '0.9rem',
              fontFamily: 'monospace',
            }}
          />
        </div>

        <div>
          <label htmlFor="dsp-helix-agent-id" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.35rem' }}>
            Agent ID
          </label>
          <input
            id="dsp-helix-agent-id"
            type="text"
            placeholder="The specific Helix agent to invoke"
            value={helixConfig.agent_id}
            onChange={(e) => setHelixConfig({ ...helixConfig, agent_id: e.target.value })}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              fontSize: '0.9rem',
              fontFamily: 'monospace',
            }}
          />
        </div>
      </form>

      {/* Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="demo-data-btn"
          onClick={fetchHelixStatus}
          disabled={helixChecking}
        >
          {helixChecking ? 'Checking…' : '🔍 Check Status'}
        </button>
        <button
          type="button"
          className="demo-data-btn"
          style={{ background: helixConfig.base_url && helixConfig.api_key && helixConfig.environment_id && helixConfig.agent_id ? '#3b82f6' : '#d1d5db' }}
          onClick={handleHelixSave}
          disabled={helixSaving || !helixConfig.base_url || !helixConfig.api_key || !helixConfig.environment_id || !helixConfig.agent_id}
        >
          {helixSaving ? 'Saving…' : '💾 Save & Activate'}
        </button>
      </div>

      {helixStatus === 'unconfigured' && (
        <div style={{
          padding: '0.75rem 1rem',
          backgroundColor: '#fef3c7',
          border: '1px solid #fcd34d',
          borderRadius: 6,
          fontSize: '0.85rem',
          color: '#92400e',
        }}>
          ⚠️ Please fill in all four fields and click Save & Activate to enable Helix.
        </div>
      )}
    </div>
  );
}
