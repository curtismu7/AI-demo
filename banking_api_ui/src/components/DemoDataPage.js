// banking_api_ui/src/components/DemoDataPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { fetchDemoScenario, saveDemoScenario } from '../services/demoScenarioService';
import { useAgentUiMode } from '../context/AgentUiModeContext';
import '../styles/appShellPages.css';
import './DemoDataPage.css';

/**
 * Lets demo users edit account labels, balances, and MFA step-up threshold for their sandbox data.
 */
export default function DemoDataPage({ onLogout }) {
  const { mode: agentUiMode, setMode: setAgentUiMode } = useAgentUiMode();
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
    const ck =
      typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `draft-${Date.now()}`;
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
    } catch (err) {
      toast.error(err.message || 'Save failed');
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
  const handleAgentLayoutChange = next => {
    if (next === agentUiMode) return;
    setAgentUiMode(next);
    toast.info('Applying agent layout…', { autoClose: 1200 });
    window.setTimeout(() => {
      window.location.reload();
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
            <Link to="/dashboard" className="app-page-shell__btn app-page-shell__btn--solid">← Dashboard</Link>
            <button type="button" className="app-page-shell__btn" onClick={onLogout}>Log out</button>
          </div>
        </div>
      </header>

      <div className="app-page-shell__body">
      {persistenceNote && (
        <div className="demo-data-banner" role="status">
          {persistenceNote}
        </div>
      )}

      <section className="app-page-card demo-data-section demo-data-agent-layout" aria-labelledby="demo-data-agent-layout-heading">
        <h2 id="demo-data-agent-layout-heading">AI banking assistant</h2>
        <p className="demo-data-hint">
          Choose one layout: <strong>floating</strong> (FAB opens the assistant on any page — default), or <strong>embedded</strong>{' '}
          (admin home only: full-width chat strip along the bottom of the <strong>admin</strong> dashboard). On the{' '}
          <strong>customer</strong> dashboard the bottom strip is hidden so accounts stay wide; the assistant still uses the FAB.
          The page reloads after you switch.
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
              <span className="demo-data-agent-option-title">Embedded (admin dashboard)</span>
              <span className="demo-data-agent-option-desc">
                On <strong>admin</strong> home, the assistant sits in a full-width bottom strip. Customers still use the FAB so the account tables stay full width.
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
            Embedded strip (if you are an admin) appears only on the admin dashboard. Other routes and the customer dashboard use the floating assistant button.
          </p>
        )}
      </section>

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
                            <option value="checking">Checking</option>
                            <option value="savings">Savings</option>
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

      <section className="app-page-card demo-data-section demo-data-docs">
        <h2>Hosting note (Vercel)</h2>
        <p>
          Account rows live in the API server&apos;s in-memory store on serverless (ephemeral unless you add a database).
          For a <strong>simple free</strong> option on Vercel, pair this app with{' '}
          <strong>Upstash Redis</strong> (same integration as sessions/KV) — we persist your{' '}
          <strong>step-up threshold override</strong> there when KV env vars are set. For full durable
          transaction history at scale, add <strong>Neon</strong> or <strong>Turso</strong> (both have free tiers)
          and migrate the banking store from memory to SQL.
        </p>
      </section>
      </div>
    </div>
  );
}
