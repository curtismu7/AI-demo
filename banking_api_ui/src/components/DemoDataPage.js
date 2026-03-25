// banking_api_ui/src/components/DemoDataPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { fetchDemoScenario, saveDemoScenario } from '../services/demoScenarioService';
import { useAgentUiMode } from '../context/AgentUiModeContext';
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
  const [userDataJson, setUserDataJson] = useState('{}');
  const [defaults, setDefaults] = useState(null);
  const [persistenceNote, setPersistenceNote] = useState(null);

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
      setUserDataJson(JSON.stringify(data.userData || {}, null, 2));
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

  const handleAccountChange = (id, field, value) => {
    setAccounts(prev =>
      prev.map(a => (a.id === id ? { ...a, [field]: value } : a)),
    );
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
        accounts: accounts.map(a => ({
          id: a.id,
          name: a._name,
          balance: a._balance === '' ? undefined : parseFloat(a._balance),
        })),
      };
      if (userDataJson.trim()) {
        let parsedUserData = null;
        try {
          parsedUserData = JSON.parse(userDataJson);
        } catch {
          toast.error('User data JSON is invalid. Fix the JSON and try again.');
          setSaving(false);
          return;
        }
        if (!parsedUserData || typeof parsedUserData !== 'object' || Array.isArray(parsedUserData)) {
          toast.error('User data JSON must be a single object.');
          setSaving(false);
          return;
        }
        body.userData = parsedUserData;
      }
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
    setAccounts(prev =>
      prev.map(a => {
        const type = (a.accountType || '').toLowerCase();
        const bal =
          type === 'checking' ? defaults.checkingBalance : type === 'savings' ? defaults.savingsBalance : a.balance;
        const name =
          type === 'checking' ? defaults.checkingName : type === 'savings' ? defaults.savingsName : a.name;
        return {
          ...a,
          _name: name,
          _balance: String(bal ?? ''),
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
    <div className="demo-data-page">
      <header className="demo-data-header">
        <div>
          <h1>Demo config</h1>
          <p className="demo-data-lead">
            Adjust sandbox account names, balances, and the MFA step-up threshold for transfers and withdrawals.
            Changes apply to your signed-in user only.
          </p>
        </div>
        <div className="demo-data-header-actions">
          <Link to="/dashboard" className="demo-data-link">← Dashboard</Link>
          <button type="button" className="demo-data-btn ghost" onClick={onLogout}>Log out</button>
        </div>
      </header>

      {persistenceNote && (
        <div className="demo-data-banner" role="status">
          {persistenceNote}
        </div>
      )}

      <section className="demo-data-section demo-data-agent-layout" aria-labelledby="demo-data-agent-layout-heading">
        <h2 id="demo-data-agent-layout-heading">AI banking assistant</h2>
        <p className="demo-data-hint">
          Choose one layout: <strong>embedded</strong> (chat on the dashboard — messages above the input, like ChatGPT/Claude)
          or <strong>floating</strong> (FAB that opens over any page). The page reloads after you switch.
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
              <span className="demo-data-agent-option-title">Embedded on dashboard</span>
              <span className="demo-data-agent-option-desc">
                No floating widget while signed in. Open <strong>Home</strong> or <strong>My Dashboard</strong> to chat.
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
            Embedded mode: other routes (e.g. this page, MCP Inspector) do not show the chat — use the dashboard for the assistant.
          </p>
        )}
      </section>

      {loading ? (
        <p className="demo-data-loading">Loading…</p>
      ) : (
        <form className="demo-data-form" onSubmit={handleSubmit}>
          <section className="demo-data-section">
            <h2>User data JSON</h2>
            <p className="demo-data-hint">
              Edit profile values as JSON. Any keys you include are saved for your signed-in user (except blocked fields like
              <code> id</code>, <code>password</code>, and <code>createdAt</code>).
            </p>
            <label className="demo-data-field">
              <span>User object</span>
              <textarea
                className="demo-data-json-editor"
                value={userDataJson}
                onChange={e => setUserDataJson(e.target.value)}
                spellCheck={false}
                rows={14}
              />
            </label>
          </section>

          <section className="demo-data-section">
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

          <section className="demo-data-section">
            <h2>Accounts</h2>
            {accounts.length === 0 ? (
              <p>No accounts yet — open the dashboard once to provision demo accounts.</p>
            ) : (
              <div className="demo-data-accounts">
                {accounts.map(a => (
                  <div key={a.id} className="demo-data-account-card">
                    <div className="demo-data-account-meta">
                      <span className="demo-data-type">{a.accountType}</span>
                      <code>{a.accountNumber}</code>
                    </div>
                    <label className="demo-data-field">
                      <span>Account name</span>
                      <input
                        type="text"
                        value={a._name}
                        onChange={e => handleAccountChange(a.id, '_name', e.target.value)}
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
                        onChange={e => handleAccountChange(a.id, '_balance', e.target.value)}
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="demo-data-actions">
            <button type="button" className="demo-data-btn ghost" onClick={handleResetDefaults} disabled={!defaults}>
              Reset form to defaults
            </button>
            <button type="submit" className="demo-data-btn primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      <section className="demo-data-section demo-data-docs">
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
  );
}
