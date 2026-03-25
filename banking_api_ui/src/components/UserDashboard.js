import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { format } from 'date-fns';
import bffAxios from '../services/bffAxios';
import { resolveSessionUser } from '../services/sessionResolver';
import useChatWidget from '../hooks/useChatWidget';
import { useEducationUI } from '../context/EducationUIContext';
import { EDU } from './education/educationIds';
import TokenChainDisplay from './TokenChainDisplay';
import BankingAgent from './BankingAgent';
import {
  errorMessageSuggestsLogin,
  navigateToCustomerOAuthLogin,
} from '../utils/authUi';
import './UserDashboard.css';

/**
 * Human-readable account label; uses demo "account name" when set on Demo config.
 * @param {{ name?: string; accountType?: string; accountNumber?: string }} account
 * @returns {string}
 */
function accountSummaryLine(account) {
  const num = account.accountNumber || 'N/A';
  const type = account.accountType || 'Account';
  const nick = typeof account.name === 'string' && account.name.trim() ? account.name.trim() : '';
  if (nick) return `${nick} · ${type} - ${num}`;
  return `${type} - ${num}`;
}

const UserDashboard = ({ user: propUser, onLogout, agentUiMode = 'floating' }) => {
  const { open } = useEducationUI();
  const [user, setUser] = useState(propUser);
  const [accounts, setAccounts] = useState([]);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenData, setTokenData] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    description: ''
  });
  const [depositForm, setDepositForm] = useState({
    amount: '',
    description: ''
  });
  const [depositAccount, setDepositAccount] = useState(null);
  const [withdrawForm, setWithdrawForm] = useState({
    amount: '',
    description: ''
  });
  const [withdrawAccount, setWithdrawAccount] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [success, setSuccess] = useState(null);
  const [stepUpRequired, setStepUpRequired] = useState(false);
  // 'ciba' | 'email' — set from the 428 response step_up_method field
  const [stepUpMethod, setStepUpMethod] = useState('email');
  // CIBA step-up state
  const [cibaAuthReqId, setCibaAuthReqId] = useState(null);
  const [cibaStatus, setCibaStatus] = useState('idle'); // 'idle' | 'pending' | 'completed' | 'error'
  const fetchingRef = React.useRef(false);
  const fetchUserDataRef = React.useRef(null);
  const [agentHighlight, setAgentHighlight] = useState(null); // 'accounts' | 'transactions' | null

  // Listen for full-page agent results dispatched by BankingAgent
  useEffect(() => {
    const handleAgentResult = (e) => {
      const { type, data, label } = e.detail;
      const labelSuffix = label ? ` \u2014 ${label}` : '';
      const labelColon = label ? `: ${label}` : '';
      if (type === 'accounts' && Array.isArray(data)) {
        setAccounts(data);
        setAgentHighlight('accounts');
        setSuccess(`Agent updated accounts${labelSuffix}`);
      } else if (type === 'transactions' && Array.isArray(data)) {
        setTransactions(data);
        setAgentHighlight('transactions');
        setSuccess(`Agent updated transactions${labelSuffix}`);
      } else if (type === 'balance' || type === 'confirm') {
        if (fetchUserDataRef.current) fetchUserDataRef.current();
        setAgentHighlight('accounts');
        setSuccess(`Agent completed${labelColon} \u2014 balances refreshed`);
      }
      setTimeout(() => setAgentHighlight(null), 3000);
    };
    window.addEventListener('banking-agent-result', handleAgentResult);
    return () => window.removeEventListener('banking-agent-result', handleAgentResult);
  }, []);

  // Listen for agent data ready events to highlight sections
  useEffect(() => {
    const handleAgentDataReady = (e) => {
      const { section, action } = e.detail;
      setAgentHighlight(section);
      
      // Refresh data based on the action
      if (section === 'accounts' && fetchUserDataRef.current) {
        fetchUserDataRef.current();
      } else if (section === 'transactions' && fetchUserDataRef.current) {
        fetchUserDataRef.current();
      }
      
      // Show success message
      const actionLabels = {
        accounts: 'Account data',
        transactions: 'Transaction data',
        balance: 'Balance check',
        deposit: 'Deposit',
        withdraw: 'Withdrawal',
        transfer: 'Transfer'
      };
      setSuccess(`Agent completed ${actionLabels[action] || action} \u2014 highlighted below`);
      
      // Clear highlight after 4 seconds
      setTimeout(() => setAgentHighlight(null), 4000);
    };
    window.addEventListener('agentDataReady', handleAgentDataReady);
    return () => window.removeEventListener('agentDataReady', handleAgentDataReady);
  }, []);

  // Auto-dismiss success messages after 4 seconds
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  // Initialize chat widget (configuration is handled in index.html)
  useChatWidget();

  // Function to fetch current OAuth tokens
  const fetchTokenData = async () => {
    try {
      // Try both user/admin token-claims endpoints first (status endpoints omit raw token).
      let response;
      try {
        response = await axios.get('/api/auth/oauth/user/token-claims');
        if (!response.data.authenticated) {
          response = await axios.get('/api/auth/oauth/token-claims');
        }
      } catch (error) {
        response = await axios.get('/api/auth/oauth/token-claims');
      }
      
      if (response.data.authenticated) {
        const decodedAccessToken = response.data.decoded
          ? {
              header: response.data.decoded.header || null,
              payload: response.data.decoded.payload || null,
              raw: null
            }
          : null;

        const tokenInfo = {
          accessToken: decodedAccessToken,
          tokenType: response.data.tokenType,
          expiresAt: response.data.expiresAt,
          clientType: response.data.clientType,
          oauthProvider: response.data.oauthProvider,
          user: response.data.user
        };
        
        setTokenData(tokenInfo);
      } else {
        setTokenData(null);
      }
    } catch (error) {
      console.error('Error fetching token data:', error);
      setTokenData(null);
    }
  };

  // Function to open token modal
  const openTokenModal = () => {
    fetchTokenData();
    setShowTokenModal(true);
  };

  useEffect(() => {
    // Initial data fetch
    fetchUserData();
    fetchUserDataRef.current = fetchUserData;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let refreshInterval;
    
    if (autoRefresh) {
      refreshInterval = setInterval(() => {
        fetchUserData(true); // Silent refresh - no loading spinner
      }, 45000); // 45s — pairs with server rate limits / shared NAT IPs
    }
    
    // Cleanup interval on component unmount or when autoRefresh changes
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [autoRefresh]);

  const fetchUserData = async (silent = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      // Only show loading spinner for initial load, not auto-refreshes
      if (!silent) {
        setLoading(true);
      }

      const sessionUser = await resolveSessionUser();
      if (!sessionUser) {
        setError('Please log in to access your account');
        if (!silent) {
          setLoading(false);
        }
        return;
      }
      setUser(sessionUser);
      setError(null);

      // Accounts first: GET /api/accounts/my may provision demo accounts + sample transactions
      // when the user has none. Running transactions in parallel often finished before
      // provisioning completed, leaving an empty history until a later refresh (regression).
      const accountsResponse = await bffAxios.get('/api/accounts/my');
      setAccounts(Array.isArray(accountsResponse.data?.accounts) ? accountsResponse.data.accounts : []);
      const transactionsResponse = await bffAxios.get('/api/transactions/my');
      setTransactions(Array.isArray(transactionsResponse.data?.transactions) ? transactionsResponse.data.transactions : []);

    } catch (error) {
      console.error('Error fetching user data:', error);
      
      // Check if it's an authentication error
      if (error.response?.status === 429) {
        setAutoRefresh(false);
        if (silent) {
          setSuccess('Auto-refresh paused due to rate limits.');
        } else {
          setError('Too many requests from this network. Wait a minute, then refresh. Auto-refresh is off.');
        }
      } else if (error.response?.status === 401 && !silent) {
        setError('Your session has expired. Please log in again.');
      } else if (error.response?.status === 403) {
        setError('You do not have permission to access this information.');
      } else if (!silent) {
        setError('Failed to load your account information');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
      fetchingRef.current = false;
    }
  };

  // ── CIBA step-up: initiate back-channel authentication ──
  const handleCibaStepUp = async () => {
    if (!user?.email) { setError('Cannot initiate CIBA: no email on session.'); return; }
    try {
      const { data } = await axios.post('/api/auth/ciba/initiate', {
        loginHint: user.email,
        bindingMessage: 'Approve your banking transaction',
        scope: 'openid profile',
      });
      setCibaAuthReqId(data.authReqId);
      setCibaStatus('pending');
    } catch (err) {
      setError('CIBA initiation failed: ' + (err.response?.data?.message || err.message));
    }
  };

  // Poll CIBA status when a request is in flight
  useEffect(() => {
    if (!cibaAuthReqId || cibaStatus !== 'pending') return;
    const interval = setInterval(async () => {
      try {
        const { data } = await axios.get(`/api/auth/ciba/poll/${cibaAuthReqId}`);
        if (data.status === 'completed' || data.status === 'approved') {
          setCibaStatus('completed');
          setCibaAuthReqId(null);
          setStepUpRequired(false);
          await fetchUserData(true);
          setSuccess('Identity verified — please retry your transaction.');
        } else if (data.status === 'failed' || data.status === 'expired' || data.status === 'error') {
          setCibaStatus('error');
          setCibaAuthReqId(null);
          setError(`CIBA verification ${data.status}. Please try again.`);
        }
      } catch (_) { /* keep polling */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [cibaAuthReqId, cibaStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTransfer = async (e) => {
    e.preventDefault();

    if (!transferForm.fromAccountId || !transferForm.toAccountId || !transferForm.amount) {
      setError('Please fill in all transfer details');
      return;
    }

    if (transferForm.fromAccountId === transferForm.toAccountId) {
      setError('From and To accounts must be different');
      return;
    }

    try {
      await bffAxios.post('/api/transactions', {
        fromAccountId: transferForm.fromAccountId,
        toAccountId: transferForm.toAccountId,
        amount: parseFloat(transferForm.amount),
        type: 'transfer',
        description: transferForm.description || 'Transfer between accounts',
        userId: user.id
      });

      // Reset form and refresh data
      setTransferForm({ fromAccountId: '', toAccountId: '', amount: '', description: '' });
      setTransferOpen(false);
      await fetchUserData();

      setSuccess('Transfer completed successfully!');
    } catch (error) {
      console.error('Transfer error:', error);
      if (error.response?.status === 428) {
        setStepUpMethod(error.response.data?.step_up_method || 'email');
        setCibaStatus('idle');
        setStepUpRequired(true);
      } else if (error.response?.status === 403) {
        setError('You do not have permission to perform transfers. Please contact your administrator.');
      } else {
        const d = error.response?.data;
        setError(d?.message || d?.error || 'Transfer failed');
      }
    }
  };

  const handleDeposit = async (e) => {
    e.preventDefault();

    if (!depositAccount || !depositForm.amount) {
      setError('Please fill in all deposit details');
      return;
    }

    try {
      await bffAxios.post('/api/transactions', {
        fromAccountId: null,
        toAccountId: depositAccount.id,
        amount: parseFloat(depositForm.amount),
        type: 'deposit',
        description: depositForm.description || 'Deposit to account',
        userId: user.id
      });

      // Reset form and refresh data
      setDepositForm({ amount: '', description: '' });
      setDepositAccount(null);
      await fetchUserData();

      setSuccess('Deposit completed successfully!');
    } catch (error) {
      console.error('Deposit error:', error);
      if (error.response?.status === 428) {
        setStepUpMethod(error.response.data?.step_up_method || 'email');
        setCibaStatus('idle');
        setStepUpRequired(true);
      } else if (error.response?.status === 403) {
        setError('You do not have permission to make deposits. Please contact your administrator.');
      } else {
        const d = error.response?.data;
        setError(d?.message || d?.error || 'Deposit failed');
      }
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();

    if (!withdrawAccount || !withdrawForm.amount) {
      setError('Please fill in all withdrawal details');
      return;
    }

    try {
      await bffAxios.post('/api/transactions', {
        fromAccountId: withdrawAccount.id,
        toAccountId: null,
        amount: parseFloat(withdrawForm.amount),
        type: 'withdrawal',
        description: withdrawForm.description || 'Withdrawal from account',
        userId: user.id
      });

      // Reset form and refresh data
      setWithdrawForm({ amount: '', description: '' });
      setWithdrawAccount(null);
      await fetchUserData();

      setSuccess('Withdrawal completed successfully!');
    } catch (error) {
      console.error('Withdrawal error:', error);
      if (error.response?.status === 428) {
        setStepUpMethod(error.response.data?.step_up_method || 'email');
        setCibaStatus('idle');
        setStepUpRequired(true);
      } else if (error.response?.status === 403) {
        setError('You do not have permission to make withdrawals. Please contact your administrator.');
      } else {
        const d = error.response?.data;
        setError(d?.message || d?.error || 'Withdrawal failed');
      }
    }
  };

  // Function to determine if a transaction represents money going out (negative) or coming in (positive)
  const isTransactionNegative = (transaction) => {
    // For withdrawals, money is going out (negative)
    if (transaction.type === 'withdrawal') {
      return true;
    }

    // For deposits, money is coming in (positive)
    if (transaction.type === 'deposit') {
      return false;
    }

    // For other transaction types, determine based on which account is involved
    // If this transaction has a fromAccountId, it means money is going out from that account
    if (transaction.fromAccountId) {
      return true;
    }
    // If this transaction has a toAccountId but no fromAccountId, it means money is coming in
    if (transaction.toAccountId && !transaction.fromAccountId) {
      return false;
    }

    // Default to positive for unknown transaction types
    return false;
  };

  const getClientTypeIcon = (clientType) => {
    if (clientType === 'enduser') {
      return { icon: '◉', label: 'End User', color: '#4b5563' };
    } else if (clientType === 'ai_agent') {
      return { icon: '◎', label: 'AI Agent', color: '#6b7280' };
    } else {
      return { icon: '○', label: 'Unknown', color: '#9ca3af' };
    }
  };

  const pendingTransactionsByAccount = transactions.reduce((acc, transaction) => {
    const isPending = String(transaction?.status || '').toLowerCase() === 'pending';
    if (!isPending) return acc;
    const accountId = transaction?.fromAccountId || transaction?.toAccountId;
    if (!accountId) return acc;
    acc[accountId] = (acc[accountId] || 0) + 1;
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="user-dashboard">
        <div className="loading">Loading your account information...</div>
      </div>
    );
  }

  const dashboardStyle = {
    background: `
      linear-gradient(rgba(248, 250, 252, 0.85), rgba(248, 250, 252, 0.85)),
      url(${process.env.PUBLIC_URL}/images/pexels-1462751220-33995750.jpg)
    `,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
    backgroundRepeat: 'no-repeat'
  };

  const showReauthCta = errorMessageSuggestsLogin(error);

  return (
    <div
      className={`user-dashboard${agentUiMode === 'embedded' ? ' user-dashboard--embed-agent' : ''}`}
      style={dashboardStyle}
    >
      {error && (
        <div
          className="inline-message inline-message--error"
          role="alert"
          onClick={() => setError(null)}
        >
          <span className="inline-message__text">{error}</span>
          {showReauthCta && (
            <button
              type="button"
              className="inline-message__login-btn"
              onClick={(e) => {
                e.stopPropagation();
                navigateToCustomerOAuthLogin();
              }}
            >
              Sign in
            </button>
          )}
          <span className="inline-message__dismiss">✕</span>
        </div>
      )}
      {success && (
        <div className="inline-message inline-message--success" onClick={() => setSuccess(null)}>
          {success} <span className="inline-message__dismiss">✕</span>
        </div>
      )}
      {stepUpRequired && (
        <div className="inline-message inline-message--warning">
          <strong>🔐 Additional verification required</strong>
          <span style={{ marginLeft: 8 }}>
            Transfers and withdrawals of $250 or more require MFA. Please verify your identity to continue.
          </span>
          {stepUpMethod === 'ciba' ? (
            <>
              {cibaStatus === 'idle' && (
                <button
                  onClick={handleCibaStepUp}
                  className="inline-message__action"
                  style={{ marginLeft: 12, fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', textDecoration: 'underline', color: 'inherit', fontSize: 'inherit' }}
                >
                  Verify via CIBA →
                </button>
              )}
              {cibaStatus === 'pending' && (
                <span style={{ marginLeft: 12, fontStyle: 'italic' }}>
                  ⏳ Waiting for approval on your device…
                </span>
              )}
              {cibaStatus === 'error' && (
                <button
                  onClick={() => { setCibaStatus('idle'); setCibaAuthReqId(null); }}
                  className="inline-message__action"
                  style={{ marginLeft: 12, fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', textDecoration: 'underline', color: 'inherit', fontSize: 'inherit' }}
                >
                  Retry →
                </button>
              )}
            </>
          ) : (
            <a
              href={`/api/auth/oauth/user/stepup?return_to=${process.env.REACT_APP_CLIENT_URL || 'http://localhost:4000'}/dashboard`}
              className="inline-message__action"
              style={{ marginLeft: 12, fontWeight: 600, color: 'inherit', textDecoration: 'underline' }}
            >
              Verify now →
            </a>
          )}
          <span
            className="inline-message__dismiss"
            onClick={() => { setStepUpRequired(false); setCibaAuthReqId(null); setCibaStatus('idle'); }}
            style={{ marginLeft: 12, cursor: 'pointer' }}
          >
            ✕
          </span>
        </div>
      )}
      <div className="dashboard-header-stack">
        <div className="dashboard-header">
          <div className="bank-branding">
            <div className="bank-logo">
              <div className="logo-icon">
                <div className="logo-square"></div>
                <div className="logo-square"></div>
                <div className="logo-square"></div>
                <div className="logo-square"></div>
              </div>
              <span className="bank-name">BX Finance</span>
            </div>
          </div>
          <div className="header-user">
            <div className="user-info">
              <span className="user-greeting">Hello, {user?.firstName} {user?.lastName}</span>
              <span className="user-email">{user?.email}</span>
            </div>
          </div>
        </div>
        <div className="dashboard-toolbar" role="toolbar" aria-label="Dashboard actions">
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
            to="/demo-data"
            className="dashboard-toolbar-btn"
            title="Edit sandbox account names, balances, and MFA threshold"
          >
            Demo config
          </Link>
          <Link
            to="/mcp-inspector"
            className="dashboard-toolbar-btn dashboard-toolbar-btn--accent"
            title="MCP discovery, tools/list & tools/call via BFF"
          >
            MCP Inspector
          </Link>
          <div className="dashboard-toolbar-toggle">
            <label className="toggle-label toggle-label--toolbar">
              <span className="toggle-text">Auto-refresh</span>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="toggle-input"
                />
                <span className="toggle-slider"></span>
              </div>
            </label>
          </div>
          <button type="button" onClick={openTokenModal} className="dashboard-toolbar-btn dashboard-toolbar-btn--icon" title="View OAuth Token Info">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.22,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.22,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.68 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z"/>
            </svg>
            <span className="dashboard-toolbar-btn__sr">Token info</span>
          </button>
          {showReauthCta && (
            <button
              type="button"
              className="dashboard-toolbar-btn dashboard-toolbar-btn--signin"
              onClick={navigateToCustomerOAuthLogin}
            >
              Sign in
            </button>
          )}
          <button type="button" onClick={onLogout} className="dashboard-toolbar-btn dashboard-toolbar-btn--danger">
            Log out
          </button>
        </div>
      </div>

      <div className={`ud-shell ${agentUiMode === 'embedded' ? 'ud-shell--embed-bottom' : 'ud-shell--floating-only'}`}>
      <div className={`dashboard-content ud-body ${agentUiMode === 'floating' ? 'ud-body--floating' : ''}`}>
        <aside className="ud-left">
          <div className="section">
            <TokenChainDisplay />
          </div>
        </aside>

        <main className="ud-center">
          {/* Account Summary */}
          <div className={`section${agentHighlight === 'accounts' ? ' section--agent-updated' : ''}`}>
          <h2>Your Accounts {agentHighlight === 'accounts' && <span className="agent-updated-badge">↻ Updated by Agent</span>}</h2>
          <div className="account-summary-table">
            <div className="account-summary-header">
              <div className="account-summary-cell">Account number</div>
              <div className="account-summary-cell">Account name</div>
              <div className="account-summary-cell">Balance</div>
              <div className="account-summary-cell">Pending transactions</div>
              <div className="account-summary-cell">Actions</div>
            </div>
            {accounts.map((account) => (
              <div key={account.id} className="account-summary-row">
                <div className="account-summary-cell account-summary-cell--mono">{account.accountNumber || 'N/A'}</div>
                <div className="account-summary-cell">{accountSummaryLine(account)}</div>
                <div className="account-summary-cell account-summary-cell--balance">${Number(account.balance || 0).toFixed(2)}</div>
                <div className="account-summary-cell">{pendingTransactionsByAccount[account.id] || 0}</div>
                <div className="account-summary-cell">
                  <div className="account-actions">
                    <button
                      type="button"
                      className="select-account-btn"
                      onClick={() => {
                        const others = accounts.filter((a) => a.id !== account.id);
                        setTransferOpen(true);
                        setTransferForm({
                          fromAccountId: account.id,
                          toAccountId: others[0]?.id || '',
                          amount: '',
                          description: ''
                        });
                      }}
                    >
                      Transfer
                    </button>
                    <button className="deposit-btn" onClick={() => setDepositAccount(account)}>Deposit</button>
                    <button className="withdraw-btn" onClick={() => setWithdrawAccount(account)}>Withdraw</button>
                  </div>
                </div>
              </div>
            ))}
            {accounts.length === 0 && (
              <div className="account-summary-empty">No account data available for this user yet.</div>
            )}
          </div>
          </div>

          {/* Transfer Form */}
          {transferOpen && (
            <div className="section">
            <h2>Transfer Money</h2>
            <div className="transfer-form">
              <form onSubmit={handleTransfer}>
                <div className="form-group">
                  <label>From Account:</label>
                  <select
                    value={transferForm.fromAccountId}
                    onChange={(e) => {
                      const fromId = e.target.value;
                      setTransferForm((prev) => {
                        let toId = prev.toAccountId;
                        if (toId === fromId) {
                          const others = accounts.filter((a) => a.id !== fromId);
                          toId = others[0]?.id || '';
                        }
                        return { ...prev, fromAccountId: fromId, toAccountId: toId };
                      });
                    }}
                    required
                  >
                    <option value="">Select source account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {accountSummaryLine(account)} (${Number(account.balance || 0).toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>To Account:</label>
                  <select
                    value={transferForm.toAccountId}
                    onChange={(e) => {
                      const toId = e.target.value;
                      setTransferForm((prev) => {
                        let fromId = prev.fromAccountId;
                        if (fromId === toId) {
                          const others = accounts.filter((a) => a.id !== toId);
                          fromId = others[0]?.id || '';
                        }
                        return { ...prev, fromAccountId: fromId, toAccountId: toId };
                      });
                    }}
                    required
                  >
                    <option value="">Select destination account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {accountSummaryLine(account)} (${Number(account.balance || 0).toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Amount:</label>
                  <input
                    type="number"
                    step="0.01"
                    value={transferForm.amount}
                    onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                    placeholder="Enter amount"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Description:</label>
                  <input
                    type="text"
                    value={transferForm.description}
                    onChange={(e) => setTransferForm({ ...transferForm, description: e.target.value })}
                    placeholder="Transfer description"
                  />
                </div>
                <div className="form-actions">
                  <button type="submit" className="transfer-btn">Transfer</button>
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => {
                      setTransferOpen(false);
                      setTransferForm({ fromAccountId: '', toAccountId: '', amount: '', description: '' });
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
            </div>
          )}

          {/* Deposit Form */}
          {depositAccount && (
            <div className="section">
            <h2>Deposit Money</h2>
            <div className="deposit-form">
              <p>To: {accountSummaryLine(depositAccount)} (${depositAccount.balance.toFixed(2)})</p>
              <form onSubmit={handleDeposit}>
                <div className="form-group">
                  <label>Amount:</label>
                  <input
                    type="number"
                    step="0.01"
                    value={depositForm.amount}
                    onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })}
                    placeholder="Enter amount"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Description:</label>
                  <input
                    type="text"
                    value={depositForm.description}
                    onChange={(e) => setDepositForm({ ...depositForm, description: e.target.value })}
                    placeholder="Deposit description"
                  />
                </div>
                <div className="form-actions">
                  <button type="submit" className="deposit-submit-btn">Deposit</button>
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => {
                      setDepositAccount(null);
                      setDepositForm({ amount: '', description: '' });
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
            </div>
          )}

          {/* Withdraw Form */}
          {withdrawAccount && (
            <div className="section">
            <h2>Withdraw Money</h2>
            <div className="withdraw-form">
              <p>From: {accountSummaryLine(withdrawAccount)} (${withdrawAccount.balance.toFixed(2)})</p>
              <form onSubmit={handleWithdraw}>
                <div className="form-group">
                  <label>Amount:</label>
                  <input
                    type="number"
                    step="0.01"
                    value={withdrawForm.amount}
                    onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
                    placeholder="Enter amount"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Description:</label>
                  <input
                    type="text"
                    value={withdrawForm.description}
                    onChange={(e) => setWithdrawForm({ ...withdrawForm, description: e.target.value })}
                    placeholder="Withdrawal description"
                  />
                </div>
                <div className="form-actions">
                  <button type="submit" className="withdraw-submit-btn">Withdraw</button>
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => {
                      setWithdrawAccount(null);
                      setWithdrawForm({ amount: '', description: '' });
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
            </div>
          )}

          {/* Recent Transactions */}
          <div className={`section${agentHighlight === 'transactions' ? ' section--agent-updated' : ''}`}>
          <h2>Recent Transactions {agentHighlight === 'transactions' && <span className="agent-updated-badge">↻ Updated by Agent</span>}</h2>
          <div className="transactions-table">
            <div className="transaction-header">
              <div className="header-cell">Date</div>
              <div className="header-cell">Type</div>
              <div className="header-cell">Amount</div>
              <div className="header-cell">Description</div>
              <div className="header-cell">Account</div>
              <div className="header-cell">Interface</div>
              <div className="header-cell">User</div>
            </div>
            <div className="transactions-list">
              {transactions
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 20)
                .map(transaction => {
                  const clientInfo = getClientTypeIcon(transaction.clientType);
                  return (
                    <div key={transaction.id} className="transaction-row">
                      <div className="transaction-cell">
                        <span className="transaction-date">
                          {format(new Date(transaction.createdAt), 'MMM dd, yyyy HH:mm')}
                        </span>
                      </div>
                      <div className="transaction-cell">
                        <span className="transaction-type">{transaction.type}</span>
                      </div>
                      <div className="transaction-cell">
                        <span className={`transaction-amount ${isTransactionNegative(transaction) ? 'negative' : 'positive'}`}>
                          {isTransactionNegative(transaction) ? '-' : '+'}
                          ${transaction.amount.toFixed(2)}
                        </span>
                      </div>
                      <div className="transaction-cell">
                        <span className="transaction-description">{transaction.description}</span>
                      </div>
                      <div className="transaction-cell">
                        <span className="transaction-account">{transaction.accountInfo || 'Unknown'}</span>
                      </div>
                      <div className="transaction-cell">
                        <div className="interface-indicator">
                          <span className="interface-icon" style={{ color: clientInfo.color }}>
                            {clientInfo.icon}
                          </span>
                          <span className="interface-label" style={{ color: clientInfo.color }}>
                            {clientInfo.label}
                          </span>
                        </div>
                      </div>
                      <div className="transaction-cell">
                        <span className="transaction-user">{transaction.performedBy || 'Unknown'}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
          </div>
        </main>
      </div>

      {agentUiMode === 'embedded' && (
        <div className="embedded-agent-dock" role="region" aria-label="AI banking assistant">
          <div className="embedded-agent-dock__head">
            <h2 className="embedded-agent-dock__title">AI banking assistant</h2>
            <p className="embedded-agent-dock__lead">
              Natural language and MCP tools along the bottom — step chips show what ran.
            </p>
          </div>
          <div className="embedded-banking-agent embedded-banking-agent--bottom">
            <BankingAgent user={user} onLogout={onLogout} mode="inline" embeddedDockBottom />
          </div>
        </div>
      )}
      </div>

      {/* OAuth Token Info Modal */}
      {showTokenModal && (
        <div className="modal-overlay" onClick={() => setShowTokenModal(false)}>
          <div className="token-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Your Token Chain</h3>
              <button className="close-btn" onClick={() => setShowTokenModal(false)}>×</button>
            </div>
            <div className="modal-content">
              {tokenData ? (
                <div className="token-info">
                  {/* Session summary */}
                  <div className="token-section">
                    <h4>Session</h4>
                    <div className="session-info-grid">
                      <div className="session-row">
                        <span className="session-label">User:</span>
                        <span className="session-value">{tokenData.user?.username} ({tokenData.user?.email})</span>
                      </div>
                      <div className="session-row">
                        <span className="session-label">Role:</span>
                        <span className="session-value">{tokenData.user?.role}</span>
                        <span className="session-label">Provider:</span>
                        <span className="session-value">{tokenData.oauthProvider}</span>
                      </div>
                      <div className="session-row">
                        <span className="session-label">Expires:</span>
                        <span className="session-value">{tokenData.expiresAt ? new Date(tokenData.expiresAt).toLocaleString() : 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {/* User Token section */}
                  {tokenData.accessToken && (
                    <div className="token-section">
                      <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ background: '#1e3a5f', border: '1px solid #3b82f6', borderRadius: '4px', padding: '2px 8px', fontSize: '0.75rem', color: '#93c5fd' }}>👤 User Token</span>
                        <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 'normal' }}>— stays in BFF session, never forwarded to MCP</span>
                        <button type="button" className="token-payload-hint" title="Learn about token exchange" onClick={() => open(EDU.MAY_ACT, 'lifecycle')}>ⓘ</button>
                      </h4>
                      <div style={{ background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '6px', padding: '10px 14px', fontSize: '0.78rem', marginBottom: '8px' }}>
                        <strong style={{ color: '#93c5fd' }}>JWT Header</strong>
                        <pre className="token-json" style={{ margin: '6px 0 0' }}>
                          {JSON.stringify(tokenData.accessToken.header, null, 2)}
                        </pre>
                      </div>
                      <div style={{ background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '6px', padding: '10px 14px', fontSize: '0.78rem', marginBottom: '8px' }}>
                        <strong style={{ color: '#93c5fd' }}>JWT Payload</strong>
                        <button type="button" className="token-payload-hint" title="scope" onClick={() => open(EDU.LOGIN_FLOW, 'tokens')}>ⓘ</button>
                        <pre className="token-json" style={{ margin: '6px 0 0' }}>
                          {JSON.stringify(tokenData.accessToken.payload, null, 2)}
                        </pre>
                      </div>
                      {tokenData.accessToken.payload?.may_act && (
                        <div style={{ background: '#1e3a5f', borderRadius: '6px', padding: '8px 12px', fontSize: '0.8rem', color: '#93c5fd', marginBottom: '8px' }}>
                          ✅ <strong>may_act present</strong> — PingOne will allow the BFF to exchange this User Token.
                          <pre style={{ margin: '4px 0 0', background: 'none', fontSize: '0.75rem' }}>{JSON.stringify(tokenData.accessToken.payload.may_act, null, 2)}</pre>
                        </div>
                      )}
                      {!tokenData.accessToken.payload?.may_act && (
                        <div style={{ background: '#7f1d1d', borderRadius: '6px', padding: '8px 12px', fontSize: '0.8rem', color: '#fca5a5', marginBottom: '8px' }}>
                          ⚠️ <strong>may_act absent</strong> — configure the may_act claim in your PingOne token policy to enable token exchange (RFC 8693).
                        </div>
                      )}
                    </div>
                  )}

                  {/* What changes in the exchange */}
                  <div className="token-section">
                    <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.8rem' }}>→</span>
                      <span style={{ background: '#2d1b69', border: '1px solid #8b5cf6', borderRadius: '4px', padding: '2px 8px', fontSize: '0.75rem', color: '#c4b5fd' }}>Token Exchange (RFC 8693)</span>
                    </h4>
                    <div style={{ background: '#0f172a', border: '1px solid #2d1b69', borderRadius: '6px', padding: '10px 14px', fontSize: '0.82rem' }}>
                      <p style={{ margin: '0 0 8px', color: '#c4b5fd' }}>What changes when the BFF exchanges the User Token for an MCP Token:</p>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #334155' }}>
                            <th style={{ textAlign: 'left', padding: '4px 8px', color: '#94a3b8' }}>Claim</th>
                            <th style={{ textAlign: 'left', padding: '4px 8px', color: '#93c5fd' }}>User Token (before)</th>
                            <th style={{ textAlign: 'left', padding: '4px 8px', color: '#34d399' }}>MCP Token (after)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ padding: '4px 8px', color: '#94a3b8' }}><code>aud</code></td>
                            <td style={{ padding: '4px 8px', color: '#93c5fd' }}>{tokenData.accessToken?.payload?.aud ? (Array.isArray(tokenData.accessToken.payload.aud) ? tokenData.accessToken.payload.aud.join(', ') : String(tokenData.accessToken.payload.aud)).substring(0, 40) + '…' : 'BFF / PingOne client'}</td>
                            <td style={{ padding: '4px 8px', color: '#34d399' }}>MCP Server Resource URI (narrowed)</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '4px 8px', color: '#94a3b8' }}><code>scope</code></td>
                            <td style={{ padding: '4px 8px', color: '#93c5fd' }}>{tokenData.accessToken?.payload?.scope ? String(tokenData.accessToken.payload.scope).substring(0, 40) + '…' : 'broad scopes'}</td>
                            <td style={{ padding: '4px 8px', color: '#34d399' }}>banking:read banking:write (narrowed)</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '4px 8px', color: '#94a3b8' }}><code>may_act</code></td>
                            <td style={{ padding: '4px 8px', color: '#93c5fd' }}>{tokenData.accessToken?.payload?.may_act ? '✅ present' : '⚠️ absent'}</td>
                            <td style={{ padding: '4px 8px', color: '#34d399' }}>removed (no longer needed)</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '4px 8px', color: '#94a3b8' }}><code>act</code></td>
                            <td style={{ padding: '4px 8px', color: '#93c5fd' }}>absent</td>
                            <td style={{ padding: '4px 8px', color: '#34d399' }}>added: {'{ "client_id": "bff" }'}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '4px 8px', color: '#94a3b8' }}><code>sub</code></td>
                            <td style={{ padding: '4px 8px', color: '#93c5fd' }}>user sub (unchanged)</td>
                            <td style={{ padding: '4px 8px', color: '#34d399' }}>user sub (preserved)</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* MCP Token section */}
                  <div className="token-section">
                    <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ background: '#1a2e1a', border: '1px solid #22c55e', borderRadius: '4px', padding: '2px 8px', fontSize: '0.75rem', color: '#86efac' }}>🤖 MCP Token</span>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 'normal' }}>— sent to MCP Server &amp; Banking API</span>
                    </h4>
                    <div style={{ background: '#0f172a', border: '1px solid #1a2e1a', borderRadius: '6px', padding: '10px 14px', fontSize: '0.82rem', color: '#86efac' }}>
                      <p style={{ margin: 0 }}>
                        🔒 The MCP Token is minted server-side on each tool call — it is never stored in the browser or exposed via the API.
                        Make a request via the <strong>AI Agent</strong> panel to see the live MCP Token claims in the <strong>Token Chain</strong> display above.
                      </p>
                    </div>
                  </div>

                  {/* Raw token */}
                  {tokenData.accessToken?.raw && (
                    <div className="token-section">
                      <h4>Raw User Token (JWT)</h4>
                      <div className="token-raw-display">
                        {tokenData.accessToken.raw}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="no-token">
                  <p>No OAuth token data available</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default UserDashboard;
