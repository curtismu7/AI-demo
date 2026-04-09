// banking_api_ui/src/components/DemoDataPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { notifySuccess, notifyError, notifyWarning, notifyInfo } from '../utils/appToast';
import axios from 'axios';
import apiClient from '../services/apiClient';
import { fetchDemoScenario, saveDemoScenario } from '../services/demoScenarioService';
import { AGENT_MCP_SCOPE_CATALOG, DEFAULT_AGENT_MCP_ALLOWED_SCOPES } from '../config/agentMcpScopes';
import { useEducationUI } from '../context/EducationUIContext';
import { useTheme } from '../context/ThemeContext';
import { EDU } from './education/educationIds';
import { useIndustryBranding } from '../context/IndustryBrandingContext';
import VerticalSwitcher from './VerticalSwitcher';
import PingOneAudit from './PingOneAudit';
import './UserDashboard.css';
import './DemoDataPage.css';

/** Persisted choice for which agent/auth story the presenter is demonstrating (demo-data UI only). */
const AGENT_AUTH_DEMO_STORAGE_KEY = 'bx-agent-auth-demo-mode';
const AGENT_AUTH_DEMO = {
  OAUTH_PKCE: 'oauth_pkce',
  /** PingOne pi.flow from the /marketing slide panel (hosted login UI), not a password grant. */
  PI_FLOW_MARKETING: 'pi_flow_marketing',
  BEARER_PASTE: 'bearer_paste',
};

/** @returns {string} one of AGENT_AUTH_DEMO */
function readStoredAgentAuthDemoMode() {
  try {
    const v = localStorage.getItem(AGENT_AUTH_DEMO_STORAGE_KEY);
    if (v === AGENT_AUTH_DEMO.BEARER_PASTE || v === AGENT_AUTH_DEMO.PI_FLOW_MARKETING) return v;
    if (v === 'credential_story') return AGENT_AUTH_DEMO.PI_FLOW_MARKETING;
  } catch (_) {
    /* ignore */
  }
  return AGENT_AUTH_DEMO.OAUTH_PKCE;
}

/** Account types — each type gets exactly one slot; accountType is the stable key. */
const ACCOUNT_TYPE_SLOTS = [
  { type: 'checking',     label: 'Checking',            icon: '🏦', defaultName: 'Checking Account' },
  { type: 'savings',     label: 'Savings',             icon: '💰', defaultName: 'Savings Account' },
  { type: 'investment',  label: 'Investment',          icon: '📈', defaultName: 'Investment Account' },
  { type: 'money_market',label: 'Money market',        icon: '💵', defaultName: 'Money Market Account' },
  { type: 'credit',      label: 'Credit card',         icon: '💳', defaultName: 'Credit Card' },
  { type: 'car_loan',    label: 'Car loan',            icon: '🚗', defaultName: 'Car Loan' },
  { type: 'mortgage',    label: 'Mortgage (home loan)',icon: '🏠', defaultName: 'Mortgage (Home Loan)' },
];

/** Build an initial typeSlots map — all disabled, default names. */
function defaultTypeSlots() {
  const m = {};
  for (const s of ACCOUNT_TYPE_SLOTS) {
    m[s.type] = { enabled: false, name: s.defaultName, balance: '0', id: null, accountNumber: '' };
  }
  return m;
}

/** Default profile fields for a given account type slot. */
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

/**
 * Lets demo users edit account labels, balances, and MFA step-up threshold for their sandbox data.
 */
