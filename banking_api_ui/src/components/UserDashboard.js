import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, notifySuccess, notifyError, notifyWarning, notifyInfo } from '../utils/appToast';
import { toastCustomerError } from '../utils/dashboardToast';
import { navigateToCustomerOAuthLogin } from '../utils/authUi';
import { format } from 'date-fns';
import apiClient from '../services/apiClient';
import useChatWidget from '../hooks/useChatWidget';
import { useEducationUI } from '../context/EducationUIContext';
import { EDU } from './education/educationIds';
import TokenChainDisplay from './TokenChainDisplay';
import TransactionConsentModal from './TransactionConsentModal';
import BankingAgent from './BankingAgent';
import AgentUiModeToggle from './AgentUiModeToggle';
import DashboardLayoutToggle from './DashboardLayoutToggle';
import { useIndustryBranding } from '../context/IndustryBrandingContext';
import { getDashboardLayout, setDashboardLayout } from '../utils/dashboardLayout';
import { useAgentUiMode } from '../context/AgentUiModeContext';
import './UserDashboard.css';

const DEMO_ACCOUNTS = [
  { id: 'demo-chk', name: 'Checking Account', accountType: 'checking', accountNumber: 'CHK-DEMO-0001', balance: 4821.50, _demo: true },
  { id: 'demo-sav', name: 'Savings Account',  accountType: 'savings',  accountNumber: 'SAV-DEMO-0001', balance: 12340.00, _demo: true },
];
const DEMO_TRANSACTIONS = [
  { id: 'd1', type: 'deposit',    amount: 2500.00, description: 'Payroll deposit',         accountInfo: 'Checking - CHK-DEMO-0001', createdAt: new Date(Date.now() - 86400000*1).toISOString(), clientType: 'enduser',  performedBy: 'Demo User', _demo: true },
  { id: 'd2', type: 'withdrawal', amount:  150.00, description: 'ATM withdrawal',           accountInfo: 'Checking - CHK-DEMO-0001', createdAt: new Date(Date.now() - 86400000*2).toISOString(), clientType: 'enduser',  performedBy: 'Demo User', _demo: true },
  { id: 'd3', type: 'transfer',   amount:  500.00, description: 'Transfer to savings',      accountInfo: 'Savings - SAV-DEMO-0001',  createdAt: new Date(Date.now() - 86400000*3).toISOString(), clientType: 'ai_agent', performedBy: 'Demo User', _demo: true },
  { id: 'd4', type: 'deposit',    amount:   75.00, description: 'Refund — online purchase', accountInfo: 'Checking - CHK-DEMO-0001', createdAt: new Date(Date.now() - 86400000*5).toISOString(), clientType: 'enduser',  performedBy: 'Demo User', _demo: true },
];

