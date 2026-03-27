// banking_api_ui/src/components/DemoDataPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { notifySuccess, notifyError, notifyWarning, notifyInfo } from '../utils/appToast';
import { fetchDemoScenario, saveDemoScenario } from '../services/demoScenarioService';
import { useAgentUiMode } from '../context/AgentUiModeContext';
import AgentUiModeToggle from './AgentUiModeToggle';
import { useEducationUI } from '../context/EducationUIContext';
import { EDU } from './education/educationIds';
import { useIndustryBranding } from '../context/IndustryBrandingContext';
import './UserDashboard.css';
import './DemoDataPage.css';

/** Account types for new rows (values stored lowercase; labels for the dropdown). */
const ACCOUNT_TYPE_OPTIONS = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'investment', label: 'Investment' },
  { value: 'money_market', label: 'Money market' },
  { value: 'credit', label: 'Credit card' },
  { value: 'car_loan', label: 'Car loan' },
  { value: 'mortgage', label: 'Mortgage (home loan)' },
];

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
  const [accounts, setAccounts] = useState([]);
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

  /** Stable React key for a row before the server assigns an account id. */
  const getAccountRowKey = (a) => a.id || a._clientKey;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDemoScenario();
      setAccounts(
        (data.accounts || []).map((a) => ({
          ...a,
          _name: a.name || '',
          _balance: String(a.balance ?? ''),
        })),
      );
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
  }, [load]);

  /** Updates a single account row (by id or draft _clientKey). */
  const handleAccountChange = (rowKey, field, value) => {
    setAccounts((prev) =>
      prev.map((a) => (getAccountRowKey(a) === rowKey ? { ...a, [field]: value } : a)),
    );
  };

  /** Appends a new row; it is created on the server when the user saves. */
  const handleAddAccount = () => {
    const c = typeof window !== 'undefined' ? window.crypto : null;
    const ck =
      c && typeof c.randomUUID === 'function' ? c.randomUUID() : `draft-${Date.now()}`;
    setAccounts((prev) => [
      ...prev,
      {
        id: '',
        _clientKey: ck,
        accountType: 'checking',
        accountNumber: '—',
        currency: 'USD',
        _name: '',
        _balance: '0',
      },
    ]);
  };

  /** Drops a not-yet-saved row from the form. */
  const handleRemoveDraft = (rowKey) => {
    setAccounts((prev) => prev.filter((a) => a.id || getAccountRowKey(a) !== rowKey));
  };

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
        accounts: accounts.map((a) => {
          const row = {
            name: a._name,
            balance: a._balance === '' ? undefined : parseFloat(a._balance),
          };
          if (a.id) {
            row.id = a.id;
          } else {
            row.accountType = (a.accountType || 'checking').toLowerCase();
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
    setAccounts((prev) =>
      prev
        .filter((a) => a.id)
        .map((a) => {
          const idStr = typeof a.id === 'string' ? a.id : '';
          if (idStr.startsWith('chk-')) {
            return {
              ...a,
              _name: defaults.checkingName,
              _balance: String(defaults.checkingBalance ?? ''),
            };
          }
          if (idStr.startsWith('sav-')) {
            return {
              ...a,
              _name: defaults.savingsName,
              _balance: String(defaults.savingsBalance ?? ''),
            };
          }
          return {
            ...a,
            _name: a.name != null ? String(a.name) : a._name || '',
            _balance: String(a.balance ?? a._balance ?? ''),
          };
        }),
    );
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
                  <button type="button" className="demo-data-btn ghost" onClick={handleAddAccount}>
                    Add account
                  </button>
                </div>
                {accounts.length === 0 ? (
                  <p className="demo-data-hint">
                    No accounts yet. Use <strong>Add account</strong> above, or open the dashboard once to provision the
                    default checking and savings accounts.
                  </p>
                ) : (
                  <div className="demo-data-accounts">
                    {accounts.map((a) => {
                      const rowKey = getAccountRowKey(a);
                      const isNew = !a.id;
                      return (
                        <div key={rowKey} className="demo-data-account-card">
                          <div className="demo-data-account-meta">
                            {isNew ? (
                              <select
                                className="demo-data-account-type-select"
                                aria-label="Account type"
                                value={a.accountType || 'checking'}
                                onChange={(e) => handleAccountChange(rowKey, 'accountType', e.target.value)}
                              >
                                {ACCOUNT_TYPE_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="demo-data-type">{a.accountType}</span>
                            )}
                            <code>{a.accountNumber}</code>
                            {isNew && (
                              <button type="button" className="demo-data-remove-draft" onClick={() => handleRemoveDraft(rowKey)}>
                                Remove
                              </button>
                            )}
                          </div>
                          <label className="demo-data-field">
                            <span>Account name</span>
                            <input
                              type="text"
                              value={a._name}
                              onChange={(e) => handleAccountChange(rowKey, '_name', e.target.value)}
                              maxLength={120}
                            />
                          </label>
                          <label className="demo-data-field">
                            <span>Balance ({a.currency || 'USD'})</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={a._balance}
                              onChange={(e) => handleAccountChange(rowKey, '_balance', e.target.value)}
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
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
          )}
        </main>
      </div>
    </div>
  );
}
