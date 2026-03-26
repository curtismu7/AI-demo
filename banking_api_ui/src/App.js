import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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
import ApiTrafficPanel from './components/ApiTrafficPanel';
import ApiTrafficPage from './components/ApiTrafficPage';

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
import { shouldShowGlobalFloatingBankingAgentFab } from './utils/embeddedAgentFabVisibility';
import './App.css';

const EMBEDDED_DOCK_AGENT_HEIGHT_KEY = 'banking_embedded_dock_agent_height_px';
const DEFAULT_EMBEDDED_AGENT_HEIGHT = 380;
const MIN_EMBEDDED_AGENT_HEIGHT = 220;

/** Persisted height (px) of the embedded agent chat area (bottom dock). */
function readEmbeddedAgentHeight() {
  try {
    const n = parseInt(localStorage.getItem(EMBEDDED_DOCK_AGENT_HEIGHT_KEY), 10);
    if (Number.isFinite(n)) {
      return Math.max(MIN_EMBEDDED_AGENT_HEIGHT, Math.min(720, n));
    }
  } catch {
    // ignore
  }
  return DEFAULT_EMBEDDED_AGENT_HEIGHT;
}

function maxEmbeddedAgentHeight() {
  if (typeof window === 'undefined') return 720;
  return Math.min(720, Math.floor(window.innerHeight * 0.82));
}

/** Session/auth tracing only in development (production builds stay quiet). */
function devLog(...args) {
  if (process.env.NODE_ENV === 'production') return;
  // eslint-disable-next-line no-console -- intentional local debugging
  console.log(...args);
}

function GlobalFloatingBankingAgent({ user, onLogout, agentUiMode }) {
  if (!shouldShowGlobalFloatingBankingAgentFab({ user, agentUiMode })) return null;
  return <BankingAgent user={user} onLogout={onLogout} mode="float" />;
}

