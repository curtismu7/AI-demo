import { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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

import { savePublicConfig } from './services/configService';
import { EducationUIProvider } from './context/EducationUIContext';
import { TokenChainProvider } from './context/TokenChainContext';
import { AgentUiModeProvider, useAgentUiMode } from './context/AgentUiModeContext';
import EducationBar from './components/EducationBar';
import EducationPanelsHost from './components/education/EducationPanelsHost';
import Footer from './components/Footer';
import './App.css';

/** Session/auth tracing only in development (production builds stay quiet). */
function devLog(...args) {
  if (process.env.NODE_ENV === 'production') return;
  // eslint-disable-next-line no-console -- intentional local debugging
  console.log(...args);
}

function AppWithAuth() {
  const { mode: agentUiMode } = useAgentUiMode();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logViewerOpen, setLogViewerOpen] = useState(false);
  // Module-scoped ref for injecting user email into the WebSocket session_init message.
  // Using a ref keeps userEmail out of window scope (avoids PII on global object).
  const pendingUserEmailRef = useRef(null);
  /** Avoid dispatching userAuthenticated on every repeat check (prevents listener ↔ check loops). */
  const sessionEstablishedRef = useRef(false);

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

  useEffect(() => {
    const userLoggedOut = localStorage.getItem('userLoggedOut');
    if (userLoggedOut === 'true') {
      localStorage.removeItem('userLoggedOut');
      setLoading(false);
      return;
    }

    // Sync server config (SQLite) → IndexedDB on every startup
    axios.get('/api/admin/config')
      .then(({ data }) => savePublicConfig(data.config))
      .catch(() => {}); // non-fatal

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

  // BankingAgent (and tests) may dispatch userAuthenticated to force a server re-check after client-side login hints.
  useEffect(() => {
    const handler = () => {
      void checkOAuthSession();
    };
    window.addEventListener('userAuthenticated', handler);
    return () => window.removeEventListener('userAuthenticated', handler);
  }, [checkOAuthSession]);

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

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <EducationUIProvider>
      <TokenChainProvider>
        <div className="App end-user-nano">
          <ToastContainer position="top-right" autoClose={4000} hideProgressBar={false} newestOnTop closeOnClick pauseOnHover draggable />
          {/* Config page is always accessible, regardless of auth state */}
          <Routes>
            <Route path="/config" element={<Config />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/logs" element={<LogViewerPage />} />
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
                    <Route path="/demo-data" element={<DemoDataPage onLogout={logout} />} />
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
          {(!user || agentUiMode === 'floating') && (
            <BankingAgent user={user} onLogout={logout} mode="float" />
          )}
          <EducationPanelsHost />
          <CIBAPanel />
          <CimdSimPanel />
          <LogViewer isOpen={logViewerOpen} onClose={() => setLogViewerOpen(false)} />
          {/* Floating Log Viewer Button — opens in a new window so it stays visible */}
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
          <Footer user={user} />
        </div>
      </TokenChainProvider>
      </EducationUIProvider>
    </Router>
  );
}

export default function App() {
  return (
    <AgentUiModeProvider>
      <AppWithAuth />
    </AgentUiModeProvider>
  );
}