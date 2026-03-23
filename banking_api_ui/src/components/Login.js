import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useEducationUIOptional } from '../context/EducationUIContext';
import { EDU } from './education/educationIds';

const Login = () => {
  const [loading] = useState(false);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();
  const edu = useEducationUIOptional();

  const handleOAuthLogin = () => {
    // OAuth redirect_uri to PingOne is computed on the server (must match PingOne app allowlist).
    const apiUrl = process.env.REACT_APP_API_URL || window.location.origin;
    window.location.href = `${apiUrl}/api/auth/oauth/login`;
  };

  const handleUserOAuthLogin = () => {
    const apiUrl = process.env.REACT_APP_API_URL || window.location.origin;
    window.location.href = `${apiUrl}/api/auth/oauth/user/login`;
  };

  // Handle OAuth error parameters from URL
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      let errorMessage = '';
      switch (errorParam) {
        case 'oauth_error':
          errorMessage = 'OAuth authentication failed. Please try again.';
          break;
        case 'invalid_state':
          errorMessage = 'Invalid authentication state. Please try again.';
          break;
        case 'no_code':
          errorMessage = 'No authorization code received. Please try again.';
          break;
        case 'callback_failed': {
          const detail = searchParams.get('detail');
          const detailMsg = detail && detail !== 'unknown' ? ` (${detail})` : '';
          errorMessage = `Authentication callback failed${detailMsg}. Check that your PingOne redirect URI is registered correctly.`;
          break;
        }
        case 'oauth_init_failed':
          errorMessage = 'Failed to initialize OAuth. Please try again.';
          break;
        default:
          errorMessage = 'Authentication error occurred. Please try again.';
      }
      setError(errorMessage);
    }
  }, [searchParams]);

  const loginContainerStyle = {
    background: `url(${process.env.PUBLIC_URL}/images/pexels-1462751220-33995750.jpg)`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
    backgroundRepeat: 'no-repeat'
  };

  return (
    <div className="login-container" style={loginContainerStyle}>
        <div className="login-card">
          <div className="login-header">
            <div className="login-branding">
              <div className="login-logo">
                <div className="logo-icon">
                  <div className="logo-square"></div>
                  <div className="logo-square"></div>
                  <div className="logo-square"></div>
                  <div className="logo-square"></div>
                </div>
                <span className="bank-name">BX Finance</span>
              </div>
            </div>
            <h1>Secure Account Access</h1>
            <p className="login-product-line">PingOne AI IAM Core</p>
            <p>Sign in to access your banking services</p>
          </div>

          {error && (
            <div className="alert alert-error">
              {error}
            </div>
          )}

          <div className="oauth-login">
            <div className="oauth-options">
              <div className="oauth-option">
                <h4>Admin Access</h4>
                <p>Uses the admin PingOne app → after login you land on <strong>Admin Dashboard</strong> (<code>/admin</code>): logs, all users &amp; accounts, security settings, config.</p>
                <button
                  onClick={handleOAuthLogin}
                  className="btn btn-primary oauth-btn"
                  disabled={loading}
                >
                  {loading ? 'Redirecting...' : 'Admin Sign in with PingOne AI IAM Core'}
                </button>
              </div>

              <div className="oauth-divider">
                <span>or</span>
              </div>

              <div className="oauth-option">
                <h4>End User Access</h4>
                <p>Uses the customer PingOne app → <strong>Personal dashboard</strong> (<code>/dashboard</code>) with your accounts only.</p>
                <button
                  onClick={handleUserOAuthLogin}
                  className="btn btn-danger oauth-btn"
                  disabled={loading}
                >
                  {loading ? 'Redirecting...' : 'Customer Sign in with PingOne AI IAM Core'}
                </button>
              </div>
            </div>
          </div>

          <div className="login-education-actions" style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem' }}
              onClick={() => edu?.open(EDU.LOGIN_FLOW, 'what')}
            >
              How does this login work?
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem' }}
              onClick={() => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('education-open-ciba', { detail: { tab: 'what' } })); }}
            >
              What is CIBA?
            </button>
            <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
              <Link to="/onboarding">Setup checklist</Link>
              {' · '}
              <span>Admin vs customer: use the Learn bar after sign-in, or the CIBA guide (floating).</span>
            </span>
          </div>

          <p className="login-onboarding-hint" style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.9rem' }}>
            <Link to="/onboarding" style={{ color: '#2563eb', fontWeight: 500 }}>
              First-time setup — what to configure in PingOne
            </Link>
          </p>

          <div className="login-footer">
            <p>
              <strong>PingOne AI IAM Core</strong><br />
              Secure authentication powered by PingOne AI IAM Core
            </p>
          </div>
        </div>
      </div>
  );
};

export default Login;
