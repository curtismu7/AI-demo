// banking_api_ui/src/components/BankingAdminOps.js
import React, { useState, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import bffAxios from '../services/bffAxios';
import { notifyError, notifyInfo, notifySuccess, notifyWarning } from '../utils/appToast';
import './BankingAdminOps.css';
import { toastAdminSessionError } from '../utils/dashboardToast';
import { navigateToAdminOAuthLogin } from '../utils/authUi';
import AdminSubPageShell from './AdminSubPageShell';
import PageNav from './PageNav';

const DEFAULT_QUERY = '123';

/**
 * Admin-only banking operations: lookup by account number fragment, latest activity,
 * delete account/transaction, seed fake card/fee charges for demos.
 */
export default function BankingAdminOps({ user, onLogout }) {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);

  // Scope update state
  const [updatingScopes, setUpdatingScopes] = useState(false);
  const [scopeSteps, setScopeSteps] = useState([]);
  const [scopeSummary, setScopeSummary] = useState('');
  const [scopeError, setScopeError] = useState('');
  const [, setCredentialStatus] = useState(null);

  // Check PingOne credential status on mount
  useEffect(() => {
    const checkCredentialStatus = async () => {
      try {
        const { data } = await bffAxios.get('/api/admin/pingone/credential-status');
        setCredentialStatus(data);
        if (!data.valid) {
          notifyWarning('⚠️ PingOne credentials not configured. Set PINGONE_AUTHORIZE_WORKER_CLIENT_ID and PINGONE_AUTHORIZE_WORKER_CLIENT_SECRET.');
        } else {
          notifyInfo('✅ PingOne worker app authenticated');
        }
      } catch (err) {
        console.error('Credential status check failed:', err);
        // Silently fail - this is just a status check
      }
    };

    checkCredentialStatus();
  }, []);

  const handleFixPingOneScopes = useCallback(async () => {
    setScopeSteps([]);
    setScopeSummary('');
    setScopeError('');
    setUpdatingScopes(true);

    try {
      const { data } = await bffAxios.post('/api/admin/pingone/update-scopes');
      setScopeSteps(data.steps || []);
      setScopeSummary(data.summary || 'Update completed');
      if (data.success) {
        notifySuccess(data.summary || 'PingOne scopes updated successfully');
      } else {
        notifyWarning(data.summary || 'Scope update completed with warnings');
      }
    } catch (err) {
      const st = err.response?.status;
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Scope update failed';
      if (st === 401) {
        toastAdminSessionError('Your session has expired. Please log in again.', navigateToAdminOAuthLogin);
      } else if (st === 403) {
        setScopeError('Admin access required.');
        notifyError('Admin access required.');
      } else if (st === 400) {
        setScopeError('Missing environment configuration. Contact an administrator.');
        notifyError('Missing PingOne credentials in environment.');
      } else {
        setScopeError(msg);
        notifyError(msg);
      }
    } finally {
      setUpdatingScopes(false);
    }
  }, []);

  const runLookup = useCallback(async () => {
    const q = String(query || '').trim();
    if (!q) {
      notifyWarning('Enter an account number (or digits to match).');
      return;
    }
    setLoading(true);
    try {
      const { data } = await bffAxios.get('/api/admin/banking/lookup', { params: { q } });
      setAccounts(data.accounts || []);
      setTransactions(data.transactions || []);
      if (!data.accounts?.length) {
        notifyInfo('No accounts matched — try a different fragment (e.g. last digits).');
      }
    } catch (err) {
      const st = err.response?.status;
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error_description ||
        err.message ||
        'Lookup failed';
      if (st === 401) {
        toastAdminSessionError('Your session has expired. Please log in again.', navigateToAdminOAuthLogin);
      } else if (st === 403) {
        notifyError('Admin access required.');
      } else {
        notifyError(msg);
      }
      setAccounts([]);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleDeleteAccount = async (accountId) => {
    if (!window.confirm('Delete this account and all references? This cannot be undone.')) return;
    try {
      await bffAxios.delete(`/api/accounts/${encodeURIComponent(accountId)}`);
      notifySuccess('Account deleted');
      await runLookup();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message;
      if (err.response?.data?.error === 'demo_mode') {
        notifyError('Account deletion is disabled on the shared public demo (DEMO_MODE).');
      } else {
        notifyError(msg || 'Delete failed');
      }
    }
  };

  const handleDeleteTransaction = async (txId) => {
    if (!window.confirm('Remove this transaction from history?')) return;
    try {
      await bffAxios.delete(`/api/transactions/${encodeURIComponent(txId)}`);
      notifySuccess('Transaction removed');
      await runLookup();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message;
      if (err.response?.data?.error === 'demo_mode') {
        notifyError('Disabled on shared public demo (DEMO_MODE). Use a private deployment to delete.');
      } else {
        notifyError(msg || 'Failed to remove transaction');
      }
    }
  };

  const handleSeedCharges = async (accountId) => {
    try {
      const { data } = await bffAxios.post(
        `/api/admin/banking/accounts/${encodeURIComponent(accountId)}/seed-charges`
      );
      notifySuccess(data.message || 'Fake charges added');
      await runLookup();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message;
      notifyError(msg || 'Could not add charges');
    }
  };

  return (
    <AdminSubPageShell
      title="Banking admin"
      lead="Look up accounts by number fragment (default 123 matches digit patterns), inspect latest activity, add demo charges, manage PingOne scopes, or remove accounts/transactions."
    >
      <PageNav user={user} onLogout={onLogout} title="Banking admin" />

      <div className="app-page-card" style={{ marginBottom: '1rem' }}>
        <div className="card-header">
          <h2 className="card-title">Account lookup</h2>
        </div>

      {/* PingOne Scopes Configuration Card */}
      <div className="app-page-card" style={{ marginBottom: '1rem', borderLeft: '4px solid #0056b3' }}>
        <div className="card-header">
          <h2 className="card-title">PingOne Scopes Configuration</h2>
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.25rem', marginBottom: 0 }}>
            Fix agent scope configuration in PingOne. Automatically creates <code>banking:ai:agent:read</code> scope,
            removes deprecated <code>banking:agent:invoke</code>, and grants to applications.
          </p>
        </div>
        <div className="card-body">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleFixPingOneScopes()}
            disabled={updatingScopes}
            style={{ marginBottom: scopeSteps.length > 0 ? '1rem' : 0 }}
          >
            {updatingScopes ? '⏳ Updating Scopes…' : '⚙️ Fix PingOne Scopes'}
          </button>

          {scopeError && (
            <div
              className="alert alert-danger"
              role="alert"
              style={{ marginBottom: scopeSteps.length > 0 ? '1rem' : 0 }}
            >
              <strong>Error:</strong> {scopeError}
            </div>
          )}

          {scopeSteps.length > 0 && (
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                {updatingScopes ? 'Updating…' : 'Update Complete'}
              </h4>
              <ul style={{ listStyle: 'none', paddingLeft: 0, fontSize: '0.9rem' }}>
                {scopeSteps.map((step, idx) => (
                  <li key={idx} style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <span style={{ minWidth: '1.5rem' }}>{step.icon || '•'}</span>
                    <span style={{ color: step.error ? '#dc2626' : '#374151' }}>{step.message}</span>
                  </li>
                ))}
              </ul>
              {scopeSummary && (
                <p
                  style={{
                    marginTop: '0.75rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid #e2e8f0',
                    fontWeight: 600,
                    color: scopeSummary.includes('✅') ? '#059669' : '#dc2626',
                  }}
                >
                  {scopeSummary}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      
        <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <label htmlFor="banking-admin-q" style={{ fontWeight: 600 }}>
            Account number contains
          </label>
          <input
            id="banking-admin-q"
            type="text"
            className="form-control"
            style={{ maxWidth: '220px' }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. 123"
          />
          <button type="button" className="btn btn-primary" onClick={() => void runLookup()} disabled={loading}>
            {loading ? 'Loading…' : 'Load activity'}
          </button>
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="app-page-card" style={{ marginBottom: '1rem' }}>
          <div className="card-header">
            <h2 className="card-title">Matching accounts</h2>
          </div>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Type</th>
                  <th>Balance</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <code>{a.accountNumber}</code>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{a.id}</div>
                    </td>
                    <td>{a.accountType}</td>
                    <td>${Number(a.balance).toFixed(2)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => void handleSeedCharges(a.id)}
                      >
                        Add fake charges
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => void handleDeleteAccount(a.id)}
                      >
                        Delete account
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {transactions.length > 0 && (
        <div className="app-page-card">
          <div className="card-header">
            <h2 className="card-title">Latest activity (matched accounts)</h2>
          </div>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Description</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td>{format(new Date(t.createdAt), 'yyyy-MM-dd HH:mm')}</td>
                    <td>
                      <code>{t._accountNumber}</code>
                    </td>
                    <td>{t.type}</td>
                    <td>${Number(t.amount).toFixed(2)}</td>
                    <td>{t.description}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => void handleDeleteTransaction(t.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && accounts.length === 0 && (
        <p className="text-muted" style={{ padding: '0 0.5rem' }}>
          Enter a fragment (try <strong>{DEFAULT_QUERY}</strong>) and click <strong>Load activity</strong>.
        </p>
      )}
    </AdminSubPageShell>
  );
}
