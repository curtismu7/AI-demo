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
  const [logViewerOpen, setLogViewerOpen] = useState(false);
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
    console.log('🔍 checkOAuthSession - Checking for active OAuth sessions...');
    try {
      // Check admin OAuth session
      console.log('👑 Checking admin OAuth session...');
      const adminResponse = await axios.get('/api/auth/oauth/status');
      console.log('👑 Admin OAuth response:', {
        authenticated: adminResponse.data.authenticated,
        user: adminResponse.data.user,
        expiresAt: adminResponse.data.expiresAt
      });
      
      if (adminResponse.data.authenticated) {
        console.log('✅ Admin OAuth session found, logging in user:', adminResponse.data.user);
        setUser(adminResponse.data.user);
        const userEmail = adminResponse.data.user?.email;
        if (userEmail) {
          injectEmailIntoNextSessionInit(userEmail);
        }
        window.dispatchEvent(new CustomEvent('userAuthenticated'));
        setLoading(false);
        return;
      }
      
      // Check end user OAuth session
      console.log('👤 Checking end user OAuth session...');
      const userResponse = await axios.get('/api/auth/oauth/user/status');
      console.log('👤 End user OAuth response:', {
        authenticated: userResponse.data.authenticated,
        user: userResponse.data.user,
        expiresAt: userResponse.data.expiresAt
      });
      
      if (userResponse.data.authenticated) {
        console.log('✅ End user OAuth session found, logging in user:', userResponse.data.user);
        setUser(userResponse.data.user);
        const userEmail = userResponse.data.user?.email;
        if (userEmail) {
          injectEmailIntoNextSessionInit(userEmail);
        }
        window.dispatchEvent(new CustomEvent('userAuthenticated'));
        setLoading(false);
        return;
      }
      
      console.log('❌ No active OAuth sessions found');
      setLoading(false);
    } catch (error) {
      console.log('❌ Error checking OAuth sessions:', error.message);
      setLoading(false);
    }
  }, [injectEmailIntoNextSessionInit]);

  useEffect(() => {
    console.log('🔍 App useEffect - Starting authentication check...');

    const userLoggedOut = localStorage.getItem('userLoggedOut');
    if (userLoggedOut === 'true') {
      console.log('🚪 User explicitly logged out, skipping authentication check');
      localStorage.removeItem('userLoggedOut');
      setLoading(false);
      return;
    }

    // Sync server config (SQLite) → IndexedDB on every startup
    axios.get('/api/admin/config')
      .then(({ data }) => savePublicConfig(data.config))
      .catch(() => {}); // non-fatal

    const t = setTimeout(() => {
      console.log('🔄 Checking for OAuth session...');
      checkOAuthSession();
    }, 200);
    return () => clearTimeout(t);
  }, [checkOAuthSession]);

  const logout = () => {
    console.log('🚪 Starting logout — navigating to /api/auth/logout');

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
          <BankingAgent user={user} />
          <EducationPanelsHost />
          <CIBAPanel />
          <CimdSimPanel />
          <LogViewer isOpen={logViewerOpen} onClose={() => setLogViewerOpen(false)} />
          {/* Floating Log Viewer Button */}
          <button
            className="log-viewer-fab"
            onClick={() => setLogViewerOpen(true)}
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