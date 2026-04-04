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
import ExchangeModeToggle from './ExchangeModeToggle';
import TransactionConsentModal from './TransactionConsentModal';
import BankingAgent from './BankingAgent';
import EmbeddedAgentDock from './EmbeddedAgentDock';
import AgentUiModeToggle from './AgentUiModeToggle';
import DashboardLayoutToggle from './DashboardLayoutToggle';
import { useIndustryBranding } from '../context/IndustryBrandingContext';
import { getDashboardLayout, setDashboardLayout } from '../utils/dashboardLayout';
import { useAgentUiMode } from '../context/AgentUiModeContext';
import Fido2Challenge from './Fido2Challenge';
import './UserDashboard.css';

/** Format a number as USD currency — $1,234.56 */
const fmt = (n) =>
  typeof n === 'number'
    ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '$0.00';

/** Account types whose balances represent money owed (liabilities), not assets. */
const DEBT_TYPES = new Set(['car_loan', 'mortgage', 'credit']);

const DEMO_ACCOUNTS = [
  { id: 'demo-chk', name: 'Checking Account', accountType: 'checking', accountNumber: 'CHK-DEMO-0001', balance: 3000.00, _demo: true },
  { id: 'demo-sav', name: 'Savings Account',  accountType: 'savings',  accountNumber: 'SAV-DEMO-0001', balance: 2000.00, _demo: true },
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
  /** Middle layout: auto-opens when placement is 'middle'; collapses via FAB click. */
  const [middleAgentOpen, setMiddleAgentOpen] = useState(() => agentPlacement === 'middle');
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
  const [autoRefresh, setAutoRefresh] = useState(false);
  /** Server-issued id for high-value HITL — opens TransactionConsentModal on the dashboard. */
  const [consentChallengeId, setConsentChallengeId] = useState(null);
  /** True when the HITL was triggered via AgentConsentModal — skip consent step, go straight to OTP. */
  const [agentHitlAutoConfirm, setAgentHitlAutoConfirm] = useState(false);
  const [stepUpRequired, setStepUpRequired] = useState(false);
  // 'ciba' | 'email' — set from the 428 response step_up_method field
  const [stepUpMethod, setStepUpMethod] = useState('email');
  // CIBA step-up state
  const [cibaAuthReqId, setCibaAuthReqId] = useState(null);
  const [cibaStatus, setCibaStatus] = useState('idle'); // 'idle' | 'pending' | 'completed' | 'error'
  const [agentTriggeredStepUp, setAgentTriggeredStepUp] = useState(false);
  const [agentCountdown, setAgentCountdown] = useState(0);
  // Email OTP step-up modal state
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [otpEmail, setOtpEmail] = useState('');
  const [otpDaId, setOtpDaId] = useState(null);
  const [otpDeviceId, setOtpDeviceId] = useState(null);
  // TOTP step-up modal state
  const [totpModalOpen, setTotpModalOpen] = useState(false);
  const [totpDaId, setTotpDaId] = useState(null);
  const [totpDeviceId, setTotpDeviceId] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpError, setTotpError] = useState(null);
  const [totpSubmitting, setTotpSubmitting] = useState(false);
  // Push notification step-up state
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [pushDaId, setPushDaId] = useState(null);
  const [pushPolling, setPushPolling] = useState(false);
  // Device picker state (shown when multiple MFA devices enrolled)
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);
  const [devicePickerDevices, setDevicePickerDevices] = useState([]);
  const [devicePickerDaId, setDevicePickerDaId] = useState(null);
  // FIDO2 passkey step-up state
  const [fido2ModalOpen, setFido2ModalOpen] = useState(false);
  const [fido2DaId, setFido2DaId] = useState(null);
  const [fido2DeviceId, setFido2DeviceId] = useState(null);
  const autoInitiateTimerRef = useRef(null);    // [t1, t2, t3] setTimeout IDs
  const handleCibaStepUpRef  = useRef(null);    // stays current — avoids stale closure
  const handleInitiateOtpRef = useRef(null);    // stays current — avoids stale closure
  const stepUpVerifyHrefRef  = useRef(null);    // stays current — avoids stale closure
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
      const { intentPayload, autoConfirm } = e.detail || {};
      if (!intentPayload) return;
      try {
        const { data } = await apiClient.post('/api/transactions/consent-challenge', intentPayload);
        const cid = data?.challengeId;
        if (!cid) { notifyError('Could not start consent — no challenge id from server.'); return; }
        setConsentChallengeId({ id: cid, snapshot: data.snapshot || null });
        setAgentHitlAutoConfirm(!!autoConfirm);
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

  /** Refresh balances silently after any agent write action (deposit/withdraw/transfer). */
  useEffect(() => {
    const onAgentResult = (e) => {
      const type = e?.detail?.type;
      // 'confirm' covers deposit, withdraw, and transfer success responses.
      // 'accounts' and 'transactions' are read-only — no balance change.
      if (type === 'confirm') {
        fetchUserData(true);
      }
    };
    window.addEventListener('banking-agent-result', onAgentResult);
    return () => window.removeEventListener('banking-agent-result', onAgentResult);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchUserData identity is stable; adding it would re-register on every render
  }, []);

  /** Keep localStorage layout aligned with Agent UI (Middle → split, Bottom → classic). */
  useEffect(() => {
    if (agentPlacement === 'middle') {
      setMiddleAgentOpen(true);
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
  // eslint-disable-next-line no-unused-vars
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
      const { data } = await axios.get('/api/auth/oauth/token-claims');
      if (data.authenticated && data.decoded) {
        setTokenData(data);
      } else {
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

  // Refresh accounts whenever the Demo config page saves (new/edited accounts, balances).
  // UserDashboard stays mounted while the user navigates to /demo-data and back, so we
  // can't rely on remount — we listen for the event instead.
  useEffect(() => {
    const onDemoSaved = () => fetchUserData(true);
    window.addEventListener('demoScenarioUpdated', onDemoSaved);
    return () => window.removeEventListener('demoScenarioUpdated', onDemoSaved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Guard: do not overwrite real account data if the user is already authenticated.
    // This prevents a race condition where a momentary session blip on layout-switch
    // reload causes DEMO_ACCOUNTS to replace real accounts (todo #11).
    if (!user) {
      setAccounts(DEMO_ACCOUNTS);
      setTransactions(DEMO_TRANSACTIONS);
    }
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

  /** Initiate PingOne MFA challenge and route to correct modal by device type. */
  const handleInitiateOtp = useCallback(async () => {
    try {
      const { data } = await apiClient.post('/api/auth/mfa/challenge');
      const devices = data.devices || [];
      if (!devices.length) {
        notifyError('No MFA devices enrolled. Please enroll a device in PingOne.');
        return;
      }
      setStepUpRequired(false);
      toast.dismiss('customer-step-up');
      // Route by device type — single device: auto-route; multiple: show picker
      if (devices.length > 1) {
        setDevicePickerDevices(devices);
        setDevicePickerDaId(data.daId);
        setDevicePickerOpen(true);
        return;
      }
      const device = devices[0];
      if (device.type === 'EMAIL' || device.type === 'SMS') {
        await apiClient.put(`/api/auth/mfa/challenge/${data.daId}`, { deviceId: device.id });
        setOtpDaId(data.daId);
        setOtpDeviceId(device.id);
        setOtpEmail(user?.email || device.nickname || '');
        setOtpCode('');
        setOtpError('');
        setOtpModalOpen(true);
      } else if (device.type === 'TOTP') {
        await handleTotpChallengeRef.current(data.daId, device);
      } else if (device.type === 'MOBILE') {
        await handlePushChallengeRef.current(data.daId, device);
      } else if (device.type === 'FIDO2') {
        handleFido2Challenge(data.daId, device);
      } else {
        // Unknown device type: show picker
        setDevicePickerDevices(devices);
        setDevicePickerDaId(data.daId);
        setDevicePickerOpen(true);
      }
    } catch (err) {
      notifyError('Could not initiate MFA: ' + (err.response?.data?.message || err.message));
    }
  }, [user]);

  /** Select a device from the picker and route to the correct challenge modal. */
  const handleDevicePick = useCallback(async (device) => {
    try {
      const daId = devicePickerDaId;
      setDevicePickerOpen(false);
      if (device.type === 'EMAIL' || device.type === 'SMS') {
        await apiClient.put(`/api/auth/mfa/challenge/${daId}`, { deviceId: device.id });
        setOtpDaId(daId);
        setOtpDeviceId(device.id);
        setOtpEmail(user?.email || device.nickname || '');
        setOtpCode('');
        setOtpError('');
        setOtpModalOpen(true);
      } else if (device.type === 'TOTP') {
        await handleTotpChallengeRef.current(daId, device);
      } else if (device.type === 'MOBILE') {
        await handlePushChallengeRef.current(daId, device);
      } else if (device.type === 'FIDO2') {
        handleFido2Challenge(daId, device);
      }
    } catch (err) {
      notifyError('Could not select device: ' + (err.response?.data?.message || err.message));
    }
  }, [devicePickerDaId, user]);

  /** Select FIDO2 device, set ASSERTION_REQUIRED, then open Fido2Challenge overlay. */
  const handleFido2Challenge = (daId, device) => {
    axios.put(`/api/auth/mfa/challenge/${daId}`, { deviceId: device.id })
      .then(() => {
        setFido2DaId(daId);
        setFido2DeviceId(device.id);
        setFido2ModalOpen(true);
        setDevicePickerOpen(false);
      })
      .catch((err) => {
        notifyError(err.response?.data?.message || 'Failed to initiate passkey challenge.');
      });
  };

  const handleTotpChallengeRef = useRef(null);
  const handlePushChallengeRef  = useRef(null);

  /** Select a TOTP device and open the TOTP code entry modal. */
  const handleTotpChallenge = useCallback(async (daId, device) => {
    try {
      await apiClient.put(`/api/auth/mfa/challenge/${daId}`, { deviceId: device.id });
      setTotpDaId(daId);
      setTotpDeviceId(device.id);
      setTotpCode('');
      setTotpError(null);
      setTotpModalOpen(true);
    } catch (err) {
      notifyError('Could not initiate TOTP challenge: ' + (err.response?.data?.message || err.message));
    }
  }, []);

  /** Verify a TOTP code. */
  const handleTotpSubmit = useCallback(async () => {
    setTotpSubmitting(true);
    setTotpError(null);
    try {
      const { data } = await apiClient.put(`/api/auth/mfa/challenge/${totpDaId}`, {
        deviceId: totpDeviceId,
        otp: totpCode,
      });
      if (!data.completed) {
        setTotpError('Incorrect code. Please check your authenticator app and try again.');
        return;
      }
      setTotpModalOpen(false);
      setTotpCode('');
      setStepUpRequired(false);
      notifySuccess(agentTriggeredStepUp ? 'Identity verified \u2014 resuming agent request\u2026' : 'Identity verified \u2014 please retry your transaction.');
      if (agentTriggeredStepUp) {
        setAgentTriggeredStepUp(false);
        window.dispatchEvent(new CustomEvent('cibaStepUpApproved'));
      }
    } catch (err) {
      setTotpError(err.response?.data?.message || 'Incorrect code. Please try again.');
    } finally {
      setTotpSubmitting(false);
    }
  }, [totpDaId, totpDeviceId, totpCode, agentTriggeredStepUp]);

  /** Select a push (MOBILE) device and open the push waiting panel. */
  const handlePushChallenge = useCallback(async (daId, device) => {
    try {
      await apiClient.put(`/api/auth/mfa/challenge/${daId}`, { deviceId: device.id });
      setPushDaId(daId);
      setPushPolling(true);
      setPushModalOpen(true);
    } catch (err) {
      notifyError('Could not send push notification: ' + (err.response?.data?.message || err.message));
    }
  }, []);

  /** Verify the OTP code via PingOne MFA; on success resume the pending agent action. */
  const handleVerifyOtp = useCallback(async () => {
    setOtpSubmitting(true);
    setOtpError('');
    try {
      const { data } = await apiClient.put(`/api/auth/mfa/challenge/${otpDaId}`, {
        deviceId: otpDeviceId,
        otp: otpCode,
      });
      if (!data.completed) {
        setOtpError('Incorrect code. Please try again.');
        return;
      }
      setOtpModalOpen(false);
      setOtpCode('');
      setAgentTriggeredStepUp(false);
      notifySuccess('Identity verified — resuming agent request…');
      window.dispatchEvent(new CustomEvent('cibaStepUpApproved'));
    } catch (err) {
      setOtpError(err.response?.data?.message || 'Incorrect code. Please try again.');
    } finally {
      setOtpSubmitting(false);
    }
  }, [otpCode, otpDaId, otpDeviceId]);

  // Keep refs current so stale closures (timers, event listeners) can call latest functions
  useEffect(() => { handleCibaStepUpRef.current = handleCibaStepUp; }, [handleCibaStepUp]);
  useEffect(() => { handleInitiateOtpRef.current = handleInitiateOtp; }, [handleInitiateOtp]);
  useEffect(() => { handleTotpChallengeRef.current = handleTotpChallenge; }, [handleTotpChallenge]);
  useEffect(() => { handlePushChallengeRef.current = handlePushChallenge; }, [handlePushChallenge]);

  // Push polling: poll /api/auth/mfa/challenge/:daId/status every 3s while waiting
  useEffect(() => {
    if (!pushDaId || !pushPolling) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await apiClient.get(`/api/auth/mfa/challenge/${pushDaId}/status`);
        if (data.completed || data.status === 'COMPLETED') {
          setPushPolling(false);
          setPushModalOpen(false);
          setStepUpRequired(false);
          notifySuccess(agentTriggeredStepUp ? 'Identity verified \u2014 resuming agent request\u2026' : 'Identity verified \u2014 please retry your transaction.');
          if (agentTriggeredStepUp) {
            setAgentTriggeredStepUp(false);
            window.dispatchEvent(new CustomEvent('cibaStepUpApproved'));
          }
        } else if (data.status === 'PUSH_CONFIRMATION_TIMED_OUT' || data.status === 'FAILED') {
          setPushPolling(false);
          setPushModalOpen(false);
          notifyError('Push notification timed out or was denied. Please try again.');
        }
      } catch (_) { /* keep polling on transient network errors */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [pushDaId, pushPolling]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { stepUpVerifyHrefRef.current = stepUpVerifyHref; }, [stepUpVerifyHref]);

  /** Clears step-up gate state and dismisses the persistent step-up toast. */
  const dismissStepUp = useCallback(() => {
    setStepUpRequired(false);
    setCibaAuthReqId(null);
    setCibaStatus('idle');
    toast.dismiss('customer-step-up');
  }, []);

  /** Cancel the auto-initiate countdown (agent-triggered flows). */
  const cancelAutoInitiate = useCallback(() => {
    if (autoInitiateTimerRef.current) {
      autoInitiateTimerRef.current.forEach(clearTimeout);
      autoInitiateTimerRef.current = null;
    }
    setAgentCountdown(0);
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
          notifySuccess(agentTriggeredStepUp
            ? 'Identity verified — resuming agent request…'
            : 'Identity verified — please retry your transaction.');
          if (agentTriggeredStepUp) {
            setAgentTriggeredStepUp(false);
            window.dispatchEvent(new CustomEvent('cibaStepUpApproved'));
          }
        } else if (data.status === 'failed' || data.status === 'expired' || data.status === 'error') {
          setCibaStatus('error');
          setCibaAuthReqId(null);
          notifyError(`CIBA verification ${data.status}. Please try again.`);
        }
      } catch (_) { /* keep polling */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [cibaAuthReqId, cibaStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  // Agent-triggered step-up: listen for agentStepUpRequested and activate CIBA flow
  useEffect(() => {
    const onAgentStepUp = (e) => {
      const method = (e && e.detail && e.detail.step_up_method) || 'email';
      if (method === 'ciba') {
        setAgentTriggeredStepUp(true);
        setStepUpRequired(true);
        setStepUpMethod('ciba');
        // 3-second countdown then auto-initiate CIBA
        setAgentCountdown(3);
        const t1 = setTimeout(() => setAgentCountdown(2), 1000);
        const t2 = setTimeout(() => setAgentCountdown(1), 2000);
        const t3 = setTimeout(() => {
          setAgentCountdown(0);
          autoInitiateTimerRef.current = null;
          handleCibaStepUpRef.current && handleCibaStepUpRef.current();
        }, 3000);
        autoInitiateTimerRef.current = [t1, t2, t3];
      } else {
        // Email OTP: generate code server-side and show inline modal (no PingOne redirect)
        setAgentTriggeredStepUp(true);
        handleInitiateOtpRef.current && handleInitiateOtpRef.current();
      }
    };
    window.addEventListener('agentStepUpRequested', onAgentStepUp);
    return () => window.removeEventListener('agentStepUpRequested', onAgentStepUp);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
              {cibaStatus === 'idle' && agentTriggeredStepUp && agentCountdown > 0 && (
                <>
                  <span style={{ fontStyle: 'italic' }}>
                    Starting in {agentCountdown}s…
                  </span>
                  <button type="button" className="dashboard-toast-error__btn" onClick={cancelAutoInitiate}>
                    Cancel
                  </button>
                </>
              )}
              {cibaStatus === 'idle' && (!agentTriggeredStepUp || agentCountdown === 0) && (
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
            <>
              {agentTriggeredStepUp && agentCountdown > 0 && (
                <>
                  <span style={{ fontStyle: 'italic' }}>
                    Redirecting in {agentCountdown}s…
                  </span>
                  <button type="button" className="dashboard-toast-error__btn" onClick={cancelAutoInitiate}>
                    Cancel
                  </button>
                </>
              )}
              {(!agentTriggeredStepUp || agentCountdown === 0) && (
                <a
                  href={stepUpVerifyHref}
                  className="dashboard-toast-error__btn"
                  style={{ textDecoration: 'none', display: 'inline-block' }}
                >
                  Verify now
                </a>
              )}
            </>
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
  }, [stepUpRequired, stepUpMethod, cibaStatus, handleCibaStepUp, dismissStepUp, stepUpVerifyHref, agentTriggeredStepUp, agentCountdown, cancelAutoInitiate]);

  // Demo mode: true when accounts haven't been replaced by real API data
  const isDemoMode = accounts.length > 0 && accounts.every(a => a._demo);

  const totalBalance = useMemo(
    () => accounts
      // Real API accounts use accountType; demo snapshots use type — check both.
      .filter(a => !DEBT_TYPES.has(a.accountType || a.type))
      .reduce((sum, a) => sum + (Number(a.balance) || 0), 0),
    [accounts]
  );

  const totalDebt = useMemo(
    () => accounts
      .filter(a => DEBT_TYPES.has(a.accountType || a.type))
      .reduce((sum, a) => sum + Math.abs(Number(a.balance) || 0), 0),
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
      setConsentChallengeId({ id: cid, snapshot: data.snapshot || null });
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

    handleScrollToAssistant();
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
      console.error('Transfer error:', error);
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

    handleScrollToAssistant();
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
      console.error('Deposit error:', error);
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

    handleScrollToAssistant();
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
      console.error('Withdrawal error:', error);
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
            {fmt(totalBalance)}
          </p>
          {totalDebt > 0 && (
            <p className="ud-hero__debt" aria-live="polite">
              <span className="ud-hero__debt-label">Debt</span>
              {fmt(totalDebt)}
            </p>
          )}
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
              Demo mode —{' '}
              <button type="button" onClick={navigateToCustomerOAuthLogin} style={{ background: 'none', border: 'none', color: '#1e40af', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 'inherit', textDecoration: 'underline' }}>
                sign in
              </button>{' '}
              to use your real accounts
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
                <p className="balance">Balance: {fmt(account.balance)}</p>
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
              <p>From: {selectedAccount.accountType} - {selectedAccount.accountNumber} ({fmt(selectedAccount.balance)})</p>
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
                          {account.accountType} - {account.accountNumber} ({fmt(account.balance)})
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
              <p>To: {depositAccount.accountType} - {depositAccount.accountNumber} ({fmt(depositAccount.balance)})</p>
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
              <p>From: {withdrawAccount.accountType} - {withdrawAccount.accountNumber} ({fmt(withdrawAccount.balance)})</p>
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
              Demo mode —{' '}
              <button type="button" onClick={navigateToCustomerOAuthLogin} style={{ background: 'none', border: 'none', color: '#1e40af', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 'inherit', textDecoration: 'underline' }}>
                sign in
              </button>{' '}
              to see your real transactions
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
                          {fmt(transaction.amount)}
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
      }${agentPlacement === 'middle' && middleAgentOpen ? ' user-dashboard--split3' : ''}`}
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
      {agentPlacement === 'middle' && middleAgentOpen ? (
        <div className="dashboard-content ud-body ud-body--2026 ud-body--dashboard-split3">
          <aside className="ud-token-rail" aria-label="Token chain">
            <div className="section ud-token-rail__inner">
              <ExchangeModeToggle />
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
        // Bottom-dock or float mode: 3-column grid + optional full-width agent row below
        <div className={`ud-body-outer${agentPlacement === 'bottom' ? ' ud-body-outer--with-bottom-agent' : ''}`}>
          <div className="dashboard-content ud-body ud-body--2026 ud-body--floating ud-body--design-3col">
            <aside className="ud-token-rail" aria-label="Token chain">
              <div className="section ud-token-rail__inner">
                <ExchangeModeToggle />
              <TokenChainDisplay />
              </div>
            </aside>

            <main className="ud-center" id="main-dashboard-content" tabIndex={-1}>
              {renderBankingMain()}
            </main>

            {agentPlacement === 'bottom' ? (
              // No float-reserve column needed — agent is below spanning all 3 cols
              <aside className="ud-float-reserve ud-float-reserve--hidden" aria-hidden="true" />
            ) : (
              <aside className="ud-float-reserve" aria-hidden="true">
                <div className="ud-float-reserve__card">
                  <span className="ud-float-reserve__label">Floating assistant</span>
                  <p className="ud-float-reserve__hint">
                    The corner FAB and panel stay in this zone so your balances and token flow stay readable.
                  </p>
                </div>
              </aside>
            )}
          </div>

          {/* Agent dock spans full content width — no App-level gap */}
          {agentPlacement === 'bottom' && (
            <EmbeddedAgentDock user={user} onLogout={onLogout} agentPlacement={agentPlacement} />
          )}
        </div>
      )}

      {/* Middle-layout open FAB — shown when middle placement hasn't been expanded yet.
          App.js global float is suppressed for middle so there is exactly one FAB. */}
      {agentPlacement === 'middle' && !middleAgentOpen && (
        <button
          type="button"
          className="banking-agent-fab"
          onClick={() => setMiddleAgentOpen(true)}
          aria-label="Open AI banking assistant in middle column"
          title="Open AI Agent"
        >
          <span className="banking-agent-fab-icon">🏦</span>
          <span className="banking-agent-fab-label">AI Agent</span>
        </button>
      )}

      {consentChallengeId?.id && (
        <TransactionConsentModal
          open
          challengeId={consentChallengeId.id}
          preloadedSnapshot={consentChallengeId.snapshot}
          user={user}
          autoConfirm={agentHitlAutoConfirm}
          onClose={() => { setConsentChallengeId(null); setAgentHitlAutoConfirm(false); agentHitlDetailRef.current = null; }}
          onTransactionSuccess={(msg) => {
            const agentDetail = agentHitlDetailRef.current;
            setConsentChallengeId(null);
            setAgentHitlAutoConfirm(false);
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
            setAgentHitlAutoConfirm(false);
            notifyInfo(
              'You declined high-value consent. The AI banking assistant stays disabled until you sign out and sign in again.',
            );
          }}
        />
      )}

      {/* Email OTP Step-Up Modal */}
      {otpModalOpen && (
        <div className="otp-step-up-overlay" onClick={() => { setOtpModalOpen(false); setOtpCode(''); setOtpError(''); }}>
          <div className="otp-step-up-modal" onClick={(e) => e.stopPropagation()}>
            <div className="otp-step-up-modal__header">
              <h3 className="otp-step-up-modal__title">🔐 Verify Your Identity</h3>
              <button
                className="otp-step-up-modal__close"
                onClick={() => { setOtpModalOpen(false); setOtpCode(''); setOtpError(''); }}
                aria-label="Close"
              >✕</button>
            </div>
            <div className="otp-step-up-modal__body">
              <p className="otp-step-up-modal__lead">
                A 6-digit verification code was sent to <strong>{otpEmail}</strong>.
                Enter it below to authorise your transaction.
              </p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otpCode}
                onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, '')); setOtpError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && otpCode.length === 6 && !otpSubmitting) handleVerifyOtp(); }}
                placeholder="000000"
                autoFocus
                className={`otp-step-up-modal__input${otpError ? ' otp-step-up-modal__input--error' : ''}`}
              />
              {otpError && (
                <p className="otp-step-up-modal__error">{otpError}</p>
              )}
              <p className="otp-step-up-modal__hint">Code expires in 5 minutes.</p>
              <div className="otp-step-up-modal__actions">
                <button
                  type="button"
                  className="otp-step-up-modal__btn-primary"
                  disabled={otpCode.length !== 6 || otpSubmitting}
                  onClick={handleVerifyOtp}
                >
                  {otpSubmitting ? 'Verifying…' : 'Verify'}
                </button>
                <button
                  type="button"
                  className="otp-step-up-modal__btn-ghost"
                  onClick={() => handleInitiateOtp()}
                >
                  Resend code
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOTP Step-Up Modal */}
      {totpModalOpen && (
        <div className="otp-step-up-overlay" onClick={() => setTotpModalOpen(false)}>
          <div className="otp-step-up-modal otp-step-up-modal--totp" onClick={(e) => e.stopPropagation()}>
            <div className="otp-step-up-modal__header">
              <h3 className="otp-step-up-modal__title">🔐 Verify Your Identity</h3>
              <button className="otp-step-up-modal__close" onClick={() => setTotpModalOpen(false)} aria-label="Close">✕</button>
            </div>
            <div className="otp-step-up-modal__body">
              <p className="otp-step-up-modal__lead">
                Enter the 6-digit code from your <strong>authenticator app</strong>.
              </p>
              <input
                className={`otp-step-up-modal__input${totpError ? ' otp-step-up-modal__input--error' : ''}`}
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                autoFocus
                value={totpCode}
                onChange={(e) => { setTotpCode(e.target.value.replace(/\D/g, '')); setTotpError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && totpCode.length === 6 && !totpSubmitting) handleTotpSubmit(); }}
              />
              {totpError && <p className="otp-step-up-modal__error">{totpError}</p>}
              <p className="otp-step-up-modal__hint">Open your authenticator app and enter the current 6-digit code.</p>
            </div>
            <div className="otp-step-up-modal__actions">
              <button className="otp-step-up-modal__btn-ghost" onClick={() => setTotpModalOpen(false)}>Cancel</button>
              <button
                className="otp-step-up-modal__btn-primary"
                disabled={totpCode.length !== 6 || totpSubmitting}
                onClick={handleTotpSubmit}
              >{totpSubmitting ? 'Verifying…' : 'Verify'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Device Picker — shown when multiple MFA devices are enrolled */}
      {devicePickerOpen && (
        <div className="otp-step-up-overlay" onClick={() => setDevicePickerOpen(false)}>
          <div className="otp-step-up-modal" onClick={(e) => e.stopPropagation()}>
            <div className="otp-step-up-modal__header">
              <h3 className="otp-step-up-modal__title">🔐 Choose Verification Method</h3>
              <button className="otp-step-up-modal__close" onClick={() => setDevicePickerOpen(false)} aria-label="Close">✕</button>
            </div>
            <div className="otp-step-up-modal__body">
              <p className="otp-step-up-modal__lead">Select how you want to verify your identity:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                {devicePickerDevices.map(device => (
                  <button
                    key={device.id}
                    className="otp-step-up-modal__btn-ghost"
                    style={{ textAlign: 'left' }}
                    onClick={() => handleDevicePick(device)}
                  >
                    {device.type === 'EMAIL' && '📧 '}
                    {device.type === 'SMS' && '📱 '}
                    {device.type === 'TOTP' && '🔑 '}
                    {device.type === 'MOBILE' && '📲 '}
                    {device.type === 'FIDO2' && '🔐 '}
                    {device.type === 'EMAIL' ? 'Email code' : device.type === 'SMS' ? 'SMS code' : device.type === 'TOTP' ? 'Authenticator app' : device.type === 'MOBILE' ? 'Push notification' : 'Passkey / FIDO2'}
                    {device.nickname ? ` (${device.nickname})` : ''}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Push Notification Waiting Panel */}
      {pushModalOpen && (
        <div className="otp-step-up-overlay">
          <div className="otp-step-up-modal otp-step-up-modal--push">
            <div className="otp-step-up-modal__header">
              <h3 className="otp-step-up-modal__title">📲 Check Your Device</h3>
            </div>
            <div className="otp-step-up-modal__body" style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div className="push-waiting-spinner" />
              <p className="otp-step-up-modal__lead" style={{ marginTop: '1rem' }}>
                A push notification was sent to your registered device.<br />
                <strong>Tap Approve</strong> in the PingOne app to continue.
              </p>
              <p className="otp-step-up-modal__hint">Waiting for approval…</p>
            </div>
            <div className="otp-step-up-modal__actions" style={{ justifyContent: 'center' }}>
              <button
                className="otp-step-up-modal__btn-ghost"
                onClick={() => { setPushPolling(false); setPushModalOpen(false); }}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* FIDO2 Passkey Step-Up */}
      {fido2ModalOpen && (
        <Fido2Challenge
          daId={fido2DaId}
          deviceId={fido2DeviceId}
          onSuccess={() => {
            setFido2ModalOpen(false);
            setStepUpRequired(false);
            notifySuccess(agentTriggeredStepUp
              ? 'Identity verified — resuming agent request…'
              : 'Identity verified — please retry your transaction.');
            if (agentTriggeredStepUp) {
              setAgentTriggeredStepUp(false);
              window.dispatchEvent(new CustomEvent('cibaStepUpApproved'));
            }
          }}
          onCancel={() => setFido2ModalOpen(false)}
          onError={(msg) => { setFido2ModalOpen(false); notifyError(msg); }}
        />
      )}

      {/* OAuth Token Info Modal */}
      {showTokenModal && (
        <div className="modal-overlay" onClick={() => setShowTokenModal(false)}>
          <div className="token-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Your Token Chain</h3>
              <button className="close-btn" onClick={() => setShowTokenModal(false)} aria-label="Close">✕</button>
            </div>
            <div className="modal-content">
              {tokenData ? (() => {
                const { decoded, user, tokenType, expiresAt, hasRefreshToken } = tokenData;
                const payload = decoded?.payload || {};
                const header  = decoded?.header  || {};
                const mayAct  = payload.may_act;
                return (
                  <div className="token-info">
                    {/* Session summary */}
                    <div className="token-section">
                      <h4>Session</h4>
                      <div className="session-info-grid">
                        <div className="session-row">
                          <span className="session-label">User:</span>
                          <span className="session-value">{user?.firstName} {user?.lastName} ({user?.email})</span>
                        </div>
                        <div className="session-row">
                          <span className="session-label">Role:</span>
                          <span className="session-value">{user?.role}</span>
                          <span className="session-label">Type:</span>
                          <span className="session-value">{tokenType || 'Bearer'}</span>
                          {hasRefreshToken && <span className="session-value" style={{ color: '#22c55e' }}>✓ refresh token</span>}
                        </div>
                        <div className="session-row">
                          <span className="session-label">Expires:</span>
                          <span className="session-value">{expiresAt ? new Date(expiresAt).toLocaleString() : 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Key claims */}
                    <div className="token-section">
                      <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ background: '#1e3a5f', border: '1px solid #3b82f6', borderRadius: '4px', padding: '2px 8px', fontSize: '0.75rem', color: '#93c5fd' }}>👤 Access Token Claims</span>
                        <button type="button" className="token-payload-hint" title="Learn about tokens" onClick={() => open(EDU.LOGIN_FLOW, 'tokens')}>ⓘ</button>
                      </h4>
                      <div style={{ background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '6px', padding: '10px 14px', fontSize: '0.8rem', marginBottom: '8px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <tbody>
                            {[
                              ['alg', header.alg],
                              ['sub', payload.sub],
                              ['aud', Array.isArray(payload.aud) ? payload.aud.join(', ') : payload.aud],
                              ['scope', payload.scope],
                              ['iss', payload.iss],
                              ['exp', payload.exp ? new Date(payload.exp * 1000).toLocaleString() : null],
                            ].filter(([, v]) => v).map(([k, v]) => (
                              <tr key={k} style={{ borderBottom: '1px solid #1e2d3d' }}>
                                <td style={{ padding: '3px 8px', color: '#94a3b8', fontFamily: 'monospace', width: '5rem' }}>{k}</td>
                                <td style={{ padding: '3px 8px', color: '#e2e8f0', fontFamily: 'monospace', wordBreak: 'break-all' }}>{String(v)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {mayAct ? (
                        <div style={{ background: '#1e3a5f', borderRadius: '6px', padding: '8px 12px', fontSize: '0.8rem', color: '#93c5fd', marginBottom: '8px' }}>
                          ✅ <strong>may_act present</strong> — BFF can exchange this token (RFC 8693)
                          <pre style={{ margin: '4px 0 0', background: 'none', fontSize: '0.75rem' }}>{JSON.stringify(mayAct, null, 2)}</pre>
                        </div>
                      ) : (
                        <div style={{ background: '#7f1d1d', borderRadius: '6px', padding: '8px 12px', fontSize: '0.8rem', color: '#fca5a5', marginBottom: '8px' }}>
                          ⚠️ <strong>may_act absent</strong> — add the may_act claim in your PingOne token policy to enable token exchange
                        </div>
                      )}
                    </div>

                    {/* Full payload */}
                    <div className="token-section">
                      <h4>Full JWT Payload</h4>
                      <pre className="token-json" style={{ background: '#0f172a', color: '#e2e8f0', borderRadius: '6px', padding: '10px', fontSize: '0.73rem', overflowX: 'auto', border: '1px solid #1e3a5f' }}>
                        {JSON.stringify(payload, null, 2)}
                      </pre>
                    </div>
                  </div>
                );
              })() : (
                <div className="no-token">
                  <p>No OAuth token data available — make sure you are signed in.</p>
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
