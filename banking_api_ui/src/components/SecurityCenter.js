// banking_api_ui/src/components/SecurityCenter.js
import React, { useState } from 'react';
import { toast } from 'react-toastify';

export default function SecurityCenter({ user }) {
  const [activeTab, setActiveTab] = useState('overview');

  const handleAction = (action) => {
    toast.info(`${action} - This would open the appropriate flow in a production implementation`);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="security-overview">
            <div className="security-status">
              <h3>Security Status</h3>
              <div className="status-grid">
                <div className="status-item">
                  <div className="status-icon good">✅</div>
                  <div className="status-text">
                    <div className="status-title">Password Protection</div>
                    <div className="status-desc">Strong password configured</div>
                  </div>
                </div>
                <div className="status-item">
                  <div className="status-icon good">✅</div>
                  <div className="status-text">
                    <div className="status-title">Multi-Factor Authentication</div>
                    <div className="status-desc">MFA enabled and active</div>
                  </div>
                </div>
                <div className="status-item">
                  <div className="status-icon warning">⚠️</div>
                  <div className="status-text">
                    <div className="status-title">Session Management</div>
                    <div className="status-desc">Review active sessions</div>
                  </div>
                </div>
                <div className="status-item">
                  <div className="status-icon good">✅</div>
                  <div className="status-text">
                    <div className="status-title">Login Monitoring</div>
                    <div className="status-desc">Suspicious activity detection</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="security-actions">
              <h3>Quick Actions</h3>
              <div className="action-grid">
                <button 
                  type="button"
                  onClick={() => handleAction('Change Password')}
                  className="action-btn"
                >
                  <span className="action-icon">🔑</span>
                  <span className="action-title">Change Password</span>
                  <span className="action-desc">Update your account password</span>
                </button>
                <button 
                  type="button"
                  onClick={() => handleAction('Manage MFA')}
                  className="action-btn"
                >
                  <span className="action-icon">📱</span>
                  <span className="action-title">Manage MFA</span>
                  <span className="action-desc">Configure multi-factor authentication</span>
                </button>
                <button 
                  type="button"
                  onClick={() => handleAction('Active Sessions')}
                  className="action-btn"
                >
                  <span className="action-icon">💻</span>
                  <span className="action-title">Active Sessions</span>
                  <span className="action-desc">View and manage logged-in devices</span>
                </button>
                <button 
                  type="button"
                  onClick={() => handleAction('Security Alerts')}
                  className="action-btn"
                >
                  <span className="action-icon">🔔</span>
                  <span className="action-title">Security Alerts</span>
                  <span className="action-desc">Configure security notifications</span>
                </button>
              </div>
            </div>
          </div>
        );

      case 'password':
        return (
          <div className="password-section">
            <h3>Password Management</h3>
            <div className="password-info">
              <div className="info-card">
                <h4>Current Password Status</h4>
                <div className="password-strength">
                  <div className="strength-bar">
                    <div className="strength-fill strong"></div>
                  </div>
                  <span className="strength-text">Strong</span>
                </div>
                <p className="last-changed">Last changed: 30 days ago</p>
              </div>

              <div className="password-requirements">
                <h4>Password Requirements</h4>
                <ul>
                  <li>✅ At least 12 characters long</li>
                  <li>✅ Contains uppercase and lowercase letters</li>
                  <li>✅ Contains numbers</li>
                  <li>✅ Contains special characters</li>
                </ul>
              </div>
            </div>

            <div className="password-actions">
              <button 
                type="button"
                onClick={() => handleAction('Change Password')}
                className="btn btn-primary"
              >
                Change Password
              </button>
              <button 
                type="button"
                onClick={() => handleAction('Forgot Password')}
                className="btn btn-outline"
              >
                Forgot Password
              </button>
            </div>
          </div>
        );

      case 'mfa':
        return (
          <div className="mfa-section">
            <h3>Multi-Factor Authentication</h3>
            <div className="mfa-status">
              <div className="status-card enabled">
                <div className="status-header">
                  <span className="status-icon">✅</span>
                  <div>
                    <h4>MFA Enabled</h4>
                    <p>Your account is protected with multi-factor authentication</p>
                  </div>
                </div>
              </div>

              <div className="mfa-methods">
                <h4>Configured Methods</h4>
                <div className="method-list">
                  <div className="method-item active">
                    <span className="method-icon">📱</span>
                    <div className="method-info">
                      <div className="method-name">Authenticator App</div>
                      <div className="method-desc">Google Authenticator</div>
                    </div>
                    <span className="method-status">Active</span>
                  </div>
                  <div className="method-item">
                    <span className="method-icon">📧</span>
                    <div className="method-info">
                      <div className="method-name">Email Verification</div>
                      <div className="method-desc">Backup email method</div>
                    </div>
                    <span className="method-status">Setup</span>
                  </div>
                  <div className="method-item">
                    <span className="method-icon">📞</span>
                    <div className="method-info">
                      <div className="method-name">SMS Verification</div>
                      <div className="method-desc">Not configured</div>
                    </div>
                    <button 
                      type="button"
                      onClick={() => handleAction('Setup SMS')}
                      className="btn btn-sm btn-outline"
                    >
                      Setup
                    </button>
                  </div>
                </div>
              </div>

              <div className="mfa-actions">
                <button 
                  type="button"
                  onClick={() => handleAction('Manage MFA')}
                  className="btn btn-primary"
                >
                  Manage MFA Settings
                </button>
                <button 
                  type="button"
                  onClick={() => handleAction('Generate Backup Codes')}
                  className="btn btn-outline"
                >
                  Generate Backup Codes
                </button>
              </div>
            </div>
          </div>
        );

      case 'sessions':
        return (
          <div className="sessions-section">
            <h3>Active Sessions</h3>
            <div className="sessions-list">
              <div className="session-item current">
                <div className="session-info">
                  <div className="session-device">
                    <span className="device-icon">💻</span>
                    <div>
                      <div className="device-name">Chrome on macOS</div>
                      <div className="device-details">192.168.1.100 • Current session</div>
                    </div>
                  </div>
                  <div className="session-time">
                    <div className="time-label">Started</div>
                    <div className="time-value">2 hours ago</div>
                  </div>
                </div>
                <div className="session-actions">
                  <span className="current-badge">Current</span>
                </div>
              </div>

              <div className="session-item">
                <div className="session-info">
                  <div className="session-device">
                    <span className="device-icon">📱</span>
                    <div>
                      <div className="device-name">Safari on iPhone</div>
                      <div className="device-details">192.168.1.101</div>
                    </div>
                  </div>
                  <div className="session-time">
                    <div className="time-label">Last active</div>
                    <div className="time-value">1 day ago</div>
                  </div>
                </div>
                <div className="session-actions">
                  <button 
                    type="button"
                    onClick={() => handleAction('Revoke Session')}
                    className="btn btn-sm btn-outline"
                  >
                    Revoke
                  </button>
                </div>
              </div>

              <div className="session-item">
                <div className="session-info">
                  <div className="session-device">
                    <span className="device-icon">🌐</span>
                    <div>
                      <div className="device-name">Firefox on Windows</div>
                      <div className="device-details">192.168.1.102</div>
                    </div>
                  </div>
                  <div className="session-time">
                    <div className="time-label">Last active</div>
                    <div className="time-value">3 days ago</div>
                  </div>
                </div>
                <div className="session-actions">
                  <button 
                    type="button"
                    onClick={() => handleAction('Revoke Session')}
                    className="btn btn-sm btn-outline"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            </div>

            <div className="sessions-actions">
              <button 
                type="button"
                onClick={() => handleAction('Revoke All Sessions')}
                className="btn btn-outline"
              >
                Revoke All Other Sessions
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="security-center">
      <div className="security-header">
        <h2>Security Center</h2>
        <p>Manage your account security and privacy settings</p>
      </div>

      <div className="security-tabs">
        <div className="tab-nav">
          {[
            { id: 'overview', label: 'Overview', icon: '🛡️' },
            { id: 'password', label: 'Password', icon: '🔑' },
            { id: 'mfa', label: 'MFA', icon: '📱' },
            { id: 'sessions', label: 'Sessions', icon: '💻' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="tab-content">
          {renderContent()}
        </div>
      </div>

      <style jsx>{`
        .security-center {
          max-width: 1000px;
          margin: 0 auto;
          padding: 2rem;
        }

        .security-header {
          margin-bottom: 2rem;
        }

        .security-header h2 {
          margin: 0 0 0.5rem 0;
          color: #333;
        }

        .security-header p {
          margin: 0;
          color: #666;
        }

        .security-tabs {
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          overflow: hidden;
        }

        .tab-nav {
          display: flex;
          border-bottom: 1px solid #e5e7eb;
          background: #f9fafb;
        }

        .tab-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 1rem;
          border: none;
          background: transparent;
          cursor: pointer;
          transition: all 0.2s;
        }

        .tab-btn:hover {
          background: #f3f4f6;
        }

        .tab-btn.active {
          background: white;
          border-bottom: 2px solid #4f46e5;
          color: #4f46e5;
        }

        .tab-icon {
          font-size: 1.2rem;
        }

        .tab-content {
          padding: 2rem;
        }

        .security-overview {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .security-status h3,
        .security-actions h3 {
          margin: 0 0 1rem 0;
          color: #333;
        }

        .status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1rem;
        }

        .status-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
        }

        .status-icon {
          font-size: 1.5rem;
        }

        .status-icon.good {
          color: #10b981;
        }

        .status-icon.warning {
          color: #f59e0b;
        }

        .status-title {
          font-weight: 600;
          color: #333;
        }

        .status-desc {
          font-size: 0.875rem;
          color: #666;
        }

        .action-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .action-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          padding: 1.5rem;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          background: white;
          cursor: pointer;
          transition: all 0.2s;
        }

        .action-btn:hover {
          border-color: #4f46e5;
          box-shadow: 0 2px 8px rgba(79, 70, 229, 0.1);
        }

        .action-icon {
          font-size: 2rem;
        }

        .action-title {
          font-weight: 600;
          color: #333;
        }

        .action-desc {
          font-size: 0.875rem;
          color: #666;
          text-align: center;
        }

        .password-section,
        .mfa-section,
        .sessions-section {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .password-info,
        .mfa-status {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .info-card {
          padding: 1.5rem;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
        }

        .password-strength {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .strength-bar {
          flex: 1;
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
        }

        .strength-fill {
          height: 100%;
          border-radius: 4px;
        }

        .strength-fill.strong {
          background: #10b981;
          width: 80%;
        }

        .strength-text {
          font-weight: 600;
          color: #10b981;
        }

        .password-requirements ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .password-requirements li {
          padding: 0.25rem 0;
          color: #666;
        }

        .password-actions,
        .mfa-actions,
        .sessions-actions {
          display: flex;
          gap: 1rem;
        }

        .status-card {
          padding: 1.5rem;
          border-radius: 6px;
          border: 1px solid #e5e7eb;
        }

        .status-card.enabled {
          background: #f0fdf4;
          border-color: #10b981;
        }

        .status-header {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .status-header h4 {
          margin: 0;
          color: #333;
        }

        .status-header p {
          margin: 0;
          color: #666;
        }

        .method-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .method-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
        }

        .method-item.active {
          border-color: #10b981;
          background: #f0fdf4;
        }

        .method-icon {
          font-size: 1.5rem;
        }

        .method-name {
          font-weight: 600;
          color: #333;
        }

        .method-desc {
          font-size: 0.875rem;
          color: #666;
        }

        .method-status {
          margin-left: auto;
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .method-status.active {
          background: #10b981;
          color: white;
        }

        .sessions-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .session-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.5rem;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
        }

        .session-item.current {
          background: #f0fdf4;
          border-color: #10b981;
        }

        .session-info {
          display: flex;
          align-items: center;
          gap: 2rem;
        }

        .device-icon {
          font-size: 1.5rem;
        }

        .device-name {
          font-weight: 600;
          color: #333;
        }

        .device-details {
          font-size: 0.875rem;
          color: #666;
        }

        .time-label {
          font-size: 0.875rem;
          color: #666;
        }

        .time-value {
          font-weight: 500;
          color: #333;
        }

        .current-badge {
          padding: 0.25rem 0.75rem;
          background: #10b981;
          color: white;
          border-radius: 12px;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .btn {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 4px;
          font-size: 1rem;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          text-align: center;
          transition: all 0.2s;
        }

        .btn-primary {
          background: #4f46e5;
          color: white;
        }

        .btn-primary:hover {
          background: #4338ca;
        }

        .btn-outline {
          background: transparent;
          color: #4f46e5;
          border: 1px solid #4f46e5;
        }

        .btn-outline:hover {
          background: #4f46e5;
          color: white;
        }

        .btn-sm {
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
        }

        @media (max-width: 768px) {
          .security-center {
            padding: 1rem;
          }

          .tab-nav {
            flex-wrap: wrap;
          }

          .tab-btn {
            flex: 1 1 50%;
            min-width: 120px;
          }

          .status-grid,
          .action-grid {
            grid-template-columns: 1fr;
          }

          .session-info {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
          }

          .session-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
          }

          .session-actions {
            align-self: stretch;
            display: flex;
            justify-content: flex-end;
          }
        }
      `}</style>
    </div>
  );
}
