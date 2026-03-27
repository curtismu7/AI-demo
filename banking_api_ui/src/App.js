import { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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

import { savePublicConfig } from './services/configService';
import { EducationUIProvider } from './context/EducationUIContext';
import { TokenChainProvider } from './context/TokenChainContext';
import { AgentUiModeProvider, useAgentUiMode } from './context/AgentUiModeContext';
import { IndustryBrandingProvider } from './context/IndustryBrandingContext';
import EducationBar from './components/EducationBar';
import EducationPanelsHost from './components/education/EducationPanelsHost';
import Footer from './components/Footer';
import UIDesignNav from './components/UIDesignNav';
import DashboardQuickNav from './components/DashboardQuickNav';
import EmbeddedAgentDock from './components/EmbeddedAgentDock';
import {
  isBankingAgentDashboardRoute,
  isDashboardQuickNavRoute,
  isEmbeddedAgentDockRoute,
} from './utils/embeddedAgentFabVisibility';
import { useDemoMode } from './hooks/useDemoMode';
import SessionReauthBanner from './components/SessionReauthBanner';
import { SESSION_REAUTH_EVENT } from './utils/authUi';
import './App.css';

/** Prevents re-auth after logout when effects re-run (matches f8393a7 session guard). */
let _didLogOut = false;

/**
 * Syncs .App classes: dashboard route chrome + quick-nav rail (only on signed-in /, /admin, /dashboard).
 */
function AppRouteChrome({ user }) {
  const { pathname } = useLocation();
  useEffect(() => {
    const appEl = document.querySelector('.App');
    if (!appEl) return;
    const showQuickNav = Boolean(user) && isDashboardQuickNavRoute(pathname, user);
    appEl.classList.toggle('App--has-quick-nav', showQuickNav);
    appEl.classList.toggle('App--on-dashboard', pathname === '/dashboard');
  }, [pathname, user]);
  return null;
}

function AppWithAuth() {
  const { pathname } = useLocation();
  const pathNorm = pathname.replace(/\/$/, '') || '/';
  const isApiTrafficOnlyPage = pathNorm === '/api-traffic';
  const { placement: agentPlacement, fab: agentFab } = useAgentUiMode();
  const demoMode = useDemoMode();
  const [user, setUser] = useState(null);
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

  /** Floating agent: dashboard homes only. Embedded dock: those routes plus `/config` (setup-focused assistant). */
  const onDashboardAgentRoute = isBankingAgentDashboardRoute(pathname);
  const onEmbeddedDockRoute = isEmbeddedAgentDockRoute(pathname);
  const showFloatingAgent =
    Boolean(user) &&
    onDashboardAgentRoute &&
    (agentPlacement === 'none' || agentFab);
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

  if (loading) {
    return (
      <div className="loading">
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <EducationUIProvider>
      <TokenChainProvider>
        <AppRouteChrome user={user} />
        <div
          className={`App end-user-nano${hasEmbeddedDockLayout ? ' App--has-embedded-dock' : ''}${sessionReauth ? ' App--session-reauth' : ''}`}
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
          {user && !isApiTrafficOnlyPage && <UIDesignNav user={user} />}
          <Routes>
            <Route path="/config" element={<Config />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/logs" element={<LogViewerPage />} />
            <Route path="/api-traffic" element={<ApiTrafficPage />} />
            <Route path="/dashboard" element={<UserDashboard user={user} onLogout={logout} />} />
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
                    <Route path="/demo-data" element={<DemoDataPage user={user} onLogout={logout} />} />
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
                    <Route path="/settings" element={user?.role === 'admin' ? <SecuritySettings user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                    <Route path="/mcp-inspector" element={<McpInspector user={user} onLogout={logout} />} />
                    <Route path="/oauth-debug-logs"
                      element={user?.role === 'admin' ? <OAuthDebugLogViewer /> : <Navigate to="/" replace />}
                    />
                    <Route path="/client-registration"
                      element={user?.role === 'admin' ? <ClientRegistrationPage /> : <Navigate to="/" replace />}
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </main>
              )
            } />
          </Routes>
          {showFloatingAgent && (
            <BankingAgent user={user} onLogout={logout} distinctFloatingChrome />
          )}
          <EmbeddedAgentDock user={user} onLogout={logout} agentPlacement={agentPlacement} />
          {!isApiTrafficOnlyPage && <EducationPanelsHost />}
          {!isApiTrafficOnlyPage && <CIBAPanel />}
          {!isApiTrafficOnlyPage && <CimdSimPanel />}
          <LogViewer isOpen={logViewerOpen} onClose={() => setLogViewerOpen(false)} />
          {user && demoMode !== true && !isApiTrafficOnlyPage && (
            <button
              type="button"
              className="demo-config-fab"
              onClick={() => { window.location.href = '/demo-data'; }}
              title="Open Demo config (sandbox accounts, balances, MFA)"
            >
              Demo config
            </button>
          )}
          {!isApiTrafficOnlyPage && <Footer user={user} />}
        </div>
      </TokenChainProvider>
    </EducationUIProvider>
  );
}

export default function App() {
  return (
    <AgentUiModeProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <IndustryBrandingProvider>
          <AppWithAuth />
        </IndustryBrandingProvider>
      </Router>
    </AgentUiModeProvider>
  );
}
