// demo_api_ui/src/components/LlmConfigPage.jsx
import React, { useCallback, useEffect, useState } from 'react';
import apiClient from '../services/apiClient';
import { notifyError, notifySuccess } from '../utils/appToast';
import HelixPanel from './HelixPanel';
import OllamaPanel from './OllamaPanel';
import ProviderSelector from './ProviderSelector';

/**
 * LlmConfigPage — LLM provider configuration
 *
 * Shows a two-option provider selector (Helix | Ollama) at the top,
 * then the appropriate config panel below.
 */
export default function LlmConfigPage() {
  const [provider, setProvider] = useState('helix');
  const [helixStatus, setHelixStatus] = useState(null);
  const [ollamaStatus, setOllamaStatus] = useState(null);

  const fetchStatuses = useCallback(async () => {
    try {
      const [helixRes, ollamaRes] = await Promise.all([
        apiClient.get('/api/langchain/provider/helix/status'),
        apiClient.get('/api/langchain/provider/ollama/status'),
      ]);
      setHelixStatus(helixRes.data?.status ?? null);
      setOllamaStatus(ollamaRes.data?.status ?? null);
    } catch (err) {
      console.warn('[LlmConfigPage] Status fetch failed:', err.message);
    }
  }, []);

  useEffect(() => {
    // Load current provider from BFF, then fetch statuses
    apiClient.get('/api/langchain/config/status')
      .then(res => {
        const p = res.data?.provider;
        if (p === 'helix' || p === 'ollama') setProvider(p);
      })
      .catch(err => console.warn('[LlmConfigPage] Config load failed:', err.message));

    fetchStatuses();
  }, [fetchStatuses]);

  const handleSelect = async (selected) => {
    if (selected === provider) return;
    setProvider(selected);
    try {
      await apiClient.post('/api/langchain/config', { provider: selected });
      notifySuccess(`Switched to ${selected === 'helix' ? 'Helix' : 'Ollama'}`);
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
        ollamaStatus={ollamaStatus}
      />
      {provider === 'helix' ? <HelixPanel /> : <OllamaPanel />}
    </div>
  );
}
