import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';

const VALID_SCOPES = [
  { key: 'view_accounts',    label: 'View Accounts',    description: 'See account list and details' },
  { key: 'view_balances',    label: 'View Balances',    description: 'See account balances' },
  { key: 'create_deposit',   label: 'Make Deposits',    description: 'Deposit funds into accounts' },
  { key: 'create_withdrawal', label: 'Make Withdrawals', description: 'Withdraw funds from accounts' },
  { key: 'create_transfer',  label: 'Transfer Funds',   description: 'Transfer between accounts' },
];

// ---------------------------------------------------------------------------
// Inline styles
// ---------------------------------------------------------------------------
const S = {
  page: { background: '#f9fafb', minHeight: '100vh', padding: '24px 16px' },
  inner: { maxWidth: 800, margin: '0 auto' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  h1: { fontSize: 22, fontWeight: 700, color: '#1e3a5f', margin: 0 },
  backLink: { fontSize: 13, color: '#2563eb', textDecoration: 'none' },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 24, marginBottom: 24 },
  sectionHeading: { fontSize: 16, fontWeight: 700, color: '#1e40af', marginTop: 0, marginBottom: 8 },
  muted: { color: '#6b7280', fontSize: 13, margin: '0 0 16px 0' },
  input: {
    width: '100%', maxWidth: 400, padding: '9px 12px',
    border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14,
    boxSizing: 'border-box',
  },
  scopeRow: { display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, cursor: 'pointer' },
  scopeLabel: { fontWeight: 600, fontSize: 13, color: '#374151' },
  scopeDesc: { fontSize: 12, color: '#9ca3af', marginLeft: 4 },
  primaryBtn: {
    padding: '9px 22px', background: '#2563eb', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  primaryBtnDisabled: {
    padding: '9px 22px', background: '#93c5fd', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'not-allowed',
  },
  dangerBtn: {
    padding: '6px 14px', background: '#fee2e2', color: '#dc2626',
    border: '1px solid #fca5a5', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  dangerBtnDisabled: {
    padding: '6px 14px', background: '#fef2f2', color: '#fca5a5',
    border: '1px solid #fde8d8', borderRadius: 6, fontSize: 13, cursor: 'not-allowed',
  },
  successBanner: {
    marginTop: 12, padding: '10px 14px', borderRadius: 6,
    background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', fontSize: 13,
  },
  errorBanner: {
    marginTop: 12, padding: '10px 14px', borderRadius: 6,
    background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', fontSize: 13,
  },
  tabBar: {
    display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: 16,
  },
  tabBtn: (active) => ({
    padding: '9px 20px', background: 'none', border: 'none',
    cursor: 'pointer', fontSize: 14,
    fontWeight: active ? 700 : 400,
    borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
    color: active ? '#2563eb' : '#6b7280',
    marginBottom: -1,
  }),
  delegCard: {
    background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8,
    padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  delegCardLeft: { flex: 1 },
  delegEmail: { fontWeight: 600, fontSize: 14, color: '#111827', marginBottom: 4 },
  delegMeta: { fontSize: 12, color: '#9ca3af', marginBottom: 6 },
  pillsRow: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  pill: {
    background: '#eff6ff', color: '#1d4ed8', fontSize: 11, fontWeight: 600,
    padding: '2px 9px', borderRadius: 12, textTransform: 'capitalize',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 12px', borderBottom: '2px solid #e5e7eb', color: '#374151', fontWeight: 600 },
  td: { padding: '9px 12px', borderBottom: '1px solid #f3f4f6', color: '#374151' },
  statusBadge: (status) => ({
    padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600,
    background: status === 'active' ? '#dcfce7' : '#f3f4f6',
    color: status === 'active' ? '#15803d' : '#6b7280',
  }),
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DelegationPage({ user }) {
  const [delegations, setDelegations]     = useState([]);
  const [history, setHistory]             = useState([]);
  const [loading, setLoading]             = useState(true);
  const [pageError, setPageError]         = useState('');

  // Add delegate form
  const [delegateEmail, setDelegateEmail]   = useState('');
  const [selectedScopes, setSelectedScopes] = useState(['view_accounts', 'view_balances']);
  const [submitting, setSubmitting]         = useState(false);
  const [submitError, setSubmitError]       = useState('');
  const [submitSuccess, setSubmitSuccess]   = useState('');

  // Revoke
  const [revoking, setRevoking] = useState(null);

  // Tab
  const [activeSection, setActiveSection] = useState('active');

  const loadData = useCallback(async () => {
    try {
      const [delRes, histRes] = await Promise.all([
        fetch('/api/delegation'),
        fetch('/api/delegation/history'),
      ]);
      const [delData, histData] = await Promise.all([delRes.json(), histRes.json()]);
      setDelegations(delData.delegations || []);
      setHistory(histData.history || []);
    } catch (err) {
      setPageError('Failed to load delegation data: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleScopeToggle = (key) => {
    setSelectedScopes(prev =>
      prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]
    );
  };

  const handleGrant = async () => {
    if (!delegateEmail.trim()) { setSubmitError('Email is required.'); return; }
    if (selectedScopes.length === 0) { setSubmitError('Select at least one permission.'); return; }
    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');
    try {
      const res = await fetch('/api/delegation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delegateEmail: delegateEmail.trim(), scopes: selectedScopes }),
      });
      const data = await res.json();
      if (!data.ok) {
        setSubmitError(data.message || `Grant failed (${data.error || 'unknown error'})`);
      } else {
        setSubmitSuccess(`Access granted to ${delegateEmail.trim()}`);
        setDelegateEmail('');
        setSelectedScopes(['view_accounts', 'view_balances']);
        await loadData();
      }
    } catch (err) {
      setSubmitError('Network error: ' + err.message);
    } finally {
      setSubmitting(false);
      setTimeout(() => { setSubmitError(''); setSubmitSuccess(''); }, 4000);
    }
  };

  const handleRevoke = async (id) => {
    setRevoking(id);
    try {
      const res = await fetch(`/api/delegation/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) {
        console.error('[DelegationPage] revoke failed:', data);
      }
      await loadData();
    } catch (err) {
      console.error('[DelegationPage] revoke error:', err.message);
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div style={S.page}>
      <div style={S.inner}>
        {/* Header */}
        <div style={S.headerRow}>
          <h1 style={S.h1}>👥 Family Delegation</h1>
          <Link to="/dashboard" style={S.backLink}>← Back to Dashboard</Link>
        </div>

        {pageError && <div style={S.errorBanner}>{pageError}</div>}

        {/* Grant access card */}
        <div style={S.card}>
          <h2 style={S.sectionHeading}>Grant Account Access</h2>
          <p style={S.muted}>Enter a family member's email to grant them scoped access to your accounts.</p>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Family member's email
            </label>
            <input
              type="email"
              placeholder="family@example.com"
              value={delegateEmail}
              onChange={e => setDelegateEmail(e.target.value)}
              style={S.input}
              onKeyDown={e => e.key === 'Enter' && handleGrant()}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Allow them to:</p>
            {VALID_SCOPES.map(scope => (
              <label key={scope.key} style={S.scopeRow}>
                <input
                  type="checkbox"
                  checked={selectedScopes.includes(scope.key)}
                  onChange={() => handleScopeToggle(scope.key)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  <span style={S.scopeLabel}>{scope.label}</span>
                  <span style={S.scopeDesc}> — {scope.description}</span>
                </span>
              </label>
            ))}
          </div>

          {submitError   && <div style={S.errorBanner}>{submitError}</div>}
          {submitSuccess && <div style={S.successBanner}>{submitSuccess}</div>}

          <div style={{ marginTop: 16 }}>
            <button
              onClick={handleGrant}
              disabled={submitting || !delegateEmail.trim() || selectedScopes.length === 0}
              style={submitting || !delegateEmail.trim() || selectedScopes.length === 0 ? S.primaryBtnDisabled : S.primaryBtn}
            >
              {submitting ? 'Granting…' : 'Grant Access'}
            </button>
          </div>
        </div>

        {/* Active / History tabs */}
        <div style={S.card}>
          <div style={S.tabBar}>
            {[
              { key: 'active',  label: `Active Delegates (${delegations.length})` },
              { key: 'history', label: 'Delegation History' },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveSection(tab.key)} style={S.tabBtn(activeSection === tab.key)}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Active delegates */}
          {activeSection === 'active' && (
            loading
              ? <p style={S.muted}>Loading…</p>
              : delegations.length === 0
                ? <p style={S.muted}>No active delegates. Grant access above.</p>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {delegations.map(d => (
                      <div key={d.id} style={S.delegCard}>
                        <div style={S.delegCardLeft}>
                          <div style={S.delegEmail}>{d.delegateEmail || d.delegate_email}</div>
                          <div style={S.delegMeta}>
                            Granted {d.granted_at ? new Date(d.granted_at).toLocaleDateString() : '—'}
                          </div>
                          <div style={S.pillsRow}>
                            {(d.scopes || []).map(s => (
                              <span key={s} style={S.pill}>{s.replace(/_/g, ' ')}</span>
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRevoke(d.id)}
                          disabled={revoking === d.id}
                          style={revoking === d.id ? S.dangerBtnDisabled : S.dangerBtn}
                        >
                          {revoking === d.id ? 'Revoking…' : 'Revoke'}
                        </button>
                      </div>
                    ))}
                  </div>
                )
          )}

          {/* Delegation history */}
          {activeSection === 'history' && (
            loading
              ? <p style={S.muted}>Loading…</p>
              : history.length === 0
                ? <p style={S.muted}>No delegation history.</p>
                : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={S.table}>
                      <thead>
                        <tr>
                          <th style={S.th}>Delegate</th>
                          <th style={S.th}>Permissions</th>
                          <th style={S.th}>Status</th>
                          <th style={S.th}>Granted</th>
                          <th style={S.th}>Revoked</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map(h => (
                          <tr key={h.id}>
                            <td style={S.td}>{h.delegateEmail || h.delegate_email}</td>
                            <td style={S.td}>{(h.scopes || []).map(s => s.replace(/_/g, ' ')).join(', ')}</td>
                            <td style={S.td}>
                              <span style={S.statusBadge(h.status)}>{h.status}</span>
                            </td>
                            <td style={S.td}>{h.granted_at ? new Date(h.granted_at).toLocaleDateString() : '—'}</td>
                            <td style={S.td}>{h.revoked_at ? new Date(h.revoked_at).toLocaleDateString() : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
          )}
        </div>
      </div>
    </div>
  );
}
