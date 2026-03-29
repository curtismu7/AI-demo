import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { spinner } from '../services/spinnerService';
import AgentUiModeToggle from './AgentUiModeToggle';
import { useIndustryBranding } from '../context/IndustryBrandingContext';
import BrandLogo from './BrandLogo';
import './LandingPage.css';

const LandingPage = () => {
  const { preset } = useIndustryBranding();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('personal');
  const [scrollY, setScrollY] = React.useState(0);

  React.useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  React.useEffect(() => {
    if (location.state?.scrollToAgent) {
      const el = document.getElementById('agent-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location.state]);

  /** When the agent nudges sign-in, scroll here for context (stay-on-page is agent-only, not these buttons). */
  React.useEffect(() => {
    const onScrollLogin = () => {
      const el = document.getElementById('marketing-login');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window.addEventListener('marketing-scroll-login', onScrollLogin);
    return () => window.removeEventListener('marketing-scroll-login', onScrollLogin);
  }, []);

  /** Customer → PingOne without return_to (dashboard after callback). Admin → admin OAuth. */
  const handleOAuthLogin = (userType = 'user') => {
    const label = userType === 'admin' ? 'Admin' : 'Customer';
    spinner.show(`Signing in as ${label}…`, 'Redirecting to PingOne');
    const apiUrl = process.env.REACT_APP_API_URL || window.location.origin;
    const url =
      userType === 'admin'
        ? `${apiUrl}/api/auth/oauth/login`
        : `${apiUrl}/api/auth/oauth/user/login`;
    setTimeout(() => {
      window.location.href = url;
    }, 150);
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
            <h1 className="hero-title">
              Banking Reimagined with 
              <span className="gradient-text"> AI Agents</span>
            </h1>
            <p className="hero-subtitle">
              Experience the future of financial services. Our AI-powered agents understand your needs, 
              automate complex tasks, and provide personalized insights—all through natural conversation.
            </p>
            <div className="hero-actions">
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

            <div className="hero-quick-links">
              <button type="button" className="hql-btn hql-btn--red" onClick={() => { window.dispatchEvent(new CustomEvent('education-open-ciba', { detail: { tab: 'what' } })); }}>
                📱 CIBA guide
              </button>
              <button type="button" className="hql-btn hql-btn--dark" onClick={() => { window.dispatchEvent(new CustomEvent('education-open-cimd', { detail: { tab: 'what' } })); }}>
                📄 CIMD Simulator
              </button>
              <button type="button" className="hql-btn hql-btn--red" onClick={() => navigate('/')}>
                Home
              </button>
              <button type="button" className="hql-btn hql-btn--blue" onClick={() => handleOAuthLogin('user')}>
                Dashboard
              </button>
              <button type="button" className="hql-btn hql-btn--red" onClick={() => window.open('/api-traffic', 'ApiTraffic', 'width=1400,height=900,scrollbars=yes,resizable=yes')}>
                API
              </button>
              <button type="button" className="hql-btn hql-btn--blue" onClick={() => window.open('/logs', '_blank')}>
                Logs
              </button>
              <button type="button" className="hql-btn hql-btn--blue" onClick={() => navigate('/demo-data')}>
                Demo config
              </button>
            </div>
            <button type="button" className="hero-setup-link" onClick={() => navigate('/config')}>
              Application setup (PingOne, redirects, local dev) — optional
            </button>
            <div className="hero-note">
              <p style={{ fontSize: '2rem', color: '#ef4444', fontWeight: 800, margin: 0, lineHeight: 1.1 }}>
                Powered by PingOne AI IAM Core
              </p>
              <p style={{ color: '#6b7280', fontSize: '1rem', margin: 0, marginTop: 4 }}>
                No passwords required
              </p>
            </div>
          </div>
          
          <div className="hero-visual">
            <div className="floating-card">
              <div className="card-header">
                <div className="card-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span className="card-title">AI Banking Assistant</span>
              </div>
              <div className="card-content">
                <div className="chat-message">
                  <span className="message-avatar">🤖</span>
                  <div className="message-bubble">
                    How can I help you manage your finances today?
                  </div>
                </div>
                <div className="chat-message user">
                  <div className="message-bubble">
                    Transfer $500 to savings
                  </div>
                  <span className="message-avatar">👤</span>
                </div>
                <div className="chat-message">
                  <span className="message-avatar">🤖</span>
                  <div className="message-bubble">
                    ✅ Transfer completed! $500 moved to your high-yield savings account.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Explains PingOne for all paths; return_to=/marketing only when sign-in starts from BankingAgent */}
      <section id="marketing-login" className="marketing-login" aria-labelledby="marketing-login-heading">
        <div className="container">
          <div className="marketing-login-card">
            <h2 id="marketing-login-heading">Sign in with PingOne</h2>
            <p>
              Balances and transfers use the <strong>banking assistant</strong> (floating button or dock below). Both the
              assistant and the buttons here send you through <strong>PingOne</strong>. If you start sign-in{' '}
              <strong>from the assistant</strong>, you come back to this marketing page to keep chatting. If you use{' '}
              <strong>Customer sign in</strong> here or in the header, you land on the <strong>customer dashboard</strong>{' '}
              after PingOne.
            </p>
            <div className="marketing-login-actions">
              <button type="button" className="cta-primary" onClick={() => handleOAuthLogin('user')}>
                Customer sign in
              </button>
              <button type="button" className="nav-cta nav-cta--ghost" onClick={() => handleOAuthLogin('admin')}>
                Admin sign in
              </button>
            </div>
          </div>
        </div>
      </section>

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

      {/* AI Agent Section — dark showcase card on light marketing page (matches product mock) */}
      <section id="agent-section" className="agent-section agent-section--showcase">
        <div className="container">
          <div className="section-header section-header--showcase">
            <h2>Try Our AI Banking Assistant</h2>
            <p>Experience the future of banking—no forms, no menus, just conversation</p>
          </div>
          
          <div className="agent-demo agent-demo--showcase">
            <div className="demo-tabs demo-tabs--pill">
              <button 
                type="button"
                className={`tab ${activeTab === 'personal' ? 'active' : ''}`}
                onClick={() => setActiveTab('personal')}
              >
                Personal Banking
              </button>
              <button 
                type="button"
                className={`tab ${activeTab === 'business' ? 'active' : ''}`}
                onClick={() => setActiveTab('business')}
              >
                Business Banking
              </button>
            </div>
            
            <div className="demo-content">
              <div className="demo-prompts">
                <h4>Try asking:</h4>
                <div className="prompt-suggestions">
                  {activeTab === 'personal' ? (
                    <>
                      <div className="prompt">"Check my account balance"</div>
                      <div className="prompt">"Transfer $100 to savings"</div>
                      <div className="prompt">"What are my recent transactions?"</div>
                      <div className="prompt">"Pay my electricity bill"</div>
                    </>
                  ) : (
                    <>
                      <div className="prompt">"Create a new business account"</div>
                      <div className="prompt">"Process payroll for 5 employees"</div>
                      <div className="prompt">"Generate quarterly reports"</div>
                      <div className="prompt">"Apply for business credit line"</div>
                    </>
                  )}
                </div>
                <div className="auth-notice auth-notice--showcase">
                  <p>
                    🔐 PingOne sign-in: use the <strong>live assistant</strong> (corner or dock) to stay on this page
                    after login; <strong>Customer sign in</strong> below opens the dashboard.
                  </p>
                  <div className="auth-buttons auth-buttons--showcase-pair">
                    <button type="button" className="auth-btn primary" onClick={() => handleOAuthLogin('user')}>
                      Customer Sign In
                    </button>
                    <button type="button" className="auth-btn secondary" onClick={() => handleOAuthLogin('admin')}>
                      Admin Sign In
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="demo-chat demo-chat--showcase">
                <div className="landing-demo-chat-sim landing-demo-chat-sim--showcase">
                  <div className="landing-demo-chat-sim__header">
                    <div className="landing-demo-chat-sim__dot" />
                    <span className="landing-demo-chat-sim__title">{preset.shortName} AI Agent</span>
                  </div>
                  <div className="landing-demo-chat-sim__body">
                    <div className="landing-demo-chat-sim__bubble landing-demo-chat-sim__bubble--bot">
                      Hi! I can check balances, move money, and explain how OAuth works. Sign in to get started.
                    </div>
                    <div className="landing-demo-chat-sim__bubble landing-demo-chat-sim__bubble--user">
                      What&apos;s my account balance?
                    </div>
                    <div className="landing-demo-chat-sim__bubble landing-demo-chat-sim__bubble--bot">
                      I&apos;ll need to verify your identity. Use <strong>Sign in</strong> inside the real assistant to
                      return here — or <strong>Customer Sign In</strong> on the left for the full dashboard.
                    </div>
                  </div>
                  <div className="landing-demo-chat-sim__footer">
                    <span>💬</span>
                    <span>Chat opens in the bottom-right corner after sign in</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta">
        <div className="container">
          <div className="cta-content">
            <h2>Ready to Experience the Future?</h2>
            <p>Choose customer or admin — you&apos;ll land on the right dashboard after PingOne sign-in.</p>
            <div className="hero-actions" style={{ justifyContent: 'center', marginTop: '1rem' }}>
              <button type="button" className="cta-primary" onClick={() => handleOAuthLogin('user')}>
                Customer sign in
              </button>
              <button type="button" className="cta-secondary" onClick={() => handleOAuthLogin('admin')}>
                Admin sign in
              </button>
            </div>
            <button type="button" className="hero-setup-link" style={{ display: 'block', margin: '1.25rem auto 0' }} onClick={() => navigate('/config')}>
              Open application setup instead
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
                <a href="#agent-section">AI Assistant</a>
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
