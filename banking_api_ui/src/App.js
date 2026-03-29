import { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import LandingPage from './components/LandingPage';
import BankingAgent from './components/BankingAgent';
import Dashboard from './components/Dashboard';
import UserDashboard from './components/UserDashboard';
import ActivityLogs from './components/ActivityLogs';
import Users from './components/Users';
import Accounts from './components/Accounts';
import Transactions from './components/Transactions';
import SecuritySettings from './components/SecuritySettings';
import Config from './components/Config';
import Onboarding from './components/Onboarding';
import SetupPage from './components/SetupPage';
import PingOneSetupGuidePage from './components/PingOneSetupGuidePage';
import CIBAPanel from './components/CIBAPanel';
import CimdSimPanel from './components/CimdSimPanel';
import McpInspector from './components/McpInspector';
import OAuthDebugLogViewer from './components/OAuthDebugLogViewer';
import ClientRegistrationPage from './components/ClientRegistrationPage';
import LogViewer from './components/LogViewer';
import LogViewerPage from './components/LogViewerPage';
import DemoDataPage from './components/DemoDataPage';
import ApiTrafficPage from './components/ApiTrafficPage';
import BankingAdminOps from './components/BankingAdminOps';
import TransactionConsentPage from './components/TransactionConsentPage';
import DelegatedAccessPage from './components/DelegatedAccessPage';
import FeatureFlagsPage from './components/FeatureFlagsPage';

import { savePublicConfig } from './services/configService';
import { SpinnerProvider } from './context/SpinnerContext';
import SpinnerHost from './components/shared/SpinnerHost';
import { EducationUIProvider } from './context/EducationUIContext';
import { TokenChainProvider } from './context/TokenChainContext';
import { AgentUiModeProvider, useAgentUiMode } from './context/AgentUiModeContext';
import { IndustryBrandingProvider } from './context/IndustryBrandingContext';
import EducationBar from './components/EducationBar';
import EducationPanelsHost from './components/education/EducationPanelsHost';
import Footer from './components/Footer';
import DashboardQuickNav from './components/DashboardQuickNav';
import EmbeddedAgentDock from './components/EmbeddedAgentDock';
import {
  isBankingAgentDashboardRoute,
  isDashboardQuickNavRoute,
  isEmbeddedAgentDockRoute,
} from './utils/embeddedAgentFabVisibility';
import { useDemoMode } from './hooks/useDemoMode';
import SessionReauthBanner from './components/SessionReauthBanner';
import AgentFlowDiagramPanel from './components/AgentFlowDiagramPanel';
import { SESSION_REAUTH_EVENT } from './utils/authUi';
import './App.css';

/** Prevents re-auth after logout when effects re-run (matches f8393a7 session guard). */
let _didLogOut = false;


function AppWithAuth() {
  const { pathname } = useLocation();
  const pathNorm = pathname.replace(/\/$/, '') || '/';
  const isApiTrafficOnlyPage = pathNorm === '/api-traffic' || pathNorm === '/logs';
  const { placement: agentPlacement } = useAgentUiMode();
  const demoMode = useDemoMode();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [loading, setLoading] = useState(true);
  const [logViewerOpen, setLogViewerOpen] = useState(false);
  /** On-page session prompt (replaces toast-only for “log in again” flows). */
  const [sessionReauth, setSessionReauth] = useState(null);
  const pendingUserEmailRef = useRef(null);
  /** Avoid userAuthenticated ↔ checkOAuthSession dispatch loops; reset when user clears. */
  const sessionEstablishedRef = useRef(false);

  const injectEmailIntoNextSessionInit = useCallback((email) => {
    pendingUserEmailRef.current = email;
    const _origSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function(data) {
      try {
        const msg = JSON.parse(data);
        if (msg && msg.type === 'session_init' && pendingUserEmailRef.current) {
          msg.userEmail = pendingUserEmailRef.current;
          pendingUserEmailRef.current = null;
          data = JSON.stringify(msg);
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
      return _origSend.call(this, data);
    };
  }, []);

  const checkOAuthSession = useCallback(async () => {
    const applyUser = (u) => {
      setUser(u);
      const userEmail = u?.email;
      if (userEmail) injectEmailIntoNextSessionInit(userEmail);
      if (!sessionEstablishedRef.current) {
        sessionEstablishedRef.current = true;
        window.dispatchEvent(new CustomEvent('userAuthenticated'));
      }
      setLoading(false);
    };

    try {
      const adminResponse = await axios.get('/api/auth/oauth/status');
      if (adminResponse.data.authenticated) {
        applyUser(adminResponse.data.user);
        return true;
      }

      const userResponse = await axios.get('/api/auth/oauth/user/status');
      if (userResponse.data.authenticated) {
        applyUser(userResponse.data.user);
        return true;
      }

      const sessionResponse = await axios.get('/api/auth/session');
      if (sessionResponse.data.authenticated) {
        applyUser(sessionResponse.data.user);
        return true;
      }

      setLoading(false);
      return false;
    } catch (error) {
      console.log('❌ Error checking OAuth sessions:', error.message);
      setLoading(false);
      return false;
    }
  }, [injectEmailIntoNextSessionInit]);

  // Public config → IndexedDB when not in logout handoff (f8393a7 pattern).
  useEffect(() => {
    if (localStorage.getItem('userLoggedOut') === 'true') return;
    axios.get('/api/admin/config')
      .then(({ data }) => savePublicConfig(data.config))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const pathname =
      typeof window !== 'undefined' && typeof window.location?.pathname === 'string'
        ? window.location.pathname
        : '';
    const isPostLogoutLanding = pathname === '/logout' || pathname.endsWith('/logout');
    const userLoggedOut =
      localStorage.getItem('userLoggedOut') === 'true' || _didLogOut || isPostLogoutLanding;

    if (userLoggedOut) {
      _didLogOut = true;
      sessionEstablishedRef.current = false;
      fetch('/api/auth/clear-session', { method: 'POST', credentials: 'include' })
        .catch(() => {})
        .finally(() => {
          localStorage.removeItem('userLoggedOut');
          setUser(null);
          setLoading(false);
          if (isPostLogoutLanding && window.history?.replaceState) {
            window.history.replaceState(null, '', '/');
          }
        });
      return undefined;
    }

    const oauthSuccess =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search || '').get('oauth') === 'success';

    // NOTE: do NOT clear bx-dashboard-reauth on oauth=success.
    // The REAUTH_KEY guard is intentional: redirect once automatically (seamless
    // SSO re-auth), then show the banner if still failing.  Clearing the key
    // here re-enables the redirect on the very next 401, creating an infinite loop:
    //   accounts/my 401 → set key → redirect → oauth=success → key cleared →
    //   accounts/my 401 → set key → redirect → …
    // The key is cleared correctly in UserDashboard's fetchUserData try-block
    // when data actually loads successfully.

    const RETRY_DELAYS_MS = [450, 950, 1900, 3000];
    let retryIndex = 0;
    let cancelled = false;
    const timeouts = [];

    const arm = (delayMs, fn) => {
      const id = setTimeout(() => {
        if (!cancelled) void fn();
      }, delayMs);
      timeouts.push(id);
    };

    const runCheck = async () => {
      if (cancelled) return;
      const ok = await checkOAuthSession();
      if (cancelled || ok) return;
      if (!oauthSuccess || retryIndex >= RETRY_DELAYS_MS.length) return;
      const delay = RETRY_DELAYS_MS[retryIndex++];
      arm(delay, runCheck);
    };

    arm(200, runCheck);

    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, [checkOAuthSession]);

  useEffect(() => {
    const handler = () => {
      void checkOAuthSession();
    };
    window.addEventListener('userAuthenticated', handler);
    return () => window.removeEventListener('userAuthenticated', handler);
  }, [checkOAuthSession]);

  useEffect(() => {
    const onSessionReauth = (e) => {
      const d = e.detail;
      if (!d || typeof d.message !== 'string' || !d.message.trim()) return;
      const role = d.role === 'admin' ? 'admin' : 'customer';
      setSessionReauth({ message: d.message.trim(), role });
    };
    window.addEventListener(SESSION_REAUTH_EVENT, onSessionReauth);
    return () => window.removeEventListener(SESSION_REAUTH_EVENT, onSessionReauth);
  }, []);

  useEffect(() => {
    if (user) setSessionReauth(null);
  }, [user]);

  /** Nav rail / layout flags — computed declaratively so React className is always in sync. */
  const showQuickNav = Boolean(user) && isDashboardQuickNavRoute(pathname, user);
  const isOnDashboard = pathname === '/dashboard';

  /** Floating agent: dashboard homes only. Embedded dock: those routes plus `/config` (setup-focused assistant). */
  const onDashboardAgentRoute = isBankingAgentDashboardRoute(pathname);
  const onEmbeddedDockRoute = isEmbeddedAgentDockRoute(pathname);

  // Routes where UserDashboard is rendered (handles its own middle FAB + split layout and its own bottom dock).
  // Admin uses Dashboard.js on /admin and / — those routes need the global float/dock from App.
  const onUserDashboardRoute =
    pathname === '/dashboard' || (pathname === '/' && user?.role !== 'admin');

  // Suppress the global float agent in middle mode ONLY when UserDashboard is active —
  // UserDashboard provides its own FAB + split-3 layout for middle placement.
  // Dashboard.js (admin view) has no inline middle layout, so the float agent must show there.
  const showFloatingAgent =
    Boolean(user) && onDashboardAgentRoute && !(agentPlacement === 'middle' && onUserDashboardRoute);

  const hasEmbeddedDockLayout =
    Boolean(user) && agentPlacement === 'bottom' && onEmbeddedDockRoute;

  const logout = () => {
    console.log('🚪 Starting logout — navigating to /api/auth/logout');

    localStorage.setItem('userLoggedOut', 'true');

    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    sessionStorage.clear();

    window.dispatchEvent(new CustomEvent('userLoggedOut'));

    window.location.href = '/api/auth/logout';
  };

  return (
    <EducationUIProvider>
      <TokenChainProvider>
        <div
          className={`App end-user-nano${showQuickNav ? ' App--has-quick-nav' : ''}${isOnDashboard ? ' App--on-dashboard' : ''}${hasEmbeddedDockLayout ? ' App--has-embedded-dock' : ''}${sessionReauth ? ' App--session-reauth' : ''}`}
        >
          <ToastContainer position="top-right" autoClose={4000} hideProgressBar={false} newestOnTop closeOnClick pauseOnHover draggable />
          {sessionReauth && (
            <SessionReauthBanner
              message={sessionReauth.message}
              role={sessionReauth.role}
              onDismiss={() => setSessionReauth(null)}
            />
          )}
          <DashboardQuickNav user={user} />
          <Routes>
            <Route path="/setup/pingone" element={<PingOneSetupGuidePage />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route
              path="/onboarding"
              element={
                user && user.role !== 'admin' ? <Navigate to="/" replace /> : <Onboarding />
              }
            />
            <Route path="*" element={
              !user ? (
                <LandingPage />
              ) : (
                <main className="main-content">
                  <EducationBar />
                  <Routes>
                    <Route path="/" element={user?.role === 'admin' ? <Dashboard user={user} onLogout={logout} /> : <UserDashboard user={user} onLogout={logout} />} />
                    <Route path="/admin" element={user?.role === 'admin' ? <Dashboard user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                    <Route path="/dashboard" element={<UserDashboard user={user} onLogout={logout} />} />
                    <Route path="/config"      element={user?.role === 'admin' ? <Config /> : <Navigate to="/" replace />} />
                    <Route path="/logs"        element={user ? <LogViewerPage /> : <Navigate to="/" replace />} />
                    <Route path="/api-traffic" element={user ? <ApiTrafficPage /> : <Navigate to="/" replace />} />
                    <Route path="/demo-data"   element={<DemoDataPage user={user} onLogout={logout} />} />
                    <Route path="/agent"       element={<BankingAgent user={user} onLogout={logout} mode="inline" />} />
                    <Route path="/activity" element={user?.role === 'admin' ? <ActivityLogs user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                    <Route path="/users" element={user?.role === 'admin' ? <Users user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                    <Route path="/accounts" element={user?.role === 'admin' ? <Accounts user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                    <Route path="/transactions" element={user?.role === 'admin' ? <Transactions user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                    <Route
                      path="/admin/banking"
                      element={user?.role === 'admin' ? <BankingAdminOps user={user} onLogout={logout} /> : <Navigate to="/" replace />}
                    />
                    <Route path="/transaction-consent" element={<TransactionConsentPage user={user} />} />
                    <Route path="/delegated-access" element={<DelegatedAccessPage user={user} onLogout={logout} />} />
                    <Route path="/feature-flags"
                      element={user?.role === 'admin' ? <FeatureFlagsPage /> : <Navigate to="/" replace />}
                    />
                    <Route path="/settings" element={user?.role === 'admin' ? <SecuritySettings user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                    <Route path="/mcp-inspector" element={<McpInspector user={user} onLogout={logout} />} />
                    <Route path="/oauth-debug-logs"
                      element={user?.role === 'admin' ? <OAuthDebugLogViewer /> : <Navigate to="/" replace />}
                    />
                    <Route path="/client-registration"
                      element={user?.role === 'admin' ? <ClientRegistrationPage /> : <Navigate to="/" replace />}
                    />
                    <Route path="/marketing" element={<LandingPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </main>
              )
            } />
          </Routes>
          {showFloatingAgent && (
            <BankingAgent user={user} onLogout={logout} distinctFloatingChrome />
          )}
          {/* UserDashboard renders EmbeddedAgentDock inside its own layout spanning all 3 columns.
              App-level dock is only for admin dashboard (/admin, /) and /config. */}
          {!onUserDashboardRoute && (
            <EmbeddedAgentDock user={user} onLogout={logout} agentPlacement={agentPlacement} />
          )}
          {!isApiTrafficOnlyPage && <EducationPanelsHost />}
          {!isApiTrafficOnlyPage && <CIBAPanel />}
          {!isApiTrafficOnlyPage && <CimdSimPanel />}
          {!isApiTrafficOnlyPage && <AgentFlowDiagramPanel />}
          <LogViewer isOpen={logViewerOpen} onClose={() => setLogViewerOpen(false)} />
          {user && demoMode !== true && !isApiTrafficOnlyPage && (
            <button
              type="button"
              className="demo-config-fab"
              onClick={() => navigate('/demo-data')}
              title="Open Demo config (sandbox accounts, balances, MFA)"
            >
              Demo config
            </button>
          )}
          {!isApiTrafficOnlyPage && <Footer user={user} />}
          <SpinnerHost />
        </div>
      </TokenChainProvider>
    </EducationUIProvider>
  );
}

export default function App() {
  return (
    <SpinnerProvider>
      <AgentUiModeProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <IndustryBrandingProvider>
            <AppWithAuth />
          </IndustryBrandingProvider>
        </Router>
      </AgentUiModeProvider>
    </SpinnerProvider>
  );
}
