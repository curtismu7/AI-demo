import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import bffAxios from '../services/bffAxios';
import { resolveSessionUser } from '../services/sessionResolver';
import AdminSubPageShell from './AdminSubPageShell';
import PageNav from './PageNav';

const Accounts = ({ user, onLogout }) => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const sessionUser = await resolveSessionUser();
      if (!sessionUser) {
        setError('Your session has expired. Please log in again.');
        return;
      }
      const response = await bffAxios.get('/api/accounts');
      setAccounts(response.data.accounts);
      setError('');
    } catch (error) {
      console.error('Accounts error:', error);
      
      if (error.response?.status === 401) {
        setError('Your session has expired. Please log in again.');
      } else if (error.response?.status === 403) {
        setError('You do not have permission to view accounts.');
      } else {
        setError('Failed to load accounts');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading && accounts.length === 0) {
    return (
      <AdminSubPageShell title="Accounts" lead="View bank accounts in the demo environment.">
        <div className="loading">
          <div>Loading accounts...</div>
        </div>
      </AdminSubPageShell>
    );
  }

  return (
    <AdminSubPageShell title="Accounts" lead="View bank accounts in the demo environment.">
      <PageNav user={user} onLogout={onLogout} title="Accounts" />

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      <div className="app-page-card">
        <div className="card-header">
          <h2 className="card-title">Account Management</h2>
          <span style={{ color: '#64748b', fontSize: '0.875rem' }}>
            {accounts.length} accounts found
          </span>
        </div>

        {accounts.length > 0 ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Account Number</th>
                  <th>Type</th>
                  <th>Balance</th>
                  <th>Currency</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: '600' }}>
                      {account.accountNumber}
                    </td>
                    <td>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        backgroundColor: account.accountType === 'checking' ? '#3b82f6' : '#10b981',
                        color: 'white'
                      }}>
                        {account.accountType}
                      </span>
                    </td>
                    <td style={{ fontWeight: '600', color: account.balance >= 0 ? '#10b981' : '#ef4444' }}>
                      ${account.balance.toLocaleString()}
                    </td>
                    <td>{account.currency}</td>
                    <td>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        backgroundColor: account.isActive ? '#10b981' : '#6b7280',
                        color: 'white'
                      }}>
                        {account.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{format(new Date(account.createdAt), 'MMM dd, yyyy')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <h3>No accounts found</h3>
            <p>No accounts are currently available.</p>
          </div>
        )}
      </div>
    </AdminSubPageShell>
  );
};

export default Accounts;
