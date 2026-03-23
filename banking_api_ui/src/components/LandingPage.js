import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import BankingAgent from './BankingAgent';
import './LandingPage.css';

const LandingPage = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('personal');
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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

  const testimonials = [
    {
      name: 'Sarah Chen',
      role: 'Small Business Owner',
      content: 'The AI assistant helped me manage my business finances effortlessly. It understands natural language and makes complex banking simple.',
      avatar: '👩‍💼'
    },
    {
      name: 'Michael Rodriguez',
      role: 'Tech Entrepreneur',
      content: 'Finally, a banking experience that speaks my language. The agent integration is seamless and incredibly intuitive.',
      avatar: '👨‍💻'
    },
    {
      name: 'Emily Johnson',
      role: 'Digital Nomad',
      content: 'I can manage my finances from anywhere in the world. The AI agent handles everything from transfers to financial planning.',
      avatar: '👩‍💻'
    }
  ];

  return (
    <div className="landing-page">
      {/* Navigation */}
      <nav className={`navbar ${scrollY > 50 ? 'scrolled' : ''}`}>
        <div className="nav-container">
          <div className="nav-brand">
            <div className="brand-icon">
              <div className="brand-square"></div>
              <div className="brand-square"></div>
              <div className="brand-square"></div>
              <div className="brand-square"></div>
            </div>
            <span className="brand-name">BX Finance</span>
          </div>
          
          <div className={`nav-menu ${isMenuOpen ? 'open' : ''}`}>
            <a href="#features" className="nav-link">Features</a>
            <a href="#how-it-works" className="nav-link">How It Works</a>
            <a href="#testimonials" className="nav-link">Testimonials</a>
            <button 
              className="nav-cta"
              onClick={() => document.getElementById('agent-section').scrollIntoView({ behavior: 'smooth' })}
            >
              Try AI Assistant
            </button>
          </div>
          
          <button 
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
              <button 
                className="cta-primary"
                onClick={() => document.getElementById('agent-section').scrollIntoView({ behavior: 'smooth' })}
              >
                Start Conversation
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </button>
              <a href="#features" className="cta-secondary">
                Learn More
              </a>
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
              <div key={index} className="feature-card">
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
                className={`tab ${activeTab === 'personal' ? 'active' : ''}`}
                onClick={() => setActiveTab('personal')}
              >
                Personal Banking
              </button>
              <button 
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
              </div>
              
              <div className="demo-chat">
                <BankingAgent />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="testimonials">
        <div className="container">
          <div className="section-header">
            <h2>Loved by Thousands</h2>
            <p>See what our customers are saying about AI-powered banking</p>
          </div>
          
          <div className="testimonials-grid">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="testimonial-card">
                <div className="testimonial-avatar">{testimonial.avatar}</div>
                <div className="testimonial-content">
                  <p>"{testimonial.content}"</p>
                  <div className="testimonial-author">
                    <strong>{testimonial.name}</strong>
                    <span>{testimonial.role}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta">
        <div className="container">
          <div className="cta-content">
            <h2>Ready to Experience the Future?</h2>
            <p>Join thousands of users who have transformed their banking experience with AI</p>
            <button 
              className="cta-primary"
              onClick={() => document.getElementById('agent-section').scrollIntoView({ behavior: 'smooth' })}
            >
              Start Your AI Journey
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <div className="brand-icon">
                <div className="brand-square"></div>
                <div className="brand-square"></div>
                <div className="brand-square"></div>
                <div className="brand-square"></div>
              </div>
              <span className="brand-name">BX Finance</span>
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
            <p>&copy; 2024 BX Finance. All rights reserved. Secured by PingOne AI IAM Core.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
