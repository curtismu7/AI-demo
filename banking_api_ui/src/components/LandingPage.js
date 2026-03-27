import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import LoadingOverlay from './shared/LoadingOverlay';
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
  const [loginOverlay, setLoginOverlay] = React.useState({ show: false, message: '', sub: '' });

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

  const handleOAuthLogin = (userType = 'user') => {
    const label = userType === 'admin' ? 'Admin' : 'Customer';
    setLoginOverlay({ show: true, message: `Signing in as ${label}…`, sub: 'Redirecting to PingOne' });
    const apiUrl = process.env.REACT_APP_API_URL || window.location.origin;
    const url = userType === 'admin'
      ? `${apiUrl}/api/auth/oauth/login`
      : `${apiUrl}/api/auth/oauth/user/login`;
    setTimeout(() => { window.location.href = url; }, 150);
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

  // Marketing home stays dark (.landing-page #0a0a0a); global light/dark theme applies inside the app after sign-in.
  return (
    <div className="landing-page">
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

      {/* AI Agent Section */}
      <section id="agent-section" className="agent-section">
        <div className="container">
          <div className="section-header">
            <h2>Try Our AI Banking Assistant</h2>
            <p>Experience the future of banking—no forms, no menus, just conversation</p>
          </div>
          
          <div className="agent-demo">
            <div className="demo-tabs">
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
                <div className="auth-notice">
                  <p>🔐 Sign in required to access AI banking features</p>
                  <div className="auth-buttons">
                    <button 
                      type="button"
                      className="auth-btn primary"
                      onClick={() => handleOAuthLogin('user')}
                    >
                      Customer Sign In
                    </button>
                    <button 
                      type="button"
                      className="auth-btn secondary"
                      onClick={() => handleOAuthLogin('admin')}
                    >
                      Admin Sign In
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="demo-chat">
                <div style={{
                  background: '#0f172a',
                  borderRadius: '1rem',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  minHeight: '260px',
                  boxShadow: '0 4px 32px rgba(0,0,0,0.4)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.75rem' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
                    <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>{preset.shortName} AI Agent</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', flex: 1 }}>
                    <div style={{ alignSelf: 'flex-start', background: '#1e293b', color: '#e2e8f0', borderRadius: '0.75rem 0.75rem 0.75rem 0', padding: '0.6rem 0.9rem', fontSize: '0.85rem', maxWidth: '80%' }}>
                      Hi! I can check balances, move money, and explain how OAuth works. Sign in to get started.
                    </div>
                    <div style={{ alignSelf: 'flex-end', background: '#6366f1', color: '#fff', borderRadius: '0.75rem 0.75rem 0 0.75rem', padding: '0.6rem 0.9rem', fontSize: '0.85rem', maxWidth: '80%' }}>
                      What's my account balance?
                    </div>
                    <div style={{ alignSelf: 'flex-start', background: '#1e293b', color: '#e2e8f0', borderRadius: '0.75rem 0.75rem 0.75rem 0', padding: '0.6rem 0.9rem', fontSize: '0.85rem', maxWidth: '80%' }}>
                      I'll need to verify your identity first. Click <strong>Customer Sign In</strong> →
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderTop: '1px solid #1e293b', paddingTop: '0.75rem', color: '#64748b', fontSize: '0.78rem' }}>
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
      <LoadingOverlay show={loginOverlay.show} message={loginOverlay.message} sub={loginOverlay.sub} />
    </div>
  );
};

export default LandingPage;
