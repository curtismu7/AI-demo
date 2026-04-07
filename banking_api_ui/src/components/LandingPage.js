import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { spinner } from '../services/spinnerService';
import AgentUiModeToggle from './AgentUiModeToggle';
import { useIndustryBranding } from '../context/IndustryBrandingContext';
import BrandLogo from './BrandLogo';
import './LandingPage.css';

const LandingPage = ({ user = null }) => {
  const { preset } = useIndustryBranding();
  const navigate = useNavigate();
  const location = useLocation();
  const dashboardPath = user?.role === 'admin' ? '/admin' : '/dashboard';
  const firstName = user?.name?.split(' ')[0] || user?.given_name || user?.sub || 'there';
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [scrollY, setScrollY] = React.useState(0);
  const [marketingCfg, setMarketingCfg] = React.useState({
    mode: 'redirect',
    userHint: '',
    passHint: '',
  });
  const [loginPanelOpen, setLoginPanelOpen] = React.useState(false);
  const [passVisible, setPassVisible] = React.useState(false);
  const marketingModeRef = React.useRef('redirect');

  React.useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  React.useEffect(() => {
    marketingModeRef.current = marketingCfg.mode;
  }, [marketingCfg.mode]);

  React.useEffect(() => {
    fetch('/api/admin/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const c = body?.config || {};
        const mode = c.marketing_customer_login_mode === 'slide_pi_flow' ? 'slide_pi_flow' : 'redirect';
        setMarketingCfg({
          mode,
          userHint: String(c.marketing_demo_username_hint || '').trim(),
          passHint: String(c.marketing_demo_password_hint || '').trim(),
        });
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    if (location.state?.scrollToAgent) {
      const el = document.getElementById('marketing-embedded-dock-slot');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location.state]);

  /** When the agent nudges sign-in, open slide panel (pi.flow marketing mode) or scroll to the sign-in strip. */
  React.useEffect(() => {
    const onScrollLogin = () => {
      if (marketingModeRef.current === 'slide_pi_flow') {
        setLoginPanelOpen(true);
        return;
      }
      const el = document.getElementById('marketing-hero-signin');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window.addEventListener('marketing-scroll-login', onScrollLogin);
    return () => window.removeEventListener('marketing-scroll-login', onScrollLogin);
  }, []);

  React.useEffect(() => {
    if (!loginPanelOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setLoginPanelOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loginPanelOpen]);

  /** Customer → PingOne (optional return_to + pi.flow). Admin → admin OAuth. */
  const redirectCustomerToPingOne = (opts = {}) => {
    const { usePiFlow = false } = opts;
    spinner.show('Signing in as Customer…', 'Redirecting to PingOne');
    const apiUrl = process.env.REACT_APP_API_URL || window.location.origin;
    setTimeout(() => {
      const params = new URLSearchParams();
      if (usePiFlow) params.set('use_pi_flow', '1');
      const q = params.toString();
      window.location.href = `${apiUrl}/api/auth/oauth/user/login${q ? `?${q}` : ''}`;
    }, 150);
  };

  /** Customer → PingOne without return_to (dashboard after callback). Admin → admin OAuth. */
  const handleOAuthLogin = (userType = 'user') => {
    const apiUrl = process.env.REACT_APP_API_URL || window.location.origin;
    if (userType === 'admin') {
      spinner.show('Signing in as Admin…', 'Redirecting to PingOne');
      setTimeout(() => {
        window.location.href = `${apiUrl}/api/auth/oauth/login`;
      }, 150);
      return;
    }
    if (marketingCfg.mode === 'slide_pi_flow') {
      setLoginPanelOpen(true);
      return;
    }
    redirectCustomerToPingOne({});
  };

  const features = [
    {
      icon: '🤖',
      title: 'AI-Powered Banking',
      description: 'Experience the future of banking with intelligent agents that understand your needs.'
    },
    {
      icon: '🔐',
      title: 'Zero-Trust Security',
      description: 'Advanced identity verification with PingOne AI IAM Core ensures your data is always protected.'
    },
    {
      icon: '⚡',
      title: 'Instant Transactions',
      description: 'Lightning-fast transfers and payments powered by real-time processing and AI validation.'
    },
    {
      icon: '📊',
      title: 'Smart Insights',
      description: 'Get personalized financial insights and recommendations based on your spending patterns.'
    },
    {
      icon: '🌐',
      title: 'Multi-Channel Access',
      description: 'Access your accounts seamlessly across web, mobile, and voice assistants.'
    },
    {
      icon: '🛡️',
      title: 'Fraud Protection',
      description: 'AI-driven fraud detection that learns and adapts to new threats in real-time.'
    }
  ];

  return (
    <div className="landing-page landing-page--light">
      {/* Session banner — non-intrusive indicator when user visits landing while logged in */}
      {user && (
        <div className="landing-session-banner" role="status">
          <span>Welcome back, {firstName}</span>
          <span className="landing-session-banner__sep" aria-hidden="true">·</span>
          <button
            type="button"
            className="landing-session-banner__link"
            onClick={() => navigate(dashboardPath)}
          >
            Go to Dashboard →
          </button>
        </div>
      )}
      {/* Navigation */}
      <nav className={`navbar ${scrollY > 50 ? 'scrolled' : ''}`}>
        <div className="nav-container">
          <div className="nav-brand">
            <BrandLogo style={{ marginRight: 12, borderRadius: 12, background: '#fff' }} height={40} width={40} />
            <span className="brand-name">{preset.shortName}</span>
          </div>

          <div className="nav-agent-ui-wrap">
            <AgentUiModeToggle variant="landing" />
          </div>
          
          <div className={`nav-menu ${isMenuOpen ? 'open' : ''}`}>
            <a href="#features" className="nav-link">Features</a>
            <a href="#how-it-works" className="nav-link">How It Works</a>

            <button
              type="button"
              className="nav-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.5rem', color: 'inherit', fontSize: 'inherit' }}
              onClick={() => navigate('/setup')}
            >
              Vercel setup
            </button>
            <button
              type="button"
              className="nav-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.5rem', color: 'inherit', fontSize: 'inherit' }}
              onClick={() => navigate('/config')}
            >
              ⚙ Application setup
            </button>
            <div className="nav-cta-row">
              <button
                type="button"
                className="nav-cta nav-cta--ghost"
                onClick={() => handleOAuthLogin('admin')}
              >
                Admin sign in
              </button>
              <button type="button" className="nav-cta" onClick={() => handleOAuthLogin('user')}>
                Customer sign in
              </button>
            </div>
          </div>
          
          <button 
            type="button"
            className="nav-toggle"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-background">
          <div className="hero-gradient"></div>
          <div className="hero-particles"></div>
        </div>
        
        <div className="hero-content">
          <div className="hero-text">
            <div className="page-indicator">
              <span className="page-indicator-text">🏠 Main Page</span>
              <span className="page-indicator-description">Banking Dashboard Home</span>
            </div>
            <h1 className="hero-title">
              Banking Reimagined with 
              <span className="gradient-text"> AI Agents</span>
            </h1>
            <p className="hero-subtitle">
              Experience the future of financial services. Our AI-powered agents understand your needs, 
              automate complex tasks, and provide personalized insights—all through natural conversation.
            </p>
            <div id="marketing-hero-signin" className="hero-actions">
              <button type="button" className="cta-primary" onClick={() => handleOAuthLogin('user')}>
                Customer sign in
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" title="Arrow icon">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </button>
              <button type="button" className="cta-secondary" onClick={() => handleOAuthLogin('admin')}>
                Admin sign in
              </button>
            </div>
            <p className="hero-signin-hint">
              The <strong>banking assistant</strong> (dock below) can start PingOne and return you here. Use the buttons above
              or the header when you want the full customer or admin dashboard after sign-in.
            </p>
            {(marketingCfg.userHint || marketingCfg.passHint) && (
              <div className="landing-demo-credentials">
                <span className="landing-demo-cred-label">Demo credentials</span>
                {marketingCfg.userHint && (
                  <span className="landing-demo-cred-item">
                    <span className="landing-demo-cred-key">User:</span> {marketingCfg.userHint}
                  </span>
                )}
                {marketingCfg.passHint && (
                  <span className="landing-demo-cred-item landing-demo-cred-item--pass">
                    <span className="landing-demo-cred-key">Pass:</span> {passVisible ? marketingCfg.passHint : '••••••••'}
                    <button
                      type="button"
                      className="landing-demo-reveal-btn"
                      onClick={() => setPassVisible(v => !v)}
                      aria-label={passVisible ? 'Hide password' : 'Show password'}
                      title={passVisible ? 'Hide password' : 'Show password'}
                    >{passVisible ? 'Hide' : 'Show'}</button>
                  </span>
                )}
              </div>
            )}
            <div className="landing-auth-flows-card">
              <h3 className="landing-auth-flows-title">3 Auth Flows in this Demo</h3>
              <ol className="landing-auth-flows-list">
                <li><strong>Home Login</strong> — Authorization Code + PKCE (this page)</li>
                <li><strong>CIBA</strong> — Backchannel push approval, no browser redirect</li>
                <li><strong>Agent-triggered Login</strong> — Agent hits auth wall, user logs in, agent resumes</li>
              </ol>
              <button
                type="button"
                className="landing-auth-flows-link"
                onClick={() => window.dispatchEvent(new CustomEvent('education-open', { detail: { panel: 'login-flow' } }))}
              >
                Open Education Panel →
              </button>
            </div>

            <div className="hero-quick-links">
              <button type="button" className="hql-btn hql-btn--blue" onClick={() => navigate('/demo-data')}>
                Demo config
              </button>
            </div>
            <button type="button" className="hero-setup-btn" onClick={() => navigate('/config')}>
              Application setup (PingOne, redirects, local dev) — optional
            </button>
            <div className="hero-note">
              <p className="hero-note__powered">Powered by PingOne AI IAM Core</p>
              {marketingCfg.mode === 'slide_pi_flow' && (
                <p className="hero-note__tag" style={{ marginTop: '0.5rem' }}>
                  <strong>Demo:</strong> customer sign-in can open a panel with username/password hints, then{' '}
                  <code>pi.flow</code> at PingOne.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {loginPanelOpen && (
        <>
          <div
            className="marketing-login-drawer-backdrop"
            aria-hidden="true"
            onClick={() => setLoginPanelOpen(false)}
            role="presentation"
          />
          <aside
            className="marketing-login-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="marketing-drawer-title"
          >
            <div className="marketing-login-drawer__head">
              <h2 id="marketing-drawer-title">Customer sign in</h2>
              <button
                type="button"
                className="marketing-login-drawer__close"
                onClick={() => setLoginPanelOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="marketing-login-drawer__lede">
              Use your PingOne demo user. The next step uses <strong>pi.flow</strong> (non-redirect authorize) when your app
              supports it.
            </p>
            <div className="marketing-login-drawer__hints" aria-label="Demo credentials hint">
              <div className="marketing-login-drawer__field">
                <span className="marketing-login-drawer__label">Username (hint)</span>
                <div className="marketing-login-drawer__value">
                  {marketingCfg.userHint || 'Set hints under Demo config or Application setup.'}
                </div>
              </div>
              <div className="marketing-login-drawer__field">
                <span className="marketing-login-drawer__label">Password (hint)</span>
                <div className="marketing-login-drawer__value">
                  {marketingCfg.passHint || '—'}
                </div>
              </div>
            </div>
            <div className="marketing-login-drawer__actions">
              <button
                type="button"
                className="cta-primary marketing-login-drawer__cta"
                onClick={() => {
                  setLoginPanelOpen(false);
                  redirectCustomerToPingOne({ usePiFlow: true });
                }}
              >
                Continue to PingOne
              </button>
              <button type="button" className="nav-cta nav-cta--ghost" onClick={() => setLoginPanelOpen(false)}>
                Cancel
              </button>
            </div>
          </aside>
        </>
      )}

      {/* Features Section */}
      <section id="features" className="features">
        <div className="container">
          <div className="section-header">
            <h2>Revolutionary Features</h2>
            <p>Powered by advanced AI and built for the future of banking</p>
          </div>
          
          <div className="features-grid">
            {features.map((feature, index) => (
              <div key={`feature-${feature.title.replace(/\s+/g, '-').toLowerCase()}`} className="feature-card">
                <div className="feature-icon">{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="how-it-works">
        <div className="container">
          <div className="section-header">
            <h2>How It Works</h2>
            <p>Three simple steps to intelligent banking</p>
          </div>
          
          <div className="steps-container">
            <div className="step">
              <div className="step-number">1</div>
              <h3>Start Conversation</h3>
              <p>Simply chat with our AI assistant using natural language</p>
            </div>
            <div className="step-connector"></div>
            <div className="step">
              <div className="step-number">2</div>
              <h3>AI Understands</h3>
              <p>Our agents analyze your request and verify your identity securely</p>
            </div>
            <div className="step-connector"></div>
            <div className="step">
              <div className="step-number">3</div>
              <h3>Instant Action</h3>
              <p>Watch as your banking tasks are completed automatically</p>
            </div>
          </div>
        </div>
      </section>

      {/* App-level EmbeddedAgentDock portals here so the live assistant scrolls above the closing CTA */}
      <div id="marketing-embedded-dock-slot" className="marketing-embedded-dock-slot" />

      {/* CTA Section */}
      <section className="cta">
        <div className="container">
          <div className="cta-content">
            <h2>Ready to Experience the Future?</h2>
            <p>
              Sign in from the <strong>header</strong> or <strong>hero</strong> above — you&apos;ll land on the right dashboard
              after PingOne.
            </p>
            <button type="button" className="hero-setup-btn hero-setup-btn--cta" onClick={() => navigate('/config')}>
              Application setup (PingOne, redirects, local dev)
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <BrandLogo style={{ borderRadius: 10, background: '#fff', marginRight: 10, verticalAlign: 'middle' }} height={40} width={40} />
              <span className="brand-name">{preset.shortName}</span>
              <p>Powered by PingOne AI IAM Core</p>
            </div>
            
            <div className="footer-links">
              <div className="link-group">
                <h4>Product</h4>
                <a href="#features">Features</a>
                <a href="#how-it-works">How It Works</a>
                <a href="#marketing-embedded-dock-slot">Banking assistant</a>
              </div>
              <div className="link-group">
                <h4>Company</h4>
                <a href="#about">About</a>
                <a href="#careers">Careers</a>
                <a href="#contact">Contact</a>
              </div>
              <div className="link-group">
                <h4>Legal</h4>
                <a href="#privacy">Privacy Policy</a>
                <a href="#terms">Terms of Service</a>
                <a href="#security">Security</a>
              </div>
            </div>
          </div>
          
          <div className="footer-bottom">
            <p>&copy; {new Date().getFullYear()} {preset.shortName}. All rights reserved. Secured by PingOne AI IAM Core.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
