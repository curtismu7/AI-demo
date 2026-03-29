// banking_api_ui/src/components/DemoDataPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { notifySuccess, notifyError, notifyWarning, notifyInfo } from '../utils/appToast';
import axios from 'axios';
import apiClient from '../services/apiClient';
import { fetchDemoScenario, saveDemoScenario } from '../services/demoScenarioService';
import { AGENT_MCP_SCOPE_CATALOG, DEFAULT_AGENT_MCP_ALLOWED_SCOPES } from '../config/agentMcpScopes';
import { useAgentUiMode } from '../context/AgentUiModeContext';
import AgentUiModeToggle from './AgentUiModeToggle';
import { useEducationUI } from '../context/EducationUIContext';
import { EDU } from './education/educationIds';
import { useIndustryBranding } from '../context/IndustryBrandingContext';
import './UserDashboard.css';
import './DemoDataPage.css';

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

/**
 * Lets demo users edit account labels, balances, and MFA step-up threshold for their sandbox data.
 */
export default function DemoDataPage({ user, onLogout }) {
  const { preset: industryPreset } = useIndustryBranding();
  const navigate = useNavigate();
  const { open } = useEducationUI();
  const { placement: agentPlacement } = useAgentUiMode();
  const dashboardPath = user?.role === 'admin' ? '/admin' : '/dashboard';
  const dashboardCrumbLabel = user?.role === 'admin' ? 'Admin' : 'Dashboard';

  const [dashTheme, setDashTheme] = useState(() => {
    try {
      const t = localStorage.getItem('bx-dash-theme');
      return t === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = dashTheme;
    try {
      localStorage.setItem('bx-dash-theme', dashTheme);
    } catch (_) {
      /* ignore */
    }
  }, [dashTheme]);

  const handleDashThemeToggle = useCallback(() => {
    setDashTheme((d) => (d === 'dark' ? 'light' : 'dark'));
  }, []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // One slot per account type — keyed by accountType string.
  const [typeSlots, setTypeSlots] = useState(defaultTypeSlots);
  const [threshold, setThreshold] = useState('');
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
      const { data } = await apiClient.patch('/api/demo/may-act', { enabled: enable });
      setMayActEnabled(enable);
      notifySuccess(data.message || (enable ? 'may_act enabled' : 'may_act cleared'));
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to update may_act';
      notifyError(msg);
    } finally {
      setMayActSaving(false);
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

  const loadP1azFlags = useCallback(async () => {
    if (user?.role !== 'admin') return;
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
  }, [user?.role]);

  useEffect(() => {
    if (user?.role === 'admin') {
      loadP1azFlags();
    }
  }, [user?.role, loadP1azFlags]);

  const handleP1azFlagToggle = async (flagId, nextBool) => {
    setP1azFlagSaving(flagId);
    try {
      const { data } = await axios.patch('/api/admin/feature-flags', {
        updates: { [flagId]: nextBool },
      });
      const updatedMap = new Map((data.flags || []).map((f) => [f.id, f]));
      setP1azFlags((prev) => prev.map((f) => (updatedMap.has(f.id) ? updatedMap.get(f.id) : f)));
      notifySuccess('Feature flag saved');
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

  /** Stable React key for a row before the server assigns an account id. */
  // eslint-disable-next-line no-unused-vars
  const getAccountRowKey = (a) => a.id || a._clientKey;

  /** Update a single field in a type slot. */
  const handleSlotChange = (type, field, value) => {
    setTypeSlots((prev) => ({ ...prev, [type]: { ...prev[type], [field]: value } }));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDemoScenario();
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
    } catch (e) {
      notifyError(e.message || 'Failed to load demo data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadScopes();
  }, [load, loadScopes]);

  /** Updates a single account row (by id or draft _clientKey). */
  // eslint-disable-next-line no-unused-vars
  const handleAccountChange = (rowKey, field, value) => {
    // kept for any legacy callers; no-op in new model
  };

  /** @deprecated replaced by type-slot model */
  // eslint-disable-next-line no-unused-vars
  const handleAddAccount = () => {};
  /** @deprecated replaced by type-slot model */
  // eslint-disable-next-line no-unused-vars
  const handleRemoveDraft = () => {};

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
      if (next.checking) {
        next.checking = {
          ...next.checking,
          name: defaults.checkingName ?? next.checking.name,
          balance: String(defaults.checkingBalance ?? next.checking.balance),
        };
      }
      if (next.savings) {
        next.savings = {
          ...next.savings,
          name: defaults.savingsName ?? next.savings.name,
          balance: String(defaults.savingsBalance ?? next.savings.balance),
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
          <button
            type="button"
            className="dashboard-toolbar-btn"
            onClick={() => open(EDU.LOGIN_FLOW, 'what')}
          >
            How does login work?
          </button>
          <button
            type="button"
            className="dashboard-toolbar-btn"
            onClick={() => open(EDU.MAY_ACT, 'what')}
          >
            What is may_act?
          </button>
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
            PingOne config
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
            onClick={handleDashThemeToggle}
            aria-pressed={dashTheme === 'dark'}
            title={dashTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {dashTheme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button type="button" onClick={onLogout} className="dashboard-toolbar-btn dashboard-toolbar-btn--danger">
            Log out
          </button>
        </div>
      </div>

      <div className="dashboard-content demo-data-page__body">
        <main className="demo-data-page__main" id="demo-data-main" tabIndex={-1}>
          <div className="section ud-hero demo-data-page__hero">
            <div className="ud-hero__top">
              <p className="ud-hero__eyebrow">{format(new Date(), 'EEEE, MMM d')}</p>
              <p className="ud-hero__insight" role="status">
                Adjust sandbox account names, balances, your profile, and the MFA step-up threshold for transfers and
                withdrawals. Changes apply to your signed-in user only.
              </p>
            </div>
          </div>

          {persistenceNote && (
            <div className="demo-data-banner" role="status">
              {persistenceNote}
            </div>
          )}

          <section className="section demo-data-section demo-data-agent-layout" aria-labelledby="demo-data-agent-layout-heading">
            <h2 id="demo-data-agent-layout-heading">AI banking assistant</h2>
            <p className="demo-data-hint">
              <strong>Middle</strong> — split dashboard (token | assistant | banking). <strong>Bottom</strong> — full-width
              dock on home and config. <strong>Float</strong> — corner FAB only. Check <strong>+ FAB</strong> with Middle or
              Bottom to show the floating panel as well (you cannot combine Middle and Bottom).
            </p>
            <AgentUiModeToggle variant="config" />
            {agentPlacement === 'bottom' && (
              <p className="demo-data-agent-note" role="status">
                Bottom dock appears on your home dashboard routes and Application Configuration. Open Home from the nav to
                see it.
              </p>
            )}
          </section>

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

            {/* ── Agent Scope Permissions (separate save — calls /api/admin/config) ── */}
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
                Controls how <strong>Customer sign in</strong> behaves on the home / marketing page (dropdown, not a
                separate checkbox). <strong>Redirect</strong> uses standard authorization code + PKCE.{' '}
                <strong>Slide panel + pi.flow</strong> opens hints then calls PingOne with <code>use_pi_flow=1</code> —{' '}
                requires a PingOne app that supports pi.flow; if sign-in fails, switch back to <strong>Redirect</strong>.
                Also under <Link to="/config">Application setup</Link>.
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

            {/* ── PingOne Authorize flags (admin — live vs simulated, MCP first tool, etc.) ── */}
            {user?.role === 'admin' && (
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
                      <em>BX Finance Demo — Transactions</em> and <em>BX Finance Demo — MCP first tool</em>. If they
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
              </section>
            )}

            {/* ── may_act demo toggle ─────────────────────────────────────── */}
            <section className="section demo-data-section" aria-labelledby="demo-mayact-heading">
              <h2 className="demo-data-section__heading" id="demo-mayact-heading">Token Exchange — may_act demo</h2>

              {/* Auto-inject toggle (admin only, sourced from feature-flag ff_inject_may_act) */}
              {user?.role === 'admin' && (() => {
                const injectFlag = p1azFlags.find((f) => f.id === 'ff_inject_may_act');
                if (!injectFlag) return null;
                const isOn = injectFlag.currentValue === true;
                return (
                  <div className="demo-data-static-notice" style={{ marginBottom: '1rem', borderColor: isOn ? '#f59e0b' : undefined, background: isOn ? '#fffbeb' : undefined }}>
                    <span className="demo-data-static-notice__icon">{isOn ? '🔧' : '💡'}</span>
                    <div style={{ flex: 1 }}>
                      <strong>Auto-inject may_act (BFF synthetic)</strong>
                      {' — '}
                      {isOn
                        ? <span style={{ color: '#b45309' }}>ON — BFF is adding a synthetic <code>may_act</code> claim before token exchange. Token Chain shows an injected badge.</span>
                        : <span style={{ color: '#6b7280' }}>OFF — if PingOne doesn&apos;t include <code>may_act</code>, exchange may fail.</span>}
                      <br />
                      <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                        When <strong>ON</strong>, the BFF synthesises <code>{`{ client_id: "<bff-client-id>" }`}</code> in memory
                        before RFC&nbsp;8693 exchange — no PingOne token policy change required.
                        Educational/demo only; disable once PingOne is configured natively.
                      </span>
                      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className={`demo-data-btn${isOn ? ' ghost' : ' primary'}`}
                          disabled={p1azFlagSaving === 'ff_inject_may_act' || (!isOn && !injectFlag)}
                          onClick={() => handleP1azFlagToggle('ff_inject_may_act', false)}
                        >
                          {p1azFlagSaving === 'ff_inject_may_act' && !isOn ? 'Saving…' : '❌ Disable injection'}
                        </button>
                        <button
                          type="button"
                          className={`demo-data-btn${isOn ? ' primary' : ' ghost'}`}
                          disabled={p1azFlagSaving === 'ff_inject_may_act' || isOn}
                          onClick={() => handleP1azFlagToggle('ff_inject_may_act', true)}
                        >
                          {p1azFlagSaving === 'ff_inject_may_act' && isOn ? 'Saving…' : '🔧 Enable injection'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Auto-inject audience toggle (admin only, sourced from feature-flag ff_inject_audience) */}
              {user?.role === 'admin' && (() => {
                const audFlag = p1azFlags.find((f) => f.id === 'ff_inject_audience');
                if (!audFlag) return null;
                const isOn = audFlag.currentValue === true;
                return (
                  <div className="demo-data-static-notice" style={{ marginBottom: '1rem', borderColor: isOn ? '#f59e0b' : undefined, background: isOn ? '#fffbeb' : undefined }}>
                    <span className="demo-data-static-notice__icon">{isOn ? '🔧' : '💡'}</span>
                    <div style={{ flex: 1 }}>
                      <strong>Auto-inject audience (BFF synthetic)</strong>
                      {' — '}
                      {isOn
                        ? <span style={{ color: '#b45309' }}>ON — BFF is adding <code>mcp_resource_uri</code> to the <code>aud</code> claim snapshot before token exchange. Token Chain shows an injected badge.</span>
                        : <span style={{ color: '#6b7280' }}>OFF — if PingOne doesn&apos;t include the resource URI in <code>aud</code>, exchange may fail validation.</span>}
                      <br />
                      <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                        When <strong>ON</strong>, the BFF adds <code>mcp_resource_uri</code> to the token&apos;s <code>aud</code> snapshot in memory
                        before RFC&nbsp;8693 exchange — useful when PingOne isn&apos;t yet configured with RFC&nbsp;8707 resource indicators.
                        Educational/demo only; disable once PingOne issues tokens with the correct audience.
                      </span>
                      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className={`demo-data-btn${isOn ? ' ghost' : ' primary'}`}
                          disabled={p1azFlagSaving === 'ff_inject_audience' || (!isOn && !audFlag)}
                          onClick={() => handleP1azFlagToggle('ff_inject_audience', false)}
                        >
                          {p1azFlagSaving === 'ff_inject_audience' && !isOn ? 'Saving…' : '❌ Disable injection'}
                        </button>
                        <button
                          type="button"
                          className={`demo-data-btn${isOn ? ' primary' : ' ghost'}`}
                          disabled={p1azFlagSaving === 'ff_inject_audience' || isOn}
                          onClick={() => handleP1azFlagToggle('ff_inject_audience', true)}
                        >
                          {p1azFlagSaving === 'ff_inject_audience' && isOn ? 'Saving…' : '🔧 Enable injection'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Static-mode notice */}
              <div className="demo-data-static-notice">
                <span className="demo-data-static-notice__icon">🔒</span>
                <div>
                  <strong>Static mapping active</strong> — <code>may_act</code> is always present in your
                  token. The PingOne attribute mapping for the <em>bankingAdmin</em> app uses a hardcoded
                  expression, so <code>may_act</code> is injected regardless of the <code>mayAct</code>{' '}
                  user attribute. The buttons below still write to your user record and are useful for
                  exploring the concept, but they will not change what appears in your token.
                </div>
              </div>

              <p className="demo-data-hint">
                The <code>may_act</code> claim in a PingOne access token pre-authorises the BFF to exchange
                that token on behalf of the user (RFC&nbsp;8693). Enable it to demo a <strong>successful</strong>{' '}
                token exchange with full <code>act</code> claim provenance; disable it to demo the{' '}
                <strong>failed / degraded</strong> path.
              </p>

              <div className="demo-data-mayact-row">
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
                <span className={`demo-data-mayact-status${mayActEnabled === true ? ' demo-data-mayact-status--on' : mayActEnabled === false ? ' demo-data-mayact-status--off' : ''}`}>
                  {mayActEnabled === true
                    ? '✅ may_act present in token'
                    : mayActEnabled === false
                      ? '❌ may_act absent from token'
                      : 'Checking…'}
                </span>
              </div>

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
