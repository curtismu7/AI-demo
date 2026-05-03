// banking_api_ui/src/components/DemoSetupPanel.js
// Inner content of the demo setup — used by /configure?tab=demo-management.
// No page chrome (no header, breadcrumbs, or side nav).
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { notifySuccess, notifyError, notifyWarning, notifyInfo } from '../utils/appToast';
import axios from 'axios';
import apiClient from '../services/apiClient';
import { fetchDemoScenario, saveDemoScenario } from '../services/demoScenarioService';
import { AGENT_MCP_SCOPE_CATALOG, DEFAULT_AGENT_MCP_ALLOWED_SCOPES } from '../config/agentMcpScopes';
import { useIndustryBranding } from '../context/IndustryBrandingContext';
import { useVertical } from '../context/VerticalContext';
import VerticalSwitcher from './VerticalSwitcher';
import PingOneAudit from './PingOneAudit';
import './DemoDataPage.css';

const AGENT_AUTH_DEMO_STORAGE_KEY = 'bx-agent-auth-demo-mode';
const AGENT_AUTH_DEMO = {
  OAUTH_PKCE: 'oauth_pkce',
  PI_FLOW_MARKETING: 'pi_flow_marketing',
  BEARER_PASTE: 'bearer_paste',
};

function readStoredAgentAuthDemoMode() {
  try {
    const v = localStorage.getItem(AGENT_AUTH_DEMO_STORAGE_KEY);
    if (v === AGENT_AUTH_DEMO.BEARER_PASTE || v === AGENT_AUTH_DEMO.PI_FLOW_MARKETING) return v;
    if (v === 'credential_story') return AGENT_AUTH_DEMO.PI_FLOW_MARKETING;
  } catch (_) { /* ignore */ }
  return AGENT_AUTH_DEMO.OAUTH_PKCE;
}

const ACCOUNT_TYPE_SLOTS = [
  { type: 'checking',      label: 'Checking',             icon: '🏦', defaultName: 'Checking Account' },
  { type: 'savings',       label: 'Savings',              icon: '💰', defaultName: 'Savings Account' },
  { type: 'investment',    label: 'Investment',           icon: '📈', defaultName: 'Investment Account' },
  { type: 'money_market',  label: 'Money market',         icon: '💵', defaultName: 'Money Market Account' },
  { type: 'credit',        label: 'Credit card',          icon: '💳', defaultName: 'Credit Card' },
  { type: 'car_loan',      label: 'Car loan',             icon: '🚗', defaultName: 'Car Loan' },
  { type: 'mortgage',      label: 'Mortgage (home loan)', icon: '🏠', defaultName: 'Mortgage (Home Loan)' },
];

function defaultTypeSlots(accountTypes = ACCOUNT_TYPE_SLOTS) {
  const m = {};
  for (const s of accountTypes) {
    m[s.type] = { enabled: false, name: s.defaultName, balance: '0', id: null, accountNumber: '' };
  }
  return m;
}

function defaultAccountProfile(type, accountHolderName) {
  return {
    swiftCode: 'CHASUS33',
    iban: type === 'savings' ? 'US98CHAS0987654321098' : 'US12CHAS0123456789012',
    branchName: 'Super Banking Main Branch',
    branchCode: '001',
    openedDate: '2022-01-15',
    accountHolderName: accountHolderName || '',
    routingNumber: '021000021',
    accountNumberFull: '',
    includeRoutingNumber: true,
    includeAccountNumberFull: false,
  };
}

