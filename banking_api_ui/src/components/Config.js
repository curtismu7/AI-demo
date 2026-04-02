import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import apiClient from '../services/apiClient';
import { notifySuccess, notifyError } from '../utils/appToast';
import { savePublicConfig, loadPublicConfig } from '../services/configService';
import { useAgentUiMode } from '../context/AgentUiModeContext';
import { useIndustryBranding } from '../context/IndustryBrandingContext';
import { INDUSTRY_PRESETS, DEFAULT_INDUSTRY_ID } from '../config/industryPresets';
import {
  AGENT_MCP_SCOPE_CATALOG,
  DEFAULT_AGENT_MCP_ALLOWED_SCOPES,
} from '../config/agentMcpScopes';
import AgentUiModeToggle from './AgentUiModeToggle';
import McpInspectorSetupWizard from './McpInspectorSetupWizard';
import '../styles/appShellPages.css';
import './Config.css';

// ─── Region options ───────────────────────────────────────────────────────────
const REGION_OPTIONS = [
  { value: 'com',    label: 'North America (com)' },
  { value: 'eu',     label: 'Europe (eu)' },
  { value: 'ca',     label: 'Canada (ca)' },
  { value: 'asia',   label: 'Asia-Pacific (asia)' },
  { value: 'com.au', label: 'Australia (com.au)' },
];

// ─── Collapsible section card ─────────────────────────────────────────────────
function CollapsibleCard({ title, subtitle, defaultOpen = true, className = '', passthrough = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`card config-page__section ${className}`}>
      <button
        type="button"
        className="config-page__section-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="config-page__section-toggle-left">
          <span className="config-page__section-title">{title}</span>
          {subtitle && <span className="config-page__section-subtitle">{subtitle}</span>}
        </div>
        <span className="config-page__section-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className={`config-page__section-body${passthrough ? ' config-page__section-body--passthrough' : ''}`}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Empty form state ─────────────────────────────────────────────────────────
const EMPTY_FORM = {
  pingone_environment_id: '',
  pingone_region: 'com',
  admin_client_id: '',
  admin_client_secret: '',
  admin_redirect_uri: '',
  admin_pingone_authorize_pi_flow: 'false',
  user_pingone_authorize_pi_flow: 'false',
  user_client_id: '',
  user_client_secret: '',
  user_redirect_uri: '',
  admin_role: 'admin',
  user_role: 'customer',
  admin_username: '',
  admin_population_id: '',
  admin_role_claim: '',
  session_secret: '',
  frontend_url: '',
  mcp_server_url: '',           // populated from saved config; not defaulted to localhost
  mcp_resource_uri: '',         // RFC 8693 MCP audience URI — required for token exchange
  debug_oauth: 'false',
  // PingOne Authorize (in-app authorization policy gate)
  authorize_enabled: 'false',
  authorize_decision_endpoint_id: '', // Phase 2 — preferred path
  authorize_mcp_decision_endpoint_id: '', // MCP first-tool gate (DecisionContext=McpFirstTool)
  authorize_policy_id: '',            // Phase 1 — legacy fallback
  authorize_worker_client_id: '',
  authorize_worker_client_secret: '',
  // Step-up authentication for large transfers / withdrawals
  // 'ciba'  → back-channel (CIBA) challenge shown inline; no page redirect
  // 'email' → OIDC re-authentication redirect (email / OTP MFA via PingOne)
  step_up_method: 'ciba',
  // Whether the CIBA feature is enabled globally (also surfaces in CIBA panel)
  ciba_enabled: 'false',
  /** Industry / white-label UI preset (server + IndustryBrandingContext). */
  ui_industry_preset: DEFAULT_INDUSTRY_ID,
  /** OAuth scopes the BFF may request for the agent MCP token (RFC 8693) — space-separated. */
  agent_mcp_allowed_scopes: DEFAULT_AGENT_MCP_ALLOWED_SCOPES,
  marketing_customer_login_mode: 'redirect',
  marketing_demo_username_hint: '',
  marketing_demo_password_hint: '',
};

// ─── Helper: secret field wrapper ────────────────────────────────────────────
function SecretField({ label, fieldKey, value, isSet, showValue, onToggleShow, onChange, help, disabled }) {
  return (
    <div className="form-group">
      <label className="form-label">
        {label}
        {isSet && (
          <span style={{
            marginLeft: '0.5rem',
            fontSize: '0.7rem',
            background: '#d1fae5',
            color: '#065f46',
            padding: '0.1rem 0.4rem',
            borderRadius: '999px',
            fontWeight: 600,
          }}>✓ already set</span>
        )}
      </label>
      <div style={{ position: 'relative', display: 'flex', gap: '0.5rem' }}>
        <input
          type={showValue ? 'text' : 'password'}
          className="form-input"
          value={value}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          placeholder={isSet ? 'Leave blank to keep current value' : 'Enter value…'}
          autoComplete="off"
          style={{ flex: 1 }}
          disabled={disabled}
          readOnly={disabled}
        />
        <button
          type="button"
          onClick={() => onToggleShow(fieldKey)}
          title={showValue ? 'Hide' : 'Show'}
          disabled={disabled}
          style={{
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            background: 'white',
            cursor: disabled ? 'default' : 'pointer',
            fontSize: '1rem',
            lineHeight: 1,
          }}
        >
          {showValue ? '🙈' : '👁️'}
        </button>
      </div>
      {help && <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>{help}</p>}
    </div>
  );
}

// ─── Helper: public text field ────────────────────────────────────────────────
function TextField({ label, fieldKey, value, onChange, help, placeholder, type = 'text', disabled }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        type={type}
        className="form-input"
        value={value}
        onChange={(e) => onChange(fieldKey, e.target.value)}
        placeholder={placeholder || ''}
        disabled={disabled}
        readOnly={disabled}
      />
      {help && <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>{help}</p>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
// ─── Display Preferences (localStorage only) ─────────────────────────────────
const DISPLAY_MODE_KEY = 'agentDisplayMode';

function DisplayPreferences() {
  const [mode, setMode] = useState(() => localStorage.getItem(DISPLAY_MODE_KEY) || 'panel');

  function handleChange(val) {
    setMode(val);
    localStorage.setItem(DISPLAY_MODE_KEY, val);
  }

  return (
    <CollapsibleCard
      title="Display Preferences"
      subtitle="Choose how the AI Agent shows results"
      defaultOpen={true}
      className="config-page__display-prefs"
    >
      <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
        Controls where banking results (accounts, transactions, balances) appear after an Agent action.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="agentDisplayMode"
            value="panel"
            checked={mode === 'panel'}
            onChange={() => handleChange('panel')}
            style={{ marginTop: '3px', flexShrink: 0 }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Side Panel (default)</div>
            <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
              Results appear in the Agent chat panel alongside your conversation.
              Good for quick lookups without leaving the current view.
            </div>
          </div>
        </label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="agentDisplayMode"
            value="fullpage"
            checked={mode === 'fullpage'}
            onChange={() => handleChange('fullpage')}
            style={{ marginTop: '3px', flexShrink: 0 }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Full Page</div>
            <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
              Results update the main dashboard in the background — same account cards and
              transaction tables as the full page, just triggered by the Agent.
            </div>
          </div>
        </label>
      </div>
      {mode === 'fullpage' && (
        <div style={{ marginTop: '12px', padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '0.8rem', color: '#1d4ed8' }}>
          💡 Full Page mode: Agent results will update the account cards and transaction table on your dashboard.
          The Agent chat stays open for follow-up questions.
        </div>
      )}
    </CollapsibleCard>
  );
}

function AgentLayoutPreferences() {
  const { placement } = useAgentUiMode();

  return (
    <CollapsibleCard
      title="AI Agent layout"
      subtitle="Middle column, bottom dock, or float — optional + FAB"
      defaultOpen={true}
      className="config-page__agent-layout"
    >
      <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
        <strong>Middle</strong> uses the split dashboard (token | assistant | banking). <strong>Bottom</strong> uses the
        full-width dock on home and config (Classic layout). <strong>Float</strong> is the corner FAB only.{' '}
        <strong>+ FAB</strong> adds the floating panel on top of Middle or Bottom (never Middle and Bottom together).
        When signed in, your choice syncs to your demo profile.
      </p>
      <AgentUiModeToggle variant="config" />
      <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '1rem', lineHeight: 1.5 }}>
        <strong>Bottom</strong> sends you to <strong>Home</strong> after apply so the dock mounts. <strong>Middle</strong>{' '}
        reloads with split view.
      </p>
      {placement === 'bottom' && (
        <div style={{ marginTop: '12px', padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '0.8rem', color: '#1d4ed8' }}>
          Bottom dock: open <strong>Home</strong> or <strong>My Dashboard</strong> to use the agent. The marketing home page still uses the floating agent when you are not signed in.
        </div>
      )}
    </CollapsibleCard>
  );
}


// ── LangChain Agent Configuration section ─────────────────────────────────
function LangChainAgentConfig() {
  const [status, setStatus] = React.useState(null);
  const [saving, setSaving] = React.useState({});
  const [keyInputs, setKeyInputs] = React.useState({});
  const [messages, setMessages] = React.useState({});

  const PROVIDERS = [
    { id: 'groq',      label: 'Groq',      placeholder: 'gsk_…'          },
    { id: 'openai',    label: 'OpenAI',     placeholder: 'sk-…'           },
    { id: 'anthropic', label: 'Anthropic',  placeholder: 'sk-ant-…'       },
    { id: 'google',    label: 'Google AI',  placeholder: 'AIza…'          },
    { id: 'ollama',    label: 'Ollama',     placeholder: '(local — no key needed)' },
  ];

  useEffect(() => {
    fetch('/api/langchain/config/status')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setStatus(d))
      .catch(() => null);
  }, []);

  const handleProviderSelect = async (provider) => {
    try {
      const r = await fetch('/api/langchain/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model: status?.default_models?.[provider] }),
      });
      if (r.ok) {
        const d = await r.json();
        setStatus(prev => ({ ...prev, provider: d.provider, model: d.model, key_set: d.key_set }));
      }
    } catch {}
  };

  const handleSaveKey = async (keyType) => {
    const key = keyInputs[keyType] || '';
    if (!key.trim()) return;
    setSaving(s => ({ ...s, [keyType]: true }));
    setMessages(m => ({ ...m, [keyType]: '' }));
    try {
      const r = await fetch('/api/langchain/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_type: keyType, key: key.trim() }),
      });
      const d = await r.json();
      if (d.ok) {
        setStatus(prev => ({ ...prev, key_set: d.key_set }));
        setKeyInputs(i => ({ ...i, [keyType]: '' }));
        setMessages(m => ({ ...m, [keyType]: '✓ Saved (session only)' }));
      } else {
        setMessages(m => ({ ...m, [keyType]: '✗ ' + (d.error || 'Error') }));
      }
    } catch (e) {
      setMessages(m => ({ ...m, [keyType]: '✗ Network error' }));
    } finally {
      setSaving(s => ({ ...s, [keyType]: false }));
    }
  };

  const handleClearKey = async (keyType) => {
    try {
      const r = await fetch('/api/langchain/config/key/' + keyType, { method: 'DELETE' });
      const d = await r.json();
      if (d.ok) {
        setStatus(prev => ({ ...prev, key_set: { ...prev.key_set, [keyType]: false } }));
        setMessages(m => ({ ...m, [keyType]: 'Key cleared' }));
      }
    } catch {}
  };

  if (!status) return <p style={{ padding: '8px', color: '#888' }}>Loading LangChain config…</p>;

  const activeProvider = status.provider || 'groq';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
        Active provider: <strong>{activeProvider}</strong> — model: <code>{status.model}</code>
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        {PROVIDERS.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => handleProviderSelect(p.id)}
            className={activeProvider === p.id ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ fontSize: 13 }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {PROVIDERS.filter(p => p.id !== 'ollama').map(p => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ width: 90, fontSize: 13, fontWeight: 500 }}>{p.label}</span>
          {status.key_set?.[p.id] ? (
            <>
              <span style={{ fontSize: 12, color: '#2e7d32' }}>🔒 key set (session only)</span>
              <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: '2px 8px' }}
                onClick={() => handleClearKey(p.id)}>Clear</button>
            </>
          ) : (
            <>
              <input
                type="password"
                placeholder={p.placeholder}
                value={keyInputs[p.id] || ''}
                onChange={e => setKeyInputs(i => ({ ...i, [p.id]: e.target.value }))}
                style={{ flex: 1, minWidth: 200, maxWidth: 340, fontSize: 13, padding: '4px 8px',
                         border: '1px solid #ccc', borderRadius: 4 }}
                autoComplete="off"
              />
              <button type="button" className="btn btn-primary" style={{ fontSize: 12, padding: '4px 12px' }}
                onClick={() => handleSaveKey(p.id)} disabled={saving[p.id]}>
                {saving[p.id] ? '…' : 'Save'}
              </button>
            </>
          )}
          {messages[p.id] && (
            <span style={{ fontSize: 12, color: messages[p.id].startsWith('✓') ? '#2e7d32' : '#c62828' }}>
              {messages[p.id]}
            </span>
          )}
        </div>
      ))}

      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>
        Keys are stored in your server session only and are never included in API responses.
        Refresh or logout to clear all keys.
      </p>
    </div>
  );
}

