import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format } from 'date-fns';
import apiClient from '../services/apiClient';
import useChatWidget from '../hooks/useChatWidget';
import { useEducationUI } from '../context/EducationUIContext';
import { EDU } from './education/educationIds';
import './UserDashboard.css';

// ── Scope metadata ──────────────────────────────────────────────────────────
const SCOPE_META = {
  'openid':                    { cat: 'oidc',   label: 'openid',           color: '#64748b' },
  'profile':                   { cat: 'oidc',   label: 'profile',          color: '#64748b' },
  'email':                     { cat: 'oidc',   label: 'email',            color: '#64748b' },
  'banking:read':              { cat: 'read',   label: 'banking:read',     color: '#2563eb' },
  'banking:write':             { cat: 'write',  label: 'banking:write',    color: '#7c3aed' },
  'banking:accounts:read':     { cat: 'read',   label: 'accounts:read',    color: '#2563eb' },
  'banking:transactions:read': { cat: 'read',   label: 'txns:read',        color: '#2563eb' },
  'banking:transactions:write':{ cat: 'write',  label: 'txns:write',       color: '#7c3aed' },
  'transfer':                  { cat: 'action', label: 'transfer',         color: '#059669' },
  'withdrawal':                { cat: 'action', label: 'withdrawal',       color: '#d97706' },
  'deposit':                   { cat: 'action', label: 'deposit',          color: '#059669' },
  'delete':                    { cat: 'admin',  label: 'delete',           color: '#dc2626' },
  'modify':                    { cat: 'admin',  label: 'modify',           color: '#ea580c' },
  'offline_access':            { cat: 'oidc',   label: 'offline_access',   color: '#64748b' },
};

const FULL_DEMO_SCOPES = [
  'openid','profile','email',
  'banking:read','banking:write',
  'banking:transactions:write',
  'transfer','withdrawal','deposit','delete','modify'
];
const TRANSFER_ONLY_SCOPES = ['openid','profile','email','transfer'];

const txIcon = {
  deposit:    { icon: '↓', color: '#059669', bg: '#d1fae5' },
  withdrawal: { icon: '↑', color: '#dc2626', bg: '#fee2e2' },
  transfer:   { icon: '⇄', color: '#2563eb', bg: '#dbeafe' },
};

// ── ScopeBadge ────────────────────────────────────────────────────────────
function ScopeBadge({ scope, strike }) {
  const meta = SCOPE_META[scope] || { color: '#6b7280', label: scope };
  return (
    <span style={{
      display: 'inline-block', fontSize: '0.7rem', fontWeight: 600,
      padding: '2px 7px', borderRadius: 20,
      background: strike ? '#f1f5f9' : `${meta.color}18`,
      color: strike ? '#94a3b8' : meta.color,
      border: `1px solid ${strike ? '#e2e8f0' : `${meta.color}44`}`,
      textDecoration: strike ? 'line-through' : 'none',
      marginRight: 3, marginBottom: 3, whiteSpace: 'nowrap'
    }}>
      {meta.label}
    </span>
  );
}