function AppWithAuth() {
  const { theme: appTheme, effectiveAgentTheme } = useTheme();
  const { mode: agentUiMode, setMode: setAgentUiMode } = useAgentUiMode();
  const embeddedDockWrapRef = useRef(null);
  const [embeddedAgentBodyHeight, setEmbeddedAgentBodyHeight] = useState(readEmbeddedAgentHeight);
  const [embeddedDockReservePx, setEmbeddedDockReservePx] = useState(420);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logViewerOpen, setLogViewerOpen] = useState(false);
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
    const userLoggedOut = localStorage.getItem('userLoggedOut');
    if (userLoggedOut === 'true') return;

    const currentPath =
      typeof window !== 'undefined' && typeof window.location?.pathname === 'string'
        ? window.location.pathname
        : '';
    if (currentPath === '/demo-data') return;

    axios
      .get('/api/admin/config')
      .then(({ data }) => savePublicConfig(data.config))
      .catch(() => {}); // non-fatal
  }, []);

  useEffect(() => {
    const userLoggedOut = localStorage.getItem('userLoggedOut');
    if (userLoggedOut === 'true') {
      localStorage.removeItem('userLoggedOut');
      setLoading(false);
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

  const updateEmbeddedDockReserve = useCallback(() => {
    const el = embeddedDockWrapRef.current;
    if (!el) return;
    setEmbeddedDockReservePx(Math.ceil(el.getBoundingClientRect().height) + 8);
  }, []);

  useLayoutEffect(() => {
    if (agentUiMode !== 'embedded') return undefined;
    updateEmbeddedDockReserve();
    const el = embeddedDockWrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => updateEmbeddedDockReserve());
    ro.observe(el);
    return () => ro.disconnect();
  }, [agentUiMode, embeddedAgentBodyHeight, updateEmbeddedDockReserve]);

  useEffect(() => {
    if (agentUiMode !== 'embedded') return undefined;
    const onWinResize = () => {
      const maxH = maxEmbeddedAgentHeight();
      setEmbeddedAgentBodyHeight((h) => Math.max(MIN_EMBEDDED_AGENT_HEIGHT, Math.min(maxH, h)));
    };
    window.addEventListener('resize', onWinResize);
    onWinResize();
    return () => window.removeEventListener('resize', onWinResize);
  }, [agentUiMode]);

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

    // Signal that the user intentionally logged out so the startup
    // session-check in useEffect skips auto-login on return to /login.
    localStorage.setItem('userLoggedOut', 'true');

    // Clear leftover client-side storage.
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    sessionStorage.clear();

    // Notify the chat widget immediately.
    window.dispatchEvent(new CustomEvent('userLoggedOut'));

    // Navigate the browser directly (NOT via axios) to the unified logout
    // endpoint. Express will destroy the server session, then 302-redirect
    // the browser to PingOne's RP-Initiated Logout → post_logout_redirect_uri
    // (/login). This ensures the PingOne SSO session is actually terminated
    // and a subsequent login will prompt for credentials fresh.
    window.location.href = '/api/auth/logout';
  };

  if (loading) {
    return (
      <div className="loading">
        <div>Loading...</div>
      </div>
    );
  }

  const currentPath =
    typeof window !== 'undefined' && typeof window.location?.pathname === 'string'
      ? window.location.pathname
      : '';
  const isLogsRoute = currentPath === '/logs' || currentPath.startsWith('/logs/');

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <EducationUIProvider>
      <TokenChainProvider>
        <div
          className={`App end-user-nano${agentUiMode === 'embedded' ? ' App--has-embedded-dock' : ''}`}
          style={
            agentUiMode === 'embedded'
              ? { '--embedded-dock-reserve': `${embeddedDockReservePx}px` }
              : undefined
          }
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
                <main className="main-content">
                  <EducationBar />
                  <Routes>
                    <Route path="/" element={user?.role === 'admin' ? <Dashboard user={user} onLogout={logout} agentUiMode={agentUiMode} /> : <UserDashboard user={user} onLogout={logout} agentUiMode={agentUiMode} />} />
                    <Route path="/admin" element={user?.role === 'admin' ? <Dashboard user={user} onLogout={logout} agentUiMode={agentUiMode} /> : <Navigate to="/" replace />} />
                    <Route path="/dashboard" element={<UserDashboard user={user} onLogout={logout} agentUiMode={agentUiMode} />} />
                    <Route path="/demo-data" element={<DemoDataPage user={user} onLogout={logout} />} />
                    <Route path="/activity" element={user?.role === 'admin' ? <ActivityLogs user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                    <Route path="/users" element={user?.role === 'admin' ? <Users user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                    <Route path="/accounts" element={user?.role === 'admin' ? <Accounts user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
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
                </main>
              )
            } />
          </Routes>
          <GlobalFloatingBankingAgent user={user} onLogout={logout} agentUiMode={agentUiMode} />
          {agentUiMode === 'embedded' && (
            <div
              ref={embeddedDockWrapRef}
              className="global-embedded-agent-dock-wrap"
              role="region"
              aria-label="AI banking assistant"
            >
              <div
                className="embedded-agent-dock"
                data-agent-theme={effectiveAgentTheme}
              >
                <div className="embedded-agent-dock__head">
                  <h2 className="embedded-agent-dock__title">AI banking assistant</h2>
                  <p className="embedded-agent-dock__lead">
                    Natural language and MCP tools along the bottom — step chips show what ran.
                  </p>
                </div>
                <button
                  type="button"
                  className="embedded-dock-resize-handle"
                  onMouseDown={onEmbeddedDockResizeMouseDown}
                  aria-label="Drag up or down to resize assistant panel height"
                  title="Drag up or down to resize the assistant"
                >
                  <span className="embedded-dock-resize-handle__grip" aria-hidden="true">
                    <span className="embedded-dock-resize-handle__bar" />
                    <span className="embedded-dock-resize-handle__bar" />
                    <span className="embedded-dock-resize-handle__bar" />
                  </span>
                  <span className="embedded-dock-resize-handle__label">Resize height</span>
                </button>
                <div
                  className="embedded-banking-agent embedded-banking-agent--bottom"
                  style={{ height: embeddedAgentBodyHeight }}
                >
                  <BankingAgent user={user} onLogout={logout} mode="inline" embeddedDockBottom />
                </div>
              </div>
            </div>
          )}
          <EducationPanelsHost />
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
              className="log-viewer-fab"
              onClick={() => window.open('/api-traffic', 'ApiTraffic', 'width=1200,height=800,scrollbars=yes,resizable=yes')}
              title="Open API Traffic Viewer in new window"
              type="button"
            >
              🌐 API
            </button>
          )}
          {user && !isLogsRoute && (
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
    </Router>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AgentUiModeProvider>
        <AppWithAuth />
      </AgentUiModeProvider>
    </ThemeProvider>
  );
}