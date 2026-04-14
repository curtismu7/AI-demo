import { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import LandingPage from './components/LandingPage';
import BankingAgent from './components/BankingAgent';
import Dashboard from './components/Dashboard';
import UserDashboard from './components/UserDashboard';
import ActivityLogs from './components/ActivityLogs';
import AuditPage from './components/AuditPage';
import Users from './components/Users';
import Accounts from './components/Accounts';
import Transactions from './components/Transactions';
import SecuritySettings from './components/SecuritySettings';
import Onboarding from './components/Onboarding';
import SetupPage from './components/SetupPage';
import PingOneSetupGuidePage from './components/PingOneSetupGuidePage';
import SetupWizard from './components/SetupWizard';
import CIBAPanel from './components/CIBAPanel';
import CimdSimPanel from './components/CimdSimPanel';
import McpInspector from './components/McpInspector';
import OAuthDebugLogViewer from './components/OAuthDebugLogViewer';
import ClientRegistrationPage from './components/ClientRegistrationPage';
import LogViewer from './components/LogViewer';
import LogViewerPage from './components/LogViewerPage';
import DemoDataPage from './components/DemoDataPage';
import UnifiedConfigurationPage from './components/Configuration/UnifiedConfigurationPage';
import ApiTrafficPage from './components/ApiTrafficPage';
import BankingAdminOps from './components/BankingAdminOps';
import TransactionConsentPage from './components/TransactionConsentPage';
import DelegatedAccessPage from './components/DelegatedAccessPage';
import DelegationPage from './components/DelegationPage';
import FeatureFlagsPage from './components/FeatureFlagsPage';
import ScopeAuditPage from './components/ScopeAuditPage';
import LangChainPage from './pages/LangChainPage';
import PostmanCollectionsPage from './components/PostmanCollectionsPage';
import Profile from './components/Profile';
import SecurityCenter from './components/SecurityCenter';
import UserAccounts from './components/UserAccounts';
import UserTransactions from './components/UserTransactions';
import SelfServicePage from './components/SelfServicePage';
import LogoutPage from './components/LogoutPage';
import PingOneTestPage from './components/PingOneTestPage';
import MFATestPage from './components/MFATestPage';

import { savePublicConfig } from './services/configService';
import { SpinnerProvider } from './context/SpinnerContext';
import SpinnerHost from './components/shared/SpinnerHost';
import { EducationUIProvider } from './context/EducationUIContext';
import { TokenChainProvider } from './context/TokenChainContext';
import { AgentUiModeProvider, useAgentUiMode } from './context/AgentUiModeContext';
import { IndustryBrandingProvider } from './context/IndustryBrandingContext';
import { VerticalProvider } from './context/VerticalContext';
import EducationBar from './components/EducationBar';
import { DemoTourProvider } from './context/DemoTourContext';
import { ExchangeModeProvider } from './context/ExchangeModeContext';
import DemoTourModal from './components/tour/DemoTourModal';
import ServerRestartModal from './components/ServerRestartModal';
import { monitorApiHealth } from './services/bankingRestartNotificationService';
import EducationPanelsHost from './components/education/EducationPanelsHost';
import Footer from './components/Footer';
import DashboardQuickNav from './components/DashboardQuickNav';
import EmbeddedAgentDock from './components/EmbeddedAgentDock';
import SideAgentDock from './components/SideAgentDock';
import TopNav from './components/TopNav';
import {
  isBankingAgentDashboardRoute,
  isDashboardQuickNavRoute,
  isEmbeddedAgentDockRoute,
  isMarketingEmbeddedDockSurface,
  isPublicMarketingAgentPath,
} from './utils/embeddedAgentFabVisibility';

import { useDemoMode } from './hooks/useDemoMode';
import SessionReauthBanner from './components/SessionReauthBanner';
import AgentFlowDiagramPanel from './components/AgentFlowDiagramPanel';
import { SESSION_REAUTH_EVENT } from './utils/authUi';
import { showEndUserOAuthErrorToast, stripEndUserOAuthErrorParamsFromUrl } from './utils/endUserOAuthErrorToast';
import { notifyWarning, notifyInfo } from './utils/appToast';
import './App.css';

// Browser extension interference detection and handling
const setupBrowserExtensionHandling = () => {
  // Monitor for extension-related errors
  const originalConsoleError = console.error;
  console.error = (...args) => {
    // Check for browser extension errors
    const message = args.join(' ');
    if (message.includes('bootstrap-autofill-overlay.js') || 
        message.includes('Cannot read properties of null (reading \'includes\')')) {
      console.warn('[Browser Extension] Detected extension interference:', message);
      // Don't let extension errors break our app
      return;
    }
    originalConsoleError.apply(console, args);
  };

  // Add global error handler for extension interference
  const handleGlobalError = (event) => {
    if (event.error && event.error.message && 
        event.error.message.includes('bootstrap-autofill-overlay.js')) {
      console.warn('[Browser Extension] Prevented extension error from crashing app');
      event.preventDefault();
      return false;
    }
  };

  window.addEventListener('error', handleGlobalError);
  
  // Cleanup function
  return () => {
    console.error = originalConsoleError;
    window.removeEventListener('error', handleGlobalError);
  };
};

/**
 * Renders children for admin users.
 * For non-admin logged-in users: shows a modal explaining why + fires a toast, then
 * renders a blank placeholder so the URL stays valid (no silent redirect to /marketing).
 */
function AdminRoute({ user, children }) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const toastedRef = useRef(false);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isAdmin && !toastedRef.current) {
      toastedRef.current = true;
      notifyWarning('This page is restricted to admin users.');
    }
  }, [isAdmin]);

  if (isAdmin) return children;

  if (dismissed) {
    navigate(-1);
    return null;
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">
      <div className="modal-content" style={{ maxWidth: 440, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{
          background: '#fff3cd',
          borderBottom: '1px solid #ffc107',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}>
          <span style={{ fontSize: '1.5rem', lineHeight: 1 }} aria-hidden="true">🔒</span>
          <h2 id="admin-modal-title" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#7c5d00' }}>
            Admin access required
          </h2>
        </div>
        <div className="modal-body" style={{ padding: '1.5rem' }}>
          <p style={{ margin: '0 0 1.25rem', color: '#374151', lineHeight: 1.6 }}>
            This page is only available to users with the <strong>admin</strong> role.
            Contact your administrator to have your account upgraded.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setDismissed(true)}
          >
            ← Go back
          </button>
        </div>
      </div>
    </div>
  );
}

