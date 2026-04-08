import React from 'react';
import { Link } from 'react-router-dom';
import EmbeddedAgentDock from './EmbeddedAgentDock';
import './LandingPage.css';

export default function LandingPage() {
  return (
    <div className="landing-page">
      {/* Header Section */}
      <header className="landing-header" role="banner">
        <div className="landing-header-content">
          <div className="landing-logo">
            <h1>BX Finance</h1>
            <p>AI Banking Demo</p>
          </div>
          <nav className="landing-nav" role="navigation" aria-label="Main navigation">
            <Link to="/admin/login" className="nav-link">
              Admin Dashboard
            </Link>
            <Link to="/login" className="nav-link">
              Customer Dashboard
            </Link>
          </nav>
          <div className="landing-header-actions">
            <Link to="/admin/login" className="btn btn-primary">
              Sign In as Admin
            </Link>
            <Link to="/login" className="btn btn-secondary">
              Sign In as Customer
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero" role="region" aria-label="Hero section">
        <div className="landing-hero-content">
          <h1 className="landing-hero-headline">Secured AI Banking</h1>
          <p className="landing-hero-subheadline">
            Explore RFC 8693 token delegation, MCP spec integration, and how AI agents safely access banking APIs on behalf of users.
          </p>
          <div className="landing-hero-actions">
            <Link to="/admin/login" className="hero-cta hero-cta-primary">
              Try as Admin
            </Link>
            <Link to="/login" className="hero-cta hero-cta-secondary">
              Try as Customer
            </Link>
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
        <EmbeddedAgentDock variant="marketing" />
      </div>
    </div>
  );
}
