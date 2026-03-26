import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import axios from 'axios';
import { toast } from 'react-toastify';
import bffAxios from '../services/bffAxios';
import { useEducationUI } from '../context/EducationUIContext';
import { EDU } from './education/educationIds';
import TokenChainDisplay from './TokenChainDisplay';
import { navigateToAdminOAuthLogin } from '../utils/authUi';
import { toastAdminSessionError } from '../utils/dashboardToast';
import '../styles/appShellPages.css';

const Dashboard = ({ user, onLogout, agentUiMode = 'floating' }) => {
  const { open } = useEducationUI();
  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [forbidden403, setForbidden403] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenData, setTokenData] = useState(null);
  const [resettingDemo, setResettingDemo] = useState(false);
  const [resetMsg, setResetMsg] = useState('');
  const fetchingRef = React.useRef(false);

  const isLocalApiHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const handleDownloadBootstrap = async () => {
    try {
      const res = await bffAxios.get('/api/admin/bootstrap/export', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bootstrapData.json';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Downloaded bootstrapData.json — commit it to update the default seed.');
    } catch (err) {
      let msg = err.message || 'Seed export failed.';
      const data = err.response?.data;
      if (data instanceof Blob) {
        try {
          const text = await data.text();
          const j = JSON.parse(text);
          msg = j.message || j.error || msg;
        } catch {
          msg = 'Seed export failed.';
        }
      } else if (data?.message) {
        msg = data.message;
      }
      toast.error(msg);
    }
  };

  const handleWriteBootstrap = async () => {
    if (!window.confirm('Overwrite data/bootstrapData.json on the API server? (local dev only)')) return;
    try {
      const { data } = await bffAxios.post('/api/admin/bootstrap/export');
      toast.success(data.path ? `Wrote ${data.path}` : 'Seed file written.');
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message;
      toast.error(msg || 'Could not write seed file.');
    }
  };

  const handleResetDemo = async () => {
    if (!window.confirm('Reset all demo OAuth accounts to $5,000 starting balance?')) return;
    setResettingDemo(true);
    setResetMsg('');
    try {
      await bffAxios.post('/api/accounts/reset-all-demo');
      setResetMsg('✓ Demo accounts reset to $5,000.');
    } catch (err) {
      setResetMsg(`Reset failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setResettingDemo(false);
    }
  };

  const fetchDashboardData = useCallback(async (attempt = 0) => {
    if (fetchingRef.current && attempt === 0) return;
    if (attempt === 0) fetchingRef.current = true;
    try {
      setLoading(true);
      const [statsResult, activityResult] = await Promise.allSettled([
        bffAxios.get('/api/admin/stats'),
        bffAxios.get('/api/admin/activity/recent?hours=24'),
      ]);

      if (statsResult.status === 'rejected') {
        const err = statsResult.reason;
        console.error('Dashboard stats error:', err?.response?.data || err?.message || err);
        const status = err.response?.status;
        const detail =
          err.response?.data?.error_description ||
          err.response?.data?.message ||
          err.message ||
          '';
        if (status === 401 && user?.role === 'admin' && attempt < 3) {
          const delays = [600, 1400, 2200];
          setForbidden403(false);
          if (attempt === 0) {
            toast.info('Reconnecting to admin API…', { toastId: 'admin-dash-reconnect', autoClose: 3000 });
          }
          await new Promise((r) => setTimeout(r, delays[attempt]));
          return fetchDashboardData(attempt + 1);
        }
        toast.dismiss('admin-dash-reconnect');
        if (status === 401) {
          setForbidden403(false);
          toastAdminSessionError('Your session has expired. Please log in again.', navigateToAdminOAuthLogin);
        } else if (status === 403) {
          setForbidden403(true);
          toast.error('You do not have permission to access the admin dashboard.');
        } else {
          setForbidden403(false);
          toast.error(
            detail
              ? `Failed to load dashboard data (${status || 'error'}): ${detail}`
              : `Failed to load dashboard data${status ? ` (HTTP ${status})` : ''}. Try refreshing the page.`
          );
        }
        setStats(null);
        return;
      }

      const nextStats = statsResult.value.data?.stats;
      if (!nextStats || typeof nextStats !== 'object') {
        toast.dismiss('admin-dash-reconnect');
        setForbidden403(false);
        toast.error('Failed to load dashboard data: invalid response from server.');
        setStats(null);
        return;
      }
      toast.dismiss('admin-dash-reconnect');
      setStats(nextStats);
      setForbidden403(false);

      if (activityResult.status === 'fulfilled') {
        setRecentActivity(activityResult.value.data?.logs ?? []);
      } else {
        console.error('Dashboard activity error:', activityResult.reason?.response?.data || activityResult.reason?.message);
        setRecentActivity([]);
      }
    } catch (err) {
      console.error('Dashboard error:', err);
      toast.dismiss('admin-dash-reconnect');
      setForbidden403(false);
      toast.error(err.message || 'Failed to load dashboard data');
      setStats(null);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

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
      
      // Try both admin and user status endpoints using axios directly
      let response;
      try {
        console.log('🔍 Trying admin OAuth status endpoint...');
        response = await axios.get('/api/auth/oauth/status');
        console.log('👑 Admin OAuth response:', response.data);
        if (!response.data.authenticated) {
          console.log('🔍 Admin not authenticated, trying user OAuth status endpoint...');
          response = await axios.get('/api/auth/oauth/user/status');
          console.log('👤 User OAuth response:', response.data);
        }
      } catch (error) {
        console.log('❌ Admin OAuth failed, trying user OAuth status endpoint...', error.message);
        response = await axios.get('/api/auth/oauth/user/status');
        console.log('👤 User OAuth response:', response.data);
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

  if (loading) {
    return (
      <div className="loading">
        <div>Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard-page app-page-shell app-page-shell--toolbar-room">
      <header className="app-page-shell__hero">
        <div className="app-page-shell__hero-top">
          <div className="admin-dashboard__intro">
            <div className="admin-dashboard__brand-line">
              <div className="admin-dashboard__logo-mark" aria-hidden="true">
                <span /><span /><span /><span />
              </div>
              <span className="admin-dashboard__brand-name">BX Finance</span>
            </div>
            <div>
              <h1 className="app-page-shell__title">Admin Dashboard</h1>
              <p className="admin-dashboard__welcome">
                Welcome, {user?.firstName} {user?.lastName}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div
        className={`app-page-shell__body app-page-shell__body--wide ${agentUiMode === 'embedded' ? 'app-page-shell__body--embed-agent' : ''}`}
      >
        <div
          className={`ud-shell ${agentUiMode === 'embedded' ? 'ud-shell--embed-bottom' : 'ud-shell--floating-only'}`}
        >
        <div className="app-page-toolbar" role="toolbar" aria-label="Admin actions">
          <button
            type="button"
            className="app-page-toolbar-btn"
            onClick={() => open(EDU.LOGIN_FLOW, 'what')}
          >
            How does login work?
          </button>
          <button
            type="button"
            className="app-page-toolbar-btn"
            onClick={() => open(EDU.MAY_ACT, 'what')}
          >
            What is may_act?
          </button>
          <Link
            to="/demo-data"
            className="app-page-toolbar-btn"
            title="Edit sandbox account names, balances, and MFA threshold"
          >
            Demo config
          </Link>
          <Link
            to="/mcp-inspector"
            className="app-page-toolbar-btn app-page-toolbar-btn--accent"
            title="MCP discovery, tools/list & tools/call via Backend-for-Frontend (BFF)"
          >
            MCP Inspector
          </Link>
          <Link
            to="/oauth-debug-logs"
            className="app-page-toolbar-btn"
            title="OAuth verbose log (Config → Debug OAuth logging)"
          >
            OAuth debug log
          </Link>
          <Link
            to="/client-registration"
            className="app-page-toolbar-btn"
            title="Create OAuth clients in PingOne using the CIMD interface"
          >
            Client Registration
          </Link>
          <button
            type="button"
            onClick={openTokenModal}
            className="app-page-toolbar-btn app-page-toolbar-btn--icon"
            title="View OAuth Token Info"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.22,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.22,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.68 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={handleDownloadBootstrap}
            className="app-page-toolbar-btn"
            title="Download current in-memory data as bootstrapData.json for the next deploy"
          >
            Export seed JSON
          </button>
          {isLocalApiHost && (
            <button
              type="button"
              onClick={handleWriteBootstrap}
              className="app-page-toolbar-btn"
              title="Write data/bootstrapData.json on the server (requires ALLOW_BOOTSTRAP_EXPORT_WRITE in production)"
            >
              Save seed on server
            </button>
          )}
          <button
            type="button"
            onClick={handleResetDemo}
            disabled={resettingDemo}
            className="app-page-toolbar-btn"
            title="Reset all OAuth demo accounts to $5,000 starting balance"
          >
            {resettingDemo ? 'Resetting…' : '↺ Reset Demo'}
          </button>
          <button type="button" onClick={onLogout} className="app-page-toolbar-btn app-page-toolbar-btn--danger">
            Log out
          </button>
        </div>
        {resetMsg && <div className="admin-dashboard__reset-msg">{resetMsg}</div>}

      {/* Token Chain Display */}
      <TokenChainDisplay />

      {/* Statistics Cards */}
      {stats ? (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.totalUsers}</div>
            <div className="stat-label">Total Users</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.activeUsers}</div>
            <div className="stat-label">Active Users</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.totalAccounts}</div>
            <div className="stat-label">Total Accounts</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.totalTransactions}</div>
            <div className="stat-label">Total Transactions</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">${stats.totalBalance.toLocaleString()}</div>
            <div className="stat-label">Total Balance</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">${stats.averageBalance.toLocaleString()}</div>
            <div className="stat-label">Average Balance</div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <p style={{ marginTop: 0 }}>Could not load admin statistics. Check the toast for details.</p>
          <button type="button" className="btn btn-primary" onClick={() => fetchDashboardData(0)}>
            Retry
          </button>
          {forbidden403 && (
            <div style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#374151', lineHeight: 1.5 }}>
              <p style={{ marginTop: 0 }}>
                The API rejected this request. Common causes: the access token was issued to the <strong>end-user</strong> PingOne
                app but the admin dashboard requires the <strong>admin</strong> app; or hosted env vars
                (<code>PINGONE_ENVIRONMENT_ID</code>, <strong>admin</strong> and <strong>user</strong> client IDs/secrets, redirect URIs) do not match the PingOne apps
                that issued the token.
              </p>
              <p>
                <strong>Shared hosted URL:</strong> everyone uses the same env vars in the deployment — set{' '}
                <code>PINGONE_AI_CORE_CLIENT_ID</code> (or <code>PINGONE_CORE_CLIENT_ID</code>) to your <strong>admin</strong> PingOne
                application ID, and register this site&apos;s redirect URIs in that app.
              </p>
              <p>
                <strong>Serverless / multi-instance:</strong> set <code>REDIS_URL</code> (or Vercel KV / Replit Redis) so OAuth session/state survives across
                instances — otherwise <strong>Admin Sign in</strong> may fail before you reach PingOne.
              </p>
              <p style={{ marginBottom: 0 }}>
                <button type="button" className="btn btn-primary" onClick={onLogout}>
                  Sign out
                </button>
                <span style={{ marginLeft: '0.5rem' }}>then open <strong>Admin Sign in</strong> again on the login page.</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Recent Activity */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Recent Activity (Last 24 Hours)</h2>
        </div>
        
        {recentActivity.length > 0 ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Endpoint</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.slice(0, 10).map((log) => (
                  <tr key={log.id}>
                    <td>{format(new Date(log.timestamp), 'MMM dd, HH:mm:ss')}</td>
                    <td>{log.username || 'Unknown'}</td>
                    <td>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        backgroundColor: getActionColor(log.action),
                        color: 'white'
                      }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                      {log.endpoint}
                    </td>
                    <td>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        backgroundColor: log.responseStatus >= 400 ? '#ef4444' : '#10b981',
                        color: 'white'
                      }}>
                        {log.responseStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <h3>No recent activity</h3>
            <p>No activity has been recorded in the last 24 hours.</p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Quick Actions</h2>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-primary"
            onClick={() => window.location.href = '/activity'}
          >
            View All Activity Logs
          </button>
          <button 
            className="btn btn-secondary"
            onClick={() => window.location.href = '/users'}
          >
            Manage Users
          </button>
          <button 
            className="btn btn-secondary"
            onClick={() => window.location.href = '/accounts'}
          >
            Manage Accounts
          </button>
          <button 
            className="btn btn-secondary"
            onClick={() => window.location.href = '/transactions'}
          >
            View Transactions
          </button>
          <button 
            className="btn btn-secondary"
            onClick={() => window.location.href = '/settings'}
            style={{ borderLeft: '3px solid #f59e0b' }}
          >
            🔒 Security Settings
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => (window.location.href = '/mcp-inspector')}
            title="MCP discovery & tools/call via Backend-for-Frontend (BFF)"
          >
            🔌 MCP Inspector
          </button>
        </div>
      </div>

        </div>

      {/* OAuth Token Info Modal */}
      {showTokenModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={() => setShowTokenModal(false)}
        >
          <div 
            style={{
              background: 'white',
              borderRadius: '12px',
              maxWidth: '900px',
              width: '100%',
              height: '80vh',
              maxHeight: '600px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              background: 'linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)',
              color: 'white',
              padding: '20px 30px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0
            }}>
              <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>OAuth Token Information</h3>
              <button 
                onClick={() => setShowTokenModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  fontSize: '2rem',
                  cursor: 'pointer',
                  padding: 0,
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  transition: 'background 0.2s ease'
                }}
                onMouseOver={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
                onMouseOut={(e) => e.target.style.background = 'none'}
              >
                ×
              </button>
            </div>
            <div style={{
              padding: '20px 30px 30px 30px',
              flex: 1,
              overflowY: 'auto',
              minHeight: 0
            }}>
              {tokenData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                  <div style={{ border: '1px solid #e1e5e9', borderRadius: '8px', overflow: 'hidden' }}>
                    <h4 style={{
                      background: '#f8f9fa',
                      margin: 0,
                      padding: '15px 20px',
                      fontSize: '1.1rem',
                      fontWeight: '600',
                      color: '#2c3e50',
                      borderBottom: '1px solid #e1e5e9'
                    }}>Session Info</h4>
                    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '12px', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                        <span style={{ fontWeight: '600', color: '#34495e', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>User:</span>
                        <span style={{ color: '#2c3e50', fontSize: '0.9rem', wordBreak: 'break-word' }}>{tokenData.user?.username} ({tokenData.user?.email})</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', gap: '12px', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                        <span style={{ fontWeight: '600', color: '#34495e', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Role:</span>
                        <span style={{ color: '#2c3e50', fontSize: '0.9rem', wordBreak: 'break-word' }}>{tokenData.user?.role}</span>
                        <span style={{ fontWeight: '600', color: '#34495e', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Provider:</span>
                        <span style={{ color: '#2c3e50', fontSize: '0.9rem', wordBreak: 'break-word' }}>{tokenData.oauthProvider}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', gap: '12px', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                        <span style={{ fontWeight: '600', color: '#34495e', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Client:</span>
                        <span style={{ color: '#2c3e50', fontSize: '0.9rem', wordBreak: 'break-word' }}>{tokenData.clientType}</span>
                        <span style={{ fontWeight: '600', color: '#34495e', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Token:</span>
                        <span style={{ color: '#2c3e50', fontSize: '0.9rem', wordBreak: 'break-word' }}>{tokenData.tokenType}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '12px', alignItems: 'center', padding: '8px 0' }}>
                        <span style={{ fontWeight: '600', color: '#34495e', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Expires:</span>
                        <span style={{ color: '#2c3e50', fontSize: '0.9rem', wordBreak: 'break-word' }}>{tokenData.expiresAt ? new Date(tokenData.expiresAt).toLocaleString() : 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {tokenData.accessToken && (
                    <div style={{ border: '1px solid #e1e5e9', borderRadius: '8px', overflow: 'hidden' }}>
                      <h4 style={{
                        background: '#f8f9fa',
                        margin: 0,
                        padding: '15px 20px',
                        fontSize: '1.1rem',
                        fontWeight: '600',
                        color: '#2c3e50',
                        borderBottom: '1px solid #e1e5e9'
                      }}>Access Token Header</h4>
                      <div style={{ padding: '20px' }}>
                        <pre style={{
                          background: '#f8f9fa',
                          border: '1px solid #e1e5e9',
                          borderRadius: '6px',
                          padding: '15px',
                          fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
                          fontSize: '0.85rem',
                          lineHeight: '1.4',
                          color: '#2c3e50',
                          overflowX: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all'
                        }}>
                          {JSON.stringify(tokenData.accessToken.header, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {tokenData.accessToken && (
                    <div style={{ border: '1px solid #e1e5e9', borderRadius: '8px', overflow: 'hidden' }}>
                      <h4 style={{
                        background: '#f8f9fa',
                        margin: 0,
                        padding: '15px 20px',
                        fontSize: '1.1rem',
                        fontWeight: '600',
                        color: '#2c3e50',
                        borderBottom: '1px solid #e1e5e9',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '8px',
                      }}>
                        Access Token Payload
                        <button
                          type="button"
                          title="may_act / act claims"
                          onClick={() => open(EDU.MAY_ACT, 'lifecycle')}
                          style={{
                            border: 'none',
                            background: '#e0e7ff',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            padding: '2px 6px',
                          }}
                        >
                          ⓘ may_act / act
                        </button>
                        <button
                          type="button"
                          title="scope claim"
                          onClick={() => open(EDU.LOGIN_FLOW, 'tokens')}
                          style={{
                            border: 'none',
                            background: '#e0e7ff',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            padding: '2px 6px',
                          }}
                        >
                          ⓘ scope
                        </button>
                      </h4>
                      <div style={{ padding: '20px' }}>
                        <pre style={{
                          background: '#f8f9fa',
                          border: '1px solid #e1e5e9',
                          borderRadius: '6px',
                          padding: '15px',
                          fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
                          fontSize: '0.85rem',
                          lineHeight: '1.4',
                          color: '#2c3e50',
                          overflowX: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all'
                        }}>
                          {JSON.stringify(tokenData.accessToken.payload, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {tokenData.accessToken && (
                    <div style={{ border: '1px solid #e1e5e9', borderRadius: '8px', overflow: 'hidden' }}>
                      <h4 style={{
                        background: '#f8f9fa',
                        margin: 0,
                        padding: '15px 20px',
                        fontSize: '1.1rem',
                        fontWeight: '600',
                        color: '#2c3e50',
                        borderBottom: '1px solid #e1e5e9'
                      }}>Raw Access Token</h4>
                      <div style={{ padding: '20px' }}>
                        <div style={{
                          background: '#f8f9fa',
                          border: '1px solid #e1e5e9',
                          borderRadius: '6px',
                          padding: '15px',
                          fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
                          fontSize: '11px',
                          lineHeight: '1.4',
                          color: '#2c3e50',
                          wordBreak: 'break-all',
                          whiteSpace: 'pre-wrap',
                          maxHeight: '150px',
                          overflowY: 'auto'
                        }}>
                          {tokenData.accessToken.raw}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                  <p>No OAuth token data available</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
};

const getActionColor = (action) => {
  const colors = {
    'LOGIN': '#10b981',
    'REGISTER': '#3b82f6',
    'TRANSFER_MONEY': '#f59e0b',
    'CHECK_BALANCE': '#8b5cf6',
    'GET_TRANSACTIONS': '#06b6d4',
    'CREATE_USER': '#84cc16',
    'UPDATE_USER': '#f97316',
    'DELETE_USER': '#ef4444',
    'ADMIN_ACCESS': '#6366f1',
    'VIEW_ACTIVITY_LOGS': '#ec4899'
  };
  
  return colors[action] || '#6b7280';
};

export default Dashboard;