export default function DemoSetupPanel() {
  useIndustryBranding();
  const { vertical } = useVertical();

  // Build account type slots dynamically based on vertical — memoized to prevent useEffect re-runs
  const ACCOUNT_TYPES = useMemo(() => {
    if (vertical?.terminology?.accountTypes?.length) {
      return vertical.terminology.accountTypes.map((name, idx) => ({
        type: `type_${idx}`,
        label: name,
        icon: '💳',
        defaultName: name
      }));
    }
    return ACCOUNT_TYPE_SLOTS;
  }, [vertical]);

  const [demoResetting, setDemoResetting] = useState(false);
  const handleResetDemo = async () => {
    if (!window.confirm('Reset demo? This clears all agent history, token chain events, and MCP audit logs. You will stay logged in.')) return;
    setDemoResetting(true);
    try { await axios.post('/api/admin/reset-demo'); } catch (_) {}
    try { localStorage.removeItem('tokenChainHistory'); } catch (_) {}
    try { localStorage.removeItem('api-traffic-store'); } catch (_) {}
    try { sessionStorage.removeItem('_agent_auto_loaded'); } catch (_) {}
    window.location.reload();
  };

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storageBackend, setStorageBackend] = useState(null);
  const [typeSlots, setTypeSlots] = useState(() => defaultTypeSlots(ACCOUNT_TYPES));
  const [accountProfiles, setAccountProfiles] = useState({});
  const [accountProfileSaving, setAccountProfileSaving] = useState(false);
  const [threshold, setThreshold] = useState('');

  const [agentTokenEndpointAuth, setAgentTokenEndpointAuth] = useState('');
  const [mcpTokenEndpointAuth, setMcpTokenEndpointAuth] = useState('');
  const [tokenAuthSaving, setTokenAuthSaving] = useState(false);

  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    isActive: true,
  });
  const [userMeta, setUserMeta] = useState({ id: '', role: '', createdAt: '' });
  const [defaults, setDefaults] = useState(null);
  const [persistenceNote, setPersistenceNote] = useState(null);
  const [collapsedSections, setCollapsedSections] = useState({ accountProfile: true });

  const [allowedScopes, setAllowedScopes] = useState(() => {
    const raw = DEFAULT_AGENT_MCP_ALLOWED_SCOPES;
    return new Set(raw.split(/\s+/).filter(Boolean));
  });
  const [scopeSaving, setScopeSaving] = useState(false);

  const [marketingLoginMode, setMarketingLoginMode] = useState('redirect');
  const [marketingUserHint, setMarketingUserHint] = useState('');
  const [marketingPassHint, setMarketingPassHint] = useState('');
  const [marketingSaving, setMarketingSaving] = useState(false);


  const loadScopes = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/admin/config');
      const cfg = data?.config || data;
      const raw = cfg?.agent_mcp_allowed_scopes || DEFAULT_AGENT_MCP_ALLOWED_SCOPES;
      setAllowedScopes(new Set(raw.split(/\s+/).filter(Boolean)));
      setMarketingLoginMode(cfg?.marketing_customer_login_mode === 'slide_pi_flow' ? 'slide_pi_flow' : 'redirect');
      setMarketingUserHint(String(cfg?.marketing_demo_username_hint ?? ''));
      setMarketingPassHint(String(cfg?.marketing_demo_password_hint ?? ''));
    } catch { /* silently keep client default */ }
  }, []);

  const handleScopeToggle = (scope, checked) => {
    setAllowedScopes((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(scope);
      } else {
        if (next.size === 1) {
          notifyError('Select at least one Agent MCP scope.');
          return prev;
        }
        next.delete(scope);
      }
      return next;
    });
  };

  const handleSaveScopes = async () => {
    setScopeSaving(true);
    try {
      await axios.post('/api/admin/config', {
        agent_mcp_allowed_scopes: [...allowedScopes].join(' '),
      });
      notifySuccess('Scope permissions saved');
    } catch (err) {
      notifyError(err?.response?.data?.message || 'Failed to save scopes');
    } finally {
      setScopeSaving(false);
    }
  };

  const handleSaveMarketingLogin = async () => {
    setMarketingSaving(true);
    try {
      await axios.post('/api/admin/config', {
        marketing_customer_login_mode: marketingLoginMode,
        marketing_demo_username_hint: marketingUserHint.trim(),
        marketing_demo_password_hint: marketingPassHint.trim(),
      });
      notifySuccess('Marketing sign-in settings saved');
    } catch (err) {
      notifyError(err?.response?.data?.message || err.message || 'Failed to save marketing sign-in settings');
    } finally {
      setMarketingSaving(false);
    }
  };

  // Helix LLM configuration
  const [helixConfig, setHelixConfig] = useState({ base_url: '', api_key: '', environment_id: '', agent_id: '' });
  const [helixStatus, setHelixStatus] = useState(null);
  const [helixSaving, setHelixSaving] = useState(false);
  const [helixChecking, setHelixChecking] = useState(false);

  const fetchHelixStatus = useCallback(async () => {
    setHelixChecking(true);
    try {
      const statusRes = await axios.get('/api/langchain/provider/helix/status');
      setHelixStatus(statusRes.data.status);

      const configRes = await axios.get('/api/langchain/config/status');
      const cfg = configRes.data;
      setHelixConfig((prev) => {
        const newConfig = {
          base_url: cfg.helix_base_url || prev.base_url || '',
          api_key: prev.api_key || '', // Keep user-entered value
          environment_id: cfg.helix_environment_id || prev.environment_id || '',
          agent_id: cfg.helix_agent_id || prev.agent_id || '',
        };
        // Save to localStorage for persistence
        localStorage.setItem('helix_config', JSON.stringify(newConfig));
        return newConfig;
      });
    } catch (err) {
      console.error('Helix status check failed:', err);
      notifyError('Failed to check Helix status');
    } finally {
      setHelixChecking(false);
    }
  }, []);

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
        helix_api_key: helixConfig.api_key,
        helix_base_url: helixConfig.base_url,
        helix_environment_id: helixConfig.environment_id,
        helix_agent_id: helixConfig.agent_id,
      });
      // Save to localStorage
      localStorage.setItem('helix_config', JSON.stringify(helixConfig));
      notifySuccess('Helix configuration saved and activated');
      await fetchHelixStatus();
    } catch (e) {
      notifyError(`Failed to save Helix config: ${e.response?.data?.error || e.message}`);
    } finally {
      setHelixSaving(false);
    }
  };

  const [mayActEnabled, setMayActEnabled] = useState(null);
  const [mayActSaving, setMayActSaving] = useState(false);
  const [delegationMode, setDelegationMode] = useState('1exchange');

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include', _silent: true })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setMayActEnabled(data.mayAct != null && data.mayAct !== false);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load Helix config from localStorage on component mount
  useEffect(() => {
    const savedHelix = localStorage.getItem('helix_config');
    if (savedHelix) {
      try {
        const parsed = JSON.parse(savedHelix);
        setHelixConfig(parsed);
      } catch (err) {
        console.warn('Failed to parse Helix config from localStorage:', err);
      }
    }
    fetchHelixStatus();
  }, [fetchHelixStatus]);

  const handleSetMayAct = async (enable) => {
    setMayActSaving(true);
    try {
      await apiClient.patch('/api/demo/may-act', { enabled: enable, mode: delegationMode });
      setMayActEnabled(enable);
      const modeLabel = delegationMode === '2exchange'
        ? '(AI Agent Client ID — 2-Token Exchange)'
        : '(Banking App Client ID — 1-Exchange)';
      notifySuccess(
        enable
          ? `may_act ${modeLabel} written to your PingOne user record. Sign out and back in to see it in your token.`
          : 'may_act cleared from your PingOne user record. Sign out and back in to confirm.'
      );
    } catch (err) {
      notifyError(err?.response?.data?.message || err.message || 'Failed to update may_act');
    } finally {
      setMayActSaving(false);
    }
  };

  const [mayActDiagnosis, setMayActDiagnosis] = useState(null);
  const [mayActDiagnosing, setMayActDiagnosing] = useState(false);

  const handleDiagnoseMayAct = async () => {
    setMayActDiagnosing(true);
    setMayActDiagnosis(null);
    try {
      const { data } = await apiClient.get('/api/demo/may-act/diagnose');
      setMayActDiagnosis(data);
    } catch (err) {
      notifyError(err?.response?.data?.message || err.message || 'Diagnose request failed');
    } finally {
      setMayActDiagnosing(false);
    }
  };

  const [agentAuthDemoMode, setAgentAuthDemoMode] = useState(readStoredAgentAuthDemoMode);
  const [bearerPasteToken, setBearerPasteToken] = useState('');
  const [bearerProbe, setBearerProbe] = useState(null);
  const [bearerBusy, setBearerBusy] = useState(false);

  const handleAgentAuthDemoModeChange = useCallback((mode) => {
    setAgentAuthDemoMode(mode);
    try {
      localStorage.setItem(AGENT_AUTH_DEMO_STORAGE_KEY, mode);
      window.dispatchEvent(new CustomEvent('bx-agent-auth-demo-mode', { detail: { mode } }));
    } catch (_) { /* ignore */ }
  }, []);

  const handleBearerProbeAccounts = useCallback(async () => {
    const t = bearerPasteToken.trim();
    if (!t) { notifyWarning('Paste an access token first.'); return; }
    setBearerBusy(true);
    setBearerProbe(null);
    try {
      const r = await fetch('/api/accounts', {
        method: 'GET',
        credentials: 'omit',
        headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' },
      });
      const text = await r.text();
      let body;
      try { body = JSON.parse(text); }
      catch { body = text.length > 400 ? `${text.slice(0, 400)}…` : text; }
      setBearerProbe({ ok: r.ok, status: r.status, body });
      if (r.ok) notifySuccess('Bearer token accepted by the API');
      else notifyError(`Accounts request returned HTTP ${r.status}`);
    } catch (e) {
      setBearerProbe({ ok: false, status: 0, body: e.message || 'Request failed' });
      notifyError(e.message || 'Probe failed');
    } finally {
      setBearerBusy(false);
    }
  }, [bearerPasteToken]);

  const handleTokenAuthSave = async () => {
    setTokenAuthSaving(true);
    try {
      await apiClient.patch('/api/demo-scenario/token-endpoint-auth', {
        ai_agent_token_endpoint_auth_method: agentTokenEndpointAuth || '',
        mcp_exchanger_token_endpoint_auth_method: mcpTokenEndpointAuth || '',
      });
      notifySuccess('Token endpoint auth method saved.', { autoClose: 2500 });
    } catch (err) {
      notifyWarning('Could not save token endpoint auth method.', { autoClose: 4000 });
    } finally {
      setTokenAuthSaving(false);
    }
  };

  const handleSlotChange = (type, field, value) => {
    setTypeSlots((prev) => ({ ...prev, [type]: { ...prev[type], [field]: value } }));
  };

  const handleSaveAccountProfiles = async () => {
    setAccountProfileSaving(true);
    try {
      await saveDemoScenario({ accountProfileFields: accountProfiles });
      notifySuccess('Account profile fields saved');
    } catch (err) {
      notifyError(err.message || 'Save failed');
    } finally {
      setAccountProfileSaving(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDemoScenario();
      if (data === null) { setLoading(false); return; }
      const fresh = defaultTypeSlots(ACCOUNT_TYPES);
      for (const a of (data.accounts || [])) {
        const t = (a.accountType || '').toLowerCase();
        if (fresh[t] && !fresh[t].enabled) {
          fresh[t] = {
            enabled: true,
            id: a.id || null,
            name: a.name || ACCOUNT_TYPES.find(s => s.type === t)?.defaultName || t,
            balance: String(a.balance ?? '0'),
            accountNumber: a.accountNumber || '',
          };
        }
      }
      setTypeSlots(fresh);
      const storedProfs = data.accountProfileFields || {};
      const profilesInit = {};
      for (const a of (data.accounts || [])) {
        const t = (a.accountType || '').toLowerCase();
        profilesInit[t] = { ...defaultAccountProfile(t, ''), ...storedProfs[t] };
      }
      setAccountProfiles(profilesInit);
      setThreshold(String(data.settings?.stepUpAmountThreshold ?? ''));
      const u = data.userData || {};
      setProfile({
        firstName: u.firstName != null ? String(u.firstName) : '',
        lastName:  u.lastName  != null ? String(u.lastName)  : '',
        email:     u.email     != null ? String(u.email)     : '',
        username:  u.username  != null ? String(u.username)  : '',
        isActive:  u.isActive !== false,
      });
      setUserMeta({
        id:        u.id        != null ? String(u.id)        : '',
        role:      u.role      != null ? String(u.role)      : '',
        createdAt: u.createdAt != null ? String(u.createdAt) : '',
      });
      setDefaults(data.defaults || null);
      setPersistenceNote(data.persistenceNote || null);
      try {
        const backendRes = await fetch('/api/demo-scenario/accounts', { credentials: 'include' });
        if (backendRes.ok) {
          const backendData = await backendRes.json();
          setStorageBackend({
            backend: backendData.backend || 'unknown',
            accountCount: backendData.accountCount || 0,
          });
        }
      } catch { /* non-critical */ }
    } catch (e) {
      if (e.status === 401) { setLoading(false); return; }
      notifyError(e.message || 'Failed to load demo data');
    } finally {
      setLoading(false);
    }
  }, [ACCOUNT_TYPES]);

  useEffect(() => {
    load();
    loadScopes();
    // Timeout: force loading to end after 10s if still pending
    const timeout = setTimeout(() => setLoading(false), 10000);
    // Load token endpoint auth method overrides (Phase 110) — /configure doesn't require auth, so this may 401
    apiClient.get('/api/demo-scenario/token-endpoint-auth')
      .then(({ data }) => {
        if (data) {
          setAgentTokenEndpointAuth(data.ai_agent_token_endpoint_auth_method || '');
          setMcpTokenEndpointAuth(data.mcp_exchanger_token_endpoint_auth_method || '');
        }
      })
      .catch((err) => {
        // Silently ignore 401 (expected when not authenticated) and other errors
        if (err.response?.status !== 401) {
          console.warn('[DemoSetupPanel] Failed to load token endpoint auth:', err.message);
        }
      });
    return () => clearTimeout(timeout);
  }, [load, loadScopes]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const t = threshold.trim();
      let stepUpAmountThreshold = null;
      if (t !== '') {
        const n = parseFloat(t);
        if (!Number.isFinite(n)) {
          notifyError('Enter a valid number for the threshold, or leave it blank for the server default.');
          setSaving(false);
          return;
        }
        stepUpAmountThreshold = n;
      }
      const body = {
        stepUpAmountThreshold,
        accounts: ACCOUNT_TYPES
          .filter(s => typeSlots[s.type]?.enabled)
          .map(s => {
            const slot = typeSlots[s.type];
            const row = {
              name: slot.name,
              balance: slot.balance === '' ? undefined : parseFloat(slot.balance),
            };
            if (slot.id) { row.id = slot.id; } else { row.accountType = s.type; }
            return row;
          }),
        userData: {
          firstName: profile.firstName.trim(),
          lastName:  profile.lastName.trim(),
          email:     profile.email.trim(),
          username:  profile.username.trim(),
          isActive:  profile.isActive,
        },
      };
      await saveDemoScenario(body);
      notifySuccess('Demo data saved');
      await load();
      try { window.dispatchEvent(new CustomEvent('demoScenarioUpdated')); } catch { /* ignore */ }
    } catch (err) {
      if (err.code === 'stale_demo_accounts') {
        await load();
        notifyWarning(err.message || 'Some account IDs are stale — form reloaded, review and save again.');
      } else {
        const msg = err.code === 'invalid_token'
          ? 'Could not validate your sign-in token. Use Refresh access token in the Banking Agent, or sign in again.'
          : err.message || 'Save failed';
        notifyError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (!defaults) return;
    setThreshold(String(defaults.stepUpAmountThreshold ?? ''));
    if (defaults.profileForm) {
      const pf = defaults.profileForm;
      setProfile({
        firstName: pf.firstName != null ? String(pf.firstName) : '',
        lastName:  pf.lastName  != null ? String(pf.lastName)  : '',
        email:     pf.email     != null ? String(pf.email)     : '',
        username:  pf.username  != null ? String(pf.username)  : '',
        isActive: true,
      });
    }
    setTypeSlots((prev) => {
      const next = { ...prev };
      for (const s of ACCOUNT_TYPES) {
        const t = s.type;
        if (!next[t]) continue;
        next[t] = { ...next[t], enabled: false, name: s.defaultName, balance: '0' };
      }
      if (next.checking) next.checking = { ...next.checking, enabled: true, name: defaults.checkingName ?? 'Checking Account', balance: String(defaults.checkingBalance ?? 3000) };
      if (next.savings)  next.savings  = { ...next.savings,  enabled: true, name: defaults.savingsName  ?? 'Savings Account',  balance: String(defaults.savingsBalance  ?? 2000) };
      return next;
    });
    notifyInfo('Form reset to defaults — click Save to apply');
  };

  return (
    <div className="demo-setup-panel">

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <div className="section ud-hero demo-data-page__hero" style={{ marginBottom: '1.5rem' }}>
        <div className="ud-hero__top">
          <p className="ud-hero__eyebrow">{format(new Date(), 'EEEE, MMM d')}</p>
          <p className="ud-hero__insight" role="status">
            Manage demo accounts, user profile, banking data, OAuth story, and marketing sign-in.
            Feature flag toggles have moved to{' '}
            <Link to="/configure?tab=feature-flags">Configuration → Feature Flags</Link>.
          </p>
        </div>
      </div>

      {/* ── may_act quick-action card ───────────────────────────────────────── */}
      <div className="demo-data-mayact-quick">
        <span className="demo-data-mayact-quick__label">may_act demo</span>
        <span className={`demo-data-mayact-quick__status${mayActEnabled === true ? ' demo-data-mayact-quick__status--on' : mayActEnabled === false ? ' demo-data-mayact-quick__status--off' : ''}`}>
          {mayActEnabled === null ? '…' : mayActEnabled ? '✅ present in token' : '❌ absent from token'}
        </span>
        <button type="button" className={`demo-data-btn${mayActEnabled === true ? ' primary' : ' ghost'}`}
          disabled={mayActSaving || mayActEnabled === true} onClick={() => handleSetMayAct(true)}>
          {mayActSaving && mayActEnabled !== true ? 'Saving…' : '✅ Enable'}
        </button>
        <button type="button" className={`demo-data-btn${mayActEnabled === false ? ' primary' : ' ghost'}`}
          disabled={mayActSaving || mayActEnabled === false} onClick={() => handleSetMayAct(false)}>
          {mayActSaving && mayActEnabled !== false ? 'Saving…' : '❌ Clear'}
        </button>
        <a href="#demo-mayact-heading" className="demo-data-mayact-quick__link"
          onClick={(e) => { e.preventDefault(); document.getElementById('demo-mayact-heading')?.scrollIntoView({ behavior: 'smooth' }); }}>
          Full controls ↓
        </a>
      </div>

      {persistenceNote && <div className="demo-data-banner" role="status">{persistenceNote}</div>}

      {/* ── Storage backend ─────────────────────────────────────────────────── */}
      {storageBackend && (
        <section className="section demo-data-section" aria-labelledby="demo-setup-storage-heading">
          <h2 id="demo-setup-storage-heading">Storage backend</h2>
          <div className="demo-data-readonly-meta">
            <span><strong>Backend:</strong>{' '}
              {storageBackend.backend === 'sqlite'    && '🗄️ SQLite (local)'}
              {storageBackend.backend === 'env_var'   && '☁️ Environment variable'}
              {storageBackend.backend === 'unknown'   && '❓ Unknown'}
            </span>
            <span><strong>Persisted accounts:</strong> <code>{storageBackend.accountCount}</code></span>
          </div>
          <p className="demo-data-hint">
            {storageBackend.backend === 'sqlite'
              ? 'Demo accounts are stored in a local SQLite database (data/persistent/). They survive server restarts.'
              : storageBackend.backend === 'env_var'
              ? 'Demo accounts are stored in the DEMO_ACCOUNTS environment variable. They persist across deploys.'
              : 'Storage backend could not be determined.'}
          </p>
        </section>
      )}

      {/* ── Demo vertical ──────────────────────────────────────────────────── */}
      <section className="section demo-data-section" aria-labelledby="demo-setup-vertical-heading">
        <h2 id="demo-setup-vertical-heading">Demo vertical</h2>
        <p className="demo-data-hint">
          Switch between Banking, Retail, and Workforce (HR) modes. Same PingOne + MCP architecture — only terminology, theme, and account types change.
        </p>
        <VerticalSwitcher variant="config" />
      </section>

      {/* ── PingOne audit ──────────────────────────────────────────────────── */}
      <section className="section demo-data-section" aria-labelledby="demo-setup-audit-heading">
        <h2 id="demo-setup-audit-heading">PingOne Configuration Audit</h2>
        <p className="demo-data-hint">
          Validate your PingOne environment — check that all required Resource Servers exist with the correct scopes.
        </p>
        <PingOneAudit />
      </section>

{/* ── Agent auth demo mode ────────────────────────────────────────────── */}
      <details>
        <summary style={{ cursor: 'pointer', padding: '0.6rem 0', fontWeight: 600, fontSize: '0.95rem', userSelect: 'none' }}>
          🎓 Lesson: how can an AI reach your bank data?
        </summary>
        <section className="section demo-data-section demo-data-agent-auth-demo" aria-labelledby="demo-setup-agent-auth-heading" style={{ marginTop: '0.5rem' }}>
          <h2 id="demo-setup-agent-auth-heading">Learn: how can an AI reach your bank data?</h2>
          <p className="demo-data-hint">
            OAuth is how apps prove "this person agreed" without sharing their password with every product. AI agents add a twist.
            Pick a story below — we only save your choice in <em>this browser</em>; nothing changes your PingOne tenant.
          </p>
          <fieldset className="demo-data-agent-auth-fieldset">
            <legend className="demo-data-agent-auth-legend">Lesson focus</legend>
            <div className="demo-data-agent-auth-options">
              {[
                {
                  mode: AGENT_AUTH_DEMO.OAUTH_PKCE,
                  title: '1 · Recommended — real sign-in at PingOne',
                  desc: 'The user is sent to PingOne\'s login (authorization code + PKCE). The BFF keeps the access token in a session — the browser never holds a long-lived secret.',
                },
                {
                  mode: AGENT_AUTH_DEMO.PI_FLOW_MARKETING,
                  title: '2 · Sign-in from the marketing page (pi.flow)',
                  desc: 'Looks like a form on your site, but PingOne still runs the actual login (response_type=pi.flow). Good for contrasting "embedded" experiences vs. unsafe password grants.',
                },
                {
                  mode: AGENT_AUTH_DEMO.BEARER_PASTE,
                  title: '3 · The AI already has an access token',
                  desc: 'Teach that holding a Bearer token is powerful, easy to leak, and not the same as teaching users to paste secrets into chatbots.',
                },
              ].map(({ mode, title, desc }) => (
                <label key={mode}
                  className={`demo-data-agent-auth-card${agentAuthDemoMode === mode ? ' demo-data-agent-auth-card--active' : ''}`}>
                  <input type="radio" name="bx-agent-auth-demo" checked={agentAuthDemoMode === mode}
                    onChange={() => handleAgentAuthDemoModeChange(mode)} />
                  <span className="demo-data-agent-auth-card__body">
                    <span className="demo-data-agent-auth-card__title">{title}</span>
                    <span className="demo-data-agent-auth-card__desc">{desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {agentAuthDemoMode === AGENT_AUTH_DEMO.OAUTH_PKCE && (
            <div className="demo-data-agent-auth-detail">
              <p className="demo-data-hint"><strong>Teaching:</strong> customer leaves briefly to sign in at PingOne and returns with a short-lived token the backend can use.</p>
              <div className="demo-data-actions demo-data-actions--wrap">
                <a className="demo-data-btn primary" href="/api/auth/oauth/user/login">Go to PingOne customer sign-in</a>
              </div>
            </div>
          )}
          {agentAuthDemoMode === AGENT_AUTH_DEMO.PI_FLOW_MARKETING && (
            <div className="demo-data-agent-auth-detail">
              <p className="demo-data-hint"><strong>Teaching:</strong> customer still authenticates with PingOne (MFA, policies, branding) but the flow can feel embedded in your marketing site.</p>
              <div className="demo-data-actions demo-data-actions--wrap">
                <Link className="demo-data-btn primary" to="/">Open marketing page (try sign-in)</Link>
              </div>
            </div>
          )}
          {agentAuthDemoMode === AGENT_AUTH_DEMO.BEARER_PASTE && (
            <div className="demo-data-agent-auth-detail">
              <p className="demo-data-hint"><strong>Teaching:</strong> whoever holds a valid access token can call the API until it expires. Use fake/lab tokens only.</p>
              <label className="demo-data-field">
                <span>Paste an access token (lab only)</span>
                <input type="password" autoComplete="off" value={bearerPasteToken}
                  onChange={(e) => setBearerPasteToken(e.target.value)} placeholder="eyJ…" />
              </label>
              <div className="demo-data-actions demo-data-actions--wrap">
                <button type="button" className="demo-data-btn primary" disabled={bearerBusy} onClick={handleBearerProbeAccounts}>
                  {bearerBusy ? 'Trying…' : 'Try "list accounts" with this token'}
                </button>
                <a className="demo-data-btn ghost" href="/api/auth/oauth/user/token-claims" target="_blank" rel="noreferrer">See your current session token (JSON)</a>
              </div>
              {bearerProbe && <pre className="demo-data-agent-auth-probe" role="status">{JSON.stringify(bearerProbe, null, 2)}</pre>}
            </div>
          )}
        </section>
      </details>

      {/* ── Account + profile form ──────────────────────────────────────────── */}
      {loading ? (
        <section className="section"><p className="demo-data-loading">Loading…</p></section>
      ) : (
        <>
        <form className="demo-data-form" onSubmit={handleSubmit}>
          <section className="section demo-data-section">
            <h2>User profile</h2>
            <p className="demo-data-hint">Updates your signed-in user record. Immutable fields (<code>id</code>, <code>createdAt</code>) are not editable here.</p>
            {(userMeta.id || userMeta.role || userMeta.createdAt) && (
              <p className="demo-data-readonly-meta" aria-label="Account metadata">
                {userMeta.id        && <span>User ID: <code>{userMeta.id}</code></span>}
                {userMeta.role      && <span>Role: <strong>{userMeta.role}</strong></span>}
                {userMeta.createdAt && <span>Created: <time dateTime={userMeta.createdAt}>{userMeta.createdAt}</time></span>}
              </p>
            )}
            <div className="demo-data-profile-grid">
              {[
                { key: 'firstName', label: 'First name', autoComplete: 'given-name',  type: 'text'  },
                { key: 'lastName',  label: 'Last name',  autoComplete: 'family-name', type: 'text'  },
                { key: 'email',     label: 'Email',      autoComplete: 'email',        type: 'email' },
                { key: 'username',  label: 'Username',   autoComplete: 'username',     type: 'text'  },
              ].map(({ key, label, autoComplete, type }) => (
                <label key={key} className="demo-data-field">
                  <span>{label}</span>
                  <input type={type} autoComplete={autoComplete} value={profile[key]} maxLength={300}
                    onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))} />
                </label>
              ))}
            </div>
            <label className="demo-data-field demo-data-field--checkbox">
              <input type="checkbox" checked={profile.isActive}
                onChange={(e) => setProfile((p) => ({ ...p, isActive: e.target.checked }))} />
              <span>Account active</span>
            </label>
          </section>

          <section className="section demo-data-section">
            <h2>Step-up MFA threshold (USD)</h2>
            <p className="demo-data-hint">
              Transfers and withdrawals at or above this amount require step-up MFA (when enabled). Default: <strong>{defaults?.stepUpAmountThreshold ?? '—'}</strong>.
            </p>
            <label className="demo-data-field">
              <span>Threshold ($)</span>
              <input type="number" min="0" step="0.01" value={threshold}
                onChange={(e) => setThreshold(e.target.value)} />
            </label>
          </section>

          <section className="section demo-data-section">
            <div className="demo-data-accounts-header">
              <h2>Accounts</h2>
              <span className="demo-data-accounts-hint">Check a type to include it. One account per type.</span>
            </div>
            <div className="demo-data-type-slots">
              {ACCOUNT_TYPES.map((s) => {
                const slot = typeSlots[s.type] || {};
                return (
                  <div key={s.type} className={`demo-data-type-slot${slot.enabled ? ' demo-data-type-slot--on' : ''}`}>
                    <label className="demo-data-type-slot__toggle">
                      <input type="checkbox" checked={!!slot.enabled}
                        onChange={(e) => handleSlotChange(s.type, 'enabled', e.target.checked)} />
                      <span className="demo-data-type-slot__icon">{s.icon}</span>
                      <span className="demo-data-type-slot__label">{s.label}</span>
                      {slot.enabled && slot.accountNumber && <code className="demo-data-type-slot__num">{slot.accountNumber}</code>}
                    </label>
                    {slot.enabled && (
                      <div className="demo-data-type-slot__fields">
                        <label className="demo-data-field demo-data-field--inline">
                          <span>Nickname</span>
                          <input type="text" value={slot.name} placeholder={s.defaultName} maxLength={120}
                            onChange={(e) => handleSlotChange(s.type, 'name', e.target.value)} />
                        </label>
                        <label className="demo-data-field demo-data-field--inline demo-data-field--narrow">
                          <span>Balance (USD)</span>
                          <input type="number" min="0" step="0.01" value={slot.balance}
                            onChange={(e) => handleSlotChange(s.type, 'balance', e.target.value)} />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="section demo-data-actions-row">
            <div className="demo-data-actions">
              <button type="button" className="demo-data-btn ghost" onClick={handleResetDefaults} disabled={!defaults}>Reset to defaults</button>
              <button type="submit" className="demo-data-btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </section>
        </form>

        {/* ── Account Profile Fields ───────────────────────────────────────── */}
        <section className="section demo-data-section" aria-labelledby="demo-setup-acct-profile-heading">
          <button type="button"
            onClick={() => setCollapsedSections((prev) => ({ ...prev, accountProfile: !prev.accountProfile }))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: 0, margin: 0 }}
            aria-expanded={!collapsedSections.accountProfile}>
            <h2 className="demo-data-section__heading" id="demo-setup-acct-profile-heading" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.2rem', minWidth: '1rem', display: 'inline-block' }}>{collapsedSections.accountProfile ? '▶' : '▼'}</span>
              Account Profile Fields{' '}
              <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', fontWeight: 400, color: '#92400e', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 4, padding: '0.1rem 0.4rem' }}>
                🔒 Sensitive fields require banking:sensitive:read
              </span>
            </h2>
          </button>
          {!collapsedSections.accountProfile && (
            <>
              <p className="demo-data-hint">
                Configure extended account details returned by the AI agent after the user grants explicit consent.
                Fields marked <strong>🔒 Sensitive</strong> are only returned via <code>get_sensitive_account_details</code> after consent.
              </p>
              {ACCOUNT_TYPES.filter((s) => typeSlots[s.type]?.enabled).length === 0 && (
                <p className="demo-data-hint" style={{ fontStyle: 'italic' }}>No accounts enabled — enable accounts in the <strong>Accounts</strong> section above.</p>
              )}
              {ACCOUNT_TYPES.filter((s) => typeSlots[s.type]?.enabled).map((s) => {
                const slot = typeSlots[s.type];
                const prof = accountProfiles[s.type] || defaultAccountProfile(s.type, '');
                const setProf = (f, v) => setAccountProfiles((prev) => ({ ...prev, [s.type]: { ...(prev[s.type] || defaultAccountProfile(s.type, '')), [f]: v } }));
                return (
                  <div key={s.type} className="demo-data-type-slot demo-data-type-slot--on" style={{ marginBottom: '1.25rem' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.95rem' }}>
                      {s.icon} {slot.name || s.defaultName}
                      {slot.accountNumber && <code className="demo-data-type-slot__num">{slot.accountNumber}</code>}
                    </div>
                    <div className="demo-data-type-slot__fields">
                      {[['swiftCode','SWIFT Code'],['iban','IBAN'],['branchName','Branch Name'],['branchCode','Branch Code'],['openedDate','Opened Date'],['accountHolderName','Account Holder Name']].map(([f, lbl]) => (
                        <label key={f} className="demo-data-field demo-data-field--inline">
                          <span>{lbl}</span>
                          <input type="text" value={prof[f] || ''} maxLength={200} onChange={(e) => setProf(f, e.target.value)} />
                        </label>
                      ))}
                      <div style={{ border: '1px solid #fcd34d', borderRadius: 6, padding: '0.5rem 0.75rem', background: '#fffbeb', marginTop: '0.5rem' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#92400e', marginBottom: '0.4rem' }}>🔒 Sensitive — requires banking:sensitive:read</div>
                        <label className="demo-data-field demo-data-field--inline">
                          <span>Routing Number 🔒</span>
                          <input type="text" value={prof.routingNumber || ''} maxLength={50} onChange={(e) => setProf('routingNumber', e.target.value)} />
                        </label>
                        <label className="demo-data-field demo-data-field--checkbox" style={{ marginTop: '0.25rem' }}>
                          <input type="checkbox" checked={!!prof.includeRoutingNumber} onChange={(e) => setProf('includeRoutingNumber', e.target.checked)} />
                          <span>Include routing number in response</span>
                        </label>
                        <label className="demo-data-field demo-data-field--inline" style={{ marginTop: '0.5rem' }}>
                          <span>Full Account Number 🔒</span>
                          <input type="text" value={prof.accountNumberFull || ''} maxLength={50} onChange={(e) => setProf('accountNumberFull', e.target.value)} />
                        </label>
                        <label className="demo-data-field demo-data-field--checkbox" style={{ marginTop: '0.25rem' }}>
                          <input type="checkbox" checked={!!prof.includeAccountNumberFull} onChange={(e) => setProf('includeAccountNumberFull', e.target.checked)} />
                          <span>Include full account number in response</span>
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="demo-data-actions" style={{ marginTop: '1rem' }}>
                <button type="button" className="demo-data-btn primary" disabled={accountProfileSaving} onClick={handleSaveAccountProfiles}>
                  {accountProfileSaving ? 'Saving…' : 'Save account profile fields'}
                </button>
              </div>
            </>
          )}
        </section>

        {/* ── Agent scope permissions ─────────────────────────────────────── */}
        <section className="section demo-data-section" aria-labelledby="demo-setup-scope-heading">
          <h2 className="demo-data-section__heading" id="demo-setup-scope-heading">Agent scope permissions</h2>
          <p className="demo-data-hint">
            Controls which OAuth scopes are included in the RFC 8693 token exchange when the AI agent calls a tool.
            <strong> banking:read</strong> — view accounts and transactions.
            <strong> banking:write</strong> — transfer funds and make deposits.
          </p>
          <div className="demo-data-scope-list">
            {AGENT_MCP_SCOPE_CATALOG.map((row) => {
              const checked = allowedScopes.has(row.scope);
              return (
                <label key={row.scope}
                  className={`demo-data-scope-row${checked ? ' demo-data-scope-row--on' : ''}${row.group === 'broad' ? ' demo-data-scope-row--broad' : ''}`}>
                  <input type="checkbox" checked={checked}
                    onChange={(e) => handleScopeToggle(row.scope, e.target.checked)}
                    style={{ marginTop: '0.2rem', flexShrink: 0 }} />
                  <span className="demo-data-scope-body">
                    <span className="demo-data-scope-label">{row.label}</span>
                    <code className="demo-data-scope-code">{row.scope}</code>
                    <span className="demo-data-scope-desc">{row.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="demo-data-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="demo-data-btn primary" disabled={scopeSaving} onClick={handleSaveScopes}>
              {scopeSaving ? 'Saving…' : 'Save scope permissions'}
            </button>
          </div>
        </section>

        {/* ── Marketing page sign-in ──────────────────────────────────────── */}
        <section className="section demo-data-section" aria-labelledby="demo-setup-marketing-heading">
          <h2 className="demo-data-section__heading" id="demo-setup-marketing-heading">Marketing page customer sign-in</h2>
          <p className="demo-data-hint">
            Controls what learners see when they click customer sign-in on the home page.
            <strong> Redirect</strong> = full browser hop to PingOne (standard OAuth code + PKCE).
            <strong> Slide panel</strong> = pi.flow so the real login still lives at PingOne, useful for showing "embedded" sign-in.
          </p>
          <label className="demo-data-field">
            <span>Customer login mode</span>
            <select value={marketingLoginMode} onChange={(e) => setMarketingLoginMode(e.target.value)}>
              <option value="redirect">Redirect — standard authorize (code + PKCE)</option>
              <option value="slide_pi_flow">Slide panel — hints + pi.flow (?use_pi_flow=1)</option>
            </select>
          </label>
          <label className="demo-data-field">
            <span>Demo username hint (not a secret)</span>
            <input type="text" value={marketingUserHint} onChange={(e) => setMarketingUserHint(e.target.value)}
              maxLength={500} placeholder="e.g. bankuser" autoComplete="off" />
          </label>
          <label className="demo-data-field">
            <span>Demo password hint (not a secret)</span>
            <input type="text" value={marketingPassHint} onChange={(e) => setMarketingPassHint(e.target.value)}
              maxLength={500} placeholder="e.g. your sandbox password" autoComplete="off" />
          </label>
          <div className="demo-data-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="demo-data-btn primary" disabled={marketingSaving} onClick={handleSaveMarketingLogin}>
              {marketingSaving ? 'Saving…' : 'Save marketing sign-in'}
            </button>
          </div>
        </section>

        {/* ── Token endpoint auth overrides ───────────────────────────────── */}
        <section className="section demo-data-section" aria-labelledby="demo-setup-token-auth-heading">
          <h2 className="demo-data-section__heading" id="demo-setup-token-auth-heading">Token endpoint authentication</h2>
          <p className="demo-data-hint">
            Override the auth method the BFF uses when exchanging tokens with PingOne. Leave blank to use the env var default (<code>AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD</code> / <code>MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD</code>).
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
            {[
              { label: 'AI Agent App', value: agentTokenEndpointAuth, set: setAgentTokenEndpointAuth },
              { label: 'MCP Token Exchanger', value: mcpTokenEndpointAuth, set: setMcpTokenEndpointAuth },
            ].map(({ label, value, set }) => (
              <label key={label} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 600 }}>
                {label}
                <select value={value} onChange={(e) => set(e.target.value)}
                  style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.8rem' }}>
                  <option value="">— use env var —</option>
                  <option value="client_secret_basic">client_secret_basic</option>
                  <option value="client_secret_post">client_secret_post</option>
                  <option value="client_secret_jwt">client_secret_jwt</option>
                </select>
              </label>
            ))}
            <button type="button" className="demo-data-btn ghost" onClick={handleTokenAuthSave} disabled={tokenAuthSaving} style={{ alignSelf: 'flex-end' }}>
              {tokenAuthSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </section>

        {/* ── Feature flags redirect callout ───────────────────────────────── */}
        <section className="section demo-data-section" aria-labelledby="demo-setup-flags-link-heading">
          <h2 className="demo-data-section__heading" id="demo-setup-flags-link-heading">🚩 Feature Flag Controls</h2>
          <div className="demo-data-static-notice" style={{ borderColor: '#6366f1', background: '#eef2ff' }}>
            <span className="demo-data-static-notice__icon">🚩</span>
            <div style={{ flex: 1 }}>
              <strong>PingOne Authorize, Token Exchange, Step-Up, HITL, MCP, and WebMCP flags</strong>
              <p className="demo-data-hint" style={{ margin: '0.35rem 0 0.5rem' }}>
                All feature toggles are now in one place — the Feature Flags tab.
                This includes PingOne Authorize (live vs simulated, fail-open, first-MCP-tool),
                Token Exchange (may_act injection, audience injection, OIDC-only, 2-exchange delegation),
                Step-Up MFA, HITL consent, and WebMCP panel.
              </p>
              <div className="demo-data-actions demo-data-actions--wrap" style={{ marginTop: '0.5rem' }}>
                <Link className="demo-data-btn primary" to="/configure?tab=feature-flags">Open Feature Flags</Link>
                <Link className="demo-data-btn ghost" to="/configure?tab=feature-flags&flag=ff_inject_may_act">Jump to may_act injection</Link>
                <Link className="demo-data-btn ghost" to="/configure?tab=feature-flags&flag=authorize_enabled">Jump to PingOne Authorize</Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── may_act PingOne user attribute ──────────────────────────────── */}
        <section className="section demo-data-section" aria-labelledby="demo-mayact-heading">
          <h2 className="demo-data-section__heading" id="demo-mayact-heading">Token Exchange — may_act PingOne attribute</h2>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', lineHeight: 1.6 }}>
            The <code>may_act</code> claim in a PingOne access token pre-authorises the BFF to exchange
            that token on behalf of the user (RFC&nbsp;8693). These buttons write to your PingOne user attribute record —
            for the BFF synthetic injection feature flag, see{' '}
            <Link to="/configure?tab=feature-flags&flag=ff_inject_may_act">Feature Flags → ff_inject_may_act</Link>.
          </p>
          <div className="demo-data-static-notice" style={{ borderColor: '#93c5fd', background: '#eff6ff', color: '#1e3a5f', marginBottom: '0.75rem' }}>
            <span className="demo-data-static-notice__icon">ℹ️</span>
            <div>
              <strong>Static mapping active</strong> — <code>may_act</code> is always present via a hardcoded PingOne attribute expression.
              The buttons below write to your PingOne user record for conceptual exploration, but will not change what appears in your token.
            </div>
          </div>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic' }}>Conceptual only — does not affect your token while static mapping is active.</p>
          <div className="demo-data-mayact-row">
            <div style={{ width: '100%', marginBottom: '0.6rem', padding: '0.6rem 0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#374151' }}>Delegation mode — which client ID becomes <code>mayAct.sub</code>:</div>
              {[
                { value: '1exchange', label: '1-Exchange', desc: '— Banking App Client ID (exchange: user → MCP token)' },
                { value: '2exchange', label: '2-Token Exchange', desc: '— AI Agent Client ID (exchange #1: user → agent token, #2: agent → MCP token with nested act)' },
              ].map(({ value, label, desc }) => (
                <label key={value} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                  <input type="radio" name="delegationMode" value={value}
                    checked={delegationMode === value} onChange={() => setDelegationMode(value)} />
                  <strong>{label}</strong>
                  <span style={{ color: '#6b7280' }}>{desc}</span>
                </label>
              ))}
              {delegationMode === '2exchange' && (
                <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 4, padding: '0.35rem 0.6rem', lineHeight: 1.6 }}>
                  ⚠️ Two more steps to activate:
                  <ol style={{ margin: '0.3rem 0 0 1.1rem', padding: 0 }}>
                    <li><strong>Enable the feature flag</strong> — <Link to="/configure?tab=feature-flags&flag=ff_two_exchange_delegation" style={{ color: '#92400e' }}>Feature Flags → "2-Exchange Delegated Chain"</Link>.</li>
                    <li><strong>Set the env vars</strong> — <Link to="/configure?tab=pingone-config&section=agent-settings" style={{ color: '#92400e' }}>PingOne Setup → Agent Settings</Link> and save <code>AI_AGENT_CLIENT_ID</code> + <code>AI_AGENT_CLIENT_SECRET</code>.</li>
                  </ol>
                </div>
              )}
            </div>
            <button type="button" className={`demo-data-btn${mayActEnabled === true ? ' primary' : ' ghost'}`}
              disabled={mayActSaving || mayActEnabled === true} onClick={() => handleSetMayAct(true)}>
              {mayActSaving && mayActEnabled !== true ? 'Saving…' : '✅ Enable may_act'}
            </button>
            <button type="button" className={`demo-data-btn${mayActEnabled === false ? ' primary' : ' ghost'}`}
              disabled={mayActSaving || mayActEnabled === false} onClick={() => handleSetMayAct(false)}>
              {mayActSaving && mayActEnabled !== false ? 'Saving…' : '❌ Clear may_act'}
            </button>
            <button type="button" className="demo-data-btn ghost" disabled={mayActDiagnosing} onClick={handleDiagnoseMayAct} title="Check your PingOne user attribute and app mapping configuration">
              {mayActDiagnosing ? 'Checking…' : '🔍 Diagnose'}
            </button>
            <span className={`demo-data-mayact-status${mayActEnabled === true ? ' demo-data-mayact-status--on' : mayActEnabled === false ? ' demo-data-mayact-status--off' : ''}`}>
              {mayActEnabled === true ? '✅ may_act present in token' : mayActEnabled === false ? '❌ may_act absent from token' : 'Checking…'}
            </span>
          </div>
          {mayActDiagnosis && (
            <div style={{ margin: '0.75rem 0', padding: '0.75rem 1rem', border: '1px solid #d1d5db', borderRadius: 6, background: '#f9fafb', fontSize: '0.85rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>🔍 PingOne config diagnosis</div>
              {mayActDiagnosis.diagnosis?.map((line, i) => <div key={i} style={{ marginBottom: '0.2rem' }}>{line}</div>)}
              {mayActDiagnosis.nextStep && (
                <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 4, color: '#1e3a5f' }}>
                  <strong>Next step:</strong> {mayActDiagnosis.nextStep}
                </div>
              )}
              <details style={{ marginTop: '0.5rem' }}>
                <summary style={{ cursor: 'pointer', color: '#6b7280' }}>Raw check results</summary>
                <pre style={{ fontSize: '0.75rem', marginTop: '0.35rem', overflowX: 'auto' }}>{JSON.stringify(mayActDiagnosis.checks, null, 2)}</pre>
              </details>
              <button type="button" style={{ marginTop: '0.5rem', fontSize: '0.75rem', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 0 }} onClick={() => setMayActDiagnosis(null)}>✕ dismiss</button>
            </div>
          )}
          <details className="demo-data-dynamic-explainer">
            <summary>Why can't the Enable / Clear buttons control the token? (advanced)</summary>
            <p>The <code>may_act</code> claim is controlled by a <strong>hardcoded expression</strong> in the PingOne attribute mapping — it always evaluates to the same <code>{`{"client_id": "<app-client-id>"}`}</code> value regardless of the user's <code>mayAct</code> attribute.</p>
            <p>The Enable / Clear buttons write to the user's <code>mayAct</code> custom attribute in PingOne, but because the token mapping is hardcoded they will not change what appears in the token. They are kept here for conceptual exploration only.</p>
            <p>To demo <code>may_act</code> absent: use the <Link to="/configure?tab=feature-flags&flag=ff_inject_may_act">Auto-inject may_act flag</Link> to <strong>disable</strong> injection, then re-login with a client that has no static <code>may_act</code> mapping.</p>
          </details>
        </section>
        <section className="section demo-data-section" aria-labelledby="dsp-reset-heading">
          <h2 id="dsp-reset-heading">Reset Demo State</h2>
          <p style={{ marginBottom: '0.75rem', color: 'var(--text-muted, #6b7280)', fontSize: '0.9rem' }}>
            Clears all agent conversation history, token chain events, and MCP audit logs on the server, then reloads the page. Your login session is preserved.
          </p>
          <button
            type="button"
            className="demo-data-btn"
            style={{ background: '#dc2626', borderColor: '#dc2626', color: '#fff' }}
            onClick={handleResetDemo}
            disabled={demoResetting}
          >
            {demoResetting ? 'Resetting…' : '🔄 Reset Demo'}
          </button>
        </section>
        </>
      )}
    </div>
  );
}
