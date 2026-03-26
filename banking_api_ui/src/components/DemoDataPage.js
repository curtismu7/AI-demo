// banking_api_ui/src/components/DemoDataPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { fetchDemoScenario, saveDemoScenario, persistBankingAgentUiMode } from '../services/demoScenarioService';
import { useAgentUiMode } from '../context/AgentUiModeContext';
import PageNav from './PageNav';
import '../styles/appShellPages.css';
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
  const { mode: agentUiMode, setMode: setAgentUiMode } = useAgentUiMode();
  const dashboardPath = user?.role === 'admin' ? '/admin' : '/dashboard';
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
  const getAccountRowKey = a => a.id || a._clientKey;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDemoScenario();
      setAccounts(
        (data.accounts || []).map(a => ({
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
      toast.error(e.message || 'Failed to load demo data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Updates a single account row (by id or draft _clientKey). */
  const handleAccountChange = (rowKey, field, value) => {
    setAccounts(prev =>
      prev.map(a => (getAccountRowKey(a) === rowKey ? { ...a, [field]: value } : a)),
    );
  };

  /** Appends a new row; it is created on the server when the user saves. */
  const handleAddAccount = () => {
    const c = typeof window !== 'undefined' ? window.crypto : null;
    const ck =
      c && typeof c.randomUUID === 'function' ? c.randomUUID() : `draft-${Date.now()}`;
    setAccounts(prev => [
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
  const handleRemoveDraft = rowKey => {
    setAccounts(prev => prev.filter(a => a.id || getAccountRowKey(a) !== rowKey));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      const t = threshold.trim();
      let stepUpAmountThreshold = null;
      if (t !== '') {
        const n = parseFloat(t);
        if (!Number.isFinite(n)) {
          toast.error('Enter a valid number for the threshold, or leave it blank for the server default.');
          setSaving(false);
          return;
        }
        stepUpAmountThreshold = n;
      }
      const body = {
        stepUpAmountThreshold,
        accounts: accounts.map(a => {
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
      toast.success('Demo data saved');
      await load();
      // Let dashboards refresh their cached account/transaction lists immediately.
      // (Helps when users switch back without a hard refresh.)
      try {
        window.dispatchEvent(new CustomEvent('demoScenarioUpdated'));
      } catch {
        // ignore
      }
    } catch (err) {
      if (err.code === 'stale_demo_accounts') {
        await load();
        toast.warning(
          err.message ||
            'These account IDs are no longer on this server (common after a deploy or new instance). The form was reloaded — review accounts and save again.'
        );
      } else {
        toast.error(err.message || 'Save failed');
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
    setAccounts(prev =>
      prev
        .filter(a => a.id)
        .map(a => {
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
    toast.info('Form reset to defaults — click Save to apply');
  };

  /**
   * Persists floating vs embedded agent; only one layout is active. Reload so App picks up the change.
   * @param {'floating' | 'embedded'} next
   */
  const handleAgentLayoutChange = async next => {
    if (next === agentUiMode) return;
    setAgentUiMode(next);
    const saved = await persistBankingAgentUiMode(next);
    if (!saved) {
      toast.warn(
        'Agent layout could not be saved on the server yet. It stays on this browser; refresh may revert if the server still has the old value.',
        { autoClose: 4500 }
      );
    }
    toast.info('Applying agent layout…', { autoClose: 1200 });
    window.setTimeout(() => {
      if (next === 'embedded') {
        window.location.href = '/';
      } else {
        window.location.reload();
      }
    }, 350);
  };

  return (
    <div className="demo-data-page app-page-shell">
      <header className="app-page-shell__hero">
        <div className="app-page-shell__hero-top">
          <div>
            <h1 className="app-page-shell__title">Demo config</h1>
            <p className="app-page-shell__lead">
              Adjust sandbox account names, balances, your profile, and the MFA step-up threshold for transfers and withdrawals.
              Changes apply to your signed-in user only.
            </p>
          </div>
          <div className="app-page-shell__actions">
            <Link to={dashboardPath} className="app-page-shell__btn app-page-shell__btn--solid">
              ← Dashboard
            </Link>
            <button type="button" className="app-page-shell__btn" onClick={onLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="app-page-shell__body">
        <PageNav user={user} onLogout={onLogout} title="Demo config" />
      {persistenceNote && (
        <div className="demo-data-banner" role="status">
          {persistenceNote}
        </div>
      )}

      <section className="app-page-card demo-data-section demo-data-agent-layout" aria-labelledby="demo-data-agent-layout-heading">
        <h2 id="demo-data-agent-layout-heading">AI banking assistant</h2>
        <p className="demo-data-hint">
          Choose one layout: <strong>floating</strong> (FAB opens the assistant on most pages — default), or <strong>embedded</strong>{' '}
          (full-width chat strip along the bottom of <strong>home</strong> only: <strong>/</strong> or <strong>/dashboard</strong> for customers,{' '}
          <strong>/</strong> or <strong>/admin</strong> for admins). On this page there is no chat widget — use the assistant icon (bottom-right) to open your dashboard.
          With floating layout, other pages keep the FAB; with embedded, the assistant exists only on home — not on logs, MCP, or Demo config. Switching to embedded sends you home so the strip appears immediately.
        </p>
        <div className="demo-data-agent-options" role="radiogroup" aria-label="Agent layout">
          <label className="demo-data-agent-option">
            <input
              type="radio"
              name="demoDataAgentUiMode"
              value="embedded"
              checked={agentUiMode === 'embedded'}
              onChange={() => handleAgentLayoutChange('embedded')}
            />
            <span className="demo-data-agent-option-text">
              <span className="demo-data-agent-option-title">Embedded (dashboard home)</span>
              <span className="demo-data-agent-option-desc">
                On your <strong>home</strong> dashboard, the assistant sits in a full-width bottom strip and the FAB is hidden while signed in.
              </span>
            </span>
          </label>
          <label className="demo-data-agent-option">
            <input
              type="radio"
              name="demoDataAgentUiMode"
              value="floating"
              checked={agentUiMode === 'floating'}
              onChange={() => handleAgentLayoutChange('floating')}
            />
            <span className="demo-data-agent-option-text">
              <span className="demo-data-agent-option-title">Floating panel</span>
              <span className="demo-data-agent-option-desc">
                Corner button opens the agent over whatever page you are on (default).
              </span>
            </span>
          </label>
        </div>
        {agentUiMode === 'embedded' && (
          <p className="demo-data-agent-note" role="status">
            Embedded mode shows the assistant as a bottom strip on your home dashboard only (<strong>/</strong> or <strong>/dashboard</strong> for customers; <strong>/</strong> or <strong>/admin</strong> for admins). Other routes have no assistant until you return home. Demo config has no widget — use the icon to go home.
          </p>
        )}
      </section>

      <Link
        to={dashboardPath}
        className="demo-data-agent-open-icon"
        title="Open AI banking assistant on your dashboard"
        aria-label="Open AI banking assistant on your dashboard"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 8V4H8" />
          <rect width="16" height="12" x="4" y="8" rx="2" />
          <path d="M2 14h2" />
          <path d="M20 14h2" />
          <path d="M15 13v2" />
          <path d="M9 13v2" />
        </svg>
      </Link>

      {loading ? (
        <div className="app-page-card">
          <p className="demo-data-loading">Loading…</p>
        </div>
      ) : (
        <form className="demo-data-form" onSubmit={handleSubmit}>
          <section className="app-page-card demo-data-section">
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
                  onChange={e => setProfile(p => ({ ...p, firstName: e.target.value }))}
                  maxLength={300}
                />
              </label>
              <label className="demo-data-field">
                <span>Last name</span>
                <input
                  type="text"
                  autoComplete="family-name"
                  value={profile.lastName}
                  onChange={e => setProfile(p => ({ ...p, lastName: e.target.value }))}
                  maxLength={300}
                />
              </label>
              <label className="demo-data-field">
                <span>Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={profile.email}
                  onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                  maxLength={300}
                />
              </label>
              <label className="demo-data-field">
                <span>Username</span>
                <input
                  type="text"
                  autoComplete="username"
                  value={profile.username}
                  onChange={e => setProfile(p => ({ ...p, username: e.target.value }))}
                  maxLength={300}
                />
              </label>
            </div>
            <label className="demo-data-field demo-data-field--checkbox">
              <input
                type="checkbox"
                checked={profile.isActive}
                onChange={e => setProfile(p => ({ ...p, isActive: e.target.checked }))}
              />
              <span>Account active</span>
            </label>
          </section>

          <section className="app-page-card demo-data-section">
            <h2>Step-up MFA threshold (USD)</h2>
            <p className="demo-data-hint">
              Transfers and withdrawals at or above this amount require step-up authentication (when enabled).
              Default from server: <strong>{defaults?.stepUpAmountThreshold ?? '—'}</strong>.
            </p>
            <label className="demo-data-field">
              <span>Threshold ($)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={threshold}
                onChange={e => setThreshold(e.target.value)}
              />
            </label>
          </section>

          <section className="app-page-card demo-data-section">
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
                {accounts.map(a => {
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
                            onChange={e => handleAccountChange(rowKey, 'accountType', e.target.value)}
                          >
                            {ACCOUNT_TYPE_OPTIONS.map(opt => (
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
                          <button
                            type="button"
                            className="demo-data-remove-draft"
                            onClick={() => handleRemoveDraft(rowKey)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <label className="demo-data-field">
                        <span>Account name</span>
                        <input
                          type="text"
                          value={a._name}
                          onChange={e => handleAccountChange(rowKey, '_name', e.target.value)}
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
                          onChange={e => handleAccountChange(rowKey, '_balance', e.target.value)}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="app-page-card demo-data-actions-row">
            <div className="demo-data-actions">
              <button type="button" className="demo-data-btn ghost" onClick={handleResetDefaults} disabled={!defaults}>
                Reset form to defaults
              </button>
              <button type="submit" className="demo-data-btn primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      )}

            </div>
    </div>
  );
}
