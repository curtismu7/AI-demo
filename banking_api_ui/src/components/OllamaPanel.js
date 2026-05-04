import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { notifySuccess, notifyError, notifyInfo } from '../utils/appToast';

const AVAILABLE_MODELS = ['mistral', 'llama3.2', 'llama3.1', 'gemma4:e4b', 'deepseek-coder:latest', 'phi3', 'qwen2.5'];

export default function OllamaPanel() {
  const [ollamaStatus, setOllamaStatus] = useState(null);
  const [, setInstalledModels] = useState([]);
  const [ollamaModel, setOllamaModel] = useState('mistral');
  const [ollamaChecking, setOllamaChecking] = useState(false);
  const [ollamaPulling, setOllamaPulling] = useState(false);
  const [ollamaSaving, setOllamaSaving] = useState(false);
  const [ollamaShuttingDown, setOllamaShuttingDown] = useState(false);
  const [showShutdownModal, setShowShutdownModal] = useState(false);
  const [showPersonalMachineModal, setShowPersonalMachineModal] = useState(false);
  const [, setLoadingModels] = useState(false);
  const [ollamaDisablingAutoStart, setOllamaDisablingAutoStart] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);

  const handleOllamaCheck = async () => {
    setOllamaChecking(true);
    setOllamaStatus(null);
    try {
      const { data } = await axios.get('/api/langchain/provider/ollama/status');
      setOllamaStatus(data);
      const cfg = await axios.get('/api/langchain/config/status');
      setOllamaModel(cfg.data.model || 'mistral');
    } catch (e) {
      setOllamaStatus({ status: 'unreachable', reason: e.message });
    } finally {
      setOllamaChecking(false);
    }
  };

  const handleOllamaSaveModel = async () => {
    setOllamaSaving(true);
    try {
      await axios.post('/api/langchain/config', { model: ollamaModel });
      notifySuccess(`Model set to ${ollamaModel}`);
    } catch (e) {
      notifyError('Failed to save model');
    } finally {
      setOllamaSaving(false);
    }
  };

  const handleOllamaPull = () => {
    setShowPersonalMachineModal(true);
  };

  const confirmPersonalMachine = async () => {
    setShowPersonalMachineModal(false);
    setOllamaPulling(true);
    notifyInfo(`Pulling ${ollamaModel}… this may take a few minutes`);
    try {
      await axios.post('/api/langchain/ollama/pull', { model: ollamaModel }, { timeout: 360000 });
      notifySuccess(`${ollamaModel} is ready`);
      handleOllamaCheck();
    } catch (e) {
      notifyError(`Pull failed: ${e.response?.data?.error || e.message}`);
    } finally {
      setOllamaPulling(false);
    }
  };

  const handleOllamaShutdown = () => {
    setShowShutdownModal(true);
  };

  const confirmShutdown = async () => {
    setShowShutdownModal(false);
    setOllamaShuttingDown(true);
    try {
      await axios.post('/api/langchain/ollama/shutdown');
      notifySuccess('Ollama shut down successfully');
      await new Promise(resolve => setTimeout(resolve, 1000));
      handleOllamaCheck();
    } catch (e) {
      notifyError(`Shutdown failed: ${e.response?.data?.error || e.message}`);
    } finally {
      setOllamaShuttingDown(false);
    }
  };

  const handleDisableAutoStart = () => {
    setShowDisableModal(true);
  };

  const confirmDisableAutoStart = async () => {
    setShowDisableModal(false);
    setOllamaDisablingAutoStart(true);
    try {
      await axios.post('/api/langchain/ollama/disable-autostart');
      notifySuccess('Ollama auto-start disabled. It will not start on login.');
      await new Promise(resolve => setTimeout(resolve, 1000));
      handleOllamaCheck();
    } catch (e) {
      notifyError(`Failed to disable auto-start: ${e.response?.data?.error || e.message}`);
    } finally {
      setOllamaDisablingAutoStart(false);
    }
  };

  useEffect(() => {
    (async () => {
      setOllamaChecking(true);
      setOllamaStatus(null);
      try {
        const { data } = await axios.get('/api/langchain/provider/ollama/status');
        setOllamaStatus(data);
        const cfg = await axios.get('/api/langchain/config/status');
        setOllamaModel(cfg.data.model || 'mistral');
      } catch (e) {
        setOllamaStatus({ status: 'unreachable', reason: e.message });
      } finally {
        setOllamaChecking(false);
      }
      setLoadingModels(true);
      try {
        const res = await axios.get('/api/langchain/ollama/models');
        setInstalledModels(res.data.models || []);
      } catch {
        setInstalledModels([]);
      } finally {
        setLoadingModels(false);
      }
    })();
  }, []);

  return (
    <div className="cfg-section">
      <div style={{ padding: '1rem', backgroundColor: '#7f1d1d', border: '3px solid #dc2626', borderRadius: 8, marginBottom: '1.5rem', color: '#fff' }}>
        <strong style={{ fontSize: '1.1rem', display: 'block', marginBottom: '0.5rem' }}>⛔ SECURITY WARNING</strong>
        <p style={{ margin: '0.5rem 0', lineHeight: 1.6, fontSize: '0.95rem' }}>
          <strong>Do NOT run Ollama on Ping Identity machines.</strong> Running local software on Ping Identity infrastructure violates corporate security policy.
          Ollama is for development on <strong>your personal machine only</strong>.
        </p>
      </div>
      <p className="cfg-section-desc">
        <strong>Helix is the default LLM provider</strong> for natural language understanding in the banking agent. Ollama is an optional local LLM alternative — useful if you want offline inference on your machine.
        The banking agent always tries keyword matching first (instant, no network), then falls back to your selected LLM provider for ambiguous requests. You can switch between providers using the chips above the agent input.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" className="demo-data-btn" onClick={handleOllamaCheck} disabled={ollamaChecking}>
          {ollamaChecking ? 'Checking…' : '🔍 Check Status'}
        </button>
        {ollamaStatus && (
          <span style={{ fontSize: '0.85rem', padding: '0.25rem 0.6rem', borderRadius: 4, background: ollamaStatus.status === 'available' ? '#dcfce7' : '#fee2e2', color: ollamaStatus.status === 'available' ? '#166534' : '#991b1b' }}>
            {ollamaStatus.status === 'available' ? '✅ Running' : '❌ Not reachable'} — {ollamaStatus.reason}
          </span>
        )}
      </div>
      {ollamaStatus?.status === 'unreachable' && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fee2e2', border: '1px solid #fecaca', borderRadius: 6, fontSize: '0.85rem', color: '#991b1b', marginBottom: '1rem' }}>
          <strong>⚠️ Ollama is not running</strong><br/>
          Install Ollama from <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer">ollama.ai</a> or run: <code>brew install ollama</code>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <label htmlFor="ollama-model-select" style={{ fontSize: '0.875rem', fontWeight: 600, minWidth: 80 }}>Model:</label>
        <select id="ollama-model-select" value={ollamaModel} onChange={e => setOllamaModel(e.target.value)} style={{ fontSize: '0.875rem', padding: '0.3rem 0.5rem', borderRadius: 4, border: '1px solid #d1d5db' }}>
          {AVAILABLE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <button type="button" className="demo-data-btn" onClick={handleOllamaSaveModel} disabled={ollamaSaving}>
          {ollamaSaving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="demo-data-btn" onClick={handleOllamaPull} disabled={ollamaPulling}>
          {ollamaPulling ? 'Pulling…' : '⬇ Pull Model'}
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" className="demo-data-btn" style={{ background: '#dc2626', color: '#fff' }} onClick={handleOllamaShutdown} disabled={ollamaShuttingDown}>
          {ollamaShuttingDown ? 'Shutting down…' : '🛑 Shut Down Ollama'}
        </button>
        <button type="button" className="demo-data-btn" style={{ background: '#f97316', color: '#fff' }} onClick={handleDisableAutoStart} disabled={ollamaDisablingAutoStart}>
          {ollamaDisablingAutoStart ? 'Disabling…' : '⛔ Disable Auto-Start'}
        </button>
      </div>
      <details style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#374151' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>How to change the model permanently</summary>
        <ol style={{ margin: '0.5rem 0 0 1.2rem', lineHeight: 1.7 }}>
          <li>Open <code>banking_api_server/.env</code></li>
          <li>Set <code>OLLAMA_MODEL=&lt;model-name&gt;</code> (e.g. <code>mistral</code>, <code>gemma4:e4b</code>)</li>
          <li>Restart the API server — the new model is picked up on startup</li>
          <li>Use <strong>Pull Model</strong> above if the model isn't downloaded yet</li>
        </ol>
        <p style={{ marginTop: '0.5rem' }}>Ollama starts automatically at login via a macOS LaunchAgent (<code>~/Library/LaunchAgents/com.ollama.server.plist</code>). Logs: <code>/tmp/ollama.log</code>.</p>
      </details>
      <details style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#374151' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Disable Ollama auto-start</summary>
        <ol style={{ margin: '0.5rem 0 0 1.2rem', lineHeight: 1.7 }}>
          <li>To prevent Ollama from starting at login, run:<br/><code style={{ display: 'block', marginTop: '0.25rem', padding: '0.25rem 0.5rem', background: '#f3f4f6', borderRadius: 4 }}>launchctl unload ~/Library/LaunchAgents/com.ollama.server.plist</code></li>
          <li>To re-enable auto-start later, run:<br/><code style={{ display: 'block', marginTop: '0.25rem', padding: '0.25rem 0.5rem', background: '#f3f4f6', borderRadius: 4 }}>launchctl load ~/Library/LaunchAgents/com.ollama.server.plist</code></li>
        </ol>
        <p style={{ marginTop: '0.5rem' }}>Note: Helix is the default LLM provider. Ollama is optional and only needed if you want to use local inference.</p>
      </details>

      {showShutdownModal && (
        <div className="modal-overlay" onClick={() => setShowShutdownModal(false)} onKeyDown={(e) => e.key === 'Escape' && setShowShutdownModal(false)} role="presentation">
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Shut Down Ollama?</h2>
              <button type="button" className="modal-close" onClick={() => setShowShutdownModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem' }}>This will stop the local Ollama LLM server and prevent it from automatically restarting.</p>
              <p style={{ fontSize: '0.9rem', color: '#666' }}>To restart Ollama later, run: <code style={{ background: '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: 4 }}>launchctl load ~/Library/LaunchAgents/com.ollama.server.plist</code></p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button type="button" className="demo-data-btn" style={{ background: '#d1d5db', color: '#1f2937' }} onClick={() => setShowShutdownModal(false)}>
                Cancel
              </button>
              <button type="button" className="demo-data-btn" style={{ background: '#dc2626', color: '#fff' }} onClick={confirmShutdown} disabled={ollamaShuttingDown}>
                {ollamaShuttingDown ? 'Shutting down…' : 'Shut Down'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPersonalMachineModal && (
        <div className="modal-overlay" onClick={() => setShowPersonalMachineModal(false)} onKeyDown={(e) => e.key === 'Escape' && setShowPersonalMachineModal(false)} role="presentation">
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>⚠️ Confirm Personal Machine</h2>
              <button type="button" className="modal-close" onClick={() => setShowPersonalMachineModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', fontWeight: 600, color: '#991b1b' }}>Is this your personal machine, not a Ping Identity workstation?</p>
              <p style={{ marginBottom: '1rem', color: '#374151' }}>Ollama is <strong>NOT allowed on Ping Identity infrastructure</strong>. Running local software on corporate machines violates Ping Identity security policy.</p>
              <p style={{ fontSize: '0.9rem', color: '#666' }}>Only proceed if you are running this on your personal computer.</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button type="button" className="demo-data-btn" style={{ background: '#d1d5db', color: '#1f2937' }} onClick={() => setShowPersonalMachineModal(false)}>
                Cancel
              </button>
              <button type="button" className="demo-data-btn" style={{ background: '#059669', color: '#fff' }} onClick={confirmPersonalMachine} disabled={ollamaPulling}>
                {ollamaPulling ? 'Pulling…' : 'Yes, Pull Model'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDisableModal && (
        <div className="modal-overlay" onClick={() => setShowDisableModal(false)} onKeyDown={(e) => e.key === 'Escape' && setShowDisableModal(false)} role="presentation">
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Disable Ollama Auto-Start?</h2>
              <button type="button" className="modal-close" onClick={() => setShowDisableModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem' }}>This will prevent Ollama from starting automatically at login.</p>
              <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>To re-enable auto-start later, run:<br/><code style={{ display: 'block', marginTop: '0.25rem', padding: '0.25rem 0.5rem', background: '#f3f4f6', borderRadius: 4 }}>launchctl load ~/Library/LaunchAgents/com.ollama.server.plist</code></p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button type="button" className="demo-data-btn" style={{ background: '#d1d5db', color: '#1f2937' }} onClick={() => setShowDisableModal(false)}>
                Cancel
              </button>
              <button type="button" className="demo-data-btn" style={{ background: '#f97316', color: '#fff' }} onClick={confirmDisableAutoStart} disabled={ollamaDisablingAutoStart}>
                {ollamaDisablingAutoStart ? 'Disabling…' : 'Disable Auto-Start'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
