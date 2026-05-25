// demo_api_ui/src/components/LlmConfigPage.jsx
import React, { useCallback, useEffect, useState } from 'react';
import apiClient from '../services/apiClient';
import { notifyError, notifySuccess } from '../utils/appToast';
import HelixPanel from './HelixPanel';
import LmStudioPanel from './LmStudioPanel';
import ProviderSelector from './ProviderSelector';

/**
 * LlmConfigPage — LLM provider configuration
 *
 * Shows a two-option provider selector (Helix | LM Studio) at the top,
 * then the appropriate config panel below.
 *
 * LM Studio uses the Anthropic-compatible /v1/messages endpoint at
 * http://localhost:1234. No API key required.
 */
export default function LlmConfigPage() {
  const [provider, setProvider] = useState('helix');
  const [helixStatus, setHelixStatus] = useState(null);
  const [lmstudioStatus, setLmstudioStatus] = useState(null);

  const fetchStatuses = useCallback(async () => {
    try {
      const [helixRes, lmstudioRes] = await Promise.all([
        apiClient.get('/api/langchain/provider/helix/status'),
        apiClient.get('/api/langchain/provider/anthropic-lmstudio/status'),
      ]);
      setHelixStatus(helixRes.data?.status ?? null);
      setLmstudioStatus(lmstudioRes.data?.status ?? null);
    } catch (err) {
      console.warn('[LlmConfigPage] Status fetch failed:', err.message);
    }
  }, []);

  useEffect(() => {
    // Load current provider from BFF, then fetch statuses
    apiClient.get('/api/langchain/config/status')
      .then(res => {
        const p = res.data?.provider;
        if (p === 'helix' || p === 'anthropic-lmstudio') setProvider(p);
      })
      .catch(err => console.warn('[LlmConfigPage] Config load failed:', err.message));

    fetchStatuses();
  }, [fetchStatuses]);

  const handleSelect = async (selected) => {
    if (selected === provider) return;
    setProvider(selected);
    try {
      await apiClient.post('/api/langchain/config', { provider: selected });
      notifySuccess(`Switched to ${selected === 'helix' ? 'Helix' : 'LM Studio'}`);
      await fetchStatuses();
    } catch (err) {
      notifyError(`Failed to switch provider: ${err.message}`);
      setProvider(provider); // revert on failure
    }
  };

  return (
    <div className="page-container">
      <ProviderSelector
        provider={provider}
        onSelect={handleSelect}
        helixStatus={helixStatus}
        lmstudioStatus={lmstudioStatus}
      />
      {provider === 'helix' ? <HelixPanel /> : <LmStudioPanel />}
    </div>
  );
}
