import { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import LandingPage from './components/LandingPage';
import BankingAgent from './components/BankingAgent';
import Dashboard from './components/Dashboard';
import UserDashboard from './components/UserDashboard';
import ActivityLogs from './components/ActivityLogs';
import Users from './components/Users';
import Accounts from './components/Accounts';
import BankingAdminOps from './components/BankingAdminOps';
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
import TransactionConsentPage from './components/TransactionConsentPage';

import { savePublicConfig } from './services/configService';
import { fetchDemoScenario } from './services/demoScenarioService';
import { toastLogStore } from './services/toastLogStore';
import { EducationUIProvider } from './context/EducationUIContext';
import { TokenChainProvider } from './context/TokenChainContext';
import { AgentUiModeProvider, useAgentUiMode } from './context/AgentUiModeContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import EducationBar from './components/EducationBar';
import EducationPanelsHost from './components/education/EducationPanelsHost';
import Footer from './components/Footer';
import {
  isBankingAgentDashboardRoute,
  shouldShowGlobalFloatingBankingAgentFab,
} from './utils/embeddedAgentFabVisibility';
import LoadingOverlay from './components/shared/LoadingOverlay';
import { setAgentBlockedByConsentDecline } from './services/agentAccessConsent';
import './App.css';

axios.defaults.withCredentials = true;

/** Persists across full navigation to /api/auth/logout → PingOne → /logout so the wait overlay can show immediately on landing. */
const SESSION_LOGOUT_PENDING_KEY = 'banking_logout_pending';

const EMBEDDED_DOCK_AGENT_HEIGHT_KEY = 'banking_embedded_dock_agent_height_px';
const EMBEDDED_DOCK_COLLAPSED_KEY = 'banking_embedded_dock_collapsed';
/** Default height for the chat area in the bottom-integrated dock (user can resize). */
const DEFAULT_EMBEDDED_AGENT_HEIGHT = 280;
const MIN_EMBEDDED_AGENT_HEIGHT = 140;

/** Persisted height (px) of the embedded agent chat area (bottom dock). */
function readEmbeddedAgentHeight() {
  try {
    const n = parseInt(localStorage.getItem(EMBEDDED_DOCK_AGENT_HEIGHT_KEY), 10);
    if (Number.isFinite(n)) {
      return Math.max(MIN_EMBEDDED_AGENT_HEIGHT, Math.min(360, n));
    }
  } catch {
    // ignore
  }
  return DEFAULT_EMBEDDED_AGENT_HEIGHT;
}

function maxEmbeddedAgentHeight() {
  if (typeof window === 'undefined') return 360;
  return Math.min(360, Math.floor(window.innerHeight * 0.41));
}

/** Session/auth tracing only in development (production builds stay quiet). */
function devLog(...args) {
  if (process.env.NODE_ENV === 'production') return;
  // eslint-disable-next-line no-console -- intentional local debugging
  console.log(...args);
}

/**
 * Module-level logout guard — persists for the lifetime of the JS runtime
 * (i.e. until a full page reload).  Set to true the moment logout is triggered
 * so that any re-run of the startup useEffect (caused by checkOAuthSession
 * reference changing) cannot call checkOAuthSession and re-authenticate.
 */
let _didLogOut = false;

function GlobalFloatingBankingAgent({ user, onLogout, agentUiMode, pathname }) {
  if (!shouldShowGlobalFloatingBankingAgentFab({ user, agentUiMode, pathname })) return null;
  return <BankingAgent user={user} onLogout={onLogout} mode="float" />;
}

function AppWithAuth() {
  const location = useLocation();
  const pathname = location.pathname || '';
  const { theme: appTheme, effectiveAgentTheme } = useTheme();
  const { mode: agentUiMode, setMode: setAgentUiMode } = useAgentUiMode();
  const embeddedDockWrapRef = useRef(null);
  const [embeddedAgentBodyHeight, setEmbeddedAgentBodyHeight] = useState(readEmbeddedAgentHeight);
  const [embeddedDockCollapsed, setEmbeddedDockCollapsed] = useState(() => {
    try { return localStorage.getItem(EMBEDDED_DOCK_COLLAPSED_KEY) === 'true'; } catch { return false; }
  });
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logViewerOpen, setLogViewerOpen] = useState(false);
  const [loadingOverlay, setLoadingOverlay] = useState(() => {
    if (typeof window === 'undefined') return { show: false, message: '', sub: '' };
    try {
      if (sessionStorage.getItem(SESSION_LOGOUT_PENDING_KEY) === '1') {
        return {
          show: true,
          message: 'Signing you out…',
          sub: 'Clearing your session',
        };
      }
    } catch {
      // ignore
    }
    return { show: false, message: '', sub: '' };
  });

  // Module-scoped ref for injecting user email into the WebSocket session_init message.
  // Using a ref keeps userEmail out of window scope (avoids PII on global object).
  const pendingUserEmailRef = useRef(null);
  /** Avoid dispatching userAuthenticated on every repeat check (prevents listener ↔ check loops). */
  const sessionEstablishedRef = useRef(false);
  const toastPatchedRef = useRef(false);

  const logRuntimeMessage = useCallback((payload) => {
    axios.post('/api/logs/runtime-message', payload).catch(() => {});
  }, []);

  // Inject userEmail into the first session_init WS message then restore send.
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
    function notifyAuthenticatedOnce() {
      if (!sessionEstablishedRef.current) {
        sessionEstablishedRef.current = true;
        window.dispatchEvent(new CustomEvent('userAuthenticated'));
      }
    }

    function applySessionUser(u) {
      setUser(u);
      const userEmail = u?.email;
      if (userEmail) {
        injectEmailIntoNextSessionInit(userEmail);
      }
      setLoading(false);
      notifyAuthenticatedOnce();
      return true;
    }

    try {
      // Priority: admin OAuth → end-user OAuth → generic cookie session
      const adminResponse = await axios.get('/api/auth/oauth/status');

      if (adminResponse.data.authenticated) {
        return applySessionUser(adminResponse.data.user);
      }

      const userResponse = await axios.get('/api/auth/oauth/user/status');

      if (userResponse.data.authenticated) {
        return applySessionUser(userResponse.data.user);
      }

      const sessionResponse = await axios.get('/api/auth/session');
      if (sessionResponse.data.authenticated) {
        return applySessionUser(sessionResponse.data.user);
      }

      setLoading(false);
      return false;
    } catch (error) {
      devLog('[App] Session check failed:', error?.message || error);
      setLoading(false);
      return false;
    }
  }, [injectEmailIntoNextSessionInit]);

  /**
   * After sign-in, apply agent layout from persisted demo scenario when set (server/KV).
   * Otherwise AgentUiModeProvider keeps the value from localStorage. Unset server value → no change.
   */
  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchDemoScenario();
        if (cancelled) return;
        const m = data?.settings?.bankingAgentUiMode;
        if (m === 'embedded' || m === 'floating') setAgentUiMode(m);
      } catch {
        // Missing demo API or network — keep localStorage / context default
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, setAgentUiMode]);

  // Masked public config → IndexedDB once per full page load (not tied to checkOAuthSession).
  // Reduces duplicate GET /api/admin/config and helps avoid 429 on shared IPs / tight rate limits.
  useEffect(() => {
    const currentPath =
      typeof window !== 'undefined' && typeof window.location?.pathname === 'string'
        ? window.location.pathname
        : '';
    if (localStorage.getItem('userLoggedOut') === 'true') return;
    if (currentPath === '/logout' || currentPath.endsWith('/logout')) return;
    if (currentPath === '/demo-data') return;

    axios
      .get('/api/admin/config')
      .then(({ data }) => savePublicConfig(data.config))
      .catch(() => {}); // non-fatal
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
      _didLogOut = true; // keep set so re-runs of this effect (checkOAuthSession ref change) skip auth check
      // Keep userLoggedOut in localStorage until clear-session finishes. Otherwise a second effect run
      // (e.g. React Strict Mode or checkOAuthSession identity change) can call checkOAuthSession and
      // restore the session before cookies are cleared — forcing users to click Log out twice.
      const finishLogout = () => {
        try {
          sessionStorage.removeItem(SESSION_LOGOUT_PENDING_KEY);
        } catch {
          // ignore
        }
        localStorage.removeItem('userLoggedOut');
        setUser(null);
        setLoading(false);
        setLoadingOverlay({ show: false, message: '', sub: '' });
        if (isPostLogoutLanding && window.history?.replaceState) {
          window.history.replaceState(null, '', '/');
        }
      };
      fetch('/api/auth/clear-session', { method: 'POST', credentials: 'include' })
        .catch(() => {})
        .finally(finishLogout);
      return;
    }

    const oauthSuccess =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search || '').get('oauth') === 'success';

    /** After OAuth redirect the session can lag; retry with increasing backoff (matches App.session tests). */
    const RETRY_DELAYS_MS = [450, 950, 1900];
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
    if (toastPatchedRef.current) return undefined;
    toastPatchedRef.current = true;

    const DEFAULT_TOAST_MS = 22000;

    const applyDefaultAutoClose = (options = {}) => {
      if (options.autoClose === false) return options;
      if (typeof options.autoClose === 'number') {
        return { ...options, autoClose: Math.max(options.autoClose, DEFAULT_TOAST_MS) };
      }
      return { ...options, autoClose: DEFAULT_TOAST_MS };
    };

    const patchToastMethod = (methodName) => {
      const original = toast[methodName];
      if (typeof original !== 'function') return;
      toast[methodName] = (content, options) => original(content, applyDefaultAutoClose(options));
    };

    patchToastMethod('success');
    patchToastMethod('error');
    patchToastMethod('info');
    patchToastMethod('warning');
    patchToastMethod('warn');

    /**
     * Best-effort text from toast content (string or simple React children).
     * @param {unknown} content
     * @returns {string}
     */
    const extractToastText = (content) => {
      if (content == null) return '';
      if (typeof content === 'string' || typeof content === 'number') return String(content);
      if (typeof content === 'function') return '[Custom toast]';
      const ch = content?.props?.children;
      if (ch == null) return '[Toast]';
      if (typeof ch === 'string' || typeof ch === 'number') return String(ch);
      if (Array.isArray(ch)) return ch.map(extractToastText).filter(Boolean).join(' ').trim() || '[Toast]';
      return String(ch);
    };

    const toastTypeToLevel = (t) => {
      switch (t) {
        case 'error':
          return 'error';
        case 'warning':
        case 'warn':
          return 'warn';
        case 'info':
        case 'success':
        case 'default':
        default:
          return 'info';
      }
    };

    const unsubscribe =
      typeof toast.onChange === 'function'
        ? toast.onChange((event) => {
            if (!event || event.status !== 'added') return;

            const message = extractToastText(event.content);
            let detail = '';
            if (event.data != null) {
              if (typeof event.data === 'string') detail = event.data;
              else {
                try {
                  detail = JSON.stringify(event.data, null, 2);
                } catch {
                  detail = String(event.data);
                }
              }
            }

            logRuntimeMessage({
              source: 'toast',
              status: event.status,
              level: event.type || 'info',
              toastId: event.id || null,
              message,
            });

            toastLogStore.append({
              timestamp: new Date().toISOString(),
              level: toastTypeToLevel(event.type || 'default'),
              message,
              detail,
              toastType: event.type || 'default',
              toastId: event.id != null ? String(event.id) : '',
              category: 'toast messages',
              _src: 'toast',
            });
          })
        : null;

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [logRuntimeMessage]);

  // BankingAgent (and tests) may dispatch userAuthenticated to force a server re-check after client-side login hints.
  useEffect(() => {
    const handler = () => {
      void checkOAuthSession();
    };
    window.addEventListener('userAuthenticated', handler);
    return () => window.removeEventListener('userAuthenticated', handler);
  }, [checkOAuthSession]);

  const handleToggleEmbeddedDock = useCallback(() => {
    setEmbeddedDockCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(EMBEDDED_DOCK_COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const showEmbeddedDock = agentUiMode === 'embedded' && isBankingAgentDashboardRoute(pathname);

  useEffect(() => {
    if (!showEmbeddedDock) return undefined;
    const onWinResize = () => {
      const maxH = maxEmbeddedAgentHeight();
      setEmbeddedAgentBodyHeight((h) => Math.max(MIN_EMBEDDED_AGENT_HEIGHT, Math.min(maxH, h)));
    };
    window.addEventListener('resize', onWinResize);
    onWinResize();
    return () => window.removeEventListener('resize', onWinResize);
  }, [showEmbeddedDock]);

  const onEmbeddedDockResizeMouseDown = useCallback((e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = embeddedAgentBodyHeight;
    const maxH = maxEmbeddedAgentHeight();
    let last = startH;
    function onMove(ev) {
      const dy = ev.clientY - startY;
      const next = Math.round(startH - dy);
      last = Math.max(MIN_EMBEDDED_AGENT_HEIGHT, Math.min(maxH, next));
      setEmbeddedAgentBodyHeight(last);
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      try {
        localStorage.setItem(EMBEDDED_DOCK_AGENT_HEIGHT_KEY, String(last));
      } catch {
        // ignore
      }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [embeddedAgentBodyHeight]);

  const logout = () => {
    sessionEstablishedRef.current = false;
    _didLogOut = true;

    setLoadingOverlay({ show: true, message: 'Signing you out…', sub: 'Ending your PingOne session' });

    // Signal that the user intentionally logged out so the startup
    // session-check in useEffect skips auto-login on return to /login.
    localStorage.setItem('userLoggedOut', 'true');

    // Clear leftover client-side storage.
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    setAgentBlockedByConsentDecline(false);
    sessionStorage.clear();

    // Notify the chat widget immediately.
    window.dispatchEvent(new CustomEvent('userLoggedOut'));

    try {
      sessionStorage.setItem(SESSION_LOGOUT_PENDING_KEY, '1');
    } catch {
      // ignore
    }

    // Delay lets React paint the full-screen wait overlay before navigation unloads the page.
    // Navigate the browser directly (NOT via axios) to the unified logout
    // endpoint. Express will destroy the server session, then 302-redirect
    // the browser to PingOne's RP-Initiated Logout → post_logout_redirect_uri
    // (/logout). SESSION_LOGOUT_PENDING_KEY keeps the overlay visible after reload.
    setTimeout(() => { window.location.href = '/api/auth/logout'; }, 420);
  };

  if (loading) {
    return (
      <>
        <LoadingOverlay
          show={loadingOverlay.show}
          message={loadingOverlay.message || 'Please wait…'}
          sub={loadingOverlay.sub}
        />
        <div className="loading">
          <div>Loading...</div>
        </div>
      </>
    );
  }

  const isLogsRoute = pathname === '/logs' || pathname.startsWith('/logs/');

  /** Signed-in home matches SideNav / dashboard FAB (`/admin` | `/dashboard`), not only `/`, so HOME navigates reliably under nested splat routing. */
  const homeFabPath = !user ? '/' : user.role === 'admin' ? '/admin' : '/dashboard';

  /** Scroll to top when going home (same dashboard component may stay mounted across `/` vs `/dashboard`). */
  function handleHomeFabClick() {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    const inner = document.querySelector('.dashboard-content.ud-body');
    if (inner) inner.scrollTop = 0;
  }

  return (
    <>
      <EducationUIProvider>
      <TokenChainProvider>
        <div
          className={`App end-user-nano${user ? ' App--has-nav-dash' : ''}`}
        >
          <ToastContainer
            theme={appTheme === 'dark' ? 'dark' : 'light'}
            position="bottom-right"
            autoClose={22000}
            hideProgressBar={false}
            newestOnTop
            closeOnClick
            pauseOnHover
            draggable
            // Increase spacing from viewport edges.
            // react-toastify uses --toastify-toast-offset to compute bottom/right placement.
            style={{ '--toastify-toast-offset': '96px' }}
          />
          {/* Config page is always accessible, regardless of auth state */}
          <Routes>
            <Route path="/config" element={<Config />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/logs" element={<LogViewerPage />} />
            <Route path="/api-traffic" element={<ApiTrafficPage />} />
            <Route path="*" element={
              !user ? (
                <LandingPage />
              ) : (
                <main
                  className={`main-content${showEmbeddedDock ? ' main-content--embedded-dock' : ''}`}
                >
                  {showEmbeddedDock ? (
                    <>
                      <div className="main-content__primary">
                        <EducationBar />
                        <Routes>
                          <Route path="/" element={user?.role === 'admin' ? <Dashboard user={user} onLogout={logout} agentUiMode={agentUiMode} /> : <UserDashboard user={user} onLogout={logout} agentUiMode={agentUiMode} />} />
                          <Route path="/admin" element={user?.role === 'admin' ? <Dashboard user={user} onLogout={logout} agentUiMode={agentUiMode} /> : <Navigate to="/" replace />} />
                          <Route path="/dashboard" element={<UserDashboard user={user} onLogout={logout} agentUiMode={agentUiMode} />} />
                          <Route path="/demo-data" element={<DemoDataPage user={user} onLogout={logout} />} />
                          <Route path="/transaction-consent" element={<TransactionConsentPage user={user} onLogout={logout} />} />
                          <Route path="/activity" element={user?.role === 'admin' ? <ActivityLogs user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                          <Route path="/users" element={user?.role === 'admin' ? <Users user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                          <Route path="/accounts" element={user?.role === 'admin' ? <Accounts user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                          <Route path="/admin/banking" element={user?.role === 'admin' ? <BankingAdminOps user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                          <Route path="/transactions" element={user?.role === 'admin' ? <Transactions user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
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
                      </div>
                      <div
                        ref={embeddedDockWrapRef}
                        className="global-embedded-agent-dock-wrap"
                        role="region"
                        aria-label="AI banking assistant"
                      >
                        <div
                          className={`embedded-agent-dock${embeddedDockCollapsed ? ' embedded-agent-dock--collapsed' : ''}`}
                          data-agent-theme={effectiveAgentTheme}
                        >
                          <div className="embedded-agent-dock__head">
                            <h2 className="embedded-agent-dock__title">AI banking assistant</h2>
                            <p className="embedded-agent-dock__lead">
                              Natural language and MCP tools — step chips show what ran.
                            </p>
                            <button
                              type="button"
                              className="embedded-dock-collapse-btn"
                              onClick={handleToggleEmbeddedDock}
                              aria-label={embeddedDockCollapsed ? 'Expand assistant panel' : 'Collapse assistant panel'}
                              title={embeddedDockCollapsed ? 'Expand' : 'Collapse'}
                            >
                              {embeddedDockCollapsed ? '▲' : '▼'}
                            </button>
                          </div>
                          {!embeddedDockCollapsed && (
                            <>
                              <button
                                type="button"
                                className="embedded-dock-resize-handle"
                                onMouseDown={onEmbeddedDockResizeMouseDown}
                                aria-label="Drag up or down to resize assistant panel height"
                                title="Drag up or down to resize the assistant"
                              >
                                <span className="embedded-dock-resize-handle__grip" aria-hidden="true">
                                  <span className="embedded-dock-resize-handle__bar" />
                                </span>
                              </button>
                              <div
                                className="embedded-banking-agent embedded-banking-agent--bottom"
                                style={{ height: embeddedAgentBodyHeight }}
                              >
                                <BankingAgent user={user} onLogout={logout} mode="inline" embeddedDockBottom />
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <EducationBar />
                      <Routes>
                        <Route path="/" element={user?.role === 'admin' ? <Dashboard user={user} onLogout={logout} agentUiMode={agentUiMode} /> : <UserDashboard user={user} onLogout={logout} agentUiMode={agentUiMode} />} />
                        <Route path="/admin" element={user?.role === 'admin' ? <Dashboard user={user} onLogout={logout} agentUiMode={agentUiMode} /> : <Navigate to="/" replace />} />
                        <Route path="/dashboard" element={<UserDashboard user={user} onLogout={logout} agentUiMode={agentUiMode} />} />
                        <Route path="/demo-data" element={<DemoDataPage user={user} onLogout={logout} />} />
                        <Route path="/transaction-consent" element={<TransactionConsentPage user={user} onLogout={logout} />} />
                        <Route path="/activity" element={user?.role === 'admin' ? <ActivityLogs user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                        <Route path="/users" element={user?.role === 'admin' ? <Users user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                        <Route path="/accounts" element={user?.role === 'admin' ? <Accounts user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                        <Route path="/admin/banking" element={user?.role === 'admin' ? <BankingAdminOps user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                        <Route path="/transactions" element={user?.role === 'admin' ? <Transactions user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
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
                    </>
                  )}
                </main>
              )
            } />
          </Routes>
          <GlobalFloatingBankingAgent user={user} onLogout={logout} agentUiMode={agentUiMode} pathname={pathname} />
          <EducationPanelsHost />
          {!isLogsRoute && (
            <Link
              className="nav-home-fab"
              to={homeFabPath}
              title={user ? 'Go to home dashboard' : 'Go to home'}
              onClick={handleHomeFabClick}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>HOME</span>
            </Link>
          )}
          {user && !isLogsRoute && (
            <Link
              className="nav-dashboard-fab"
              to={user.role === 'admin' ? '/admin' : '/dashboard'}
              title={user.role === 'admin' ? 'Admin dashboard' : 'My dashboard'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="7" height="9" x="3" y="3" rx="1" />
                <rect width="7" height="5" x="14" y="3" rx="1" />
                <rect width="7" height="9" x="14" y="12" rx="1" />
                <rect width="7" height="5" x="3" y="16" rx="1" />
              </svg>
              <span>{user.role === 'admin' ? 'Admin' : 'Dashboard'}</span>
            </Link>
          )}
          {!isLogsRoute && <CIBAPanel />}
          {!isLogsRoute && <CimdSimPanel />}
          <LogViewer isOpen={logViewerOpen} onClose={() => setLogViewerOpen(false)} />
          {/* Floating Log Viewer Button — opens in a new window so it stays visible */}
          {!isLogsRoute && (
            <button
              className="log-viewer-fab"
              onClick={() => window.open('/logs', 'BankingLogs', 'width=1400,height=900,scrollbars=yes,resizable=yes')}
              title="Open Log Viewer in new window"
              type="button"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="9" y1="13" x2="15" y2="13"/>
                <line x1="9" y1="17" x2="13" y2="17"/>
              </svg>
              <span>Logs</span>
            </button>
          )}
          {!isLogsRoute && (
            <button
              className="api-traffic-fab"
              type="button"
              onClick={() =>
                window.open('/api-traffic', 'ApiTraffic', 'width=1400,height=900,scrollbars=yes,resizable=yes')
              }
              title="Open API Traffic in a new window — move to another monitor like Logs"
            >
              🌐 API
            </button>
          )}
          {user && !isLogsRoute && pathname !== '/demo-data' && (
            <button
              className="demo-config-fab"
              onClick={() => { window.location.href = '/demo-data'; }}
              title="Open Demo config"
              type="button"
            >
              Demo config
            </button>
          )}
          <Footer user={user} />
        </div>
      </TokenChainProvider>
      </EducationUIProvider>
      <LoadingOverlay
        show={loadingOverlay.show}
        message={loadingOverlay.message}
        sub={loadingOverlay.sub}
      />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AgentUiModeProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppWithAuth />
        </Router>
      </AgentUiModeProvider>
    </ThemeProvider>
  );
}