export default function DemoDataPage({ user, onLogout }) {
  const { preset: industryPreset } = useIndustryBranding();
  const navigate = useNavigate();
  const { open } = useEducationUI();
  const { theme, toggleTheme } = useTheme();
  const dashboardPath = user?.role === 'admin' ? '/admin' : '/dashboard';
  const dashboardCrumbLabel = user?.role === 'admin' ? 'Admin' : 'Dashboard';




  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storageBackend, setStorageBackend] = useState(null);
  // One slot per account type — keyed by accountType string.
  const [typeSlots, setTypeSlots] = useState(defaultTypeSlots);
  const [accountProfiles, setAccountProfiles] = useState({});
  const [accountProfileSaving, setAccountProfileSaving] = useState(false);
  const [threshold, setThreshold] = useState('');

  /** Token endpoint auth method overrides (Phase 110) */
  const [agentTokenEndpointAuth, setAgentTokenEndpointAuth] = useState('');
  const [mcpTokenEndpointAuth, setMcpTokenEndpointAuth] = useState('');
  const [tokenAuthSaving, setTokenAuthSaving] = useState(false);

  /** Sticky section nav active state (Phase 110) */
  const [activeNav, setActiveNav] = useState(null);
  /** Editable profile fields (persisted as userData on save). */
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    isActive: true,
  });
  /** Read-only metadata from the server (not sent as editable JSON). */
  const [userMeta, setUserMeta] = useState({ id: '', role: '', createdAt: '' });
  const [defaults, setDefaults] = useState(null);
  const [persistenceNote, setPersistenceNote] = useState(null);
  const [collapsedSections, setCollapsedSections] = useState({ accountProfile: true });

  /** Agent MCP scope toggles — loaded from admin config, saved separately */
  const [allowedScopes, setAllowedScopes] = useState(() => {
    const raw = DEFAULT_AGENT_MCP_ALLOWED_SCOPES;
    return new Set(raw.split(/\s+/).filter(Boolean));
  });
  const [scopeSaving, setScopeSaving] = useState(false);

  /** Marketing home sign-in mode + demo hints (persisted in admin config). */
  const [marketingLoginMode, setMarketingLoginMode] = useState('redirect');
  const [marketingUserHint, setMarketingUserHint] = useState('');
  const [marketingPassHint, setMarketingPassHint] = useState('');
  const [marketingSaving, setMarketingSaving] = useState(false);

  /** Load current scope config from server */
  const loadScopes = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/admin/config');
      const cfg = data?.config || data;
      const raw = cfg?.agent_mcp_allowed_scopes || DEFAULT_AGENT_MCP_ALLOWED_SCOPES;
      setAllowedScopes(new Set(raw.split(/\s+/).filter(Boolean)));
      setMarketingLoginMode(cfg?.marketing_customer_login_mode === 'slide_pi_flow' ? 'slide_pi_flow' : 'redirect');
      setMarketingUserHint(String(cfg?.marketing_demo_username_hint ?? ''));
      setMarketingPassHint(String(cfg?.marketing_demo_password_hint ?? ''));
    } catch {
      // silently keep client default
    }
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

  /** may_act demo toggle — set/clear the PingOne user mayAct attribute */
  const [mayActEnabled, setMayActEnabled] = useState(null); // null = unknown, true/false = known
  const [mayActSaving, setMayActSaving] = useState(false);
  /** Delegation mode: '1exchange' = BFF/Banking App, '2exchange' = AI Agent App */
  const [delegationMode, setDelegationMode] = useState('1exchange');

  // Seed the initial may_act status from the current session's token claims so the
  // status badge is populated on page load without the user having to click anything.
  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include', _silent: true })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setMayActEnabled(data.mayAct != null && data.mayAct !== false);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSetMayAct = async (enable) => {
    setMayActSaving(true);
    try {
      await apiClient.patch('/api/demo/may-act', { enabled: enable, mode: delegationMode });
      setMayActEnabled(enable);
      const modeLabel = delegationMode === '2exchange' ? '(AI Agent Client ID — 2-Exchange)' : '(Banking App Client ID — 1-Exchange)';
      notifySuccess(
        enable
          ? `may_act ${modeLabel} written to your PingOne user record. Sign out and back in to see it in your token.`
          : 'may_act cleared from your PingOne user record. Sign out and back in to confirm.'
      );
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to update may_act';
      notifyError(msg);
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
      const msg = err?.response?.data?.message || err.message || 'Diagnose request failed';
      notifyError(msg);
    } finally {
      setMayActDiagnosing(false);
    }
  };

  /** PingOne Authorize feature flags — same registry as /feature-flags; admin-only on this page. */
  const [p1azFlags, setP1azFlags] = useState([]);
  const [p1azFlagsLoading, setP1azFlagsLoading] = useState(false);
  const [p1azFlagsError, setP1azFlagsError] = useState(null);
  const [p1azFlagSaving, setP1azFlagSaving] = useState(null);

  /** PingOne Authorize — bootstrap decision endpoints via worker + Platform API */
  const [p1azBootstrapPolicyId, setP1azBootstrapPolicyId] = useState('');
  const [p1azBootstrapAuthVer, setP1azBootstrapAuthVer] = useState('');
  const [p1azBootstrapEnableLive, setP1azBootstrapEnableLive] = useState(true);
  const [p1azBootstrapEnableMcp, setP1azBootstrapEnableMcp] = useState(false);
  const [p1azBootstrapBusy, setP1azBootstrapBusy] = useState(false);

  /** Which agent authentication story is highlighted for demos (saved in localStorage). */
  const [agentAuthDemoMode, setAgentAuthDemoMode] = useState(readStoredAgentAuthDemoMode);
  const [bearerPasteToken, setBearerPasteToken] = useState('');
  const [bearerProbe, setBearerProbe] = useState(null);
  const [bearerBusy, setBearerBusy] = useState(false);

  const handleAgentAuthDemoModeChange = useCallback((mode) => {
    setAgentAuthDemoMode(mode);
    try {
      localStorage.setItem(AGENT_AUTH_DEMO_STORAGE_KEY, mode);
      window.dispatchEvent(new CustomEvent('bx-agent-auth-demo-mode', { detail: { mode } }));
    } catch (_) {
      /* ignore */
    }
  }, []);

  const handleBearerProbeAccounts = useCallback(async () => {
    const t = bearerPasteToken.trim();
    if (!t) {
      notifyWarning('Paste an access token first.');
      return;
    }
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
      try {
        body = JSON.parse(text);
      } catch {
        body = text.length > 400 ? `${text.slice(0, 400)}…` : text;
      }
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

  const loadP1azFlags = useCallback(async () => {
    setP1azFlagsLoading(true);
    setP1azFlagsError(null);
    try {
      const { data } = await axios.get('/api/admin/feature-flags');
      const list = (data.flags || []).filter(
        (f) => f.category === 'PingOne Authorize' || f.category === 'Token Exchange'
      );
      setP1azFlags(list);
    } catch (err) {
      setP1azFlagsError(err?.response?.data?.error || err.message || 'Failed to load feature flags');
    } finally {
      setP1azFlagsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadP1azFlags();
  }, [loadP1azFlags]);

  /** Token endpoint auth method save handler (Phase 110) */
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

  const handleP1azFlagToggle = async (flagId, nextBool) => {
    setP1azFlagSaving(flagId);
    const flagLabel = p1azFlags.find((f) => f.id === flagId)?.label || flagId;
    try {
      const { data } = await axios.patch('/api/admin/feature-flags', {
        updates: { [flagId]: nextBool },
      });
      const updatedMap = new Map((data.flags || []).map((f) => [f.id, f]));
      setP1azFlags((prev) => prev.map((f) => (updatedMap.has(f.id) ? updatedMap.get(f.id) : f)));
      notifySuccess(`${flagLabel}: ${nextBool ? 'ON' : 'OFF'}`);
    } catch (err) {
      notifyError(err?.response?.data?.error || err.message || 'Failed to save flag');
    } finally {
      setP1azFlagSaving(null);
    }
  };

  const handleP1azAuthorizeBootstrap = async () => {
    setP1azBootstrapBusy(true);
    try {
      const { data } = await apiClient.post('/api/authorize/bootstrap-demo-endpoints', {
        policyId: p1azBootstrapPolicyId.trim() || undefined,
        authorizationVersionId: p1azBootstrapAuthVer.trim() || undefined,
        enableLiveAuthorize: p1azBootstrapEnableLive,
        enableMcpFirstTool: p1azBootstrapEnableMcp,
      });
      notifySuccess(data.message || 'PingOne Authorize demo endpoints ready.');
      if (data.copyEnvHint) {
        notifyInfo(data.copyEnvHint, { autoClose: 12000 });
      }
      await loadP1azFlags();
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err.message ||
        'Authorize bootstrap failed';
      notifyError(msg);
    } finally {
      setP1azBootstrapBusy(false);
    }
  };

  /** Update a single field in a type slot. */
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
      if (data === null) { setLoading(false); return; } // unauthenticated — skip silently
      // Map server accounts into type slots (first account per type wins).
      const fresh = defaultTypeSlots();
      for (const a of (data.accounts || [])) {
        const t = (a.accountType || '').toLowerCase();
        if (fresh[t] && !fresh[t].enabled) {
          fresh[t] = {
            enabled: true,
            id: a.id || null,
            name: a.name || ACCOUNT_TYPE_SLOTS.find(s => s.type === t)?.defaultName || t,
            balance: String(a.balance ?? '0'),
            accountNumber: a.accountNumber || '',
          };
        }
      }
      setTypeSlots(fresh);
      // Populate account profile fields from stored scenario, falling back to defaults.
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
        lastName: u.lastName != null ? String(u.lastName) : '',
        email: u.email != null ? String(u.email) : '',
        username: u.username != null ? String(u.username) : '',
        isActive: u.isActive !== false,
      });
      setUserMeta({
        id: u.id != null ? String(u.id) : '',
        role: u.role != null ? String(u.role) : '',
        createdAt: u.createdAt != null ? String(u.createdAt) : '',
      });
      setDefaults(data.defaults || null);
      setPersistenceNote(data.persistenceNote || null);
      // Fetch storage backend info
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
      if (e.status === 401) {
        // Not logged in — demo config flags still work, account section needs a session
        setLoading(false);
        return;
      }
      notifyError(e.message || 'Failed to load demo data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadScopes();
    // Load token endpoint auth method overrides (Phase 110)
    apiClient.get('/api/demo-scenario/token-endpoint-auth').then(({ data }) => {
      if (data) {
        setAgentTokenEndpointAuth(data.ai_agent_token_endpoint_auth_method || '');
        setMcpTokenEndpointAuth(data.mcp_exchanger_token_endpoint_auth_method || '');
      }
    }).catch(() => {});
  }, [load, loadScopes]);

  // Sticky section nav — highlight active section as user scrolls (Phase 110)
  const NAV_SECTIONS = [
    { id: 'demo-data-storage-heading',       label: 'Storage' },
    { id: 'demo-data-vertical-heading',      label: 'Demo vertical' },
    { id: 'demo-data-pingone-audit-heading', label: 'PingOne audit' },
    { id: 'demo-agent-auth-demo-heading',    label: 'Agent auth' },
    { id: 'demo-acct-profile-heading',       label: 'User profile' },
    { id: 'demo-scope-heading',              label: 'Scope' },
    { id: 'demo-marketing-login-heading',    label: 'Marketing login' },
    { id: 'demo-p1az-flags-heading',         label: 'PingOne Authorize' },
    { id: 'demo-mayact-heading',             label: 'may_act' },
  ];

  useEffect(() => {
    const observers = NAV_SECTIONS.map(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveNav(id); },
        { rootMargin: '-10% 0px -70% 0px', threshold: 0 }
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach(o => o?.disconnect());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


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
        // Only include enabled type slots; each slot maps to one account row.
        accounts: ACCOUNT_TYPE_SLOTS
          .filter(s => typeSlots[s.type]?.enabled)
          .map(s => {
            const slot = typeSlots[s.type];
            const row = {
              name: slot.name,
              balance: slot.balance === '' ? undefined : parseFloat(slot.balance),
            };
            if (slot.id) {
              row.id = slot.id;
            } else {
              // No existing account for this type — create one.
              row.accountType = s.type;
            }
            return row;
          }),
        userData: {
          firstName: profile.firstName.trim(),
          lastName: profile.lastName.trim(),
          email: profile.email.trim(),
          username: profile.username.trim(),
          isActive: profile.isActive,
        },
      };
      await saveDemoScenario(body);
      notifySuccess('Demo data saved');
      await load();
      try {
        window.dispatchEvent(new CustomEvent('demoScenarioUpdated'));
      } catch {
        // ignore
      }
    } catch (err) {
      if (err.code === 'stale_demo_accounts') {
        await load();
        notifyWarning(
          err.message ||
            'These account IDs are no longer on this server (common after a deploy or new instance). The form was reloaded — review accounts and save again.',
        );
      } else {
        const msg =
          err.code === 'invalid_token'
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
        lastName: pf.lastName != null ? String(pf.lastName) : '',
        email: pf.email != null ? String(pf.email) : '',
        username: pf.username != null ? String(pf.username) : '',
        isActive: true,
      });
    }
    setTypeSlots((prev) => {
      const next = { ...prev };
      // Reset every slot: only checking and savings are on by default.
      for (const s of ACCOUNT_TYPE_SLOTS) {
        const t = s.type;
        if (!next[t]) continue;
        next[t] = { ...next[t], enabled: false, name: s.defaultName, balance: '0' };
      }
      if (next.checking) {
        next.checking = {
          ...next.checking,
          enabled: true,
          name: defaults.checkingName ?? 'Checking Account',
          balance: String(defaults.checkingBalance ?? 3000),
        };
      }
      if (next.savings) {
        next.savings = {
          ...next.savings,
          enabled: true,
          name: defaults.savingsName ?? 'Savings Account',
          balance: String(defaults.savingsBalance ?? 2000),
        };
      }
      return next;
    });
    notifyInfo('Form reset to defaults — click Save to apply');
  };

  return (
    <div className="user-dashboard user-dashboard--2026 demo-data-page">
      <a href="#demo-data-main" className="dash-skip-link">
        Skip to main content
      </a>

      <div className="dashboard-header-stack">
        <div className="dashboard-header dashboard-header--surface">
          <div className="bank-branding">
            <div className="bank-logo">
              <div className="logo-icon">
                <div className="logo-square" />
                <div className="logo-square" />
                <div className="logo-square" />
                <div className="logo-square" />
              </div>
              <span className="bank-name">{industryPreset.shortName}</span>
            </div>
            <div>
              <h1 className="dashboard-header__title">Demo config</h1>
              <div className="dashboard-header__crumbs">
                <Link to="/" className="dashboard-header__crumb-link">
                  Home
                </Link>
                <span className="dashboard-header__crumb-sep" aria-hidden="true">
                  ›
                </span>
                <Link to={dashboardPath} className="dashboard-header__crumb-link">
                  {dashboardCrumbLabel}
                </Link>
                <span className="dashboard-header__crumb-sep" aria-hidden="true">
                  ›
                </span>
                <span className="dashboard-header__crumb-link dashboard-header__crumb-link--current">
                  Demo config
                </span>
              </div>
            </div>
          </div>
          <div className="header-right">
            <div className="user-info">
              <span className="user-greeting">
                Hello,{' '}
                {user?.firstName || user?.lastName
                  ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                  : user?.name || user?.username || user?.email?.split('@')[0] || 'there'}
              </span>
              <span className="user-email">{user?.email || user?.username}</span>
            </div>
          </div>
        </div>

        <div className="dashboard-toolbar" role="toolbar" aria-label="Demo config actions">
          <button type="button" className="dashboard-toolbar-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <Link to={dashboardPath} className="dashboard-toolbar-btn">
            ⌂ {dashboardCrumbLabel}
          </Link>
          <Link
            to="/mcp-inspector"
            className="dashboard-toolbar-btn dashboard-toolbar-btn--accent"
            title="MCP discovery, tools/list & tools/call via Backend-for-Frontend (BFF)"
          >
            MCP Inspector
          </Link>
          <span className="demo-data-toolbar-current" aria-current="page">
            Demo config
          </span>
          <Link to="/config" className="dashboard-toolbar-btn" title="PingOne environment and OAuth client settings">
            ⚙ Config
          </Link>
          <button
            type="button"
            className="dashboard-toolbar-btn"
            onClick={() =>
              window.open('/api-traffic', 'ApiTraffic', 'width=1400,height=900,scrollbars=yes,resizable=yes')
            }
            title="Open API Traffic viewer (all /api/* calls)"
          >
            API Traffic
          </button>
          <button
            type="button"
            className="dashboard-toolbar-btn dashboard-toolbar-btn--theme"
            onClick={toggleTheme}
            aria-pressed={theme === 'dark'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button type="button" onClick={onLogout} className="dashboard-toolbar-btn dashboard-toolbar-btn--danger">
            Log out
          </button>
        </div>
      </div>

      <div className="dashboard-content demo-data-page__body">
        {/* Sticky section jump-to nav (Phase 110) */}
        <nav className="demo-data-page__nav" aria-label="Jump to section">
          <ul>
            {NAV_SECTIONS.map(({ id, label }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className={`demo-data-page__nav-link${activeNav === id ? ' demo-data-page__nav-link--active' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
                    setActiveNav(id);
                  }}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <main className="demo-data-page__main" id="demo-data-main" tabIndex={-1}>
          <div className="section ud-hero demo-data-page__hero">
            <div className="ud-hero__top">
              <p className="ud-hero__eyebrow">{format(new Date(), 'EEEE, MMM d')}</p>
              <p className="ud-hero__insight" role="status">
                This whole app is a <strong>teaching sandbox</strong>: safe fake banking data plus lessons on sign-in,
                tokens, and how AI assistants should (and should not) use them. Here you can rename accounts, tweak balances,
                update your profile, and set when extra verification is required — only for your signed-in demo user.
              </p>
            </div>
          </div>

          {/* may_act quick-action card — shortcut so users don't have to scroll to find the controls */}
          <div className="demo-data-mayact-quick">
            <span className="demo-data-mayact-quick__label">may_act demo</span>
            <span className={`demo-data-mayact-quick__status${mayActEnabled === true ? ' demo-data-mayact-quick__status--on' : mayActEnabled === false ? ' demo-data-mayact-quick__status--off' : ''}`}>
              {mayActEnabled === null ? '…' : mayActEnabled ? '✅ present in token' : '❌ absent from token'}
            </span>
            <button
              type="button"
              className={`demo-data-btn${mayActEnabled === true ? ' primary' : ' ghost'}`}
              disabled={mayActSaving || mayActEnabled === true}
              onClick={() => handleSetMayAct(true)}
            >
              {mayActSaving && mayActEnabled !== true ? 'Saving…' : '✅ Enable'}
            </button>
            <button
              type="button"
              className={`demo-data-btn${mayActEnabled === false ? ' primary' : ' ghost'}`}
              disabled={mayActSaving || mayActEnabled === false}
              onClick={() => handleSetMayAct(false)}
            >
              {mayActSaving && mayActEnabled !== false ? 'Saving…' : '❌ Clear'}
            </button>
            <button
              type="button"
              className="demo-data-mayact-quick__link"
              onClick={() => document.getElementById('demo-mayact-heading')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Full controls ↓
            </button>
          </div>

          {persistenceNote && (
            <div className="demo-data-banner" role="status">
              {persistenceNote}
            </div>
          )}

          {storageBackend && (
            <section className="section demo-data-section" aria-labelledby="demo-data-storage-heading">
              <h2 id="demo-data-storage-heading">Storage backend</h2>
              <div className="demo-data-readonly-meta">
                <span><strong>Backend:</strong>{' '}
                  {storageBackend.backend === 'sqlite' && '🗄️ SQLite (local)'}
                  {storageBackend.backend === 'env_var' && '☁️ Vercel environment variable'}
                  {storageBackend.backend === 'unknown' && '❓ Unknown'}
                </span>
                <span><strong>Persisted accounts:</strong> <code>{storageBackend.accountCount}</code></span>
              </div>
              <p className="demo-data-hint">
                {storageBackend.backend === 'sqlite'
                  ? 'Demo accounts are stored in a local SQLite database (data/persistent/). They survive server restarts but not Vercel deploys.'
                  : storageBackend.backend === 'env_var'
                  ? 'Demo accounts are stored in the DEMO_ACCOUNTS environment variable on Vercel. They persist across deploys.'
                  : 'Storage backend could not be determined.'}
              </p>
            </section>
          )}

          <section className="section demo-data-section" aria-labelledby="demo-data-vertical-heading">
            <h2 id="demo-data-vertical-heading">Demo vertical</h2>
            <p className="demo-data-hint">
              Switch the demo between Banking, Retail, and Workforce (HR) modes. The same PingOne + MCP architecture
              is reused — only terminology, theme, and account types change.
            </p>
            <VerticalSwitcher variant="config" />
          </section>

          <section className="section demo-data-section" aria-labelledby="demo-data-pingone-audit-heading">
            <h2 id="demo-data-pingone-audit-heading">PingOne Configuration Audit</h2>
            <p className="demo-data-hint">
              Validate your PingOne environment configuration — check that all required resource servers exist
              and are configured with the correct scopes. Run the audit to verify your setup is correct.
            </p>
            <PingOneAudit />
          </section>



<details>
  <summary>🎓 Lesson: how can an AI reach your bank data?</summary>
          <section
            className="section demo-data-section demo-data-agent-auth-demo"
            aria-labelledby="demo-agent-auth-demo-heading"
          >
            <h2 id="demo-agent-auth-demo-heading">Learn: how can an AI reach your bank data?</h2>
            <p className="demo-data-hint">
              In the real world, <strong>OAuth</strong> is how apps prove “this person agreed” without sharing their
              password with every product. AI agents add a twist: sometimes people talk about “the agent logging in” in
              different ways. Pick a story below to see which path this demo highlights — we only save your choice in{' '}
              <em>this browser</em> so presenters can switch lessons; nothing here changes your PingOne tenant by itself.
            </p>
            <fieldset className="demo-data-agent-auth-fieldset">
              <legend className="demo-data-agent-auth-legend">Lesson focus</legend>
              <div className="demo-data-agent-auth-options">
                <label
                  className={`demo-data-agent-auth-card${
                    agentAuthDemoMode === AGENT_AUTH_DEMO.OAUTH_PKCE ? ' demo-data-agent-auth-card--active' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="bx-agent-auth-demo"
                    checked={agentAuthDemoMode === AGENT_AUTH_DEMO.OAUTH_PKCE}
                    onChange={() => handleAgentAuthDemoModeChange(AGENT_AUTH_DEMO.OAUTH_PKCE)}
                  />
                  <span className="demo-data-agent-auth-card__body">
                    <span className="demo-data-agent-auth-card__title">1 · Recommended — real sign-in at PingOne</span>
                    <span className="demo-data-agent-auth-card__desc">
                      The user is sent to PingOne’s login (authorization code + PKCE). The app’s backend keeps the access
                      token in a session — the browser never needs to hold a long-lived secret. This is the pattern to teach
                      first.
                    </span>
                  </span>
                </label>
                <label
                  className={`demo-data-agent-auth-card${
                    agentAuthDemoMode === AGENT_AUTH_DEMO.PI_FLOW_MARKETING ? ' demo-data-agent-auth-card--active' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="bx-agent-auth-demo"
                    checked={agentAuthDemoMode === AGENT_AUTH_DEMO.PI_FLOW_MARKETING}
                    onChange={() => handleAgentAuthDemoModeChange(AGENT_AUTH_DEMO.PI_FLOW_MARKETING)}
                  />
                  <span className="demo-data-agent-auth-card__body">
                    <span className="demo-data-agent-auth-card__title">2 · Sign-in from the marketing page (pi.flow)</span>
                    <span className="demo-data-agent-auth-card__desc">
                      Looks like a form on your site, but PingOne still runs the actual login and security screens (a Ping
                      flow: <code>response_type=pi.flow</code>). Good for teaching “embedded” experiences without teaching
                      apps to collect passwords and send them to a password-grant endpoint.
                    </span>
                  </span>
                </label>
                <label
                  className={`demo-data-agent-auth-card${
                    agentAuthDemoMode === AGENT_AUTH_DEMO.BEARER_PASTE ? ' demo-data-agent-auth-card--active' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="bx-agent-auth-demo"
                    checked={agentAuthDemoMode === AGENT_AUTH_DEMO.BEARER_PASTE}
                    onChange={() => handleAgentAuthDemoModeChange(AGENT_AUTH_DEMO.BEARER_PASTE)}
                  />
                  <span className="demo-data-agent-auth-card__body">
                    <span className="demo-data-agent-auth-card__title">3 · The AI already has an access token</span>
                    <span className="demo-data-agent-auth-card__desc">
                      Some demos assume the user copied a token (like a temporary key) into a script or tool. The API
                      accepts <code>Authorization: Bearer …</code>. Teach that this is powerful, easy to leak, and not the
                      same as teaching end users to paste secrets into chatbots.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            {agentAuthDemoMode === AGENT_AUTH_DEMO.OAUTH_PKCE && (
              <div className="demo-data-agent-auth-detail">
                <p className="demo-data-hint">
                  <strong>What you are teaching:</strong> the customer leaves this app briefly, signs in where PingOne
                  says it is safe, and returns with a short-lived “yes” the backend can use. After login, you can open the
                  slide lesson on <strong>token exchange</strong> to show how a narrower token can be minted for tools
                  like MCP.
                </p>
                <div className="demo-data-actions demo-data-actions--wrap">
                  <a className="demo-data-btn primary" href="/api/auth/oauth/user/login">
                    Go to PingOne customer sign-in
                  </a>
                  <button
                    type="button"
                    className="demo-data-btn ghost"
                    onClick={() => open(EDU.TOKEN_EXCHANGE, 'what')}
                  >
                    Open lesson: token exchange
                  </button>
                  <button
                    type="button"
                    className="demo-data-btn ghost"
                    onClick={() => open(EDU.BEST_PRACTICES, 'what')}
                  >
                    Open lesson: AI + OAuth basics
                  </button>
                </div>
              </div>
            )}

            {agentAuthDemoMode === AGENT_AUTH_DEMO.PI_FLOW_MARKETING && (
              <div className="demo-data-agent-auth-detail">
                <p className="demo-data-hint">
                  <strong>What you are teaching:</strong> the customer still authenticates with PingOne (MFA, policies,
                  branding), but the flow can feel like part of your marketing site. That is different from “type your
                  password into ChatGPT,” which you should discourage.
                </p>
                <ol className="demo-data-agent-auth-steps">
                  <li>
                    Scroll to <strong>Marketing page customer sign-in</strong> below, choose{' '}
                    <strong>Slide panel — hints + pi.flow</strong>, and click <strong>Save marketing sign-in</strong> (same
                    idea lives under Application setup if you prefer).
                  </li>
                  <li>
                    Visit <Link to="/marketing">/marketing</Link>, open the sign-in slide, and continue. Behind the scenes
                    the app asks PingOne for a <code>pi.flow</code> response so the real login UI is still PingOne’s — not a
                    legacy “password grant” to the token endpoint.
                  </li>
                </ol>
                <div className="demo-data-actions demo-data-actions--wrap">
                  <Link className="demo-data-btn primary" to="/marketing">
                    Open marketing page (try sign-in)
                  </Link>
                  <button
                    type="button"
                    className="demo-data-btn ghost"
                    onClick={() =>
                      document.getElementById('demo-marketing-login-heading')?.scrollIntoView({ behavior: 'smooth' })
                    }
                  >
                    Scroll to marketing sign-in settings
                  </button>
                </div>
              </div>
            )}

            {agentAuthDemoMode === AGENT_AUTH_DEMO.BEARER_PASTE && (
              <div className="demo-data-agent-auth-detail">
                <p className="demo-data-hint">
                  <strong>What you are teaching:</strong> whoever holds a valid access token can call the API like the user
                  until it expires. In class, use this to show why tokens must be short-lived, scoped, and never pasted into
                  untrusted chat. The button below sends <em>only</em> the Bearer header (no session cookie) so you can
                  prove the rule. Use fake/lab tokens only.
                </p>
                <label className="demo-data-field">
                  <span>Paste an access token (lab only)</span>
                  <input
                    type="password"
                    autoComplete="off"
                    value={bearerPasteToken}
                    onChange={(e) => setBearerPasteToken(e.target.value)}
                    placeholder="eyJ…"
                  />
                </label>
                <div className="demo-data-actions demo-data-actions--wrap">
                  <button
                    type="button"
                    className="demo-data-btn primary"
                    disabled={bearerBusy}
                    onClick={handleBearerProbeAccounts}
                  >
                    {bearerBusy ? 'Trying…' : 'Try “list accounts” with this token'}
                  </button>
                  <a className="demo-data-btn ghost" href="/api/auth/oauth/user/token-claims" target="_blank" rel="noreferrer">
                    See your current session token (JSON lesson)
                  </a>
                </div>
                {bearerProbe && (
                  <pre className="demo-data-agent-auth-probe" role="status">
                    {JSON.stringify(bearerProbe, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </section>
</details>

          <Link
            to={dashboardPath}
            className="demo-data-agent-open-icon"
            title="Open dashboard (AI assistant)"
            aria-label="Open dashboard (AI assistant)"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 8V4H8" />
              <rect width="16" height="12" x="4" y="8" rx="2" />
              <path d="M2 14h2" />
              <path d="M20 14h2" />
              <path d="M15 13v2" />
              <path d="M9 13v2" />
            </svg>
          </Link>

          {loading ? (
            <section className="section">
              <p className="demo-data-loading">Loading…</p>
            </section>
          ) : (
            <>
            <form className="demo-data-form" onSubmit={handleSubmit}>
              <section className="section demo-data-section">
                <h2>User profile</h2>
                <p className="demo-data-hint">
                  These fields update your signed-in user record. Immutable fields (<code>id</code>, <code>password</code>,{' '}
                  <code>createdAt</code>) are not editable here.
                </p>
                {(userMeta.id || userMeta.role || userMeta.createdAt) && (
                  <p className="demo-data-readonly-meta" aria-label="Account metadata">
                    {userMeta.id && (
                      <span>
                        User ID: <code>{userMeta.id}</code>
                      </span>
                    )}
                    {userMeta.role && (
                      <span>
                        Role: <strong>{userMeta.role}</strong>
                      </span>
                    )}
                    {userMeta.createdAt && (
                      <span>
                        Created: <time dateTime={userMeta.createdAt}>{userMeta.createdAt}</time>
                      </span>
                    )}
                  </p>
                )}
                <div className="demo-data-profile-grid">
                  <label className="demo-data-field">
                    <span>First name</span>
                    <input
                      type="text"
                      autoComplete="given-name"
                      value={profile.firstName}
                      onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))}
                      maxLength={300}
                    />
                  </label>
                  <label className="demo-data-field">
                    <span>Last name</span>
                    <input
                      type="text"
                      autoComplete="family-name"
                      value={profile.lastName}
                      onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))}
                      maxLength={300}
                    />
                  </label>
                  <label className="demo-data-field">
                    <span>Email</span>
                    <input
                      type="email"
                      autoComplete="email"
                      value={profile.email}
                      onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                      maxLength={300}
                    />
                  </label>
                  <label className="demo-data-field">
                    <span>Username</span>
                    <input
                      type="text"
                      autoComplete="username"
                      value={profile.username}
                      onChange={(e) => setProfile((p) => ({ ...p, username: e.target.value }))}
                      maxLength={300}
                    />
                  </label>
                </div>
                <label className="demo-data-field demo-data-field--checkbox">
                  <input
                    type="checkbox"
                    checked={profile.isActive}
                    onChange={(e) => setProfile((p) => ({ ...p, isActive: e.target.checked }))}
                  />
                  <span>Account active</span>
                </label>
              </section>

              <section className="section demo-data-section">
                <h2>Step-up MFA threshold (USD)</h2>
                <p className="demo-data-hint">
                  Transfers and withdrawals at or above this amount require step-up authentication (when enabled). Default
                  from server: <strong>{defaults?.stepUpAmountThreshold ?? '—'}</strong>.
                </p>
                <label className="demo-data-field">
                  <span>Threshold ($)</span>
                  <input type="number" min="0" step="0.01" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
                </label>
              </section>

              <section className="section demo-data-section">
                <div className="demo-data-accounts-header">
                  <h2>Accounts</h2>
                  <span className="demo-data-accounts-hint">Check a type to include it; uncheck to exclude. One account per type.</span>
                </div>
                <div className="demo-data-type-slots">
                  {ACCOUNT_TYPE_SLOTS.map((s) => {
                    const slot = typeSlots[s.type] || {};
                    return (
                      <div
                        key={s.type}
                        className={`demo-data-type-slot${slot.enabled ? ' demo-data-type-slot--on' : ''}`}
                      >
                        <label className="demo-data-type-slot__toggle" title={slot.enabled ? 'Disable this account type' : 'Enable this account type'}>
                          <input
                            type="checkbox"
                            checked={!!slot.enabled}
                            onChange={(e) => handleSlotChange(s.type, 'enabled', e.target.checked)}
                          />
                          <span className="demo-data-type-slot__icon">{s.icon}</span>
                          <span className="demo-data-type-slot__label">{s.label}</span>
                          {slot.enabled && slot.accountNumber && (
                            <code className="demo-data-type-slot__num">{slot.accountNumber}</code>
                          )}
                        </label>
                        {slot.enabled && (
                          <div className="demo-data-type-slot__fields">
                            <label className="demo-data-field demo-data-field--inline">
                              <span>Nickname</span>
                              <input
                                type="text"
                                value={slot.name}
                                placeholder={s.defaultName}
                                onChange={(e) => handleSlotChange(s.type, 'name', e.target.value)}
                                maxLength={120}
                              />
                            </label>
                            <label className="demo-data-field demo-data-field--inline demo-data-field--narrow">
                              <span>Balance (USD)</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={slot.balance}
                                onChange={(e) => handleSlotChange(s.type, 'balance', e.target.value)}
                              />
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
                  <button type="button" className="demo-data-btn ghost" onClick={handleResetDefaults} disabled={!defaults}>
                    Reset form to defaults
                  </button>
                  <button type="submit" className="demo-data-btn primary" disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </section>
            </form>

            {/* ── Account Profile Fields ── */}
            <section className="section demo-data-section" aria-labelledby="demo-acct-profile-heading">
              <button
                type="button"
                onClick={() => setCollapsedSections((prev) => ({ ...prev, accountProfile: !prev.accountProfile }))}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  padding: 0,
                  margin: 0,
                }}
                aria-expanded={!collapsedSections.accountProfile}
              >
                <h2 className="demo-data-section__heading" id="demo-acct-profile-heading" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.2rem', minWidth: '1rem', display: 'inline-block' }}>
                    {collapsedSections.accountProfile ? '▶' : '▼'}
                  </span>
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
                Fields marked <strong>🔒 Sensitive</strong> are only returned via the{' '}
                <code>get_sensitive_account_details</code> tool after consent. Toggle{' '}
                <em>Include in response</em> to control which sensitive fields the demo exposes.
              </p>
              {ACCOUNT_TYPE_SLOTS.filter((s) => typeSlots[s.type]?.enabled).length === 0 && (
                <p className="demo-data-hint" style={{ fontStyle: 'italic' }}>
                  No accounts enabled. Enable accounts in the <strong>Accounts</strong> section above.
                </p>
              )}
              {ACCOUNT_TYPE_SLOTS.filter((s) => typeSlots[s.type]?.enabled).map((s) => {
                const slot = typeSlots[s.type];
                const prof = accountProfiles[s.type] || defaultAccountProfile(s.type, '');
                const setProf = (field, value) =>
                  setAccountProfiles((prev) => ({
                    ...prev,
                    [s.type]: { ...(prev[s.type] || defaultAccountProfile(s.type, '')), [field]: value },
                  }));
                return (
                  <div key={s.type} className="demo-data-type-slot demo-data-type-slot--on" style={{ marginBottom: '1.25rem' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.95rem' }}>
                      {s.icon} {slot.name || s.defaultName}
                      {slot.accountNumber && (
                        <code className="demo-data-type-slot__num">{slot.accountNumber}</code>
                      )}
                    </div>
                    <div className="demo-data-type-slot__fields">
                      {[
                        ['swiftCode', 'SWIFT Code'],
                        ['iban', 'IBAN'],
                        ['branchName', 'Branch Name'],
                        ['branchCode', 'Branch Code'],
                        ['openedDate', 'Opened Date'],
                        ['accountHolderName', 'Account Holder Name'],
                      ].map(([field, label]) => (
                        <label key={field} className="demo-data-field demo-data-field--inline">
                          <span>{label}</span>
                          <input
                            type="text"
                            value={prof[field] || ''}
                            onChange={(e) => setProf(field, e.target.value)}
                            maxLength={200}
                          />
                        </label>
                      ))}
                      <div style={{ border: '1px solid #fcd34d', borderRadius: 6, padding: '0.5rem 0.75rem', background: '#fffbeb', marginTop: '0.5rem' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#92400e', marginBottom: '0.4rem' }}>
                          🔒 Sensitive — requires banking:sensitive:read
                        </div>
                        <label className="demo-data-field demo-data-field--inline">
                          <span>Routing Number 🔒</span>
                          <input
                            type="text"
                            value={prof.routingNumber || ''}
                            onChange={(e) => setProf('routingNumber', e.target.value)}
                            maxLength={50}
                          />
                        </label>
                        <label className="demo-data-field demo-data-field--checkbox" style={{ marginTop: '0.25rem' }}>
                          <input
                            type="checkbox"
                            checked={!!prof.includeRoutingNumber}
                            onChange={(e) => setProf('includeRoutingNumber', e.target.checked)}
                          />
                          <span>Include routing number in response</span>
                        </label>
                        <label className="demo-data-field demo-data-field--inline" style={{ marginTop: '0.5rem' }}>
                          <span>Full Account Number 🔒</span>
                          <input
                            type="text"
                            value={prof.accountNumberFull || ''}
                            onChange={(e) => setProf('accountNumberFull', e.target.value)}
                            maxLength={50}
                          />
                        </label>
                        <label className="demo-data-field demo-data-field--checkbox" style={{ marginTop: '0.25rem' }}>
                          <input
                            type="checkbox"
                            checked={!!prof.includeAccountNumberFull}
                            onChange={(e) => setProf('includeAccountNumberFull', e.target.checked)}
                          />
                          <span>Include full account number in response</span>
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="demo-data-actions" style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  className="demo-data-btn primary"
                  disabled={accountProfileSaving}
                  onClick={handleSaveAccountProfiles}
                >
                  {accountProfileSaving ? 'Saving\u2026' : 'Save account profile fields'}
                </button>
              </div>
                          </>
              )}
            </section>

                        {/* \u2500\u2500 Agent Scope Permissions (separate save \u2014 calls /api/admin/config) \u2500\u2500 */}
            <section className="section demo-data-section" aria-labelledby="demo-scope-heading">
              <h2 className="demo-data-section__heading" id="demo-scope-heading">Agent scope permissions</h2>
              <p className="demo-data-hint">
                Controls which OAuth scopes are included in the RFC 8693 token exchange when the AI agent calls a tool.
                <br />
                <strong>banking:read</strong> — agent can view accounts, balances, and transactions.
                <strong> banking:write</strong> — agent can transfer funds and make deposits.
                Broad scopes (<em>banking:read</em>, <em>banking:write</em>) satisfy any matching tool;
                specific scopes are finer-grained alternatives.
              </p>
              <div className="demo-data-scope-list">
                {AGENT_MCP_SCOPE_CATALOG.map((row) => {
                  const checked = allowedScopes.has(row.scope);
                  return (
                    <label
                      key={row.scope}
                      className={`demo-data-scope-row${checked ? ' demo-data-scope-row--on' : ''}${row.group === 'broad' ? ' demo-data-scope-row--broad' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => handleScopeToggle(row.scope, e.target.checked)}
                        style={{ marginTop: '0.2rem', flexShrink: 0 }}
                      />
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
                <button
                  type="button"
                  className="demo-data-btn primary"
                  disabled={scopeSaving}
                  onClick={handleSaveScopes}
                >
                  {scopeSaving ? 'Saving…' : 'Save scope permissions'}
                </button>
              </div>
            </section>

            <section className="section demo-data-section" aria-labelledby="demo-marketing-login-heading">
              <h2 className="demo-data-section__heading" id="demo-marketing-login-heading">
                Marketing page customer sign-in
              </h2>
              <p className="demo-data-hint">
                <strong>Teaching note:</strong> this controls what learners see when they click customer sign-in on the
                home / marketing page. <strong>Redirect</strong> is the simplest story — full browser hop to PingOne with
                standard OAuth (code + PKCE). <strong>Slide panel + pi.flow</strong> adds demo hints and uses Ping’s flow
                mode (<code>use_pi_flow=1</code>, <code>response_type=pi.flow</code>) so the real login still lives at
                PingOne — useful when you want to contrast “embedded” sign-in with unsafe “paste your password into an AI”
                habits. Needs a PingOne app that supports pi.flow; otherwise switch back to <strong>Redirect</strong>. Same
                options exist under <Link to="/config">Application setup</Link>.
              </p>
              <label className="demo-data-field">
                <span>Customer login mode</span>
                <select
                  value={marketingLoginMode}
                  onChange={(e) => setMarketingLoginMode(e.target.value)}
                >
                  <option value="redirect">Redirect — standard authorize (code + PKCE)</option>
                  <option value="slide_pi_flow">Slide panel — hints + pi.flow (?use_pi_flow=1)</option>
                </select>
              </label>
              <label className="demo-data-field">
                <span>Demo username hint (not a secret)</span>
                <input
                  type="text"
                  value={marketingUserHint}
                  onChange={(e) => setMarketingUserHint(e.target.value)}
                  maxLength={500}
                  placeholder="e.g. bankuser"
                  autoComplete="off"
                />
              </label>
              <label className="demo-data-field">
                <span>Demo password hint (not a secret)</span>
                <input
                  type="text"
                  value={marketingPassHint}
                  onChange={(e) => setMarketingPassHint(e.target.value)}
                  maxLength={500}
                  placeholder="e.g. your sandbox password"
                  autoComplete="off"
                />
              </label>
              <div className="demo-data-actions" style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  className="demo-data-btn primary"
                  disabled={marketingSaving}
                  onClick={handleSaveMarketingLogin}
                >
                  {marketingSaving ? 'Saving…' : 'Save marketing sign-in'}
                </button>
              </div>
            </section>

            {/* ── PingOne Authorize flags (all users — live vs simulated, MCP first tool, etc.) ── */}
            <section className="section demo-data-section" aria-labelledby="demo-p1az-flags-heading">
                <h2 className="demo-data-section__heading" id="demo-p1az-flags-heading">
                  PingOne Authorize — demo toggles
                </h2>
                <p className="demo-data-hint">
                  These are the same switches as <Link to="/feature-flags">Feature Flags</Link> (PingOne Authorize
                  category). <strong>Live PingOne</strong> calls the real decision API when{' '}
                  <strong>Simulated Authorize</strong> is <strong>off</strong> and you have a decision endpoint + worker
                  app in <Link to="/config">Application Configuration</Link>. <strong>Simulated Authorize on</strong> keeps
                  evaluation in-process (education). <strong>First MCP tool</strong> adds a policy check on the first
                  BankingAgent tool call per session when configured.
                </p>

                <div
                  className="demo-data-static-notice"
                  style={{ marginTop: '0.75rem', marginBottom: '0.75rem', borderColor: '#93c5fd', background: '#eff6ff' }}
                >
                  <span className="demo-data-static-notice__icon">⚙️</span>
                  <div style={{ flex: 1 }}>
                    <strong>Configure PingOne Authorize (worker + Management API)</strong>
                    <p className="demo-data-hint" style={{ margin: '0.35rem 0 0.5rem' }}>
                      Uses your <strong>Authorize worker</strong> app (client credentials) to call PingOne{' '}
                      <code>POST …/decisionEndpoints</code> and create two endpoints:{' '}
                      <em>Super Banking Demo — Transactions</em> and <em>Super Banking Demo — MCP first tool</em>. If they
                      already exist, their IDs are reused. Optionally pass a <strong>policy ID</strong> or{' '}
                      <strong>authorization version ID</strong> from PingOne Authorize (published policy); otherwise
                      PingOne attaches the latest policy version at runtime per PingOne docs.
                    </p>
                    <div className="demo-data-field-row" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
                      <label className="demo-data-field" style={{ flex: '1 1 200px' }}>
                        <span className="demo-data-field__label">Policy ID (optional)</span>
                        <input
                          type="text"
                          className="demo-data-input"
                          value={p1azBootstrapPolicyId}
                          onChange={(e) => setP1azBootstrapPolicyId(e.target.value)}
                          placeholder="PingOne policy UUID"
                          autoComplete="off"
                        />
                      </label>
                      <label className="demo-data-field" style={{ flex: '1 1 200px' }}>
                        <span className="demo-data-field__label">Authorization version ID (optional)</span>
                        <input
                          type="text"
                          className="demo-data-input"
                          value={p1azBootstrapAuthVer}
                          onChange={(e) => setP1azBootstrapAuthVer(e.target.value)}
                          placeholder="Pinned policy version UUID"
                          autoComplete="off"
                        />
                      </label>
                    </div>
                    <label className="demo-data-field demo-data-field--checkbox" style={{ marginTop: '0.5rem' }}>
                      <input
                        type="checkbox"
                        checked={p1azBootstrapEnableLive}
                        onChange={(e) => setP1azBootstrapEnableLive(e.target.checked)}
                      />
                      <span>
                        After bootstrap: turn <strong>on</strong> live transaction Authorize and turn <strong>off</strong>{' '}
                        simulated Authorize (saved with endpoint IDs when config persistence is available)
                      </span>
                    </label>
                    <label className="demo-data-field demo-data-field--checkbox">
                      <input
                        type="checkbox"
                        checked={p1azBootstrapEnableMcp}
                        onChange={(e) => setP1azBootstrapEnableMcp(e.target.checked)}
                      />
                      <span>
                        Also enable <strong>First MCP tool</strong> Authorize flag and save MCP endpoint ID
                      </span>
                    </label>
                    <div className="demo-data-actions" style={{ marginTop: '0.75rem' }}>
                      <button
                        type="button"
                        className="demo-data-btn primary"
                        disabled={p1azBootstrapBusy}
                        onClick={handleP1azAuthorizeBootstrap}
                      >
                        {p1azBootstrapBusy ? 'Calling PingOne…' : 'Create / link Authorize decision endpoints'}
                      </button>
                    </div>
                  </div>
                </div>

                {p1azFlagsLoading && <p className="demo-data-loading">Loading Authorize flags…</p>}
                {p1azFlagsError && (
                  <p style={{ color: '#b91c1c', fontSize: '0.9rem' }} role="alert">
                    {p1azFlagsError}
                  </p>
                )}
                {!p1azFlagsLoading && p1azFlags.length > 0 && (
                  <div className="demo-data-scope-list" style={{ marginTop: '0.75rem' }}>
                    {p1azFlags.map((flag) => {
                      const isOn = flag.value === true;
                      const showWarn =
                        (!isOn && flag.warnIfDisabled) || (isOn && flag.warnIfEnabled);
                      const warnMsg = flag.warnIfDisabled
                        ? 'Disabling may block transactions or reduce safety.'
                        : 'Enabling may reduce security — use for demos only.';
                      return (
                        <div
                          key={flag.id}
                          className={`demo-data-scope-row${isOn ? ' demo-data-scope-row--on' : ''}`}
                        >
                          <label className="demo-data-field demo-data-field--checkbox" style={{ alignItems: 'flex-start' }}>
                            <input
                              type="checkbox"
                              checked={isOn}
                              disabled={p1azFlagSaving === flag.id}
                              onChange={(e) => handleP1azFlagToggle(flag.id, e.target.checked)}
                              style={{ marginTop: '0.25rem', flexShrink: 0 }}
                            />
                            <span className="demo-data-scope-body">
                              <span className="demo-data-scope-label">{flag.name}</span>
                              <code className="demo-data-scope-code">{flag.id}</code>
                              <span className="demo-data-scope-desc">{flag.description}</span>
                              {showWarn && (
                                <span className="demo-data-scope-desc" style={{ color: '#b45309' }}>
                                  ⚠️ {warnMsg}
                                </span>
                              )}
                            </span>
                          </label>
                          {p1azFlagSaving === flag.id && (
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Saving…</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="demo-data-hint" style={{ marginTop: '0.75rem' }}>
                  <Link to="/feature-flags">Open full Feature Flags</Link>
                  {' · '}
                  <Link to="/config">PingOne / OAuth config</Link>
                </p>

                {/* ── Token endpoint auth method overrides (Phase 110) ── */}
                <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-light,#e2e8f0)', paddingTop: '1rem' }}>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.4rem', color: '#374151' }}>
                    Token endpoint authentication method
                  </h3>
                  <p className="demo-data-hint" style={{ marginBottom: '0.75rem' }}>
                    Override the auth method the BFF uses when exchanging tokens with PingOne.
                    Leave blank to use the env var default (
                    <code>AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD</code> /{' '}
                    <code>MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD</code>).
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 600 }}>
                      AI Agent App
                      <select
                        value={agentTokenEndpointAuth}
                        onChange={(e) => setAgentTokenEndpointAuth(e.target.value)}
                        style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.8rem' }}
                      >
                        <option value="">— use env var —</option>
                        <option value="client_secret_basic">client_secret_basic</option>
                        <option value="client_secret_post">client_secret_post</option>
                        <option value="client_secret_jwt">client_secret_jwt</option>
                      </select>
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 600 }}>
                      MCP Token Exchanger
                      <select
                        value={mcpTokenEndpointAuth}
                        onChange={(e) => setMcpTokenEndpointAuth(e.target.value)}
                        style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.8rem' }}
                      >
                        <option value="">— use env var —</option>
                        <option value="client_secret_basic">client_secret_basic</option>
                        <option value="client_secret_post">client_secret_post</option>
                        <option value="client_secret_jwt">client_secret_jwt</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="demo-data-btn ghost"
                      onClick={handleTokenAuthSave}
                      disabled={tokenAuthSaving}
                      style={{ alignSelf: 'flex-end' }}
                    >
                      {tokenAuthSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              </section>

            {/* ── may_act demo toggle ─────────────────────────────────────── */}
            <section className="section demo-data-section" aria-labelledby="demo-mayact-heading">
              <h2 className="demo-data-section__heading" id="demo-mayact-heading">Token Exchange — may_act demo</h2>

              {/* BFF injection flags — visible to all logged-in users */}
              {(() => {
                const injectFlag = p1azFlags.find((f) => f.id === 'ff_inject_may_act');
                const audFlag    = p1azFlags.find((f) => f.id === 'ff_inject_audience');
                const injectOn   = injectFlag?.currentValue === true;
                const audOn      = audFlag?.currentValue === true;

                return (
                  <>
                    {/* ff_inject_may_act */}
                    <div className="demo-data-static-notice" style={{ marginBottom: '0.75rem', borderColor: injectOn ? '#f59e0b' : '#c7d2fe', background: injectOn ? '#fffbeb' : '#eef2ff' }}>
                      <span className="demo-data-static-notice__icon">{injectOn ? '🔧' : '💡'}</span>
                      <div style={{ flex: 1 }}>
                        <strong>Auto-inject may_act (BFF synthetic)</strong>
                        {' — '}
                        {injectOn
                          ? <span style={{ color: '#b45309' }}>ON — BFF adds a synthetic <code>may_act</code> claim before exchange. Token Chain shows an injected badge.</span>
                          : <span style={{ color: '#374151' }}>OFF — token exchange uses the real <code>may_act</code> from PingOne (or fails if absent).</span>}
                        <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button type="button" className={`demo-data-btn${!injectOn ? ' primary' : ' ghost'}`}
                            disabled={p1azFlagSaving === 'ff_inject_may_act' || !injectOn || !injectFlag}
                            onClick={() => handleP1azFlagToggle('ff_inject_may_act', false)}>
                            {p1azFlagSaving === 'ff_inject_may_act' && injectOn ? 'Saving…' : '❌ Disable'}
                          </button>
                          <button type="button" className={`demo-data-btn${injectOn ? ' primary' : ' ghost'}`}
                            disabled={p1azFlagSaving === 'ff_inject_may_act' || injectOn || !injectFlag}
                            onClick={() => handleP1azFlagToggle('ff_inject_may_act', true)}>
                            {p1azFlagSaving === 'ff_inject_may_act' && !injectOn ? 'Saving…' : '🔧 Enable'}
                          </button>
                          {!injectFlag && <span style={{ fontSize: '0.78rem', color: '#9ca3af', alignSelf: 'center' }}>Flag not loaded — scroll up to reload Authorize flags</span>}
                        </div>
                      </div>
                    </div>
                    {/* ff_inject_audience */}
                    <div className="demo-data-static-notice" style={{ marginBottom: '1rem', borderColor: audOn ? '#f59e0b' : '#c7d2fe', background: audOn ? '#fffbeb' : '#eef2ff' }}>
                      <span className="demo-data-static-notice__icon">{audOn ? '🔧' : '💡'}</span>
                      <div style={{ flex: 1 }}>
                        <strong>Auto-inject audience (BFF synthetic)</strong>
                        {' — '}
                        {audOn
                          ? <span style={{ color: '#b45309' }}>ON — BFF adds <code>mcp_resource_uri</code> to <code>aud</code> snapshot before exchange.</span>
                          : <span style={{ color: '#374151' }}>OFF — token exchange uses the real <code>aud</code> from PingOne.</span>}
                        <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button type="button" className={`demo-data-btn${!audOn ? ' primary' : ' ghost'}`}
                            disabled={p1azFlagSaving === 'ff_inject_audience' || !audOn || !audFlag}
                            onClick={() => handleP1azFlagToggle('ff_inject_audience', false)}>
                            {p1azFlagSaving === 'ff_inject_audience' && audOn ? 'Saving…' : '❌ Disable'}
                          </button>
                          <button type="button" className={`demo-data-btn${audOn ? ' primary' : ' ghost'}`}
                            disabled={p1azFlagSaving === 'ff_inject_audience' || audOn || !audFlag}
                            onClick={() => handleP1azFlagToggle('ff_inject_audience', true)}>
                            {p1azFlagSaving === 'ff_inject_audience' && !audOn ? 'Saving…' : '🔧 Enable'}
                          </button>
                          {!audFlag && <span style={{ fontSize: '0.78rem', color: '#9ca3af', alignSelf: 'center' }}>Flag not loaded — scroll up to reload Authorize flags</span>}
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Static-mode notice */}
              <div className="demo-data-static-notice" style={{ borderColor: '#93c5fd', background: '#eff6ff', color: '#1e3a5f' }}>
                <span className="demo-data-static-notice__icon">ℹ️</span>
                <div>
                  <strong>Static mapping active</strong> — <code>may_act</code> is always present in your
                  token. The PingOne attribute mapping for the <em>bankingAdmin</em> app uses a hardcoded
                  expression, so <code>may_act</code> is injected regardless of the <code>mayAct</code>{' '}
                  user attribute. The buttons below write to your PingOne user record for conceptual
                  exploration, but will not change what appears in your token.
                </div>
              </div>

              <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', lineHeight: 1.6 }}>
                The <code>may_act</code> claim in a PingOne access token pre-authorises the BFF to exchange
                that token on behalf of the user (RFC&nbsp;8693). Enable it to demo a <strong>successful</strong>{' '}
                token exchange with full <code>act</code> claim provenance; disable it to demo the{' '}
                <strong>failed / degraded</strong> path.
              </p>

              <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic' }}>Conceptual only — writes to PingOne user attribute; does not affect your token while static mapping is active.</p>
              <div className="demo-data-mayact-row">
                {/* Delegation mode selector */}
                <div style={{ width: '100%', marginBottom: '0.6rem', padding: '0.6rem 0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#374151' }}>Delegation mode — which client ID becomes <code>mayAct.sub</code>:</div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                    <input
                      type="radio"
                      name="delegationMode"
                      value="1exchange"
                      checked={delegationMode === '1exchange'}
                      onChange={() => setDelegationMode('1exchange')}
                    />
                    <strong>1-Exchange</strong>
                    <span style={{ color: '#6b7280' }}>— Banking App Client ID (exchange: user → MCP token)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input
                      type="radio"
                      name="delegationMode"
                      value="2exchange"
                      checked={delegationMode === '2exchange'}
                      onChange={() => setDelegationMode('2exchange')}
                    />
                    <strong>2-Exchange</strong>
                    <span style={{ color: '#6b7280' }}>— AI Agent Client ID (exchange #1: user → agent token, exchange #2: agent → MCP token with nested <code>act</code>)</span>
                  </label>
                  {delegationMode === '2exchange' && (
                    <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 4, padding: '0.35rem 0.6rem' }}>
                      ⚠️ Also enable the <strong>"2-Exchange Delegated Chain"</strong> feature flag and set <code>AI_AGENT_CLIENT_ID</code> + <code>AI_AGENT_CLIENT_SECRET</code> env vars.
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={`demo-data-btn${mayActEnabled === true ? ' primary' : ' ghost'}`}
                  disabled={mayActSaving || mayActEnabled === true}
                  onClick={() => handleSetMayAct(true)}
                >
                  {mayActSaving && mayActEnabled !== true ? 'Saving…' : '✅ Enable may_act'}
                </button>
                <button
                  type="button"
                  className={`demo-data-btn${mayActEnabled === false ? ' primary' : ' ghost'}`}
                  disabled={mayActSaving || mayActEnabled === false}
                  onClick={() => handleSetMayAct(false)}
                >
                  {mayActSaving && mayActEnabled !== false ? 'Saving…' : '❌ Clear may_act'}
                </button>
                <button
                  type="button"
                  className="demo-data-btn ghost"
                  disabled={mayActDiagnosing}
                  onClick={handleDiagnoseMayAct}
                  title="Check your PingOne user attribute and app mapping configuration"
                >
                  {mayActDiagnosing ? 'Checking…' : '🔍 Diagnose'}
                </button>
                <span className={`demo-data-mayact-status${mayActEnabled === true ? ' demo-data-mayact-status--on' : mayActEnabled === false ? ' demo-data-mayact-status--off' : ''}`}>
                  {mayActEnabled === true
                    ? '✅ may_act present in token'
                    : mayActEnabled === false
                      ? '❌ may_act absent from token'
                      : 'Checking…'}
                </span>
              </div>

              {mayActDiagnosis && (
                <div style={{ margin: '0.75rem 0', padding: '0.75rem 1rem', border: '1px solid #d1d5db', borderRadius: 6, background: '#f9fafb', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>🔍 PingOne config diagnosis</div>
                  {mayActDiagnosis.diagnosis?.map((line, i) => (
                    <div key={i} style={{ marginBottom: '0.2rem' }}>{line}</div>
                  ))}
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

              {/* Dynamic mode explainer */}
              <details className="demo-data-dynamic-explainer">
                <summary>Why can't the Enable / Clear buttons control the token? (advanced)</summary>
                <p>
                  The <code>may_act</code> claim is controlled by a <strong>hardcoded expression</strong> in
                  the PingOne attribute mapping — it always evaluates to the same{' '}
                  <code>{`{"client_id": "<app-client-id>"}`}</code> value regardless of the
                  user&apos;s <code>mayAct</code> attribute. PingOne attribute mapping expressions
                  for <code>may_act</code> must be a static JSON literal; there is no supported
                  dynamic expression that reads a custom user attribute and injects it as a JSON object.
                </p>
                <p>
                  The Enable / Clear buttons write to the user&apos;s <code>mayAct</code> custom
                  attribute in PingOne, but because the token mapping is hardcoded they will not
                  change what appears in the token. They are kept here for conceptual exploration
                  only.
                </p>
                <p>
                  To demote <code>may_act</code> to absent (for the failed path demo) use the{' '}
                  <strong>Auto-inject may_act (BFF synthetic)</strong> toggle above to{' '}
                  <strong>disable</strong> injection, then re-login with a client that has no
                  static <code>may_act</code> mapping. Alternatively, remove the{' '}
                  <code>may_act</code> attribute mapping from the PingOne app and re-login.
                </p>
              </details>
            </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
