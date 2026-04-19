import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { notifySuccess, notifyError, notifyInfo } from '../utils/appToast';
import './LandingPage.css';
import EmbeddedAgentDock from './EmbeddedAgentDock';
import * as bankingAgentService from '../services/bankingAgentService';

export default function LandingPage({ user, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleAdminLogin = (e) => {
    e.preventDefault();
    // Redirect to BFF OAuth login endpoint
    window.location.href = '/api/auth/oauth/login';
  };

  const handleCustomerLogin = (e) => {
    e.preventDefault();
    navigate("/dashboard");
  };







  const handleResourceAction = async (actionId) => {
    try {
      if (actionId === 'balance') {
        const result = await bankingAgentService.getAccountBalance('primary');
        notifySuccess(`Balance: ${result.balance || 'Loading...'}`);
      } else if (actionId === 'transactions') {
        const result = await bankingAgentService.getMyTransactions();
        notifySuccess(`Found ${result?.length || 0} transactions`);
      }
    } catch (err) {
      console.error(`[handleResourceAction] Error for ${actionId}:`, err);
      
      // Phase 187 pattern: Check for need_auth signal (401 - token expired or missing permission)
      if (err?.need_auth) {
        notifyInfo('🔐 Session expired — sign in again to view your data');
        handleCustomerLogin({ preventDefault: () => {} });
        return;
      }
      
      // Other errors: display error message
      notifyError(`Error fetching ${actionId}: ${err.message || 'Unknown error'}`);
    }
  };

  return (
    <div className="landing-page">
      {/* Logged-out: white marketing header; logged-in: no top nav (sidebar + App.js TopNav handles it) */}
      {!user && (
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
            <button
              onClick={() => navigate('/mfa-test')}
              className="nav-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit' }}
            >
              MFA Test
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              className="nav-link"
              style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", font: "inherit" }}
            >
              Explore Demo
            </button>

          </nav>
          <div className="landing-header-actions">
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
          </div>
        </div>
      </header>
      )}

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
            {!user && (
              <button
                onClick={() => navigate("/dashboard")}
                className="hero-cta hero-cta-explore"
              >
                Explore Demo
              </button>
            )}
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

      {/* Account Resources Section (Phase 189) - visible when logged in */}
      {user && (
        <section className="landing-account-resources">
          <div className="landing-resources-heading">
            <h2>Account Resources</h2>
            <p className="landing-resources-subtitle">Explore your banking data directly from here</p>
          </div>
          <div className="landing-resources-grid" role="list">
            {/* Resource 1: Check Balance */}
            <article className="resource-card" role="listitem">
              <div className="resource-card-icon">💰</div>
              <h3 className="resource-card-title">Account Balance</h3>
              <p className="resource-card-description">
                View your current account balance and account details
              </p>
              <button
                onClick={() => handleResourceAction('balance')}
                className="resource-button"
                disabled={!user}
                aria-label="Check Account Balance"
                title={!user ? 'Sign in to view balance' : 'Check your account balance'}
              >
                Check Balance
              </button>
            </article>

            {/* Resource 2: View Transactions */}
            <article className="resource-card" role="listitem">
              <div className="resource-card-icon">📊</div>
              <h3 className="resource-card-title">Recent Transactions</h3>
              <p className="resource-card-description">
                View your recent transactions and account activity
              </p>
              <button
                onClick={() => handleResourceAction('transactions')}
                className="resource-button"
                disabled={!user}
                aria-label="View Recent Transactions"
                title={!user ? 'Sign in to view transactions' : 'View your recent transactions'}
              >
                View Transactions
              </button>
            </article>
          </div>
        </section>
      )}

      {/* Embedded Agent Dock - fixed bottom-right on desktop, static on mobile */}
      <div className="landing-agent-dock-container">
        <EmbeddedAgentDock variant="marketing" user={user} onLogout={onLogout} />
      </div>
    </div>
  );
}
