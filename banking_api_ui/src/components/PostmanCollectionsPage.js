// banking_api_ui/src/components/PostmanCollectionsPage.js
import React, { useState } from 'react';
import PageNav from './PageNav';
import './PostmanCollectionsPage.css';

// Collection metadata with descriptions and audience
const POSTMAN_COLLECTIONS = [
  {
    filename: 'Super-Banking-1-Exchange-Step-by-Step.postman_collection.json',
    title: 'Super Banking - 1-Exchange Step-by-Step',
    description: 'Learn OAuth 2.0 token exchange with detailed, individual steps. Perfect for understanding each RFC 8693 operation.',
    audience: 'Learner',
    features: ['Individual OAuth steps', 'Token inspection utilities', 'Educational comments'],
    difficulty: 'Beginner'
  },
  {
    filename: 'Super Banking — 1-Exchange Delegated Chain — pi.flow.postman_collection.json',
    title: 'Super Banking - 1-Exchange Delegated Chain',
    description: 'Complete 1-exchange flow for quick demos. Runs the full RFC 8693 token exchange sequence.',
    audience: 'Demo Runner',
    features: ['Full flow automation', 'pi.flow authorization', 'Token exchange'],
    difficulty: 'Intermediate'
  },
  {
    filename: 'Super Banking — 2-Exchange Delegated Chain — pi.flow.postman_collection.json',
    title: 'Super Banking - 2-Exchange Delegated Chain',
    description: 'Advanced 2-exchange (nested delegation) flow. Shows agent-to-MCP delegation patterns.',
    audience: 'Demo Runner',
    features: ['Nested delegation', 'Agent-to-MCP flow', 'Advanced patterns'],
    difficulty: 'Advanced'
  },
  {
    filename: 'Super-Banking-MCP-Tools.postman_collection.json',
    title: 'Super Banking - MCP Tools',
    description: 'Direct MCP server tool testing. Includes all banking operations via the MCP protocol.',
    audience: 'Developer',
    features: ['MCP protocol tools', 'Banking operations', 'Error testing'],
    difficulty: 'Intermediate'
  },
  {
    filename: 'Super-Banking-BFF-API.postman_collection.json',
    title: 'Super Banking - BFF API',
    description: 'Backend-for-Frontend API endpoints. Test the banking API server directly.',
    audience: 'Developer',
    features: ['BFF endpoints', 'Account operations', 'Transaction testing'],
    difficulty: 'Intermediate'
  },
  {
    filename: 'Super-Banking-Advanced-Utilities.postman_collection.json',
    title: 'Super Banking - Advanced Utilities',
    description: 'Advanced utilities for PAZ policies, token revocation, and administrative operations.',
    audience: 'Engineer',
    features: ['PAZ policy testing', 'Token revocation', 'Admin utilities'],
    difficulty: 'Advanced'
  },
  {
    filename: 'PingOne Authentication v4 - MFA included.postman_collection.json',
    title: 'PingOne Authentication v4 - MFA',
    description: 'Pure PingOne authentication testing with MFA flows. OAuth 2.0 and OIDC compliance.',
    audience: 'Security Engineer',
    features: ['MFA flows', 'OAuth 2.0 compliance', 'OIDC testing'],
    difficulty: 'Advanced'
  },
  {
    filename: 'AI-IAM-CORE Webinar.postman_collection.json',
    title: 'AI IAM CORE Webinar',
    description: 'Collection from the AI IAM CORE webinar presentation. Demonstrates key concepts.',
    audience: 'Learner',
    features: ['Webinar examples', 'Concept demonstration', 'Tutorial flow'],
    difficulty: 'Beginner'
  }
];

const ENVIRONMENT_FILE = {
  filename: 'Super-Banking-Shared.postman_environment.json',
  title: 'Super Banking - Shared Environment',
  description: 'Shared environment file required by all collections. Contains variables for endpoints, credentials, and configuration.',
  required: true
};

