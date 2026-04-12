import React from 'react';
import { useNavigate } from 'react-router-dom';
import './LandingPage.css';
import EmbeddedAgentDock from './EmbeddedAgentDock';

export default function LandingPage({ user, onLogout }) {
  const navigate = useNavigate();

  const handleAdminLogin = (e) => {
    e.preventDefault();
    // Redirect to BFF OAuth login endpoint
    window.location.href = '/api/auth/oauth/login';
  };

  const handleCustomerLogin = (e) => {
    e.preventDefault();
    // Redirect to BFF OAuth user login endpoint
    window.location.href = '/api/auth/oauth/user/login';
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      navigate('/logout');
    }
  };

  return (
    <div className="landing-page">
      {/* Session banner for logged-in users */}
      {user && (
        <div className="landing-session-banner">
          <span className="landing-session-banner-text">
            Welcome back, {user.firstName || user.username || 'User'} ·
            <button
              type="button"
              onClick={() => navigate('/user-dashboard')}
              className="landing-session-banner-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', textDecoration: 'underline', font: 'inherit' }}
            >
              Go to Dashboard
            </button>
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="landing-session-banner-logout"
            style={{ background: 'none', border: '1px solid currentColor', cursor: 'pointer', padding: '4px 8px', font: 'inherit' }}
          >
            Sign Out
          </button>
        </div>
      )}

      {/* Header with nav — always visible */}
      <header className="landing-header" role="banner">
        <div className="landing-header-content">
          <div className="landing-logo">
            <h1>Super Banking</h1>
            <p>AI-Powered Financial Services</p>
          </div>
          <nav className="landing-nav" role="navigation" aria-label="Main navigation">
            <button
              onClick={() => navigate('/demo-data')}
              className="nav-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit' }}
            >
              Demo Config
            </button>
            <button
              onClick={() => navigate('/pingone-test')}
              className="nav-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit' }}
            >
              PingOne Test
            </button>
            {!user && (
              <>
                <button
                  onClick={handleAdminLogin}
                  className="nav-link"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit' }}
                >
                  Admin Dashboard
                </button>
                <button
                  onClick={handleCustomerLogin}
                  className="nav-link"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit' }}
                >
                  Customer Dashboard
                </button>
              </>
            )}
          </nav>
          <div className="landing-header-actions">
            {user ? (
              <>
                <button
                  onClick={() => navigate('/user-dashboard')}
                  className="btn btn-primary"
                >
                  My Dashboard
                </button>
                <button
                  onClick={handleLogout}
                  className="btn btn-secondary"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleAdminLogin}
                  className="btn btn-primary"
                >
                  Sign In as Admin
                </button>
                <button
                  onClick={handleCustomerLogin}
                  className="btn btn-secondary"
                >
                  Sign In as Customer
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero" aria-label="Hero section">
        <div className="landing-hero-content">
          <h1 className="landing-hero-headline">Secured AI Banking</h1>
          <p className="landing-hero-subheadline">
            Explore RFC 8693 token delegation, MCP spec integration, and how AI agents safely access banking APIs on behalf of users.
          </p>
          <div className="landing-hero-actions">
            <button
              onClick={handleAdminLogin}
              className="hero-cta hero-cta-primary"
            >
              Try as Admin
            </button>
            <button
              onClick={handleCustomerLogin}
              className="hero-cta hero-cta-secondary"
            >
              Try as Customer
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="landing-features">
        <div className="landing-features-heading">
          <h2>Core Capabilities</h2>
        </div>
        <div className="landing-features-grid" role="list">
          {/* Feature 1: Auth Flows */}
          <article className="landing-feature-card" role="listitem">
            <div className="landing-feature-icon">🔐</div>
            <h3 className="landing-feature-title">3 Auth Flows</h3>
            <p className="landing-feature-description">
              Experience OIDC, CIBA push auth, and in-flight step-up challenges — all protecting banking operations
            </p>
          </article>

          {/* Feature 2: RFC 8693 */}
          <article className="landing-feature-card" role="listitem">
            <div className="landing-feature-icon">📜</div>
            <h3 className="landing-feature-title">RFC 8693 Token Exchange</h3>
            <p className="landing-feature-description">
              Watch secure delegation in action: user tokens transformed to agent tokens with act claims
            </p>
          </article>

          {/* Feature 3: MCP Integration */}
          <article className="landing-feature-card" role="listitem">
            <div className="landing-feature-icon">🔌</div>
            <h3 className="landing-feature-title">MCP Spec Integration</h3>
            <p className="landing-feature-description">
              See how AI agents connect to banking APIs via the Model Context Protocol with full auth context
            </p>
          </article>

          {/* Feature 4: AI Agent */}
          <article className="landing-feature-card" role="listitem">
            <div className="landing-feature-icon">🤖</div>
            <h3 className="landing-feature-title">AI Agent Banking</h3>
            <p className="landing-feature-description">
              Observe real-time agent operations: transfers, balance checks, transaction analysis — all secured by tokens
            </p>
          </article>
        </div>
      </section>

      {/* Embedded Agent Dock - fixed bottom-right on desktop, static on mobile */}
      <div className="landing-agent-dock-container">
        <EmbeddedAgentDock variant="marketing" user={user} onLogout={onLogout} />
      </div>
    </div>
  );
}