export default function Config() {
  const navigate = useNavigate();
  const { applyIndustryId } = useIndustryBranding();
  const [form, setForm]               = useState(EMPTY_FORM);
  const [secretMeta, setSecretMeta]   = useState({});   // { <key>_set: bool }
  const [showSecret, setShowSecret]   = useState({});   // { key: bool }
  const [storageType, setStorageType] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);
  const [readOnly, setReadOnly]       = useState(false);
  /** Hosted (Replit/Vercel + managed OAuth): client IDs/secrets from deployment — UI may not edit them. */
  const [deploymentManaged, setDeploymentManaged] = useState(false);

  const [demoMode, setDemoMode]   = useState(false);
  const [showSelfHosting, setShowSelfHosting] = useState(false);

  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [testing, setTesting]     = useState(false);

  const [testResult, setTestResult] = useState(null);
  // Admin password for hosted serverless or REPLIT_CONFIG_PASSWORD_MODE (sessions / config gate)
  const [configPassword, setConfigPassword] = useState('');  // matches ADMIN_CONFIG_PASSWORD env var
  /** Server-computed OAuth redirect URIs for PingOne allowlists */
  const [redirectInfo, setRedirectInfo] = useState(null);

  // ── Fetch from server + merge with IndexedDB cache ──
  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      // Load IndexedDB cache first for instant pre-fill
      const cached = await loadPublicConfig();
      if (Object.keys(cached).length > 0) {
        setForm((prev) => ({ ...prev, ...cached }));
      }

      // Then fetch from server (authoritative source)
      const { data } = await axios.get('/api/admin/config');
      const cfg = data.config || {};
      const meta = {};

      const formUpdates = {};
      for (const key of Object.keys(EMPTY_FORM)) {
        if (key.endsWith('_set')) continue;
        // Server returns '••••••••' for set secrets and '' for unset ones
        const isSecret = ['admin_client_secret', 'user_client_secret', 'session_secret'].includes(key);
        if (isSecret) {
          meta[`${key}_set`] = !!cfg[`${key}_set`];
          // Don't populate the form field for secrets (show placeholder "already set")
          formUpdates[key] = '';
        } else {
          formUpdates[key] = cfg[key] || EMPTY_FORM[key];
        }
      }

      setDeploymentManaged(!!data.deploymentManagedPingOneOAuth || process.env.REACT_APP_MANAGED_DEPLOYMENT === 'true');
      setDemoMode(!!data.demoMode);
      setForm((prev) => ({ ...prev, ...formUpdates }));
      setSecretMeta(meta);
      setStorageType(data.storageType || '');
      setIsConfigured(data.isConfigured || false);
      setReadOnly(data.readOnly || false);
      setRedirectInfo(data.redirectInfo ?? null);

      // Persist public values back to IndexedDB
      await savePublicConfig(formUpdates);
    } catch (err) {
      showToast('error', `Could not load config: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // Auto-fill redirect URIs from current origin if empty
  useEffect(() => {
    const origin = window.location.origin;
    setForm((prev) => ({
      ...prev,
      admin_redirect_uri: prev.admin_redirect_uri || `${origin}/api/auth/oauth/callback`,
      user_redirect_uri:  prev.user_redirect_uri  || `${origin}/api/auth/oauth/user/callback`,
      frontend_url:       prev.frontend_url       || origin,
    }));
  }, []);

  // ── Field helpers ──
  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleShow = (key) => {
    setShowSecret((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  function showToast(type, msg) {
    if (type === 'success') notifySuccess(msg);
    else notifyError(msg);
  }

  // Build auth headers for config write requests (hosted: password header)
  const getConfigHeaders = () => {
    if (storageType === 'vercel-kv' && configPassword) {
      return { 'X-Config-Password': configPassword };
    }
    return {};
  };

  // ── Save ──
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await axios.post('/api/admin/config', form, { headers: getConfigHeaders() });
      setIsConfigured(data.isConfigured);

      // Update secret meta from response
      const meta = {};
      for (const key of ['admin_client_secret', 'user_client_secret', 'session_secret']) {
        meta[`${key}_set`] = !!data.config?.[`${key}_set`];
      }
      setSecretMeta(meta);

      // Clear secret form fields after save (they're stored, don't show them)
      setForm((prev) => ({
        ...prev,
        admin_client_secret: '',
        user_client_secret: '',
        session_secret: '',
      }));

      // Persist public fields to IndexedDB
      await savePublicConfig(form);

      applyIndustryId(form.ui_industry_preset || DEFAULT_INDUSTRY_ID);

      showToast('success', 'Configuration saved! Redirecting to sign in…');
      setTimeout(() => navigate('/', { state: { scrollToAgent: true } }), 1500);
    } catch (err) {
      showToast('error', `Save failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Test connection ──
  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Send the current form values so the test works before saving
      const { data } = await apiClient.post('/api/admin/config/test', {
        pingone_environment_id: form.pingone_environment_id,
        pingone_region:         form.pingone_region,
        admin_client_id:        form.admin_client_id,
      }, { headers: getConfigHeaders() });
      setTestResult(data);
    } catch (err) {
      setTestResult({ ok: false, message: err.response?.data?.message || err.message });
    } finally {
      setTesting(false);
    }
  };

  // ── Render ──
  if (loading) {
    return (
      <div className="config-page config-page--loading app-page-shell">
        <div className="loading" />
      </div>
    );
  }

  return (
    <div className="config-page app-page-shell">
      <header className="app-page-shell__hero config-page__hero-shell">
        <div className="app-page-shell__hero-top">
          <div>
            <h1 className="app-page-shell__title">⚙️ Application Configuration</h1>
            <p className="app-page-shell__lead">
              {deploymentManaged ? (
                <><strong>Hosted:</strong> <strong>Two</strong> PingOne OAuth apps (admin + end-user) — client credentials live <strong>on the server</strong> (secrets / KV — not entered by visitors). Use <strong>Admin</strong> and <strong>Customer</strong> sign-in on the login page. Register both redirect URIs below in PingOne.{' '}</>
              ) : (
                <><strong>Local:</strong> configure <strong>both</strong> PingOne apps here (admin + end-user). Stored in SQLite.{' '}</>
              )}
            </p>
          </div>
          <div className="app-page-shell__actions config-page__hero-actions">
            {isConfigured && (
              <span className="config-page__badge config-page__badge--ok">✓ Configured</span>
            )}
            {!isConfigured && (
              <span className="config-page__badge config-page__badge--warn">⚠ Not configured</span>
            )}
            <Link to="/onboarding" className="app-page-shell__btn app-page-shell__btn--solid">Setup guide</Link>
            <Link to="/setup/pingone" className="app-page-shell__btn">PingOne reference</Link>
            <Link to="/" className="app-page-shell__btn">← Back to app</Link>
          </div>
        </div>
      </header>

      <div className="app-page-shell__body">
      <div className="config-page__main">

        {/* Read-only banner (hosted serverless, no KV) */}
        {readOnly && (
          <div className="config-page__banner config-page__banner--info">
            <strong>Read-only mode (hosted, no KV):</strong> Runtime PingOne fields are supplied by the deployment (server-side). Connect <strong>Upstash Redis / KV</strong> (<code>KV_REST_API_URL</code>) if you need to edit values from this UI. On <strong>localhost</strong> or <strong>Replit with SQLite</strong>, configuration is stored on disk.
          </div>
        )}

        {deploymentManaged && (
          <div className="config-page__banner config-page__banner--hosted">
            <strong>Hosted deployment:</strong> <strong>Client IDs and secrets</strong> are configured on the server (not on this screen). You only need to <strong>register the redirect URIs</strong> in PingOne for your Admin and Customer apps — see the blue box below for the exact values.
          </div>
        )}

        {demoMode && (
          <div className="config-page__banner config-page__banner--warning">
            <strong>Demo mode:</strong> This is a shared public demo. All banking data is simulated — no real transactions occur.
            Transfers and account operations are limited. To use your own data,{' '}
            <button
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 'inherit', fontWeight: 600 }}
              onClick={() => setShowSelfHosting(true)}
            >run your own instance</button>.
          </div>
        )}

        {redirectInfo && !redirectInfo.error && (
          <CollapsibleCard
            title="Register these redirect URIs in PingOne"
            subtitle="Copy the exact callback URLs into each PingOne OAuth app"
            className="config-page__card--redirect"
          >
            <p className="config-page__redirect-lede">
              {redirectInfo.instructions?.summary || 'Each PingOne OAuth app must allowlist its callback URL exactly (scheme, host, path).'}
              {' '}
              {redirectInfo.stableDemoOrigin && (
                <span>Production alias for this demo: <code style={{ background: 'rgba(255,255,255,0.7)', padding: '0.1rem 0.35rem', borderRadius: 4 }}>{redirectInfo.stableDemoOrigin}</code></span>
              )}
            </p>
            <ol className="config-page__redirect-steps">
              {(redirectInfo.instructions?.steps || []).map((step, i) => (
                <li key={i} style={{ marginBottom: '0.35rem' }}>{step}</li>
              ))}
            </ol>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <div className="config-page__redirect-label">Admin (staff) app — Redirect URI</div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <code className="config-page__code-block">{redirectInfo.adminRedirectUri}</code>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }}
                    onClick={() => { navigator.clipboard.writeText(redirectInfo.adminRedirectUri); notifySuccess('Admin redirect URI copied'); }}>
                    Copy
                  </button>
                </div>
              </div>
              <div>
                <div className="config-page__redirect-label">Customer (end-user) app — Redirect URI</div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <code className="config-page__code-block">{redirectInfo.userRedirectUri}</code>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }}
                    onClick={() => { navigator.clipboard.writeText(redirectInfo.userRedirectUri); notifySuccess('Customer redirect URI copied'); }}>
                    Copy
                  </button>
                </div>
              </div>
            </div>
            {Array.isArray(redirectInfo.referenceRedirectSets) && redirectInfo.referenceRedirectSets.length > 0 && (
              <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.35)', borderRadius: 8, border: '1px solid rgba(15,23,42,0.12)' }}>
                <p style={{ margin: '0 0 0.65rem', fontSize: '0.875rem', fontWeight: 600 }}>
                  Reference: localhost + api.pingdeme.org (add every host you use in PingOne)
                </p>
                {redirectInfo.referenceRedirectSets.map((row) => (
                  <div key={row.id} style={{ marginBottom: '0.85rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>{row.label}</div>
                    {row.hint && <p style={{ margin: '0 0 0.35rem', fontSize: '0.78rem', color: '#475569' }}>{row.hint}</p>}
                    <div style={{ display: 'grid', gap: '0.35rem', fontSize: '0.78rem' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                        <span style={{ minWidth: '7rem', color: '#64748b' }}>Admin</span>
                        <code className="config-page__code-block" style={{ flex: '1 1 200px' }}>{row.adminRedirectUri}</code>
                        <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem' }}
                          onClick={() => { navigator.clipboard.writeText(row.adminRedirectUri); notifySuccess('Copied'); }}>
                          Copy
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                        <span style={{ minWidth: '7rem', color: '#64748b' }}>Customer</span>
                        <code className="config-page__code-block" style={{ flex: '1 1 200px' }}>{row.userRedirectUri}</code>
                        <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem' }}
                          onClick={() => { navigator.clipboard.writeText(row.userRedirectUri); notifySuccess('Copied'); }}>
                          Copy
                        </button>
                      </div>
                      {row.postLogoutExample && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                          <span style={{ minWidth: '7rem', color: '#64748b' }}>Sign off</span>
                          <code className="config-page__code-block" style={{ flex: '1 1 200px' }}>{row.postLogoutExample}</code>
                          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem' }}
                            onClick={() => { navigator.clipboard.writeText(row.postLogoutExample); notifySuccess('Copied'); }}>
                            Copy
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {redirectInfo.canonicalOrigin && (
              <p className="config-page__redirect-foot">
                Canonical origin: <code>{redirectInfo.canonicalOrigin}</code>
                {redirectInfo.requestHost && (<> · Request host: <code>{redirectInfo.requestHost}</code></>)}
              </p>
            )}
            {(redirectInfo.warnings || []).length > 0 && (
              <div className="config-page__redirect-warn">
                {(redirectInfo.warnings || []).map((w, i) => (<p key={i} style={{ margin: '0.25rem 0' }}>⚠ {w}</p>))}
              </div>
            )}
          </CollapsibleCard>
        )}

        {redirectInfo?.error && (
          <div className="card config-page__banner--danger" style={{ marginBottom: '1.5rem' }}>
            <p style={{ margin: 0, fontSize: '0.875rem' }}>Could not load redirect URI info: {redirectInfo.error}</p>
          </div>
        )}

        {!deploymentManaged && (
          <div className="config-page__banner config-page__banner--success">
            <strong>Local development:</strong> Configure <strong>Admin</strong> and <strong>End-User</strong> OAuth apps independently — <strong>two PingOne apps and two client IDs</strong>, same model as production. This layout is shown when deployment-managed OAuth is off (e.g. local or Replit with full editor).
          </div>
        )}

        {/* Step-by-step directions */}
        <CollapsibleCard
          title="How to complete this form"
          subtitle="Step-by-step setup checklist — open for a printable guide"
          className="config-page__card--steps"
          defaultOpen={false}
        >
          <p className="config-page__steps-intro">
            For a printable-style checklist, open the <Link to="/onboarding">onboarding guide</Link>. Follow the steps below in order.
          </p>
          <ol className="config-page__steps-list">
            {deploymentManaged ? (
              <>
                <li>Copy the <strong>Admin</strong> and <strong>Customer</strong> redirect URIs from the <strong>Register these redirect URIs in PingOne</strong> section above into each PingOne application's allowlist.</li>
                <li>OAuth client IDs and secrets are stored <strong>on the server</strong> — visitors do not enter them here.</li>
                <li>Use <strong>Admin sign-in</strong> and <strong>Customer sign-in</strong> on the login page.</li>
                <li>Optional: other fields below may be read-only unless KV is connected.</li>
              </>
            ) : (
              <>
                <li>In PingOne, create <strong>two</strong> OIDC web applications (admin + end user). Copy each <strong>redirect URI</strong> into the matching PingOne app — exact match required.</li>
                <li>Enter <strong>Environment ID</strong>, <strong>region</strong>, and <strong>frontend URL</strong>, then <strong>Test PingOne Connection</strong>.</li>
                <li>Enter each app&apos;s <strong>client ID</strong> and <strong>client secret</strong>. Leave secrets blank if &quot;already set&quot; and you are not rotating them.</li>
              </>
            )}
            <li>Set a random <strong>session secret</strong> (32+ characters) and the <strong>admin / customer role names</strong> that match your PingOne setup.</li>
            <li>Optional: <strong>PingOne Authorize</strong> for transfer policy; <strong>Advanced</strong> / MCP URL is for local use.</li>
            <li><strong>Save Configuration</strong>, then sign in with Admin or Customer as needed.</li>
          </ol>
        </CollapsibleCard>

        {/* First-run banner (local setup only) */}
        {!isConfigured && !readOnly && !deploymentManaged && (
          <div className="config-page__banner config-page__banner--warning">
            <strong>Not saved yet:</strong> Complete the fields below, then <strong>Save Configuration</strong>.
            Values are stored in {storageType === 'vercel-kv' ? 'Redis (KV)' : 'SQLite'} so they survive restarts.
          </div>
        )}

        <form id="config-main-form" onSubmit={handleSave}>

          <CollapsibleCard
            title="Industry & branding"
            subtitle="White-label colors and logo — stored with configuration (public field)"
            className="config-page__card--industry"
          >
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem', lineHeight: 1.5 }}>
              Choose a preset to change primary button colors, dashboard header gradient, and the logo shown across the app.
              The setup assistant on this page can explain these options. Save configuration to apply everywhere.
            </p>
            <div className="config-page__industry-grid">
              {INDUSTRY_PRESETS.map((p) => (
                <label
                  key={p.id}
                  className={`config-page__industry-option${form.ui_industry_preset === p.id ? ' config-page__industry-option--active' : ''}`}
                >
                  <input
                    type="radio"
                    name="ui_industry_preset"
                    value={p.id}
                    checked={form.ui_industry_preset === p.id}
                    onChange={() => handleChange('ui_industry_preset', p.id)}
                    disabled={readOnly}
                    style={{ marginTop: '0.35rem', flexShrink: 0 }}
                  />
                  <span className="config-page__industry-option-body">
                    <img src={p.logoPath} alt="" className="config-page__industry-logo" height={40} width={40} />
                    <span className="config-page__industry-titles">
                      <span className="config-page__industry-name">{p.shortName}</span>
                      <span className="config-page__industry-desc">{p.description}</span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </CollapsibleCard>

          <CollapsibleCard
            title="Agent MCP scopes"
            subtitle="Limit which capabilities the AI agent can use after RFC 8693 token exchange"
            className="config-page__card--agent-scopes"
            defaultOpen={false}
          >
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem', lineHeight: 1.5 }}>
              Each scope maps to PingOne OAuth scopes on the delegated MCP token. Unchecking <strong>Transfers &amp; movement</strong>{' '}
              removes <code>banking:transactions:write</code> (the transfer scope) so the agent cannot move money — read-only demos.
              Save configuration to apply; the next tool call runs a new token exchange with the selected scopes.
            </p>
            <div className="config-page__agent-scope-list">
              {AGENT_MCP_SCOPE_CATALOG.map((row) => {
                const raw = String(form.agent_mcp_allowed_scopes || '').trim();
                const selected = raw
                  ? new Set(raw.split(/\s+/).filter(Boolean))
                  : new Set(AGENT_MCP_SCOPE_CATALOG.map((c) => c.scope));
                const checked = selected.has(row.scope);
                return (
                  <label
                    key={row.scope}
                    className={`config-page__agent-scope-row${checked ? ' config-page__agent-scope-row--on' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={readOnly}
                      onChange={(e) => {
                        const eff = new Set(
                          String(form.agent_mcp_allowed_scopes || '').trim()
                            ? form.agent_mcp_allowed_scopes.split(/\s+/).filter(Boolean)
                            : AGENT_MCP_SCOPE_CATALOG.map((c) => c.scope)
                        );
                        if (e.target.checked) {
                          eff.add(row.scope);
                        } else {
                          eff.delete(row.scope);
                          if (eff.size === 0) {
                            notifyError('Select at least one Agent MCP scope.');
                            return;
                          }
                        }
                        handleChange('agent_mcp_allowed_scopes', [...eff].join(' '));
                      }}
                      style={{ marginTop: '0.2rem', flexShrink: 0 }}
                    />
                    <span className="config-page__agent-scope-body">
                      <span className="config-page__agent-scope-label">{row.label}</span>
                      <code className="config-page__agent-scope-code">{row.scope}</code>
                      <span className="config-page__agent-scope-desc">{row.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </CollapsibleCard>

          {/* ── Section 1: PingOne Environment ── */}
          <CollapsibleCard
            title="PingOne Environment"
            subtitle={deploymentManaged
              ? 'Values reflect the deployment (read-only) — OAuth clients are configured server-side'
              : 'Environment ID, region, and frontend URL — test the connection before signing in'}
          >
            <div className="config-page__grid">
              <div className="config-page__grid-span-2">
                <TextField
                  label="Environment ID"
                  fieldKey="pingone_environment_id"
                  value={form.pingone_environment_id}
                  onChange={handleChange}
                  placeholder="e.g. a1b2c3d4-e5f6-7890-abcd-ef1234567890"
                  help="Found in PingOne → Environments → (your env) → Settings → Environment ID"
                  disabled={readOnly || deploymentManaged}
                />
              </div>
              <div>
                <label className="form-label">Region</label>
                <select
                  className="form-input"
                  value={form.pingone_region}
                  onChange={(e) => handleChange('pingone_region', e.target.value)}
                  disabled={readOnly || deploymentManaged}
                >
                  {REGION_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <TextField
                label="Frontend URL"
                fieldKey="frontend_url"
                value={form.frontend_url}
                onChange={handleChange}
                placeholder={window.location.origin}
                help="The URL your React app is served from"
                disabled={readOnly || deploymentManaged}
              />
            </div>

            {/* Test connection */}
            <div className="config-page__test-row">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleTest}
                disabled={testing || !form.pingone_environment_id || !form.admin_client_id}
              >
                {testing ? 'Testing…' : '🔌 Test PingOne Connection'}
              </button>
              {testResult && (
                <div className={`config-page__test-result ${testResult.ok ? 'config-page__test-result--ok' : 'config-page__test-result--err'}`}>
                  {testResult.ok ? `✓ ${testResult.message}` : `✗ ${testResult.message}`}
                  {testResult.ok && testResult.issuer && (
                    <div className="config-page__test-issuer">Issuer: {testResult.issuer}</div>
                  )}
                </div>
              )}
            </div>
          </CollapsibleCard>

          {/* ── OAuth: hosted managed vs local full editor ── */}
          {deploymentManaged ? (
            <CollapsibleCard
              title="PingOne OAuth (server-side)"
              subtitle="Client credentials are on the backend — register the redirect URIs above in PingOne"
              className="config-page__card--oauth-hosted"
            >
              <p className="config-page__card-subtitle" style={{ margin: 0 }}>
                Admin and Customer apps use client credentials stored <strong>on the backend</strong>. Redirect URIs you must add in PingOne are in the <strong>"Register these redirect URIs"</strong> section above (copy/paste). You do not type client secrets on this page.
                {' '}Optional <strong>pi.flow</strong> authorize: set deployment env <code>PINGONE_ADMIN_AUTHORIZE_PI_FLOW=true</code> or <code>PINGONE_USER_AUTHORIZE_PI_FLOW=true</code> only when your PingOne apps support it (
                <a href="https://developer.pingidentity.com/pingone-api/auth/auth-config-options/browserless-authentication-flow-options.html" target="_blank" rel="noopener noreferrer">docs</a>
                ).
              </p>
            </CollapsibleCard>
          ) : (
            <>
              <CollapsibleCard
                title="Admin OAuth App"
                subtitle="Authorization Code + PKCE · used for admin dashboard sign-in"
              >
                <div className="config-page__grid">
                  <TextField
                    label="Client ID"
                    fieldKey="admin_client_id"
                    value={form.admin_client_id}
                    onChange={handleChange}
                    placeholder="Admin app client ID"
                    disabled={readOnly}
                  />
                  <div />
                  <div className="config-page__grid-span-2">
                    <SecretField
                      label="Client Secret"
                      fieldKey="admin_client_secret"
                      value={form.admin_client_secret}
                      isSet={!!secretMeta.admin_client_secret_set}
                      showValue={!!showSecret.admin_client_secret}
                      onToggleShow={toggleShow}
                      onChange={handleChange}
                      help="Leave blank to keep the existing secret stored on the server"
                      disabled={readOnly}
                    />
                  </div>
                  <div className="config-page__grid-span-2">
                    <TextField
                      label="Redirect URI (must match PingOne app settings)"
                      fieldKey="admin_redirect_uri"
                      value={form.admin_redirect_uri}
                      onChange={handleChange}
                      placeholder={`${window.location.origin}/api/auth/oauth/callback`}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="form-group config-page__grid-span-2">
                    <label className="form-label">PingOne authorize — pi.flow</label>
                    <select
                      className="form-input"
                      value={form.admin_pingone_authorize_pi_flow}
                      onChange={(e) => handleChange('admin_pingone_authorize_pi_flow', e.target.value)}
                      disabled={readOnly}
                    >
                      <option value="false">Standard (response_type=code, redirect with ?code=)</option>
                      <option value="true">pi.flow — response_type=pi.flow + response_mode=pi.flow</option>
                    </select>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      Enable only when this PingOne app supports non-redirect / DaVinci flow authorize (see{' '}
                      <a href="https://developer.pingidentity.com/pingone-api/auth/auth-config-options/browserless-authentication-flow-options.html" target="_blank" rel="noopener noreferrer">PingOne: redirect and non-redirect flows</a>
                      ). Default stays authorization code + PKCE.
                    </p>
                  </div>
                </div>
              </CollapsibleCard>

              <CollapsibleCard
                title="End-User OAuth App"
                subtitle="Authorization Code + PKCE · used for customer sign-in — separate PingOne app from admin"
              >
                <div className="config-page__grid">
                  <TextField
                    label="Client ID"
                    fieldKey="user_client_id"
                    value={form.user_client_id}
                    onChange={handleChange}
                    placeholder="End-user app client ID"
                    disabled={readOnly}
                  />
                  <div />
                  <div className="config-page__grid-span-2">
                    <SecretField
                      label="Client Secret"
                      fieldKey="user_client_secret"
                      value={form.user_client_secret}
                      isSet={!!secretMeta.user_client_secret_set}
                      showValue={!!showSecret.user_client_secret}
                      onToggleShow={toggleShow}
                      onChange={handleChange}
                      help="Leave blank to keep the existing secret stored on the server"
                      disabled={readOnly}
                    />
                  </div>
                  <div className="config-page__grid-span-2">
                    <TextField
                      label="Redirect URI (must match PingOne app settings)"
                      fieldKey="user_redirect_uri"
                      value={form.user_redirect_uri}
                      onChange={handleChange}
                      placeholder={`${window.location.origin}/api/auth/oauth/user/callback`}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="form-group config-page__grid-span-2">
                    <label className="form-label">PingOne authorize — pi.flow (end-user)</label>
                    <select
                      className="form-input"
                      value={form.user_pingone_authorize_pi_flow}
                      onChange={(e) => handleChange('user_pingone_authorize_pi_flow', e.target.value)}
                      disabled={readOnly}
                    >
                      <option value="false">Standard (response_type=code)</option>
                      <option value="true">pi.flow — response_type=pi.flow + response_mode=pi.flow</option>
                    </select>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      Applies to <strong>all</strong> customer logins when enabled. For marketing-only pi.flow, use{' '}
                      <strong>Marketing customer sign-in</strong> below instead.
                    </p>
                  </div>
                </div>
              </CollapsibleCard>

              <CollapsibleCard
                title="Marketing customer sign-in"
                subtitle="Home / marketing page — redirect vs slide-over + demo hints + use_pi_flow=1"
              >
                <div className="config-page__grid">
                  <div className="form-group config-page__grid-span-2">
                    <label className="form-label">Customer login on marketing page</label>
                    <select
                      className="form-input"
                      value={form.marketing_customer_login_mode}
                      onChange={(e) => handleChange('marketing_customer_login_mode', e.target.value)}
                      disabled={readOnly}
                    >
                      <option value="redirect">Redirect — standard authorize (code + PKCE)</option>
                      <option value="slide_pi_flow">Slide panel — hints + Continue with pi.flow (?use_pi_flow=1)</option>
                    </select>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      <strong>Redirect</strong> is the safe default. <strong>pi.flow</strong> requires a PingOne OIDC app
                      that supports it — otherwise use <strong>Redirect</strong> (same choice as Demo config).
                    </p>
                  </div>
                  <div className="config-page__grid-span-2">
                    <TextField
                      label="Demo username hint (shown in slide panel — not a secret)"
                      fieldKey="marketing_demo_username_hint"
                      value={form.marketing_demo_username_hint}
                      onChange={handleChange}
                      placeholder="e.g. bankuser or your PingOne preferred_username"
                      disabled={readOnly}
                    />
                  </div>
                  <div className="config-page__grid-span-2">
                    <TextField
                      label="Demo password hint (shown in slide panel — not a secret)"
                      fieldKey="marketing_demo_password_hint"
                      value={form.marketing_demo_password_hint}
                      onChange={handleChange}
                      placeholder="e.g. use your sandbox password policy"
                      disabled={readOnly}
                    />
                  </div>
                </div>
              </CollapsibleCard>
            </>
          )}

          {/* ── Section 4: Session & Roles ── */}
          <CollapsibleCard
            title="Session & Roles"
            subtitle="Session cookie secret + admin/customer role names must match PingOne"
          >
            <div className="config-page__grid">
              <TextField
                label="Admin Role name (in PingOne)"
                fieldKey="admin_role"
                value={form.admin_role}
                onChange={handleChange}
                placeholder="admin"
                disabled={readOnly}
              />
              <TextField
                label="Customer Role name (in PingOne)"
                fieldKey="user_role"
                value={form.user_role}
                onChange={handleChange}
                placeholder="customer"
                disabled={readOnly}
              />
              <TextField
                label="Admin Population ID (PingOne)"
                fieldKey="admin_population_id"
                value={form.admin_population_id}
                onChange={handleChange}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                helpText="ID of the PingOne population (e.g. bankAdmins) whose members receive admin role. Map population.id into your app's attribute contract in PingOne — no schema changes needed."
                disabled={readOnly}
              />
              <TextField
                label="Admin Role Claim (custom PingOne attribute)"
                fieldKey="admin_role_claim"
                value={form.admin_role_claim}
                onChange={handleChange}
                placeholder="bankingRole"
                helpText="Name of a custom PingOne userinfo claim to inspect. Its value must match the Admin Role name above."
                disabled={readOnly}
              />
              <div className="config-page__grid-span-2">
                <TextField
                  label="Admin usernames — permanent allowlist (comma-separated)"
                  fieldKey="admin_username"
                  value={form.admin_username}
                  onChange={handleChange}
                  placeholder="bankadmin, bankuser"
                  helpText="preferred_username values that always get admin, regardless of PingOne claims. Use for service/test accounts."
                  disabled={readOnly}
                />
              </div>
              <div className="config-page__grid-span-2">
                <SecretField
                  label="Session Secret"
                  fieldKey="session_secret"
                  value={form.session_secret}
                  isSet={!!secretMeta.session_secret_set}
                  showValue={!!showSecret.session_secret}
                  onToggleShow={toggleShow}
                  onChange={handleChange}
                  help="Random string used to sign session cookies — use at least 32 characters"
                  disabled={readOnly}
                />
              </div>
            </div>
          </CollapsibleCard>

          {/* ── Section 5: Step-Up Authentication ── */}
          <CollapsibleCard
            title="Step-Up Authentication"
            subtitle="Challenge method for large transfers — CIBA (inline) or Email/OTP (redirect)"
            defaultOpen={false}
          >
            <div className="config-page__grid">
              <div className="form-group">
                <label className="form-label">Step-up method</label>
                <select
                  className="form-input"
                  value={form.step_up_method}
                  onChange={(e) => handleChange('step_up_method', e.target.value)}
                  disabled={readOnly}
                >
                  <option value="ciba">CIBA — back-channel challenge (inline, no page redirect)</option>
                  <option value="email">Email / OTP — OIDC re-authentication redirect</option>
                </select>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  <strong>CIBA:</strong> the dashboard shows a "Verify via CIBA" button that sends a
                  back-channel auth request; the user approves on their registered device.{' '}
                  <strong>Email / OTP:</strong> the browser redirects to PingOne for a fresh MFA
                  sign-in (email code, TOTP, etc.).
                </p>
              </div>
              <div className="form-group">
                <label className="form-label">Enable CIBA globally</label>
                <select
                  className="form-input"
                  value={form.ciba_enabled}
                  onChange={(e) => handleChange('ciba_enabled', e.target.value)}
                  disabled={readOnly}
                >
                  <option value="false">Disabled</option>
                  <option value="true">Enabled</option>
                </select>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Required when step-up method is CIBA. Also controls the CIBA panel on the
                  demo pages.
                </p>
              </div>
            </div>
          </CollapsibleCard>

          {/* ── Section 6: PingOne Authorize (in-app authorization) ── */}
          <CollapsibleCard
            title="PingOne Authorize — In-App Authorization"
            subtitle="Policy-based authorization for transfers and withdrawals (optional)"
            defaultOpen={false}
          >
            <div className="config-page__grid">
              <div className="form-group">
                <label className="form-label">Enable PingOne Authorize</label>
                <select
                  className="form-input"
                  value={form.authorize_enabled}
                  onChange={(e) => handleChange('authorize_enabled', e.target.value)}
                  disabled={readOnly}
                >
                  <option value="false">Disabled</option>
                  <option value="true">Enabled — enforce on transfers &amp; withdrawals</option>
                </select>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  When enabled, every transfer and withdrawal is evaluated against the policy below.
                </p>
              </div>
              <TextField
                label="Decision Endpoint ID (Phase 2 — preferred)"
                fieldKey="authorize_decision_endpoint_id"
                value={form.authorize_decision_endpoint_id}
                onChange={handleChange}
                placeholder="e.g. 87554d55-a7cf-…"
                help="Endpoint ID from PingOne Authorize → Decision Endpoints. When set, uses the current Decision Endpoints API (POST /decisionEndpoints/{id}). Takes priority over Policy Decision Point ID below."
                disabled={readOnly}
              />
              <TextField
                label="MCP first-tool Decision Endpoint ID (optional)"
                fieldKey="authorize_mcp_decision_endpoint_id"
                value={form.authorize_mcp_decision_endpoint_id}
                onChange={handleChange}
                placeholder="Separate endpoint for MCP delegation policy"
                help="When **Feature flag: Authorize — First MCP tool** is ON and Simulated Authorize is OFF, the BFF POSTs Trust Framework parameters with **DecisionContext=McpFirstTool**, **UserId**, **ToolName**, **TokenAudience**, **ActClientId**, **NestedActClientId**, **McpResourceUri**. Create this decision endpoint and matching policy in PingOne Authorize."
                disabled={readOnly}
              />
              <TextField
                label="Policy Decision Point ID (Phase 1 — legacy fallback)"
                fieldKey="authorize_policy_id"
                value={form.authorize_policy_id}
                onChange={handleChange}
                placeholder="e.g. abc12345-…"
                help="Legacy PDP ID. Used only when Decision Endpoint ID above is not set. From PingOne Authorize → Policy Decision Points."
                disabled={readOnly}
              />
            </div>
            {deploymentManaged ? (
              <div className="config-page__note-box" style={{ marginTop: '1rem' }}>
                <strong>Worker app credentials</strong> for PingOne Authorize are configured in the deployment (same as OAuth clients). They are not edited on this page.
              </div>
            ) : (
              <div className="config-page__grid" style={{ marginTop: '1rem' }}>
                <TextField
                  label="Worker App Client ID"
                  fieldKey="authorize_worker_client_id"
                  value={form.authorize_worker_client_id}
                  onChange={handleChange}
                  placeholder="Worker app client ID"
                  help="Client ID of the Worker application used to obtain tokens for policy evaluation."
                  disabled={readOnly}
                />
                <SecretField
                  label="Worker App Client Secret"
                  fieldKey="authorize_worker_client_secret"
                  value={form.authorize_worker_client_secret}
                  isSet={secretMeta.authorize_worker_client_secret_set}
                  showValue={!!showSecret.authorize_worker_client_secret}
                  onToggleShow={toggleShow}
                  onChange={handleChange}
                  help="Client secret for the Worker app. Stored encrypted at rest."
                  disabled={readOnly}
                />
              </div>
            )}
          </CollapsibleCard>

          <CollapsibleCard
            title="MCP Inspector Setup"
            subtitle="Generate env snippets and commands for testing MCP tools (browser or npm)"
            defaultOpen={false}
            passthrough
          >
            <McpInspectorSetupWizard
              appBaseUrl={form.frontend_url || (typeof window !== 'undefined' ? window.location.origin : '')}
              mcpAgentUrl={form.mcp_server_url}
              storageType={storageType}
            />
          </CollapsibleCard>

          {/* ── Section 7: Advanced ── */}
          <CollapsibleCard
            title="Advanced"
            subtitle="LangChain / MCP Agent URL and debug logging"
            defaultOpen={false}
          >

            {/* Hosted warning: LangChain agent is local-only */}
            {storageType === 'vercel-kv' && (
              <div className="config-page__callout">
                <span style={{ fontSize: '1rem', lineHeight: 1 }}>⚠️</span>
                <div>
                  <strong>LangChain / MCP Agent not available on hosted cloud.</strong> The agent runs
                  as a local Python process and cannot be reached from a browser-only cloud deployment (Vercel, Replit web, etc.).
                  Leave this field blank — the chat panel will show a "not configured" message
                  instead of failing silently.
                </div>
              </div>
            )}

            <div className="config-page__grid">
              <TextField
                label="LangChain / MCP Agent URL"
                fieldKey="mcp_server_url"
                value={form.mcp_server_url}
                onChange={handleChange}
                placeholder={storageType === 'vercel-kv' ? 'Not available on hosted cloud — leave blank' : 'http://localhost:8000'}
                help={storageType === 'vercel-kv'
                  ? '⚠️ This URL is only reachable when running locally. On Replit/Vercel, clear this field.'
                  : 'URL of the banking LangChain agent (WebSocket). Local only — not reachable from hosted cloud.'}
                disabled={readOnly}
              />
              <TextField
                label="MCP Resource URI (RFC 8693 audience)"
                fieldKey="mcp_resource_uri"
                value={form.mcp_resource_uri}
                onChange={handleChange}
                placeholder="https://mcp.example.com or urn:pingone:mcp"
                help="Required for RFC 8693 token exchange. The audience (aud) the exchanged MCP token will be scoped to. Must match the Resource registered in PingOne. Also set via MCP_SERVER_RESOURCE_URI env var."
                disabled={readOnly}
              />
              <div>
                <label className="form-label">Debug OAuth logging</label>
                <select
                  className="form-input"
                  value={form.debug_oauth}
                  onChange={(e) => handleChange('debug_oauth', e.target.value)}
                  disabled={readOnly}
                >
                  <option value="false">Off</option>
                  <option value="true">On (verbose)</option>
                </select>
              </div>
            </div>

            {/* Hosted KV: admin password may be required — hidden in read-only mode */}
            {storageType === 'vercel-kv' && !readOnly && (
              <div className="config-page__divider">
                <div className="config-page__callout config-page__callout--purple" style={{ marginBottom: '0.75rem' }}>
                  <strong>🔑 Config password</strong> — once credentials are saved, updates require
                  an admin password. Set <code>ADMIN_CONFIG_PASSWORD</code> in your Replit / Vercel secrets
                  variables, then enter it here before saving. Leave blank on first-time setup.
                </div>
                <div className="form-group" style={{ maxWidth: '400px' }}>
                  <label className="form-label">Config Password (hosted KV)</label>
                  <input
                    type="password"
                    className="form-input"
                    value={configPassword}
                    onChange={(e) => setConfigPassword(e.target.value)}
                    placeholder="Value of ADMIN_CONFIG_PASSWORD env var"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    data-form-type="other"
                  />
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    Required to overwrite config when the API uses this gate. Not stored — enter each session.
                  </p>
                </div>
              </div>
            )}
          </CollapsibleCard>

        </form>

        {/* ── Display Preferences (localStorage only — no server POST) ── */}
        <DisplayPreferences />

        <AgentLayoutPreferences />

        {/* ── Vercel Config ── */}
        {redirectInfo && (
          <div className="card" style={{ marginTop: '2rem', borderColor: '#fbbf24', background: '#fffbeb' }}>
            <div className="card-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
              <h2 className="card-title" style={{ margin: 0 }}>Vercel Config</h2>
              <span style={{ fontSize: '0.8rem', color: '#92400e' }}>
                Values the server is currently using — read from Vercel environment variables.
                Compare these against your PingOne app settings to diagnose login failures.
              </span>
            </div>
            <div style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.8rem', display: 'grid', gap: '0.6rem' }}>
              {[
                { label: 'Environment ID',     value: redirectInfo.environmentId },
                { label: 'Admin Client ID',    value: redirectInfo.adminClientId },
                { label: 'Admin Secret',       value: redirectInfo.adminSecretSet ? `${redirectInfo.adminSecretHint}•••• (set)` : null },
                { label: 'User Client ID',     value: redirectInfo.userClientId },
                { label: 'User Secret',        value: redirectInfo.userSecretSet  ? `${redirectInfo.userSecretHint}•••• (set)`  : null },
                { label: 'Admin Redirect URI', value: redirectInfo.adminRedirectUri },
                { label: 'User Redirect URI',  value: redirectInfo.userRedirectUri },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ color: '#92400e', fontWeight: 600, fontFamily: 'sans-serif', fontSize: '0.75rem' }}>{label}</span>
                  <span style={{
                    background: value ? '#fff' : '#fee2e2',
                    border: `1px solid ${value ? '#fde68a' : '#fca5a5'}`,
                    borderRadius: '4px',
                    padding: '0.25rem 0.5rem',
                    color: value ? '#1f2937' : '#dc2626',
                    wordBreak: 'break-all',
                  }}>
                    {value || 'MISSING'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Run Your Own Instance ── */}
        <div className="config-page__expand-wrap">
          <button
            type="button"
            className="config-page__expand-btn"
            onClick={() => setShowSelfHosting((v) => !v)}
          >
            🚀 Run Your Own Instance
            <span className="config-page__expand-chevron">{showSelfHosting ? '▲' : '▼'}</span>
          </button>

          {showSelfHosting && (
            <div className="card config-page__self-host-card">
              <div className="card-header">
                <h2 className="card-title">Run Your Own Instance</h2>
                <p className="config-page__card-subtitle" style={{ margin: 0 }}>
                  The hosted demo at <code>banking-demo-puce.vercel.app</code> may use a shared PingOne environment (see project docs for the current URL).
                  Your own deployment gets its own isolated PingOne environment — users you create there are separate.
                </p>
              </div>

              <div className="config-page__callout" style={{ marginBottom: '1.5rem' }}>
                <strong>Client secrets are optional</strong> — both deployment modes support PKCE (public client).
                Only expose a client secret if your PingOne app is configured as confidential.
              </div>

              <div className="config-page__self-host-grid">

                {/* Path A: hosted cloud */}
                <div className="config-page__path-card config-page__path-card--indigo">
                  <h3 className="config-page__path-title">☁️ Path A: Deploy (Vercel or Replit)</h3>
                  <p className="config-page__path-desc">
                    Your own PingOne environment, zero-downtime deploys, free tier available.
                  </p>
                  <ol className="config-page__path-steps">
                    <li>Fork or clone the repo from GitHub</li>
                    <li>In PingOne, create <strong>two OIDC web apps</strong> (Admin + Customer) and note each Client ID</li>
                    <li>Set these environment variables on your host (Vercel, Replit Secrets, etc.):
                      <table className="config-page__env-table">
                        <tbody>
                          {[
                            ['PINGONE_ENVIRONMENT_ID', 'Your PingOne env UUID'],
                            ['PINGONE_REGION', 'com / eu / ca / asia / com.au'],
                            ['PINGONE_ADMIN_CLIENT_ID', 'Admin app Client ID'],
                            ['PINGONE_ADMIN_CLIENT_SECRET', 'Admin secret (or omit for PKCE-only)'],
                            ['PINGONE_USER_CLIENT_ID', 'Customer app Client ID'],
                            ['PINGONE_USER_CLIENT_SECRET', 'Customer secret (or omit)'],
                            ['PINGONE_ADMIN_ROLE', 'Role name (default: admin)'],
                            ['PINGONE_USER_ROLE', 'Role name (default: customer)'],
                            ['SESSION_SECRET', 'Random 32+ char string'],
                            ['PUBLIC_APP_URL', 'Your public URL (e.g. https://my-app.vercel.app or *.replit.dev)'],
                          ].map(([k, v]) => (
                            <tr key={k}>
                              <td className="config-page__env-key">{k}</td>
                              <td className="config-page__env-val">{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </li>
                    <li>Add the redirect URIs shown on this page to each PingOne app</li>
                    <li>
                      <strong>Replit-specific (optional but recommended):</strong>{' '}
                      set <code>REPLIT_MANAGED_OAUTH=true</code> when this page should be reference-only for OAuth credentials,
                      and set <code>REPLIT_CONFIG_PASSWORD_MODE=true</code> + <code>ADMIN_CONFIG_PASSWORD</code> if you want
                      password-gated config updates on hosted deployments.
                    </li>
                    <li>
                      <strong>Replit networking:</strong> if UI and API are on different origins, set <code>CORS_ORIGIN</code> to the UI URL.
                      Keep <code>PUBLIC_APP_URL</code> as your stable published Replit HTTPS URL (no trailing slash).
                    </li>
                    <li>Deploy — no additional setup needed</li>
                  </ol>
                </div>

                {/* Path B: Localhost */}
                <div className="config-page__path-card config-page__path-card--green">
                  <h3 className="config-page__path-title">🖥️ Path B: Run on localhost</h3>
                  <p className="config-page__path-desc">
                    Default API server uses <code>api.pingdemo.com</code> as the host.
                  </p>
                  <ol className="config-page__path-steps">
                    <li>Clone the repo</li>
                    <li>Copy <code>banking_api_server/.env.example</code> → <code>banking_api_server/.env</code> and fill in your PingOne values</li>
                    <li>By default the API server listens on <code>api.pingdemo.com</code> — add that to your local hosts file, or change <code>PORT</code>/<code>HOST</code> in <code>.env</code></li>
                    <li>
                      <code>npm install &amp;&amp; npm run dev</code> in <code>banking_api_server/</code>
                    </li>
                    <li>
                      <code>npm install &amp;&amp; npm start</code> in <code>banking_api_ui/</code>
                    </li>
                    <li>Open this Config page and follow the on-screen setup</li>
                  </ol>
                </div>

              </div>
            </div>
          )}
        </div>


        {/* ── LangChain Agent configuration ── */}
        <CollapsibleCard
          title="LangChain Agent"
          subtitle="Multi-provider LLM config — keys stored in session only, never returned to browser"
          defaultOpen={false}
          className="config-page__card--langchain"
        >
          <LangChainAgentConfig />
        </CollapsibleCard>

        {/* ── Primary actions (page bottom — after all sections) ── */}
        {!readOnly && (
          <div className="config-page__actions config-page__actions--footer">
            <button type="button" className="btn btn-secondary" onClick={loadConfig}>
              ↺ Reload from server
            </button>
            <button type="submit" form="config-main-form" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : '💾 Save Configuration'}
            </button>
          </div>
        )}

      </div>
      </div>
    </div>
  );
}