/** Prevents re-auth after logout when effects re-run (matches f8393a7 session guard). */
let _didLogOut = false;


function AppWithAuth() {
  const fullLocation = useLocation();
  const backgroundLocation = fullLocation.state?.backgroundLocation;
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const pathNorm = pathname.replace(/\/$/, '') || '/';
  const isApiTrafficOnlyPage = pathNorm === '/api-traffic' || pathNorm === '/logs';
  const { placement: agentPlacement, fab: agentFab } = useAgentUiMode();
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
  const sessionEstablishedRef = useRef(null);

  // Setup browser extension interference handling
  useEffect(() => {
    const cleanup = setupBrowserExtensionHandling();
    return cleanup;
  }, []);

  // Initialize server restart notification monitoring
  useEffect(() => {
    monitorApiHealth();
  }, []);

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
      console.error('Error checking OAuth sessions:', error.message);
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
      const isHITL = d.isHITL === true;
      setSessionReauth({ message: d.message.trim(), role, isHITL });
    };
    window.addEventListener(SESSION_REAUTH_EVENT, onSessionReauth);
    return () => window.removeEventListener(SESSION_REAUTH_EVENT, onSessionReauth);
  }, []);

  useEffect(() => {
    if (user) setSessionReauth(null);
  }, [user]);

  /** End-user OAuth BFF failures redirect to /marketing (not /login) so FAB/dock stay mounted — toast here. */
  useEffect(() => {
    if (showEndUserOAuthErrorToast(searchParams)) {
      stripEndUserOAuthErrorParamsFromUrl();
    }
  }, [searchParams]);

  /** SSO silent sign-in: PingOne skipped the credential prompt (active session reuse). */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('sso_silent') !== '1') return;
    // Remove the param from the URL without a page reload
    params.delete('sso_silent');
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
    window.history.replaceState(null, '', newUrl);
    notifyInfo('✅ Signed in automatically — you had an active PingOne session.', { autoClose: 6000 });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount only
  }, []);

  /** OAuth success landing: strip ?oauth= param from URL — same pattern as sso_silent handler above. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search || '');
    if (!params.has('oauth')) return;
    params.delete('oauth');
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
    window.history.replaceState(null, '', newUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount only
  }, []);

  /** Nav rail / layout flags — computed declaratively so React className is always in sync. */
  const showQuickNav = Boolean(user) && isDashboardQuickNavRoute(pathname, user);
  const isOnDashboard = pathname === '/dashboard';

  /** Floating agent: dashboard homes only. Embedded dock: those routes plus `/config` (setup-focused assistant). */
  const onDashboardAgentRoute = isBankingAgentDashboardRoute(pathname);
  const onEmbeddedDockRoute = isEmbeddedAgentDockRoute(pathname);

  // Routes where UserDashboard is rendered (handles its own middle FAB + split layout and its own bottom dock).
  // Admin uses Dashboard.js on /admin — those routes need the global float/dock from App.
  // / now renders LandingPage for non-admin logged-in users; UserDashboard lives at /dashboard.
  const onUserDashboardRoute =
    Boolean(user) &&
    pathname === '/dashboard';

  // Marketing home (/ or /marketing): show floating agent even when signed out; signed-in /marketing too.
  // Suppress float on signed-in / only when UserDashboard owns middle placement.
  const marketingAgentSurface =
    isPublicMarketingAgentPath(pathname) && (!user || pathNorm === '/marketing');

  // Marketing `/` + `/marketing`: always reserve bottom dock (float + bottom) regardless of agent UI toggle.
  const hasEmbeddedDockLayout =
    isMarketingEmbeddedDockSurface(pathname, user) ||
    (Boolean(user) && agentPlacement === 'bottom' && onEmbeddedDockRoute);

  const showFloatingAgent =
    !isApiTrafficOnlyPage &&
    !hasEmbeddedDockLayout &&
    (marketingAgentSurface ||
      (Boolean(user) &&
        onDashboardAgentRoute &&
        !(agentPlacement === 'middle' && onUserDashboardRoute) &&
        !((agentPlacement === 'left-dock' || agentPlacement === 'right-dock') && !agentFab)));

  /** Slower default dismiss on public landing so OAuth/agent messages are readable (signed-in routes stay 4s). */
  const toastContainerAutoCloseMs =
    !user && isPublicMarketingAgentPath(pathname) ? 12000 : 4000;

  const logout = () => {
    console.info('Starting logout — navigating to /api/auth/logout');

    localStorage.setItem('userLoggedOut', 'true');

    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    sessionStorage.clear();

    window.dispatchEvent(new CustomEvent('userLoggedOut'));

    localStorage.removeItem('tokenChainHistory');
    window.location.href = '/api/auth/logout';
  };

  return (
    <DemoTourProvider>
    <EducationUIProvider>
      <TokenChainProvider>
        <div
          className={`App end-user-nano${showQuickNav ? ' App--has-quick-nav' : ''}${isOnDashboard ? ' App--on-dashboard' : ''}${hasEmbeddedDockLayout ? ' App--has-embedded-dock' : ''}${sessionReauth ? ' App--session-reauth' : ''}${isMarketingEmbeddedDockSurface(pathname, user) ? ' App--marketing-page' : ''}`}
        >
          <ToastContainer position="top-right" autoClose={toastContainerAutoCloseMs} hideProgressBar={false} newestOnTop closeOnClick pauseOnHover draggable />
          {sessionReauth && (
            <SessionReauthBanner
              message={sessionReauth.message}
              role={sessionReauth.role}
              isHITL={sessionReauth.isHITL || false}
              onDismiss={() => setSessionReauth(null)}
            />
          )}
          <DashboardQuickNav user={user} />
          <Routes>
            <Route path="/setup/pingone" element={<PingOneSetupGuidePage />} />
            <Route path="/setup/wizard" element={<SetupWizard />} />
            <Route path="/setup" element={<SetupPage />} />
            {/* Demo config accessible without login - needed to configure flags before PingOne is set up */}
            <Route path="/configure" element={
              <>
                <TopNav user={user} onLogout={logout} />
                <main className="main-content">
                  <EducationBar />
                  <UnifiedConfigurationPage user={user} onLogout={logout} />
                </main>
              </>
            } />
            <Route path="/demo-data" element={
              <>
                <TopNav user={user} onLogout={logout} />
                <main className="main-content">
                  <EducationBar />
                  <DemoDataPage user={user} onLogout={logout} />
                </main>
              </>
            } />
            {/* Self-service user provisioning — accessible without login */}
            <Route path="/self-service" element={
              <>
                <TopNav user={user} onLogout={logout} />
                <main className="main-content">
                  <EducationBar />
                  <SelfServicePage />
                </main>
              </>
            } />
            <Route
              path="/onboarding"
              element={
                user && user.role !== 'admin' ? <Navigate to="/" replace /> : <Onboarding />
              }
            />
            {/* Explicit /marketing so the SPA always resolves the real agents (float + dock), not only splat * */}
            <Route
              path="/marketing"
              element={
                !user ? (
                  <LandingPage />
                ) : (
                  <main className="main-content">
                    <EducationBar />
                    <LandingPage user={user} onLogout={logout} />
                  </main>
                )
              }
            />
            <Route path="/logout" element={<LogoutPage />} />

            <Route path="*" element={
              !user ? (
                <LandingPage />
              ) : (
                <>
                  <TopNav user={user} onLogout={logout} />
                  <main className="main-content">
                    <EducationBar />
                    <Routes location={backgroundLocation || fullLocation}>
                    <Route path="/" element={user?.role === 'admin' ? <Dashboard user={user} onLogout={logout} /> : <LandingPage user={user} onLogout={logout} />} />
                    <Route path="/admin" element={<AdminRoute user={user}><Dashboard user={user} onLogout={logout} /></AdminRoute>} />
                    <Route path="/dashboard" element={<UserDashboard user={user} onLogout={logout} />} />
                    <Route path="/config"      element={<Navigate to="/configure?tab=pingone-config" replace />} />
                    <Route path="/logs"        element={user ? <LogViewerPage /> : <Navigate to="/" replace />} />
                    <Route path="/api-traffic" element={user ? <ApiTrafficPage /> : <Navigate to="/" replace />} />
                    <Route path="/agent"       element={<BankingAgent user={user} onLogout={logout} mode="inline" />} />
                    <Route path="/activity" element={<AdminRoute user={user}><ActivityLogs user={user} onLogout={logout} /></AdminRoute>} />
                    <Route path="/audit" element={<AdminRoute user={user}><AuditPage user={user} /></AdminRoute>} />
                    <Route path="/users" element={<AdminRoute user={user}><Users user={user} onLogout={logout} /></AdminRoute>} />
                    <Route path="/accounts" element={<AdminRoute user={user}><Accounts user={user} onLogout={logout} /></AdminRoute>} />
                    <Route path="/transactions" element={<AdminRoute user={user}><Transactions user={user} onLogout={logout} /></AdminRoute>} />
                    <Route
                      path="/admin/banking"
                      element={<AdminRoute user={user}><BankingAdminOps user={user} onLogout={logout} /></AdminRoute>}
                    />
                    <Route path="/transaction-consent" element={<TransactionConsentPage user={user} />} />
                    <Route path="/delegated-access" element={<DelegatedAccessPage user={user} onLogout={logout} />} />
                    <Route path="/delegation" element={user ? <DelegationPage user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                    <Route path="/feature-flags"
                      element={user ? <FeatureFlagsPage /> : <Navigate to="/" replace />}
                    />
                    <Route path="/langchain" element={<LangChainPage />} />
                    <Route path="/settings" element={<AdminRoute user={user}><SecuritySettings user={user} onLogout={logout} /></AdminRoute>} />
                    <Route path="/mcp-inspector" element={<McpInspector user={user} onLogout={logout} />} />
                    <Route path="/oauth-debug-logs"
                      element={<AdminRoute user={user}><OAuthDebugLogViewer /></AdminRoute>}
                    />
                    <Route path="/client-registration"
                      element={<AdminRoute user={user}><ClientRegistrationPage /></AdminRoute>}
                    />
                    <Route path="/postman" element={<PostmanCollectionsPage user={user} onLogout={logout} />} />
                    <Route path="/scope-audit" element={<AdminRoute user={user}><ScopeAuditPage /></AdminRoute>} />
                    {/* Test & educational pages */}
                    <Route path="/pingone-test" element={user ? <PingOneTestPage /> : <Navigate to="/" replace />} />
                    <Route path="/mfa-test" element={user ? <MFATestPage /> : <Navigate to="/" replace />} />
                    {/* User-friendly self-service routes */}
                    <Route path="/accounts" element={<UserAccounts user={user} />} />
                    <Route path="/transactions" element={<UserTransactions user={user} />} />
                    <Route path="/profile" element={<Profile user={user} />} />
                    <Route path="/security" element={<SecurityCenter user={user} />} />
                  </Routes>
                  {backgroundLocation && fullLocation.pathname === '/audit' && (
                    <AdminRoute user={user}><AuditPage user={user} onClose={() => window.history.back()} /></AdminRoute>
                  )}
                </main>
                </>
              )
            } />
          </Routes>
          {showFloatingAgent && (
            <BankingAgent user={user} onLogout={logout} distinctFloatingChrome />
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
          {/* Side dock — mounts globally for left-dock and right-dock placements */}
          {(agentPlacement === 'left-dock' || agentPlacement === 'right-dock') && (
            <SideAgentDock
              user={user}
              onLogout={logout}
              side={agentPlacement === 'left-dock' ? 'left' : 'right'}
            />
          )}
          {/* UserDashboard renders EmbeddedAgentDock inside its layout. App-level dock sits in document
              order directly above the footer on marketing and other non-dashboard routes. */}
          {!onUserDashboardRoute && (
            <EmbeddedAgentDock user={user} onLogout={logout} agentPlacement={agentPlacement} />
          )}
          {!isApiTrafficOnlyPage && <Footer user={user} />}
          <ServerRestartModal />
          {!isApiTrafficOnlyPage && <DemoTourModal />}
          <SpinnerHost />
        </div>
      </TokenChainProvider>
    </EducationUIProvider>
    </DemoTourProvider>
  );
}

export default function App() {
  return (
    <SpinnerProvider>
      <AgentUiModeProvider>
        <ExchangeModeProvider>
          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <IndustryBrandingProvider>
              <VerticalProvider>
                <AppWithAuth />
              </VerticalProvider>
            </IndustryBrandingProvider>
          </Router>
        </ExchangeModeProvider>
      </AgentUiModeProvider>
    </SpinnerProvider>
  );
}
