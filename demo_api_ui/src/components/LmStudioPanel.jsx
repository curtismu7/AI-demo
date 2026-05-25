// demo_api_ui/src/components/LmStudioPanel.jsx
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../services/apiClient';
import { notifySuccess, notifyError, notifyInfo } from '../utils/appToast';

const DEFAULT_MODEL = 'google/gemma-4-e2b';
const DEFAULT_BASE_URL = 'http://localhost:1234';

export default function LmStudioPanel() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [serverStatus, setServerStatus] = useState(null); // null | 'running' | 'unreachable'
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  // Download state
  const [downloadJobId, setDownloadJobId] = useState(null);
  const [downloadStatus, setDownloadStatus] = useState(null); // null | { status, progress_pct, downloaded_bytes, total_size_bytes }
  const [downloading, setDownloading] = useState(false);
  // Load state
  const [loading, setLoading] = useState(false);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const res = await apiClient.get('/api/langchain/lmstudio/status');
      const d = res.data;
      setServerStatus(d.server_running ? 'running' : 'unreachable');
      if (d.server_running) {
        setModels(d.models || []);
        setBaseUrl(d.base_url || DEFAULT_BASE_URL);
        // Auto-select first loaded model if default isn't available
        const loadedModels = (d.models || []).filter(m => m.loaded);
        const hasDefault = (d.models || []).some(m => m.key === DEFAULT_MODEL);
        if (!hasDefault && loadedModels.length > 0) {
          setSelectedModel(loadedModels[0].key);
        }
      }
    } catch {
      setServerStatus('unreachable');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll download progress when a job is running
  useEffect(() => {
    if (!downloadJobId) return;
    const interval = setInterval(async () => {
      try {
        const res = await apiClient.get(`/api/langchain/lmstudio/download/status?job_id=${downloadJobId}`);
        const d = res.data;
        setDownloadStatus(d);
        if (d.status === 'completed') {
          clearInterval(interval);
          setDownloadJobId(null);
          setDownloading(false);
          notifySuccess('Download complete — loading model…');
          await handleLoad(selectedModel);
          await checkStatus();
        } else if (d.status === 'failed') {
          clearInterval(interval);
          setDownloadJobId(null);
          setDownloading(false);
          notifyError(`Download failed: ${d.error || 'unknown error'}`);
        }
      } catch (err) {
        clearInterval(interval);
        setDownloadJobId(null);
        setDownloading(false);
        notifyError(`Download status check failed: ${err.message}`);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [downloadJobId, selectedModel]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadStatus(null);
    try {
      const res = await apiClient.post('/api/langchain/lmstudio/download', { model: selectedModel });
      const d = res.data;
      if (d.status === 'already_downloaded' || d.status === 'completed') {
        notifyInfo('Model already downloaded — loading…');
        setDownloading(false);
        await handleLoad(selectedModel);
        await checkStatus();
      } else if (d.job_id) {
        setDownloadJobId(d.job_id);
        setDownloadStatus(d);
        notifyInfo(`Downloading ${selectedModel}… this may take several minutes`);
      } else {
        setDownloading(false);
        notifyError(d.error || 'Download start failed');
      }
    } catch (err) {
      setDownloading(false);
      notifyError(`Download failed: ${err.message}`);
    }
  };

  const handleLoad = async (model) => {
    setLoading(true);
    try {
      await apiClient.post('/api/langchain/lmstudio/load', { model: model || selectedModel });
      notifySuccess(`${model || selectedModel} loaded`);
      await checkStatus();
    } catch (err) {
      notifyError(`Load failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveModel = async () => {
    setSaving(true);
    try {
      await apiClient.post('/api/langchain/config', {
        provider: 'anthropic-lmstudio',
        model: selectedModel,
      });
      notifySuccess(`Model set to ${selectedModel}`);
    } catch (err) {
      notifyError(`Failed to save model: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const downloadedModels = models.filter(m => !m.loaded); // downloaded but not loaded
  const loadedModels = models.filter(m => m.loaded);
  const selectedLoaded = models.find(m => m.key === selectedModel && m.loaded);
  const selectedDownloaded = models.find(m => m.key === selectedModel && !m.loaded);

  const statusColor = serverStatus === 'running' ? '#166534' : serverStatus === 'unreachable' ? '#991b1b' : '#92400e';
  const statusBg = serverStatus === 'running' ? '#dcfce7' : serverStatus === 'unreachable' ? '#fecaca' : '#fef3c7';
  const statusLabel = serverStatus === 'running' ? '✅ Server running' : serverStatus === 'unreachable' ? '❌ Server not reachable' : checking ? '…' : '⚠️ Unknown';

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

  const formatBytes = (bytes) => {
    if (!bytes) return '';
    const gb = bytes / 1e9;
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
  };

  return (
    <div style={{ padding: '1.5rem' }}>
      <h3>LM Studio Configuration</h3>
      <p style={{ marginBottom: '1.25rem', color: '#666', fontSize: '0.9rem' }}>
        LM Studio runs models locally using the Anthropic API format — no cloud API key required.
        Inference endpoint: <code style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{baseUrl}/v1/messages</code>
      </p>

      {/* Setup instructions — shown when server is unreachable */}
      {serverStatus !== 'running' && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem', background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 6 }}>
          <p style={{ margin: '0 0 0.75rem', fontWeight: 600, fontSize: '0.9rem' }}>Getting started with LM Studio</p>
          <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: '#374151', lineHeight: 1.7 }}>
            <li>Download and install LM Studio from{' '}
              <a href="https://lmstudio.ai/download" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>lmstudio.ai/download</a>
            </li>
            <li>Open LM Studio, go to the <strong>Developer</strong> tab and start the local server:
              <code style={{ ...codeStyle, marginTop: '0.4rem' }}>Default port: 1234</code>
            </li>
            <li>Click <strong>Check Status</strong> below, then use <strong>Download &amp; Load</strong> to set up Gemma.</li>
          </ol>
        </div>
      )}

      {/* Status + refresh */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <span style={{ display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: 6, fontSize: '0.85rem', fontWeight: 500, backgroundColor: statusBg, color: statusColor }}>
          {statusLabel}
        </span>
        <button type="button" onClick={checkStatus} disabled={checking}
          style={{ padding: '0.35rem 0.85rem', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, cursor: checking ? 'not-allowed' : 'pointer', opacity: checking ? 0.6 : 1, fontSize: '0.85rem' }}>
          {checking ? '…' : 'Check Status'}
        </button>
      </div>

      {/* Server URL */}
      <div style={{ marginBottom: '1.25rem', maxWidth: 480 }}>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.35rem' }}>
          LM Studio Server URL
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
            placeholder={DEFAULT_BASE_URL}
            style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.9rem' }} />
        </div>
        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.35rem' }}>
          Default: {DEFAULT_BASE_URL} — Anthropic endpoint: <code style={{ fontFamily: 'monospace' }}>/v1/messages</code>
        </div>
      </div>

      {/* Model section — only shown when server is running */}
      {serverStatus === 'running' && (
        <>
          {/* Loaded models */}
          {loadedModels.length > 0 && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6 }}>
              <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', fontWeight: 600, color: '#166534' }}>✅ Loaded in memory</p>
              {loadedModels.map(m => (
                <div key={m.key} style={{ fontSize: '0.85rem', color: '#166534' }}>{m.display_name || m.key}</div>
              ))}
            </div>
          )}

          {/* Model selector */}
          <div style={{ marginBottom: '1rem', maxWidth: 480 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.35rem' }}>
              Model
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.9rem' }}>
                {models.length > 0
                  ? models.map(m => (
                    <option key={m.key} value={m.key}>
                      {m.display_name || m.key}{m.loaded ? ' (loaded)' : ' (not loaded)'}
                      {m.size_bytes ? ` — ${formatBytes(m.size_bytes)}` : ''}
                    </option>
                  ))
                  : <option value={DEFAULT_MODEL}>{DEFAULT_MODEL}</option>
                }
              </select>
              <button type="button" onClick={handleSaveModel} disabled={saving}
                style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, fontSize: '0.9rem' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          {/* Load / Download actions */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {/* Load button — shown when model is downloaded but not loaded */}
            {(selectedDownloaded || models.length === 0) && !selectedLoaded && (
              <button type="button" onClick={() => handleLoad(selectedModel)} disabled={loading}
                style={{ padding: '0.5rem 1.1rem', background: '#059669', color: '#fff', border: 'none', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, fontSize: '0.9rem' }}>
                {loading ? 'Loading…' : 'Load Model'}
              </button>
            )}

            {/* Download + Load button */}
            <button type="button" onClick={handleDownload} disabled={downloading || loading}
              style={{ padding: '0.5rem 1.1rem', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, cursor: (downloading || loading) ? 'not-allowed' : 'pointer', opacity: (downloading || loading) ? 0.6 : 1, fontSize: '0.9rem' }}>
              {downloading ? 'Downloading…' : 'Download & Load'}
            </button>
          </div>

          {/* Download progress */}
          {downloadStatus && downloading && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 6 }}>
              <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', fontWeight: 600, color: '#5b21b6' }}>
                Downloading {selectedModel}…
              </p>
              {downloadStatus.progress_pct != null && (
                <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden', marginBottom: '0.4rem' }}>
                  <div style={{ height: '100%', width: `${downloadStatus.progress_pct}%`, background: '#7c3aed', borderRadius: 4, transition: 'width 0.3s' }} />
                </div>
              )}
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>
                {downloadStatus.downloaded_bytes && downloadStatus.total_size_bytes
                  ? `${formatBytes(downloadStatus.downloaded_bytes)} / ${formatBytes(downloadStatus.total_size_bytes)}`
                  : 'Calculating…'}
                {downloadStatus.progress_pct != null ? ` (${downloadStatus.progress_pct}%)` : ''}
              </p>
            </div>
          )}

          {/* Anthropic endpoint info */}
          <div style={{ marginTop: '1.25rem', padding: '0.75rem 1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>Anthropic API endpoint</p>
            <code style={codeStyle}>{baseUrl}/v1/messages</code>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#6b7280' }}>
              x-api-key: any value accepted — LM Studio does not validate API keys.
              Model field must match the key shown above (e.g. <code style={{ fontFamily: 'monospace' }}>google/gemma-4-e2b</code>).
            </p>
          </div>
        </>
      )}
    </div>
  );
}