export default function PostmanCollectionsPage({ user, onLogout }) {
  const [downloadStats, setDownloadStats] = useState({});

  // Handle file download
  const handleDownload = async (filename, title) => {
    try {
      const response = await fetch(`/docs/${filename}`);
      if (!response.ok) {
        throw new Error(`Failed to download ${filename}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Update download stats
      setDownloadStats(prev => ({
        ...prev,
        [filename]: (prev[filename] || 0) + 1
      }));
    } catch (error) {
      console.error('Download failed:', error);
      alert(`Failed to download ${filename}. Please try again.`);
    }
  };

  // Get difficulty color
  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'Beginner': return '#22c55e';
      case 'Intermediate': return '#f59e0b';
      case 'Advanced': return '#ef4444';
      default: return '#6b7280';
    }
  };

  // Get audience icon
  const getAudienceIcon = (audience) => {
    switch (audience) {
      case 'Learner': return '🎓';
      case 'Demo Runner': return '🚀';
      case 'Developer': return '💻';
      case 'Engineer': return '🔧';
      case 'Security Engineer': return '🔒';
      default: return '📋';
    }
  };

  return (
    <div className="postman-page">
      <PageNav user={user} onLogout={onLogout} title="Postman Collections" />
      
      <main className="postman-page__main">
        <div className="postman-page__header">
          <h1>Postman Collections</h1>
          <p className="postman-page__subtitle">
            Ready-to-use Postman collections for testing the Super Banking API and OAuth flows. 
            Each collection includes detailed descriptions and pre-configured requests.
          </p>
        </div>

        {/* Environment File - Always show first */}
        <section className="postman-section">
          <h2>📋 Required Environment</h2>
          <div className="postman-card postman-card--environment">
            <div className="postman-card__content">
              <div className="postman-card__header">
                <h3>{ENVIRONMENT_FILE.title}</h3>
                <span className="postman-card__badge postman-card__badge--required">Required</span>
              </div>
              <p className="postman-card__description">
                {ENVIRONMENT_FILE.description}
              </p>
              <div className="postman-card__features">
                <span className="postman-card__feature">🔧 Configuration variables</span>
                <span className="postman-card__feature">🔐 Credential placeholders</span>
                <span className="postman-card__feature">🌍 Environment settings</span>
              </div>
            </div>
            <div className="postman-card__actions">
              <button
                className="postman-btn postman-btn--primary"
                onClick={() => handleDownload(ENVIRONMENT_FILE.filename)}
              >
                📥 Download Environment
              </button>
            </div>
          </div>
        </section>

        {/* Collections Grid */}
        <section className="postman-section">
          <h2>📚 API Collections</h2>
          <div className="postman-grid">
            {POSTMAN_COLLECTIONS.map((collection) => (
              <div key={collection.filename} className="postman-card">
                <div className="postman-card__content">
                  <div className="postman-card__header">
                    <h3>{collection.title}</h3>
                    <div className="postman-card__meta">
                      <span 
                        className="postman-card__difficulty"
                        style={{ color: getDifficultyColor(collection.difficulty) }}
                      >
                        {collection.difficulty}
                      </span>
                      <span className="postman-card__audience">
                        {getAudienceIcon(collection.audience)} {collection.audience}
                      </span>
                    </div>
                  </div>
                  <p className="postman-card__description">
                    {collection.description}
                  </p>
                  <div className="postman-card__features">
                    {collection.features.map((feature, index) => (
                      <span key={index} className="postman-card__feature">
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="postman-card__actions">
                  <button
                    className="postman-btn postman-btn--primary"
                    onClick={() => handleDownload(collection.filename, collection.title)}
                  >
                    📥 Download Collection
                  </button>
                  {downloadStats[collection.filename] && (
                    <span className="postman-card__download-count">
                      Downloaded {downloadStats[collection.filename]} time{downloadStats[collection.filename] > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Start Guide */}
        <section className="postman-section">
          <h2>🚀 Quick Start Guide</h2>
          <div className="postman-guide">
            <div className="postman-guide__steps">
              <div className="postman-guide__step">
                <div className="postman-guide__step-number">1</div>
                <div className="postman-guide__step-content">
                  <h4>Import Environment</h4>
                  <p>Download and import the shared environment file first. This provides all necessary variables.</p>
                </div>
              </div>
              <div className="postman-guide__step">
                <div className="postman-guide__step-number">2</div>
                <div className="postman-guide__step-content">
                  <h4>Configure Variables</h4>
                  <p>Fill in your PingOne credentials, environment IDs, and test user details in the environment.</p>
                </div>
              </div>
              <div className="postman-guide__step">
                <div className="postman-guide__step-number">3</div>
                <div className="postman-guide__step-content">
                  <h4>Import Collection</h4>
                  <p>Download and import your chosen collection based on your needs (learning, demo, or development).</p>
                </div>
              </div>
              <div className="postman-guide__step">
                <div className="postman-guide__step-number">4</div>
                <div className="postman-guide__step-content">
                  <h4>Run Requests</h4>
                  <p>Execute requests in order. Each collection includes detailed descriptions and expected outputs.</p>
                </div>
              </div>
            </div>
            <div className="postman-guide__tips">
              <h4>💡 Pro Tips</h4>
              <ul>
                <li>Use the "Step-by-Step" collection first to understand the OAuth flow</li>
                <li>Set the <code>mayAct</code> attribute on your test user before running token exchanges</li>
                <li>Check the "Test" tab in Postman for detailed validation and debugging information</li>
                <li>Use the "Decode Token" utility to inspect JWT claims and delegation chains</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Resources */}
        <section className="postman-section">
          <h2>📖 Additional Resources</h2>
          <div className="postman-resources">
            <a 
              href="/docs/POSTMAN-GUIDE.md" 
              target="_blank" 
              rel="noopener noreferrer"
              className="postman-resource-link"
            >
              <div className="postman-resource-icon">📖</div>
              <div className="postman-resource-content">
                <h4>Complete Postman Guide</h4>
                <p>Detailed documentation with prerequisites, setup instructions, and troubleshooting.</p>
              </div>
            </a>
            <a 
              href="https://www.postman.com/downloads/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="postman-resource-link"
            >
              <div className="postman-resource-icon">⬇️</div>
              <div className="postman-resource-content">
                <h4>Download Postman</h4>
                <p>Get the latest version of Postman for your platform.</p>
              </div>
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