// ── TokenStatusPanel ──────────────────────────────────────────────────────
function TokenStatusPanel({ tokenData, onRefresh }) {
  const [expanded, setExpanded] = useState(true);
  const [scopeScenario, setScopeScenario] = useState('full');
  const [scopeLog, setScopeLog] = useState([]);
  const [showMayActSim, setShowMayActSim] = useState(false);
  const { open } = useEducationUI();

  const realScopes = tokenData?.scopes || tokenData?.claims?.scope?.split(' ') || [];
  const displayScopes = scopeScenario === 'full' ? FULL_DEMO_SCOPES : TRANSFER_ONLY_SCOPES;

  const handleDownscope = () => {
    setScopeLog(prev => [...prev, {
      id: Date.now(),
      action: 'Transfer executed — scoped down to Transfer-only',
      before: FULL_DEMO_SCOPES,
      after: TRANSFER_ONLY_SCOPES,
      ts: new Date(),
    }]);
    setScopeScenario('transfer-only');
  };

  const handleResetScope = () => {
    setScopeLog(prev => [...prev, {
      id: Date.now(),
      action: 'Session refreshed — full scopes restored',
      before: TRANSFER_ONLY_SCOPES,
      after: FULL_DEMO_SCOPES,
      ts: new Date(),
    }]);
    setScopeScenario('full');
    setShowMayActSim(false);
  };

  const handleMayActSim = () => {
    setShowMayActSim(true);
    setScopeLog(prev => [...prev, {
      id: Date.now(),
      action: 'Token exchange — may_act delegated to MCP server',
      before: [],
      after: [],
      mayActBefore: null,
      mayActAfter: { client_id: 'bx-finance-mcp', sub: 'agent-svc@pingone.local' },
      ts: new Date(),
    }]);
  };

  const connected = tokenData?.authenticated;
  const claims = tokenData?.claims || {};
  const sub = (claims.sub || '').slice(0, 18) + ((claims.sub || '').length > 18 ? '…' : '');
  const exp = claims.exp ? new Date(claims.exp * 1000) : null;

  return (
    <div className="ud-token-panel">
      {/* Panel header */}
      <button type="button" className="ud-tp-header" onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.1rem' }}>🔐</span>
          <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1e293b' }}>Token Status</span>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: connected ? '#22c55e' : '#ef4444',
            marginLeft: 2, flexShrink: 0
          }} />
        </div>
        <span style={{
          fontSize: '1.1rem', color: '#64748b', userSelect: 'none',
          fontWeight: 700, lineHeight: 1,
          transition: 'transform .15s',
          display: 'inline-block',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)'
        }}>▼</span>
      </button>

      {expanded && (
        <div className="ud-tp-body">
          {/* Identity */}
          <div className="ud-tp-section">
            <div className="ud-tp-label">Identity</div>
            <div className="ud-tp-row"><span className="ud-tp-key">sub</span><code className="ud-tp-val">{sub || '—'}</code></div>
            <div className="ud-tp-row"><span className="ud-tp-key">email</span><code className="ud-tp-val" style={{ fontSize: '0.72rem' }}>{claims.email || tokenData?.user?.email || '—'}</code></div>
            <div className="ud-tp-row"><span className="ud-tp-key">role</span><code className="ud-tp-val">{tokenData?.user?.role || claims.role || 'customer'}</code></div>
            {exp && <div className="ud-tp-row"><span className="ud-tp-key">expires</span><code className="ud-tp-val" style={{ fontSize: '0.69rem' }}>{format(exp, 'HH:mm:ss')}</code></div>}
          </div>

          {/* Current Scopes */}
          <div className="ud-tp-section">
            <div className="ud-tp-label">
              Active Scopes
              {scopeScenario === 'transfer-only' && (
                <span style={{ marginLeft: 6, fontSize: '0.68rem', background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>
                  DOWNSCOPED
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 4 }}>
              {displayScopes.map(s => <ScopeBadge key={s} scope={s} />)}
            </div>
          </div>

          {/* Scope Simulation */}
          <div className="ud-tp-section">
            <div className="ud-tp-label">Scope Simulation</div>
            <p style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 8, lineHeight: 1.5 }}>
              Simulate how scopes narrow after a transfer operation.
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {scopeScenario === 'full' ? (
                <button type="button" className="ud-sim-btn ud-sim-btn--orange" onClick={handleDownscope}>
                  ↓ Downscope → Transfer-only
                </button>
              ) : (
                <button type="button" className="ud-sim-btn ud-sim-btn--blue" onClick={handleResetScope}>
                  ↺ Reset to Full Scopes
                </button>
              )}
              <button type="button" className="ud-sim-btn ud-sim-btn--purple" onClick={handleMayActSim}>
                ⇆ Simulate may_act
              </button>
            </div>
          </div>

          {/* may_act */}
          {showMayActSim && (
            <div className="ud-tp-section">
              <div className="ud-tp-label">may_act Claim</div>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '8px 10px', fontSize: '0.72rem', fontFamily: 'monospace' }}>
                <div style={{ color: '#166534', marginBottom: 3 }}>{/* After token exchange: */}{'// After token exchange:'}</div>
                <div><span style={{ color: '#2563eb' }}>"may_act"</span>: {'{'}</div>
                <div style={{ paddingLeft: 12 }}><span style={{ color: '#059669' }}>"client_id"</span>: <span style={{ color: '#7c3aed' }}>"bx-finance-mcp"</span>,</div>
                <div style={{ paddingLeft: 12 }}><span style={{ color: '#059669' }}>"sub"</span>: <span style={{ color: '#7c3aed' }}>"agent-svc@pingone"</span></div>
                <div>{'}'}</div>
              </div>
              <button
                type="button"
                style={{ marginTop: 6, fontSize: '0.7rem', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                onClick={() => open(EDU.MAY_ACT, 'what')}
              >
                What is may_act? →
              </button>
            </div>
          )}

          {/* Before/After log */}
          {scopeLog.length > 0 && (
            <div className="ud-tp-section">
              <div className="ud-tp-label">Change Log</div>
              {scopeLog.slice(-3).reverse().map(entry => (
                <div key={entry.id} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: 4 }}>
                    {format(entry.ts, 'HH:mm:ss')} — {entry.action}
                  </div>
                  {entry.before?.length > 0 && (
                    <table className="ud-scope-table">
                      <thead>
                        <tr>
                          <th>Scope</th>
                          <th>Before</th>
                          <th>After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...new Set([...entry.before, ...entry.after])].map(s => {
                          const wasBefore = entry.before.includes(s);
                          const isAfter = entry.after.includes(s);
                          const changed = wasBefore !== isAfter;
                          return (
                            <tr key={s} style={{ background: changed ? '#fef9ec' : 'transparent' }}>
                              <td><ScopeBadge scope={s} /></td>
                              <td style={{ textAlign: 'center', color: wasBefore ? '#22c55e' : '#ef4444' }}>{wasBefore ? '✓' : '✗'}</td>
                              <td style={{ textAlign: 'center', color: isAfter ? '#22c55e' : '#ef4444' }}>{isAfter ? '✓' : '✗'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  {entry.mayActAfter && (
                    <div style={{ fontSize: '0.72rem', padding: '4px 8px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 4 }}>
                      <span style={{ color: '#0369a1' }}>may_act added</span> → client_id: {entry.mayActAfter.client_id}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {realScopes.length > 0 && (
            <div className="ud-tp-section">
              <div className="ud-tp-label">Live Token Scopes</div>
              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                {realScopes.map(s => <ScopeBadge key={s} scope={s} />)}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 4 }}>
                Actual scopes from PingOne token
              </div>
            </div>
          )}

          <button type="button" onClick={onRefresh} style={{ width: '100%', marginTop: 4, padding: '5px', fontSize: '0.72rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, color: '#475569', cursor: 'pointer' }}>
            ↻ Refresh Token
          </button>
        </div>
      )}
    </div>
  );
}

// ── AccountCard ────────────────────────────────────────────────────────────
function AccountCard({ account, onTransfer, onDeposit, onWithdraw }) {
  const isChecking = (account.accountType || '').toLowerCase() === 'checking';
  const gradient = isChecking
    ? 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)'
    : 'linear-gradient(135deg, #065f46 0%, #059669 100%)';
  const masked = (account.accountNumber || '').slice(-4).padStart(account.accountNumber?.length || 4, '•');

  return (
    <div className="ud-account-card" style={{ background: gradient }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)', marginBottom: 2 }}>
            {isChecking ? 'Checking Account' : 'Savings Account'}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)', letterSpacing: '0.05em' }}>
            {masked}
          </div>
        </div>
        <div style={{ fontSize: '1.4rem', opacity: 0.6 }}>{isChecking ? '💳' : '🏦'}</div>
      </div>
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>Available Balance</div>
        <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'white', letterSpacing: '-0.02em' }}>
          ${account.balance?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="button" className="ud-card-btn" onClick={() => onTransfer(account)}>Transfer</button>
        <button type="button" className="ud-card-btn" onClick={() => onDeposit(account)}>Deposit</button>
        <button type="button" className="ud-card-btn" onClick={() => onWithdraw(account)}>Withdraw</button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
const UserDashboard = ({ user: propUser, onLogout }) => {
  const navigate = useNavigate();
  const { open } = useEducationUI();
  const [user, setUser] = useState(propUser);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [tokenData, setTokenData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Action state
  const [activeAction, setActiveAction] = useState(null); // { type: 'transfer'|'deposit'|'withdraw', account }
  const [formData, setFormData] = useState({ toAccountId: '', amount: '', description: '' });

  // Step-up state
  const [stepUpRequired, setStepUpRequired] = useState(false);
  const [stepUpMethod, setStepUpMethod] = useState('email');
  const [cibaAuthReqId, setCibaAuthReqId] = useState(null);
  const [cibaStatus, setCibaStatus] = useState('idle');

  const fetchingRef = React.useRef(false);

  useChatWidget();

  // Auto-dismiss success
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  const fetchTokenData = useCallback(async () => {
    try {
      let res;
      try {
        res = await axios.get('/api/auth/oauth/user/token-claims', { withCredentials: true });
        if (!res.data.authenticated) res = await axios.get('/api/auth/oauth/token-claims', { withCredentials: true });
      } catch {
        res = await axios.get('/api/auth/oauth/token-claims', { withCredentials: true });
      }
      setTokenData(res.data.authenticated ? res.data : null);
    } catch { setTokenData(null); }
  }, []);

  const fetchUserData = useCallback(async (silent = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      if (!silent) setLoading(true);
      try {
        const r = await axios.get('/api/auth/oauth/user/status');
        if (r.data.authenticated) setUser(r.data.user);
        else {
          const r2 = await axios.get('/api/auth/oauth/status');
          if (r2.data.authenticated) setUser(r2.data.user);
        }
      } catch { /* use propUser */ }

      const [acctRes, txnRes] = await Promise.all([
        apiClient.get('/api/accounts/my'),
        apiClient.get('/api/transactions/my'),
      ]);
      setAccounts(acctRes.data.accounts || []);
      setTransactions(txnRes.data.transactions || []);
    } catch (err) {
      if (err.response?.status === 401) setError('Session expired. Please log in again.');
      else setError('Failed to load account information');
    } finally {
      if (!silent) setLoading(false);
      fetchingRef.current = false;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchUserData(); fetchTokenData(); }, [fetchUserData, fetchTokenData]); // eslint-disable-line react-hooks/exhaustive-deps

  // CIBA polling
  useEffect(() => {
    if (!cibaAuthReqId || cibaStatus !== 'pending') return;
    const iv = setInterval(async () => {
      try {
        const { data } = await axios.get(`/api/auth/ciba/poll/${cibaAuthReqId}`);
        if (data.status === 'completed' || data.status === 'approved') {
          setCibaStatus('completed'); setCibaAuthReqId(null); setStepUpRequired(false);
          await fetchUserData(true); setSuccess('Identity verified — please retry.');
        } else if (['failed','expired','error'].includes(data.status)) {
          setCibaStatus('error'); setCibaAuthReqId(null);
          setError(`CIBA ${data.status}. Please try again.`);
        }
      } catch { /* keep polling */ }
    }, 5000);
    return () => clearInterval(iv);
  }, [cibaAuthReqId, cibaStatus, fetchUserData]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCibaStepUp = async () => {
    if (!user?.email) { setError('No email on session.'); return; }
    try {
      const { data } = await axios.post('/api/auth/ciba/initiate', {
        loginHint: user.email, bindingMessage: 'Approve your banking transaction', scope: 'openid profile',
      });
      setCibaAuthReqId(data.authReqId); setCibaStatus('pending');
    } catch (err) { setError(`CIBA failed: ${err.response?.data?.message || err.message}`); }
  };

  const handleSubmitAction = async (e) => {
    e.preventDefault();
    const { type, account } = activeAction;
    const amount = parseFloat(formData.amount);
    if (!amount || amount <= 0) { setError('Please enter a valid amount.'); return; }

    try {
      const body = {
        type,
        amount,
        description: formData.description || `${type.charAt(0).toUpperCase() + type.slice(1)}`,
        userId: user?.id,
      };
      if (type === 'transfer') {
        if (!formData.toAccountId) { setError('Please select a destination account.'); return; }
        body.fromAccountId = account.id;
        body.toAccountId = formData.toAccountId;
      } else if (type === 'deposit') {
        body.toAccountId = account.id;
        body.fromAccountId = null;
      } else if (type === 'withdrawal') {
        body.fromAccountId = account.id;
        body.toAccountId = null;
      }
      await apiClient.post('/api/transactions', body);
      setActiveAction(null);
      setFormData({ toAccountId: '', amount: '', description: '' });
      await fetchUserData(true);
      setSuccess(`${type.charAt(0).toUpperCase() + type.slice(1)} completed successfully!`);
    } catch (err) {
      if (err.response?.status === 428) {
        setStepUpMethod(err.response.data?.step_up_method || 'email');
        setCibaStatus('idle'); setStepUpRequired(true);
      } else {
        setError(err.response?.data?.message || err.response?.data?.error || `${type} failed`);
      }
    }
  };

  const totalBalance = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);
  const sortedTxns = [...transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 20);

  if (loading) {
    return (
      <div className="ud-loading">
        <div className="ud-loading-spinner" />
        <p>Loading your accounts…</p>
      </div>
    );
  }

  return (
    <div className="user-dashboard-v2">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="ud-header">
        <div className="ud-header-brand">
          <div className="ud-logo">
            <div className="ud-logo-grid">
              <span /><span /><span /><span />
            </div>
          </div>
          <span className="ud-brand-name">BX Finance</span>
        </div>
        <div className="ud-header-user">
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
              {user?.firstName} {user?.lastName}
            </div>
            <div style={{ fontSize: '0.8rem', opacity: 0.75 }}>{user?.email}</div>
          </div>
        </div>
        <div className="ud-header-actions">
          <button type="button" className="ud-hdr-btn" onClick={() => open(EDU.LOGIN_FLOW, 'what')}>Login Flow</button>
          <button type="button" className="ud-hdr-btn" onClick={() => open(EDU.MAY_ACT, 'what')}>may_act</button>
          <button type="button" className="ud-hdr-btn ud-hdr-btn--ghost" onClick={() => navigate(-1)}>← Back</button>
          <button type="button" className="ud-hdr-btn ud-hdr-btn--logout" onClick={onLogout}>Sign Out</button>
        </div>
      </header>

      {/* ── Alerts ──────────────────────────────────────── */}
      {error && (
        <div className="ud-alert ud-alert--error">
          ⚠ {error}
          <button type="button" className="ud-alert-dismiss" onClick={() => setError(null)}>✕</button>
        </div>
      )}
      {success && (
        <div className="ud-alert ud-alert--success">
          ✓ {success}
          <button type="button" className="ud-alert-dismiss" onClick={() => setSuccess(null)}>✕</button>
        </div>
      )}
      {stepUpRequired && (
        <div className="ud-alert ud-alert--warning">
          <span>🔐 <strong>MFA required</strong> — Transfers ≥$250 need additional verification.</span>
          {stepUpMethod === 'ciba' ? (
            cibaStatus === 'idle'   ? <button type="button" className="ud-alert-action" onClick={handleCibaStepUp}>Verify via CIBA →</button> :
            cibaStatus === 'pending' ? <span style={{ marginLeft: 10, fontStyle: 'italic' }}>⏳ Waiting on device…</span> :
            cibaStatus === 'error'   ? <button type="button" className="ud-alert-action" onClick={() => { setCibaStatus('idle'); setCibaAuthReqId(null); }}>Retry →</button> : null
          ) : (
            <a className="ud-alert-action" href={`/api/auth/oauth/user/stepup?return_to=/dashboard`}>
              Verify now →
            </a>
          )}
          <button type="button" className="ud-alert-dismiss" onClick={() => { setStepUpRequired(false); setCibaAuthReqId(null); setCibaStatus('idle'); }}>✕</button>
        </div>
      )}

      {/* ── Body: 3-column ─────────────────────────────── */}
      <div className="ud-body">

        {/* LEFT — Token Status Panel */}
        <aside className="ud-left">
          <TokenStatusPanel tokenData={tokenData} onRefresh={fetchTokenData} />
        </aside>

        {/* CENTER — Banking Content */}
        <main className="ud-center">
          {/* Balance overview */}
          <div className="ud-balance-bar">
            <div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Portfolio</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#1e293b', letterSpacing: '-0.03em' }}>
                ${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="ud-action-pill" onClick={fetchUserData}>↻ Refresh</button>
            </div>
          </div>

          {/* Account cards */}
          <div className="ud-accounts-row">
            {accounts.length === 0 ? (
              <div className="ud-empty">No accounts found. Try refreshing.</div>
            ) : (
              accounts.map(acct => (
                <AccountCard
                  key={acct.id}
                  account={acct}
                  onTransfer={a => { setActiveAction({ type: 'transfer', account: a }); setFormData({ toAccountId: '', amount: '', description: '' }); }}
                  onDeposit={a => { setActiveAction({ type: 'deposit', account: a }); setFormData({ toAccountId: '', amount: '', description: '' }); }}
                  onWithdraw={a => { setActiveAction({ type: 'withdrawal', account: a }); setFormData({ toAccountId: '', amount: '', description: '' }); }}
                />
              ))
            )}
          </div>

          {/* Action form drawer */}
          {activeAction && (
            <div className="ud-action-drawer">
              <div className="ud-drawer-header">
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  {activeAction.type === 'transfer' ? '⇄ Transfer Money' :
                   activeAction.type === 'deposit'  ? '↓ Deposit Funds' : '↑ Withdraw Funds'}
                </span>
                <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                  {activeAction.account.name} · ${activeAction.account.balance?.toFixed(2)}
                </span>
                <button type="button" className="ud-drawer-close" onClick={() => setActiveAction(null)}>✕</button>
              </div>
              <form onSubmit={handleSubmitAction} className="ud-action-form">
                {activeAction.type === 'transfer' && (
                  <div className="ud-form-group">
                    <label htmlFor="action-to-account">To Account</label>
                    <select id="action-to-account" value={formData.toAccountId} onChange={e => setFormData({...formData, toAccountId: e.target.value})} required>
                      <option value="">Select destination…</option>
                      {accounts.filter(a => a.id !== activeAction.account.id).map(a => (
                        <option key={a.id} value={a.id}>{a.name} · ${a.balance?.toFixed(2)}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="ud-form-group">
                    <label htmlFor="action-amount">Amount ($)</label>
                    <input id="action-amount" type="number" step="0.01" min="0.01" placeholder="0.00" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} required />
                  </div>
                  <div className="ud-form-group">
                    <label htmlFor="action-description">Note (optional)</label>
                    <input id="action-description" type="text" placeholder="Description…" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                  </div>
                </div>
                {activeAction.type === 'transfer' && (
                  <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0 0 10px' }}>Minimum transfer: $50</p>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="submit" className="ud-submit-btn">
                    {activeAction.type === 'transfer' ? 'Transfer' : activeAction.type === 'deposit' ? 'Deposit' : 'Withdraw'}
                  </button>
                  <button type="button" className="ud-cancel-btn" onClick={() => setActiveAction(null)}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          {/* Transactions */}
          <div className="ud-txn-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>Recent Transactions</h3>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{transactions.length} transactions</span>
            </div>
            {sortedTxns.length === 0 ? (
              <div className="ud-empty">No transactions yet.</div>
            ) : (
              <div className="ud-txn-list">
                {sortedTxns.map(txn => {
                  const isOut = txn.type === 'withdrawal' || (txn.type === 'transfer' && txn.fromAccountId);
                  const meta = txIcon[txn.type] || { icon: '•', color: '#64748b', bg: '#f1f5f9' };
                  return (
                    <div key={txn.id} className="ud-txn-row">
                      <div className="ud-txn-icon" style={{ background: meta.bg, color: meta.color }}>
                        {meta.icon}
                      </div>
                      <div className="ud-txn-info">
                        <div className="ud-txn-desc">{txn.description || txn.type}</div>
                        <div className="ud-txn-date">{format(new Date(txn.createdAt), 'MMM d, yyyy · h:mm a')}</div>
                      </div>
                      <div className="ud-txn-type-badge" style={{ color: meta.color, background: meta.bg }}>
                        {txn.type}
                      </div>
                      <div className={`ud-txn-amount ${isOut ? 'ud-txn-out' : 'ud-txn-in'}`}>
                        {isOut ? '-' : '+'}${txn.amount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        {/* RIGHT — Agent info panel */}
        <aside className="ud-right">
          <div className="ud-agent-info">
            <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🤖</div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: 6 }}>Banking Assistant</div>
            <p style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.6, marginBottom: 12 }}>
              Ask questions about your accounts, transactions, CIBA, token exchange, or MCP tools.
            </p>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.5 }}>
              Click the <strong>⊕</strong> button in the bottom-right corner to open the assistant.
            </p>
            <div className="ud-agent-hints">
              <div className="ud-hint-chip">"What's my balance?"</div>
              <div className="ud-hint-chip">"Explain token exchange"</div>
              <div className="ud-hint-chip">"What is CIBA?"</div>
              <div className="ud-hint-chip">"List MCP tools"</div>
            </div>
          </div>

          <div className="ud-agent-info" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e293b', marginBottom: 8 }}>🔗 Auth Education</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button type="button" className="ud-edu-link" onClick={() => open(EDU.LOGIN_FLOW, 'what')}>How does login work?</button>
              <button type="button" className="ud-edu-link" onClick={() => open(EDU.MAY_ACT, 'what')}>What is may_act?</button>
              <button type="button" className="ud-edu-link" onClick={() => open(EDU.TOKEN_EXCHANGE, 'what')}>Token Exchange</button>
              <button type="button" className="ud-edu-link" onClick={() => open(EDU.CIBA, 'what')}>CIBA / Backchannel Auth</button>
              <button type="button" className="ud-edu-link" onClick={() => open(EDU.MCP_PROTOCOL, 'what')}>MCP Protocol</button>
            </div>
          </div>

          <div className="ud-agent-info ud-mcp-status" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e293b', marginBottom: 6 }}>⚙ MCP Server</div>
            <p style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.55, margin: 0 }}>
              The MCP server requires a persistent WebSocket connection and cannot run on Vercel serverless. Deploy it separately:
            </p>
            <code style={{ display: 'block', fontSize: '0.7rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: '6px 8px', marginTop: 8, color: '#475569' }}>
              cd banking_mcp_server<br />
              npm run dev
            </code>
            <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 6, marginBottom: 0 }}>
              Then set <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: 3 }}>MCP_SERVER_URL</code> to your deployed URL.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default UserDashboard;
