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
import AgentPage from './pages/AgentPage';
import CIBAPanel from './components/CIBAPanel';
import CimdSimPanel from './components/CimdSimPanel';
import McpInspector from './components/McpInspector';
import OAuthDebugLogViewer from './components/OAuthDebugLogViewer';
import ClientRegistrationPage from './components/ClientRegistrationPage';
import { openLogViewerWindow } from './components/LogViewer';
import SideNav from './components/SideNav';

import { savePublicConfig } from './services/configService';
import { EducationUIProvider } from './context/EducationUIContext';
import { TokenChainProvider } from './context/TokenChainContext';
import EducationBar from './components/EducationBar';
import EducationPanelsHost from './components/education/EducationPanelsHost';
import Footer from './components/Footer';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const _sessionFoundRef = useRef(false); // prevent userAuthenticated dispatch loop
  // Module-scoped ref for injecting user email into the WebSocket session_init message.
  // Using a ref keeps userEmail out of window scope (avoids PII on global object).
  const pendingUserEmailRef = useRef(null);

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
    try {
      // Check all three session types in parallel — OAuth admin, OAuth end-user,
      // and the generic /session endpoint that catches _auth-cookie-restored sessions
      // and local (username/password) sessions too.
      const [adminResp, userResp, sessionResp] = await Promise.allSettled([
        axios.get('/api/auth/oauth/status',      { withCredentials: true }),
        axios.get('/api/auth/oauth/user/status', { withCredentials: true }),
        axios.get('/api/auth/session',           { withCredentials: true }),
      ]);

      const admin   = adminResp.status   === 'fulfilled' ? adminResp.value.data   : null;
      const endUser = userResp.status    === 'fulfilled' ? userResp.value.data    : null;
      const session = sessionResp.status === 'fulfilled' ? sessionResp.value.data : null;

      const found = (admin?.authenticated && admin.user)
        ? admin.user
        : (endUser?.authenticated && endUser.user)
          ? endUser.user
          : (session?.authenticated && session.user)
            ? session.user
            : null;

      if (found) {
        setUser(found);
        if (found.email) injectEmailIntoNextSessionInit(found.email);
        if (!_sessionFoundRef.current) {
          _sessionFoundRef.current = true;
          window.dispatchEvent(new CustomEvent('userAuthenticated'));
        }
        return true; // signal: found a session
      }
      return false;
    } catch (_) {
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

    // Detect whether we're landing here straight from the OAuth callback.
    // On Vercel the callback runs on one serverless instance and 302s to
    // /admin?oauth=success, which loads on a *different* cold instance that
    // may not yet have the Redis session. We only enable the retry loop in
    // that specific case. For regular page loads (refresh with an existing
    // session, or unauthenticated visits) a single check is enough — the
    // session is either warm (Vercel Redis / localhost in-memory) or absent.
    const isOAuthReturn = window.location.search.includes('oauth=success');
    let cancelled = false;

    async function attempt(delaysRemaining) {
      if (cancelled) return;
      const found = await checkOAuthSession();
      setLoading(false); // unblock UI immediately after first attempt
      if (!found && delaysRemaining.length > 0) {
        const [next, ...rest] = delaysRemaining;
        setTimeout(() => attempt(rest), next);
      }
    }

    // On OAuth return: retry with backoff in case of Vercel cold-start lag.
    // On regular load: single check only.
    const retryDelays = isOAuthReturn ? [400, 900, 1800, 3000] : [];
    const t = setTimeout(() => attempt(retryDelays), 150);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [checkOAuthSession]);

  // If BankingAgent self-detects a session and dispatches 'userAuthenticated',
  // re-run our own check so App.js sets the user state and shows the correct routes.
  useEffect(() => {
    const onAuth = () => {
      if (!user) checkOAuthSession();
    };
    window.addEventListener('userAuthenticated', onAuth);
    return () => window.removeEventListener('userAuthenticated', onAuth);
  }, [user, checkOAuthSession]);

  const logout = () => {
    console.log('🚪 Starting logout — navigating to /api/auth/logout');
    _sessionFoundRef.current = false;

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
    // (/logout). This ensures the PingOne SSO session is actually terminated
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
            <Route path="*" element={
              !user ? (
                <LandingPage />
              ) : (
                <main className="main-content">
                  <div className="app-shell">
                    <SideNav user={user} onLogout={logout} />
                    <div className="app-shell-body">
                    <EducationBar />
                    <Routes>
                    <Route path="/" element={user?.role === 'admin' ? <Dashboard user={user} onLogout={logout} /> : <UserDashboard user={user} onLogout={logout} />} />
                    <Route path="/admin" element={user?.role === 'admin' ? <Dashboard user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                    <Route path="/dashboard" element={<UserDashboard user={user} onLogout={logout} />} />
                    <Route path="/activity" element={user?.role === 'admin' ? <ActivityLogs user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                    <Route path="/users" element={user?.role === 'admin' ? <Users user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                    <Route path="/accounts" element={user?.role === 'admin' ? <Accounts user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                    <Route path="/transactions" element={user?.role === 'admin' ? <Transactions user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                    <Route path="/settings" element={user?.role === 'admin' ? <SecuritySettings user={user} onLogout={logout} /> : <Navigate to="/" replace />} />
                    <Route path="/mcp-inspector" element={<McpInspector user={user} onLogout={logout} />} />
                    <Route path="/agent" element={<AgentPage user={user} onLogout={logout} />} />
                    <Route path="/oauth-debug-logs"
                      element={user?.role === 'admin' ? <OAuthDebugLogViewer user={user} onLogout={logout} /> : <Navigate to="/" replace />}
                    />
                    <Route path="/client-registration"
                      element={user?.role === 'admin' ? <ClientRegistrationPage user={user} onLogout={logout} /> : <Navigate to="/" replace />}
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                    </div>
                  </div>
                </main>
              )
            } />
          </Routes>
          <BankingAgent user={user} onLogout={logout} />
          <EducationPanelsHost />
          <CIBAPanel />
          <CimdSimPanel />
          {/* Floating Log Viewer Button — opens in popup window */}
          <button
            className="log-viewer-fab"
            onClick={openLogViewerWindow}
            title="Open Log Viewer"
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
          <Footer />
        </div>
      </TokenChainProvider>
      </EducationUIProvider>
    </Router>
  );
}

export default App;