const UserDashboard = ({ user: propUser, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { open } = useEducationUI();
  const { preset } = useIndustryBranding();
  const { placement: agentPlacement } = useAgentUiMode();
  const [dashboardLayout, setDashboardLayoutState] = useState(() => getDashboardLayout());
  const [user, setUser] = useState(propUser);
  const [accounts, setAccounts] = useState([]);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenData, setTokenData] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [switchingRole, setSwitchingRole] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [transferForm, setTransferForm] = useState({
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
  /** Server-issued id for high-value HITL — opens TransactionConsentModal on the dashboard. */
  const [consentChallengeId, setConsentChallengeId] = useState(null);
  const [stepUpRequired, setStepUpRequired] = useState(false);
  // 'ciba' | 'email' — set from the 428 response step_up_method field
  const [stepUpMethod, setStepUpMethod] = useState('email');
  // CIBA step-up state
  const [cibaAuthReqId, setCibaAuthReqId] = useState(null);
  const [cibaStatus, setCibaStatus] = useState('idle'); // 'idle' | 'pending' | 'completed' | 'error'
  const fetchingRef = React.useRef(false);
  /** Holds the agent HITL detail (actionId, form) while the consent modal is open so we can fire the confirmed event. */
  const agentHitlDetailRef = React.useRef(null);

  /** Dashboard chrome theme (persists `bx-dash-theme` for admin + mock HTML). */
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

  useEffect(() => {
    const onLayout = () => setDashboardLayoutState(getDashboardLayout());
    window.addEventListener('banking-dashboard-layout', onLayout);
    return () => window.removeEventListener('banking-dashboard-layout', onLayout);
  }, []);

  /** HITL: open the TransactionConsentModal when the floating agent requests consent. */
  useEffect(() => {
    const onAgentHitl = async (e) => {
      const { intentPayload } = e.detail || {};
      if (!intentPayload) return;
      try {
        const { data } = await apiClient.post('/api/transactions/consent-challenge', intentPayload);
        const cid = data?.challengeId;
        if (!cid) { notifyError('Could not start consent — no challenge id from server.'); return; }
        setConsentChallengeId(cid);
        // Store the original agent intent so we can pass it back on confirmation
        agentHitlDetailRef.current = e.detail;
      } catch (ex) {
        const msg = ex.response?.data?.message || ex.response?.data?.error || ex.message || 'Could not start consent flow.';
        notifyError(msg);
      }
    };
    window.addEventListener('banking-agent-hitl-consent', onAgentHitl);
    return () => window.removeEventListener('banking-agent-hitl-consent', onAgentHitl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Keep localStorage layout aligned with Agent UI (Middle → split, Bottom → classic). */
  useEffect(() => {
    if (agentPlacement === 'middle') {
      setDashboardLayoutState('split3');
      setDashboardLayout('split3');
    } else if (agentPlacement === 'bottom') {
      setDashboardLayoutState('classic');
      setDashboardLayout('classic');
    }
  }, [agentPlacement]);

  const handleDashThemeToggle = useCallback(() => {
    setDashTheme((d) => (d === 'dark' ? 'light' : 'dark'));
  }, []);

  // Initialize chat widget (configuration is handled in index.html)
  useChatWidget();

  // Function to decode JWT token
  const decodeToken = (token) => {
    try {
      if (!token) return null;
      
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      
      const header = JSON.parse(atob(parts[0]));
      const payload = JSON.parse(atob(parts[1]));
      
      return {
        header,
        payload,
        raw: token
      };
    } catch (error) {
      console.error('Error decoding token:', error);
      return null;
    }
  };

  // Function to fetch current OAuth tokens
  const fetchTokenData = async () => {
    try {
      console.log('🔍 Fetching current OAuth token data...');
      
      // Try both admin and user status endpoints
      let response;
      try {
        response = await axios.get('/api/auth/oauth/user/status');
        if (!response.data.authenticated) {
          response = await axios.get('/api/auth/oauth/status');
        }
      } catch (error) {
        response = await axios.get('/api/auth/oauth/status');
      }
      
      if (response.data.authenticated && response.data.accessToken) {
        const decodedAccessToken = decodeToken(response.data.accessToken);
        
        const tokenInfo = {
          accessToken: decodedAccessToken,
          tokenType: response.data.tokenType,
          expiresAt: response.data.expiresAt,
          clientType: response.data.clientType,
          oauthProvider: response.data.oauthProvider,
          user: response.data.user
        };
        
        console.log('✅ Token data fetched:', tokenInfo);
        setTokenData(tokenInfo);
      } else {
        console.log('❌ No authenticated session found');
        setTokenData(null);
      }
    } catch (error) {
      console.error('❌ Error fetching token data:', error);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only load
  }, []);

  useEffect(() => {
    let refreshInterval;
    
    if (autoRefresh) {
      // Refresh every 30 seconds — frequent enough to catch real-time changes,
      // slow enough not to burn Upstash quota or clutter the console.
      refreshInterval = setInterval(() => {
        fetchUserData(true); // Silent refresh - no loading spinner
      }, 30000); // 30 seconds
    }
    
    // Cleanup interval on component unmount or when autoRefresh changes
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- interval uses current fetchUserData; adding it would reset timer too often
  }, [autoRefresh]);

  /** Toast when returning from transaction consent route (success or decline). */
  useEffect(() => {
    const st = location.state;
    if (!st || typeof st !== 'object') return;
    if (typeof st.transactionSuccess === 'string' && st.transactionSuccess.trim()) {
      notifySuccess(st.transactionSuccess.trim());
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: {} });
      return;
    }
    if (st.consentDeclined) {
      notifyInfo(
        'You declined high-value consent. The AI banking assistant stays disabled until you sign out and sign in again.',
      );
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, location.search, navigate]);

  const loadDemoFallback = (reason) => {
    setAccounts(DEMO_ACCOUNTS);
    setTransactions(DEMO_TRANSACTIONS);
    notifyInfo(`Demo mode — ${reason}. Sign in to see your real accounts.`, {
      toastId: 'demo-mode',   // deduplicate across refreshes
      autoClose: 6000,
      icon: '🏦',
    });
  };

  const fetchUserData = async (silent = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      if (!silent) setLoading(true);

      // ── 1. Resolve session ────────────────────────────────────────────────
      let sessionUser = null;
      try {
        const userRes = await axios.get('/api/auth/oauth/user/status');
        if (userRes.data.authenticated) {
          sessionUser = userRes.data.user;
        } else {
          const adminRes = await axios.get('/api/auth/oauth/status');
          if (adminRes.data.authenticated) sessionUser = adminRes.data.user;
        }
      } catch (sessionErr) {
        console.warn('Session check failed:', sessionErr.message);
      }

      if (!sessionUser) {
        // Not logged in — show demo data, no error banner
        if (!silent) loadDemoFallback('no active session');
        return;
      }

      setUser(sessionUser);

      // ── 2. Fetch real account + transaction data ──────────────────────────
      const REAUTH_KEY = 'bx-dashboard-reauth';
      try {
        const [acctRes, txRes] = await Promise.all([
          apiClient.get('/api/accounts/my'),
          apiClient.get('/api/transactions/my'),
        ]);
        // Successful fetch — clear any pending reauth guard
        sessionStorage.removeItem(REAUTH_KEY);
        setAccounts(acctRes.data.accounts || []);
        setTransactions(txRes.data.transactions || []);
      } catch (dataErr) {
        if (dataErr.response?.status === 401) {
          // Log the server-side reason for easier diagnosis — visible in browser console
          const serverReason = dataErr.response?.data?.error_description
            || dataErr.response?.data?.message
            || dataErr.response?.data?.error
            || '(no body)';
          console.warn('Data fetch 401 — server reason:', serverReason, '| REAUTH_KEY:', sessionStorage.getItem(REAUTH_KEY));
          if (!silent) {
            // Token expired or cold-start stub. Redirect to re-auth.
            // PingOne's SSO session usually makes this seamless (no credentials needed).
            // Guard: only auto-redirect once — if a redirect already happened and we still
            // get 401, clear the guard and fall back to the banner so the user can act.
            if (!sessionStorage.getItem(REAUTH_KEY)) {
              sessionStorage.setItem(REAUTH_KEY, '1');
              navigateToCustomerOAuthLogin();
              return;
            }
            sessionStorage.removeItem(REAUTH_KEY);
            toastCustomerError(
              'Session could not be restored after sign-in. Please try signing in again.',
              navigateToCustomerOAuthLogin,
            );
          }
          // silent refresh 401 — ignore; next explicit load will handle it
        } else if (dataErr.response?.status === 403) {
          notifyError('You do not have permission to access this information.');
        } else if (!silent) {
          // API unreachable or 5xx — fall back to demo without blocking the user
          loadDemoFallback('could not reach banking API');
        }
      }

    } finally {
      if (!silent) setLoading(false);
      fetchingRef.current = false;
    }
  };

  // ── CIBA step-up: initiate back-channel authentication ──
  const handleCibaStepUp = useCallback(async () => {
    if (!user?.email) { notifyError('Cannot initiate CIBA: no email on session.'); return; }
    try {
      const { data } = await axios.post('/api/auth/ciba/initiate', {
        loginHint: user.email,
        bindingMessage: 'Approve your banking transaction',
        scope: 'openid profile',
      });
      setCibaAuthReqId(data.authReqId);
      setCibaStatus('pending');
    } catch (err) {
      notifyError('CIBA initiation failed: ' + (err.response?.data?.message || err.message));
    }
  }, [user?.email]);

  const stepUpVerifyHref = useMemo(
    () =>
      `/api/auth/oauth/user/stepup?return_to=${encodeURIComponent(
        (process.env.REACT_APP_CLIENT_URL || 'http://localhost:4000') + '/dashboard'
      )}`,
    []
  );

  /** Clears step-up gate state and dismisses the persistent step-up toast. */
  const dismissStepUp = useCallback(() => {
    setStepUpRequired(false);
    setCibaAuthReqId(null);
    setCibaStatus('idle');
    toast.dismiss('customer-step-up');
  }, []);

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
          notifySuccess('Identity verified — please retry your transaction.');
        } else if (data.status === 'failed' || data.status === 'expired' || data.status === 'error') {
          setCibaStatus('error');
          setCibaAuthReqId(null);
          notifyError(`CIBA verification ${data.status}. Please try again.`);
        }
      } catch (_) { /* keep polling */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [cibaAuthReqId, cibaStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Step-up MFA (428): persistent warning toast with verify actions (replaces inline banner). */
  useEffect(() => {
    if (!stepUpRequired) {
      toast.dismiss('customer-step-up');
      return;
    }

    const onToastClosed = () => {
      setStepUpRequired(false);
      setCibaAuthReqId(null);
      setCibaStatus('idle');
    };

    const body = (
      <div className="dashboard-toast-error" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <p className="dashboard-toast-error__text" style={{ marginBottom: 8 }}>
          <strong>Additional verification required.</strong>{' '}
          Transfers and withdrawals of $250 or more require MFA. Verify your identity to continue.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {stepUpMethod === 'ciba' ? (
            <>
              {cibaStatus === 'idle' && (
                <button type="button" className="dashboard-toast-error__btn" onClick={handleCibaStepUp}>
                  Verify via CIBA
                </button>
              )}
              {cibaStatus === 'pending' && (
                <span style={{ fontStyle: 'italic' }}>Waiting for approval on your device…</span>
              )}
              {cibaStatus === 'error' && (
                <button
                  type="button"
                  className="dashboard-toast-error__btn"
                  onClick={() => { setCibaStatus('idle'); setCibaAuthReqId(null); }}
                >
                  Retry
                </button>
              )}
            </>
          ) : (
            <a
              href={stepUpVerifyHref}
              className="dashboard-toast-error__btn"
              style={{ textDecoration: 'none', display: 'inline-block' }}
            >
              Verify now
            </a>
          )}
          <button type="button" className="dashboard-toast-error__btn" onClick={dismissStepUp}>
            Dismiss
          </button>
        </div>
      </div>
    );

    const opts = {
      toastId: 'customer-step-up',
      autoClose: false,
      closeOnClick: false,
      onClose: onToastClosed,
    };

    if (toast.isActive('customer-step-up')) {
      toast.update('customer-step-up', { render: body, ...opts });
    } else {
      toast.warning(body, opts);
    }
  }, [stepUpRequired, stepUpMethod, cibaStatus, handleCibaStepUp, dismissStepUp, stepUpVerifyHref]);

  // Demo mode: true when accounts haven't been replaced by real API data
  const isDemoMode = accounts.length > 0 && accounts.every(a => a._demo);

  const totalBalance = useMemo(
    () => accounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0),
    [accounts]
  );

  const accountsAnchorRef = useRef(null);
  const agentColumnRef = useRef(null);

  const handleScrollToAccounts = useCallback(() => {
    accountsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleScrollToAssistant = useCallback(() => {
    if (dashboardLayout === 'split3' && agentColumnRef.current) {
      agentColumnRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  }, [dashboardLayout]);

  /**
   * High-value HITL: POST /transactions without consent returns 400; create a session challenge and open the consent popup.
   */
  const openConsentFlowForPayload = async (intentBody) => {
    try {
      const { data } = await apiClient.post('/api/transactions/consent-challenge', intentBody);
      const cid = data?.challengeId;
      if (!cid) {
        notifyError('Could not start consent — no challenge id from server.');
        return;
      }
      setConsentChallengeId(cid);
    } catch (e) {
      const msg =
        e.response?.data?.message || e.response?.data?.error || e.message || 'Could not start consent flow.';
      notifyError(msg);
    }
  };

  // Simulate a transaction locally (demo mode only)
  const applyDemoTransaction = (type, amount, fromId, toId, description) => {
    const now = new Date().toISOString();
    const newTx = {
      id: `demo-${Date.now()}`,
      type,
      amount,
      description: description || `Demo ${type}`,
      accountInfo: (() => {
        const acc = accounts.find(a => a.id === (fromId || toId));
        return acc ? `${acc.accountType.charAt(0).toUpperCase() + acc.accountType.slice(1)} - ${acc.accountNumber}` : 'Demo Account';
      })(),
      createdAt: now,
      clientType: 'enduser',
      performedBy: user?.name || user?.username || 'Demo User',
      _demo: true,
    };
    setTransactions(prev => [newTx, ...prev]);
    setAccounts(prev => prev.map(a => {
      if (a.id === fromId) return { ...a, balance: Math.max(0, a.balance - amount) };
      if (a.id === toId)   return { ...a, balance: a.balance + amount };
      return a;
    }));
  };

  const handleTransfer = async (e) => {
    e.preventDefault();

    if (!selectedAccount || !transferForm.toAccountId || !transferForm.amount) {
      notifyWarning('Please fill in all transfer details');
      return;
    }

    if (isDemoMode) {
      applyDemoTransaction('transfer', parseFloat(transferForm.amount), selectedAccount.id, transferForm.toAccountId, transferForm.description || 'Demo transfer');
      setTransferForm({ toAccountId: '', amount: '', description: '' });
      setSelectedAccount(null);
      notifySuccess('Demo transfer completed!');
      return;
    }

    try {
      await apiClient.post('/api/transactions', {
        fromAccountId: selectedAccount.id,
        toAccountId: transferForm.toAccountId,
        amount: parseFloat(transferForm.amount),
        type: 'transfer',
        description: transferForm.description || 'Transfer between accounts',
        userId: user.id
      });

      // Reset form and refresh data
      setTransferForm({ toAccountId: '', amount: '', description: '' });
      setSelectedAccount(null);
      await fetchUserData();

      notifySuccess('Transfer completed successfully!');
    } catch (error) {
      console.error('Transfer error:', error);
      const d = error.response?.data;
      if (error.response?.status === 400 && d?.error === 'consent_challenge_required') {
        await openConsentFlowForPayload({
          fromAccountId: selectedAccount.id,
          toAccountId: transferForm.toAccountId,
          amount: parseFloat(transferForm.amount),
          type: 'transfer',
          description: transferForm.description || 'Transfer between accounts',
        });
        return;
      }
      if (error.response?.status === 428) {
        setStepUpMethod(error.response.data?.step_up_method || 'email');
        setCibaStatus('idle');
        setStepUpRequired(true);
      } else if (error.response?.status === 403) {
        notifyError('You do not have permission to perform transfers. Please contact your administrator.');
      } else {
        notifyError(error.response?.data?.error || 'Transfer failed');
      }
    }
  };

  const handleDeposit = async (e) => {
    e.preventDefault();

    if (!depositAccount || !depositForm.amount) {
      notifyWarning('Please fill in all deposit details');
      return;
    }

    if (isDemoMode) {
      applyDemoTransaction('deposit', parseFloat(depositForm.amount), null, depositAccount.id, depositForm.description || 'Demo deposit');
      setDepositForm({ amount: '', description: '' });
      setDepositAccount(null);
      notifySuccess('Demo deposit completed!');
      return;
    }

    try {
      await apiClient.post('/api/transactions', {
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

      notifySuccess('Deposit completed successfully!');
    } catch (error) {
      console.error('Deposit error:', error);
      const d = error.response?.data;
      if (error.response?.status === 400 && d?.error === 'consent_challenge_required') {
        await openConsentFlowForPayload({
          fromAccountId: null,
          toAccountId: depositAccount.id,
          amount: parseFloat(depositForm.amount),
          type: 'deposit',
          description: depositForm.description || 'Deposit to account',
        });
        return;
      }
      if (error.response?.status === 428) {
        setStepUpMethod(error.response.data?.step_up_method || 'email');
        setCibaStatus('idle');
        setStepUpRequired(true);
      } else if (error.response?.status === 403) {
        notifyError('You do not have permission to make deposits. Please contact your administrator.');
      } else {
        notifyError(error.response?.data?.error || 'Deposit failed');
      }
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();

    if (!withdrawAccount || !withdrawForm.amount) {
      notifyWarning('Please fill in all withdrawal details');
      return;
    }

    if (isDemoMode) {
      const amt = parseFloat(withdrawForm.amount);
      if (amt > withdrawAccount.balance) { notifyWarning('Insufficient demo balance'); return; }
      applyDemoTransaction('withdrawal', amt, withdrawAccount.id, null, withdrawForm.description || 'Demo withdrawal');
      setWithdrawForm({ amount: '', description: '' });
      setWithdrawAccount(null);
      notifySuccess('Demo withdrawal completed!');
      return;
    }

    try {
      await apiClient.post('/api/transactions', {
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

      notifySuccess('Withdrawal completed successfully!');
    } catch (error) {
      console.error('Withdrawal error:', error);
      const d = error.response?.data;
      if (error.response?.status === 400 && d?.error === 'consent_challenge_required') {
        await openConsentFlowForPayload({
          fromAccountId: withdrawAccount.id,
          toAccountId: null,
          amount: parseFloat(withdrawForm.amount),
          type: 'withdrawal',
          description: withdrawForm.description || 'Withdrawal from account',
        });
        return;
      }
      if (error.response?.status === 428) {
        setStepUpMethod(error.response.data?.step_up_method || 'email');
        setCibaStatus('idle');
        setStepUpRequired(true);
      } else if (error.response?.status === 403) {
        notifyError('You do not have permission to make withdrawals. Please contact your administrator.');
      } else {
        notifyError(error.response?.data?.error || 'Withdrawal failed');
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

  const renderBankingMain = () => (
    <>
        {/* Hero: balance, AI insight, lightweight viz (2026 “financial butler” pattern) */}
        <div className="section ud-hero" aria-labelledby="ud-hero-heading">
          <div className="ud-hero__top">
            <p className="ud-hero__eyebrow" id="ud-hero-heading">
              {format(new Date(), 'EEEE, MMM d')}
            </p>
            <p className="ud-hero__insight" role="status">
              {isDemoMode
                ? 'Demo snapshot — connect real accounts to unlock personalized cash-flow and savings nudges from the assistant.'
                : dashboardLayout === 'split3'
                  ? 'Your balances update automatically. Ask the assistant in the center column for transfers, explanations, or spending patterns.'
                  : 'Your balances update automatically. Ask the assistant below for transfers, explanations, or spending patterns.'}
            </p>
          </div>
          <p className="ud-hero__balance-label">Total balance</p>
          <p className="ud-hero__balance" aria-live="polite">
            ${totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <div className="ud-hero__spark" aria-hidden="true" title="Illustrative activity trend">
            <span style={{ height: '40%' }} /><span style={{ height: '65%' }} /><span style={{ height: '55%' }} />
            <span style={{ height: '78%' }} /><span style={{ height: '62%' }} /><span style={{ height: '88%' }} /><span style={{ height: '72%' }} />
          </div>
        </div>

        {/* Proactive actions — reduce menu depth (mobile-first tap targets) */}
        <div className="section ud-quick-actions" aria-label="Quick actions">
          <h2 className="ud-quick-actions__title">Quick actions</h2>
          <div className="ud-quick-actions__row">
            <button type="button" className="ud-qa-btn" onClick={handleScrollToAccounts}>
              Move money
            </button>
            <button type="button" className="ud-qa-btn" onClick={handleScrollToAccounts}>
              Add funds
            </button>
            <button type="button" className="ud-qa-btn ud-qa-btn--accent" onClick={handleScrollToAssistant}>
              Ask assistant
            </button>
            <Link to="/delegated-access" className="ud-qa-btn ud-qa-btn--delegate">
              👥 Delegated access
            </Link>
          </div>
        </div>

        {/* Trust + omnichannel / super-app cues (copy only in this demo) */}
        <div className="ud-trust-strip" role="status">
          <span className="ud-trust-strip__item">Session secured (OAuth)</span>
          <span className="ud-trust-strip__dot" aria-hidden="true" />
          <span className="ud-trust-strip__item">Step-up when risk warrants</span>
          <span className="ud-trust-strip__dot" aria-hidden="true" />
          <span className="ud-trust-strip__item">Biometrics on supported devices</span>
          <span className="ud-trust-strip__dot" aria-hidden="true" />
          <a
            href="/api/auth/debug?deep=1"
            target="_blank"
            rel="noopener noreferrer"
            className="ud-trust-strip__item ud-trust-strip__item--debug"
            title="Inspect session and Upstash store health"
          >Session debug</a>
        </div>
        <div className="ud-super-pills" aria-label="More capabilities (demo)">
          <span className="ud-super-pill" title="Demo placeholder">Insights</span>
          <span className="ud-super-pill" title="Demo placeholder">Goals</span>
          <span className="ud-super-pill" title="Demo placeholder">Payments hub</span>
        </div>

        {/* Customer Profile */}
        <div className="section">
          <h2>Account Holder</h2>
          <div className="ud-profile-meta">
            <div><strong>Name:&nbsp;</strong>
              {(user?.firstName || user?.lastName)
                ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                : user?.name || user?.username || '—'}
            </div>
            <div><strong>Email:&nbsp;</strong>{user?.email || user?.username || '—'}</div>
            <div><strong>Role:&nbsp;</strong><span style={{ textTransform: 'capitalize' }}>{user?.role || (isDemoMode ? 'demo' : 'customer')}</span></div>
            {isDemoMode && (
              <span style={{ background: '#e5e7eb', color: '#6b7280', borderRadius: 4, padding: '1px 8px', fontSize: '0.75rem', alignSelf: 'center' }}>
                🏦 Demo mode
              </span>
            )}
          </div>
        </div>

        {/* Account Summary */}
        <div ref={accountsAnchorRef} className="section">
          <h2>Your Accounts</h2>
          {isDemoMode && (
            <p className="demo-notice" style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              Demo mode — sign in to use your real accounts
            </p>
          )}
          <div className="accounts-grid">
            {accounts.map(account => (
              <div key={account.id} className="account-card" style={account._demo ? { opacity: 0.65 } : {}}>
                <div className="account-header">
                  <h3>{account.name}</h3>
                  <span className={`account-type-badge ${(account.accountType || account.type || 'unknown').toLowerCase()}`}>
                    {(account.accountType || account.type) ?
                      (account.accountType || account.type).charAt(0).toUpperCase() + (account.accountType || account.type).slice(1) :
                      'Unknown'}
                  </span>
                  {account._demo && <span style={{ marginLeft: 6, fontSize: '0.7rem', background: '#e5e7eb', color: '#6b7280', borderRadius: 4, padding: '1px 5px' }}>demo</span>}
                </div>
                <p className="account-number">Account: {account.accountNumber}</p>
                <p className="balance">Balance: ${account.balance.toFixed(2)}</p>
                <div className="account-actions">
                  <button
                    className="select-account-btn"
                    onClick={() => setSelectedAccount(account)}
                  >
                    Select for Transfer
                  </button>
                  <button
                    className="deposit-btn"
                    onClick={() => setDepositAccount(account)}
                  >
                    Deposit
                  </button>
                  <button
                    className="withdraw-btn"
                    onClick={() => setWithdrawAccount(account)}
                  >
                    Withdraw
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Transfer Form */}
        {selectedAccount && (
          <div className="section">
            <h2>Transfer Money</h2>
            <div className="transfer-form">
              <p>From: {selectedAccount.accountType} - {selectedAccount.accountNumber} (${selectedAccount.balance.toFixed(2)})</p>
              <form onSubmit={handleTransfer}>
                <div className="form-group">
                  <label>To Account:</label>
                  <select
                    value={transferForm.toAccountId}
                    onChange={(e) => setTransferForm({ ...transferForm, toAccountId: e.target.value })}
                    required
                  >
                    <option value="">Select destination account</option>
                    {accounts
                      .filter(account => account.id !== selectedAccount.id)
                      .map(account => (
                        <option key={account.id} value={account.id}>
                          {account.accountType} - {account.accountNumber} (${account.balance.toFixed(2)})
                        </option>
                      ))
                    }
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
                      setSelectedAccount(null);
                      setTransferForm({ toAccountId: '', amount: '', description: '' });
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
              <p>To: {depositAccount.accountType} - {depositAccount.accountNumber} (${depositAccount.balance.toFixed(2)})</p>
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
              <p>From: {withdrawAccount.accountType} - {withdrawAccount.accountNumber} (${withdrawAccount.balance.toFixed(2)})</p>
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
        <div className="section">
          <h2>Recent Transactions</h2>
          {isDemoMode && (
            <p className="demo-notice" style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              Demo mode — sign in to see your real transactions
            </p>
          )}
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
                    <div key={transaction.id} className="transaction-row" style={transaction._demo ? { opacity: 0.55 } : {}}>
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


    </>
  );

  if (loading) {
    return (
      <div className="user-dashboard">
        <div className="loading">Loading your account information...</div>
      </div>
    );
  }

  return (
    <div
      className={`user-dashboard user-dashboard--2026${
        agentPlacement === 'bottom' && dashboardLayout === 'classic' ? ' user-dashboard--embed-agent' : ''
      }${agentPlacement === 'middle' ? ' user-dashboard--split3' : ''}`}
    >
      <a href="#main-dashboard-content" className="dash-skip-link">
        Skip to main content
      </a>
      {/* ── Header stack: branding row + toolbar row ────────────────── */}
      <div className="dashboard-header-stack">
        <div className="dashboard-header dashboard-header--surface">
          {/* LEFT: logo + title + nav shortcuts */}
          <div className="bank-branding">
            <div className="bank-logo">
              <div className="logo-icon">
                <div className="logo-square"></div>
                <div className="logo-square"></div>
                <div className="logo-square"></div>
                <div className="logo-square"></div>
              </div>
              <span className="bank-name">{preset.shortName}</span>
            </div>
            <div>
              <h1 className="dashboard-header__title">Overview</h1>
              <div className="dashboard-header__crumbs">
                <Link to="/" className="dashboard-header__crumb-link">Home</Link>
                <span className="dashboard-header__crumb-sep" aria-hidden="true">›</span>
                <Link to="/dashboard" className="dashboard-header__crumb-link dashboard-header__crumb-link--current">Dashboard</Link>
              </div>
            </div>
          </div>
          {/* RIGHT: greeting + email */}
          <div className="header-right">
            <div className="user-info">
              <span className="user-greeting">
                Hello, {
                  (user?.firstName || user?.lastName)
                    ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                    : user?.name || user?.username || user?.email?.split('@')[0] || 'there'
                }
              </span>
              <span className="user-email">{user?.email || user?.username}</span>
            </div>
          </div>
        </div>

        {/* Toolbar row */}
        <div className="dashboard-toolbar" role="toolbar" aria-label="Dashboard actions">
          <div className="dashboard-toolbar__agent-layout">
            <AgentUiModeToggle variant="eduBar" />
            <DashboardLayoutToggle />
          </div>
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
          <Link
            to="/demo-data"
            className="dashboard-toolbar-btn"
            title="Sandbox accounts, balances, and MFA threshold"
          >
            Demo config
          </Link>
          <Link
            to="/config"
            className="dashboard-toolbar-btn"
            title="PingOne environment and OAuth client settings"
          >
            PingOne config
          </Link>
          <button
            type="button"
            className="dashboard-toolbar-btn"
            onClick={() => window.open('/api-traffic', 'ApiTraffic', 'width=1400,height=900,scrollbars=yes,resizable=yes')}
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
          <button
            type="button"
            onClick={openTokenModal}
            className="dashboard-toolbar-btn dashboard-toolbar-btn--icon"
            title="View OAuth Token Info"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.22,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.22,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.68 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z"/>
            </svg>
            <span className="dashboard-toolbar-btn__sr">Token info</span>
          </button>
          {/* P2 — Role switch: re-login as admin without a full logout cycle */}
          <button
            type="button"
            disabled={switchingRole}
            onClick={async () => {
              setSwitchingRole(true);
              try {
                const res = await apiClient.post('/api/auth/switch', { targetRole: 'admin' });
                window.location.href = res.data.redirectUrl;
              } catch (err) {
                notifyError(err.response?.data?.message || 'Role switch unavailable — admin client not configured.');
                setSwitchingRole(false);
              }
            }}
            className="dashboard-toolbar-btn"
            title="Re-login as an admin without signing out"
          >
            {switchingRole ? 'Switching…' : 'Switch to Admin view'}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="dashboard-toolbar-btn dashboard-toolbar-btn--danger"
          >
            Log out
          </button>
        </div>
      </div>

      {/* ── Token | (split: agent + banking columns) | classic: banking + float reserve ── */}
      {agentPlacement === 'middle' ? (
        <div className="dashboard-content ud-body ud-body--2026 ud-body--dashboard-split3">
          <aside className="ud-token-rail" aria-label="Token chain">
            <div className="section ud-token-rail__inner">
              <TokenChainDisplay />
            </div>
          </aside>

          <section className="ud-agent-column" ref={agentColumnRef} aria-label="AI banking assistant">
            <div className="embedded-banking-agent ud-dashboard-inline-agent">
              <BankingAgent
                user={user}
                onLogout={onLogout}
                mode="inline"
                embeddedFocus="banking"
                distinctFloatingChrome
                splitColumnChrome
              />
            </div>
          </section>

          <main className="ud-center ud-banking-column" id="main-dashboard-content" tabIndex={-1}>
            {renderBankingMain()}
          </main>
        </div>
      ) : (
        <div className="dashboard-content ud-body ud-body--2026 ud-body--floating ud-body--design-3col">
          <aside className="ud-token-rail" aria-label="Token chain">
            <div className="section ud-token-rail__inner">
              <TokenChainDisplay />
            </div>
          </aside>

          <main className="ud-center" id="main-dashboard-content" tabIndex={-1}>
            {renderBankingMain()}
          </main>

          <aside className="ud-float-reserve" aria-hidden="true">
            <div className="ud-float-reserve__card">
              <span className="ud-float-reserve__label">Floating assistant</span>
              <p className="ud-float-reserve__hint">
                The corner FAB and panel stay in this zone so your balances and token flow stay readable.
              </p>
            </div>
          </aside>
        </div>
      )}

      {consentChallengeId && (
        <TransactionConsentModal
          open
          challengeId={consentChallengeId}
          user={user}
          onClose={() => { setConsentChallengeId(null); agentHitlDetailRef.current = null; }}
          onTransactionSuccess={(msg) => {
            const agentDetail = agentHitlDetailRef.current;
            setConsentChallengeId(null);
            agentHitlDetailRef.current = null;
            notifySuccess(msg);
            void fetchUserData(true);
            // If the consent was triggered from the floating agent, notify it so it
            // can show a success message in the chat panel.
            if (agentDetail) {
              window.dispatchEvent(new CustomEvent('banking-agent-hitl-confirmed', {
                detail: { actionId: agentDetail.actionId, successMsg: msg },
              }));
            }
          }}
          onDeclinedConfirmed={() => {
            setConsentChallengeId(null);
            notifyInfo(
              'You declined high-value consent. The AI banking assistant stays disabled until you sign out and sign in again.',
            );
          }}
        />
      )}

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
                        <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 'normal' }}>— stays in Backend-for-Frontend (BFF) session, never forwarded to MCP</span>
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
                          ✅ <strong>may_act present</strong> — PingOne will allow the Backend-for-Frontend (BFF) to exchange this User Token.
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
                      <p style={{ margin: '0 0 8px', color: '#c4b5fd' }}>What changes when the Backend-for-Frontend (BFF) exchanges the User Token for an MCP Token:</p>
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
                            <td style={{ padding: '4px 8px', color: '#93c5fd' }}>{tokenData.accessToken?.payload?.aud ? (Array.isArray(tokenData.accessToken.payload.aud) ? tokenData.accessToken.payload.aud.join(', ') : String(tokenData.accessToken.payload.aud)).substring(0, 40) + '…' : 'Backend-for-Frontend (BFF) / PingOne client'}</td>
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
                  {tokenData.accessToken && (
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
