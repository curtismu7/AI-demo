/**
 * SelfServicePage.js
 *
 * Self-service user provisioning page with account creation and profile management.
 * Allows users to create customer and admin accounts with full profile data and mayAct setup.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './SelfServicePage.css';

const SelfServicePage = () => {
  const navigate = useNavigate();
  
  // Tab state
  const [activeTab, setActiveTab] = useState('create');

  // Create form state
  const [formData, setFormData] = useState({
    role: 'customer',
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    phone: '',
    streetAddress: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
    enableMayAct: true,
    mayActMode: '1exchange'
  });
  const [formErrors, setFormErrors] = useState({});
  const [creating, setCreating] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(null);
  const [createError, setCreateError] = useState(null);

  // Profile state
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [mayActDiagnosis, setMayActDiagnosis] = useState(null);
  const [mayActConfiguring, setMayActConfiguring] = useState(false);

  // Auto-generate username from email
  useEffect(() => {
    if (formData.email && !formData.username) {
      const username = formData.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, '');
      setFormData(prev => ({ ...prev, username }));
    }
  }, [formData.email, formData.username]);

  // Load user profile when switching to profile tab
  useEffect(() => {
    if (activeTab === 'profile') {
      loadUserProfile();
    }
  }, [activeTab]);

  const loadUserProfile = async () => {
    setProfileLoading(true);
    setCreateError(null);
    
    try {
      const response = await fetch('/api/self-service/users/me', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          // User not logged in, redirect to login
          navigate('/login');
          return;
        }
        throw new Error('Failed to load profile');
      }
      
      const data = await response.json();
      setProfile(data.user);
      
      // Load mayAct diagnosis
      loadMayActDiagnosis();
    } catch (error) {
      setCreateError(error.message);
    } finally {
      setProfileLoading(false);
    }
  };

  const loadMayActDiagnosis = async () => {
    try {
      const response = await fetch('/api/demo/may-act/diagnose', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setMayActDiagnosis(data);
      }
    } catch (error) {
      console.error('Failed to load mayAct diagnosis:', error);
    }
  };

  const validateForm = (data) => {
    const errors = {};
    
    if (!data.firstName?.trim()) errors.firstName = 'First name is required';
    if (!data.lastName?.trim()) errors.lastName = 'Last name is required';
    if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.email = 'Valid email is required';
    }
    if (!data.username?.trim()) errors.username = 'Username is required';
    if (!data.password || data.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    if (!/[A-Z]/.test(data.password)) {
      errors.password = 'Password must contain an uppercase letter';
    }
    if (!/[0-9]/.test(data.password)) {
      errors.password = 'Password must contain a number';
    }
    if (data.password !== data.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    
    return errors;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const errors = validateForm(formData);
    setFormErrors(errors);
    
    if (Object.keys(errors).length > 0) return;
    
    setCreating(true);
    setCreateError(null);
    
    try {
      const response = await fetch('/api/self-service/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: formData.email,
          firstName: formData.firstName,
          lastName: formData.lastName,
          username: formData.username,
          password: formData.password,
          phone: formData.phone || undefined,
          address: formData.streetAddress ? {
            streetAddress: formData.streetAddress,
            locality: formData.city,
            region: formData.state,
            postalCode: formData.zipCode,
            countryCode: formData.country
          } : undefined,
          role: formData.role,
          enableMayAct: formData.enableMayAct,
          mayActMode: formData.mayActMode
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error_description || data.error || 'Failed to create user');
      }
      
      setCreateSuccess(data);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleMayActConfig = async () => {
    setMayActConfiguring(true);
    setCreateError(null);
    
    try {
      const response = await fetch('/api/self-service/users/mayact', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          enabled: formData.enableMayAct,
          clientIds: formData.enableMayAct ? [process.env.REACT_APP_PINGONE_CORE_CLIENT_ID] : []
        })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error_description || data.error || 'Failed to configure mayAct');
      }
      
      // Reload profile to show updated mayAct status
      await loadUserProfile();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setMayActConfiguring(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const getPasswordStrength = (password) => {
    if (!password) return { strength: 0, label: 'Weak', color: '#ef4444' };
    
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z\d]/.test(password)) strength++;
    
    const levels = [
      { strength: 0, label: 'Weak', color: '#ef4444' },
      { strength: 1, label: 'Fair', color: '#f59e0b' },
      { strength: 2, label: 'Good', color: '#eab308' },
      { strength: 3, label: 'Strong', color: '#22c55e' },
      { strength: 4, label: 'Very Strong', color: '#16a34a' },
      { strength: 5, label: 'Excellent', color: '#15803d' }
    ];
    
    return levels[Math.min(strength, 4)];
  };

  const passwordStrength = getPasswordStrength(formData.password);

  return (
    <div className="ssp-root">
      <div className="ssp-container">
        <header className="ssp-header">
          <h1>Self-Service User Provisioning</h1>
          <p>Create your Super Banking account or manage your existing profile</p>
        </header>

        {/* Error Banner */}
        {createError && (
          <div className="ssp-error-banner">
            <span className="ssp-error-icon">⚠️</span>
            <span>{createError}</span>
            <button 
              className="ssp-error-close"
              onClick={() => setCreateError(null)}
            >
              ×
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="ssp-tabs">
          <button
            className={`ssp-tab ${activeTab === 'create' ? 'ssp-tab--active' : ''}`}
            onClick={() => setActiveTab('create')}
          >
            Create Account
          </button>
          <button
            className={`ssp-tab ${activeTab === 'profile' ? 'ssp-tab--active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            My Profile
          </button>
        </div>

        {/* Create Account Tab */}
        {activeTab === 'create' && (
          <div className="ssp-card">
            {createSuccess ? (
              <div className="ssp-success-card">
                <h2>✅ Account Created Successfully!</h2>
                <div className="ssp-credentials">
                  <p><strong>Email:</strong> {createSuccess.user.email}</p>
                  <p><strong>Username:</strong> {createSuccess.user.username}</p>
                  <p><strong>Role:</strong> {createSuccess.user.role}</p>
                  {createSuccess.user.role === 'admin' && (
                    <p><strong>mayAct:</strong> {formData.enableMayAct ? 'Enabled' : 'Disabled'}</p>
                  )}
                </div>
                <div className="ssp-next-steps">
                  <h3>Next Steps:</h3>
                  <ol>
                    <li>Use your email and password to log in</li>
                    <li>Complete your profile setup</li>
                    <li>Start using Super Banking features</li>
                  </ol>
                </div>
                <button
                  className="ssp-submit-btn"
                  onClick={() => navigate('/login')}
                >
                  Login Now
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="ssp-form">
                {/* Role Selector */}
                <div className="ssp-role-selector">
                  <label className="ssp-role-label">Account Type:</label>
                  <div className="ssp-role-cards">
                    <div
                      className={`ssp-role-card ${formData.role === 'customer' ? 'ssp-role-card--selected' : ''}`}
                      onClick={() => handleInputChange('role', 'customer')}
                    >
                      <div className="ssp-role-icon">👤</div>
                      <div className="ssp-role-title">Customer</div>
                      <div className="ssp-role-desc">Personal banking account</div>
                    </div>
                    <div
                      className={`ssp-role-card ${formData.role === 'admin' ? 'ssp-role-card--selected' : ''}`}
                      onClick={() => handleInputChange('role', 'admin')}
                    >
                      <div className="ssp-role-icon">🔧</div>
                      <div className="ssp-role-title">Admin</div>
                      <div className="ssp-role-desc">Administrative access</div>
                    </div>
                  </div>
                </div>

                {/* Personal Information */}
                <div className="ssp-form-section">
                  <h3>Personal Information</h3>
                  <div className="ssp-form-row">
                    <div className="ssp-form-group">
                      <label>First Name *</label>
                      <input
                        type="text"
                        className={`ssp-input ${formErrors.firstName ? 'ssp-input--error' : ''}`}
                        value={formData.firstName}
                        onChange={(e) => handleInputChange('firstName', e.target.value)}
                        placeholder="Enter your first name"
                      />
                      {formErrors.firstName && (
                        <div className="ssp-error-text">{formErrors.firstName}</div>
                      )}
                    </div>
                    <div className="ssp-form-group">
                      <label>Last Name *</label>
                      <input
                        type="text"
                        className={`ssp-input ${formErrors.lastName ? 'ssp-input--error' : ''}`}
                        value={formData.lastName}
                        onChange={(e) => handleInputChange('lastName', e.target.value)}
                        placeholder="Enter your last name"
                      />
                      {formErrors.lastName && (
                        <div className="ssp-error-text">{formErrors.lastName}</div>
                      )}
                    </div>
                  </div>
                  <div className="ssp-form-row">
                    <div className="ssp-form-group">
                      <label>Email Address *</label>
                      <input
                        type="email"
                        className={`ssp-input ${formErrors.email ? 'ssp-input--error' : ''}`}
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        placeholder="your.email@example.com"
                      />
                      {formErrors.email && (
                        <div className="ssp-error-text">{formErrors.email}</div>
                      )}
                    </div>
                    <div className="ssp-form-group">
                      <label>Username *</label>
                      <input
                        type="text"
                        className={`ssp-input ${formErrors.username ? 'ssp-input--error' : ''}`}
                        value={formData.username}
                        onChange={(e) => handleInputChange('username', e.target.value)}
                        placeholder="username"
                      />
                      {formErrors.username && (
                        <div className="ssp-error-text">{formErrors.username}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Password */}
                <div className="ssp-form-section">
                  <h3>Password</h3>
                  <div className="ssp-form-row">
                    <div className="ssp-form-group">
                      <label>Password *</label>
                      <input
                        type="password"
                        className={`ssp-input ${formErrors.password ? 'ssp-input--error' : ''}`}
                        value={formData.password}
                        onChange={(e) => handleInputChange('password', e.target.value)}
                        placeholder="Enter your password"
                      />
                      {formErrors.password && (
                        <div className="ssp-error-text">{formErrors.password}</div>
                      )}
                      <div className="ssp-password-strength">
                        <div className="ssp-strength-bar">
                          <div 
                            className="ssp-strength-fill"
                            style={{ 
                              width: `${(passwordStrength.strength / 4) * 100}%`,
                              backgroundColor: passwordStrength.color
                            }}
                          />
                        </div>
                        <span className="ssp-strength-label" style={{ color: passwordStrength.color }}>
                          {passwordStrength.label}
                        </span>
                      </div>
                    </div>
                    <div className="ssp-form-group">
                      <label>Confirm Password *</label>
                      <input
                        type="password"
                        className={`ssp-input ${formErrors.confirmPassword ? 'ssp-input--error' : ''}`}
                        value={formData.confirmPassword}
                        onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                        placeholder="Confirm your password"
                      />
                      {formErrors.confirmPassword && (
                        <div className="ssp-error-text">{formErrors.confirmPassword}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Phone (Optional) */}
                <div className="ssp-form-section">
                  <h3>Contact Information (Optional)</h3>
                  <div className="ssp-form-group">
                    <label>Phone Number</label>
                    <input
                      type="tel"
                      className="ssp-input"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      placeholder="+1-555-0100"
                    />
                  </div>
                </div>

                {/* Address (Optional) */}
                <div className="ssp-form-section">
                  <h3>Address Information (Optional)</h3>
                  <div className="ssp-address-section">
                    <div className="ssp-form-group">
                      <label>Street Address</label>
                      <input
                        type="text"
                        className="ssp-input"
                        value={formData.streetAddress}
                        onChange={(e) => handleInputChange('streetAddress', e.target.value)}
                        placeholder="123 Main St"
                      />
                    </div>
                    <div className="ssp-form-row">
                      <div className="ssp-form-group">
                        <label>City</label>
                        <input
                          type="text"
                          className="ssp-input"
                          value={formData.city}
                          onChange={(e) => handleInputChange('city', e.target.value)}
                          placeholder="San Francisco"
                        />
                      </div>
                      <div className="ssp-form-group">
                        <label>State</label>
                        <input
                          type="text"
                          className="ssp-input"
                          value={formData.state}
                          onChange={(e) => handleInputChange('state', e.target.value)}
                          placeholder="CA"
                        />
                      </div>
                    </div>
                    <div className="ssp-form-row">
                      <div className="ssp-form-group">
                        <label>ZIP Code</label>
                        <input
                          type="text"
                          className="ssp-input"
                          value={formData.zipCode}
                          onChange={(e) => handleInputChange('zipCode', e.target.value)}
                          placeholder="94105"
                        />
                      </div>
                      <div className="ssp-form-group">
                        <label>Country</label>
                        <select
                          className="ssp-input"
                          value={formData.country}
                          onChange={(e) => handleInputChange('country', e.target.value)}
                        >
                          <option value="US">United States</option>
                          <option value="CA">Canada</option>
                          <option value="UK">United Kingdom</option>
                          <option value="AU">Australia</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* mayAct Configuration */}
                <div className="ssp-form-section ssp-mayact-section">
                  <h3>
                    <span className="ssp-mayact-icon">🔐</span>
                    Token Exchange Delegation (mayAct)
                  </h3>
                  <div className="ssp-mayact-toggle">
                    <label className="ssp-toggle-switch">
                      <input
                        type="checkbox"
                        checked={formData.enableMayAct}
                        onChange={(e) => handleInputChange('enableMayAct', e.target.checked)}
                      />
                      <span className="ssp-toggle-slider"></span>
                    </label>
                    <span className="ssp-toggle-label">Enable mayAct for token exchange</span>
                  </div>
                  
                  {formData.enableMayAct && (
                    <div className="ssp-mayact-details">
                      <div className="ssp-mayact-modes">
                        <label>Exchange Mode:</label>
                        <div className="ssp-mode-cards">
                          <div
                            className={`ssp-mode-card ${formData.mayActMode === '1exchange' ? 'ssp-mode-card--selected' : ''}`}
                            onClick={() => handleInputChange('mayActMode', '1exchange')}
                          >
                            <div className="ssp-mode-title">1-Exchange</div>
                            <div className="ssp-mode-desc">Direct BFF to MCP token exchange</div>
                          </div>
                          <div
                            className={`ssp-mode-card ${formData.mayActMode === '2exchange' ? 'ssp-mode-card--selected' : ''}`}
                            onClick={() => handleInputChange('mayActMode', '2exchange')}
                          >
                            <div className="ssp-mode-title">2-Exchange</div>
                            <div className="ssp-mode-desc">Agent → BFF → MCP nested exchange</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="ssp-mayact-tooltip">
                        <div className="ssp-tooltip-icon">ℹ️</div>
                        <div className="ssp-tooltip-content">
                          <h4>What is mayAct?</h4>
                          <p>
                            The may_act claim (RFC 8693 §4.1) permits an OAuth client to act on behalf 
                            of this user during token exchange. This is required for the Banking Agent 
                            to perform operations using the user's identity.
                          </p>
                          <ul>
                            <li><strong>1-Exchange:</strong> may_act.client_id = Banking App (BFF) — the Backend-for-Frontend exchanges the user token directly for an MCP token.</li>
                            <li><strong>2-Exchange:</strong> may_act.client_id = AI Agent App — the AI Agent first exchanges its own credentials, then the BFF exchanges again for the final MCP token with nested act.act claims.</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                <div className="ssp-form-actions">
                  <button
                    type="submit"
                    className="ssp-submit-btn"
                    disabled={creating}
                  >
                    {creating ? 'Creating Account...' : 'Create Account'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* My Profile Tab */}
        {activeTab === 'profile' && (
          <div className="ssp-card">
            {profileLoading ? (
              <div className="ssp-loading">Loading profile...</div>
            ) : profile ? (
              <div className="ssp-profile-card">
                <h2>My Profile</h2>
                
                {/* Profile Information */}
                <div className="ssp-profile-section">
                  <h3>Account Information</h3>
                  <div className="ssp-profile-info">
                    <div className="ssp-info-row">
                      <span className="ssp-info-label">Name:</span>
                      <span className="ssp-info-value">{profile.name?.given} {profile.name?.family}</span>
                    </div>
                    <div className="ssp-info-row">
                      <span className="ssp-info-label">Email:</span>
                      <span className="ssp-info-value">{profile.email}</span>
                    </div>
                    <div className="ssp-info-row">
                      <span className="ssp-info-label">Username:</span>
                      <span className="ssp-info-value">{profile.username}</span>
                    </div>
                    <div className="ssp-info-row">
                      <span className="ssp-info-label">Account Status:</span>
                      <span className={`ssp-info-value ${profile.enabled ? 'ssp-status--active' : 'ssp-status--inactive'}`}>
                        {profile.enabled ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {profile.phone && (
                      <div className="ssp-info-row">
                        <span className="ssp-info-label">Phone:</span>
                        <span className="ssp-info-value">{profile.phone}</span>
                      </div>
                    )}
                    {profile.address && (
                      <div className="ssp-info-row">
                        <span className="ssp-info-label">Address:</span>
                        <span className="ssp-info-value">
                          {profile.address.streetAddress}, {profile.address.locality}, {profile.address.region} {profile.address.postalCode}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* mayAct Status */}
                <div className="ssp-profile-section">
                  <h3>Token Exchange Delegation (mayAct)</h3>
                  <div className="ssp-mayact-status">
                    <div className="ssp-mayact-toggle">
                      <label className="ssp-toggle-switch">
                        <input
                          type="checkbox"
                          checked={formData.enableMayAct}
                          onChange={(e) => handleInputChange('enableMayAct', e.target.checked)}
                        />
                        <span className="ssp-toggle-slider"></span>
                      </label>
                      <span className="ssp-toggle-label">
                        mayAct: {formData.enableMayAct ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    
                    <button
                      className="ssp-action-btn"
                      onClick={handleMayActConfig}
                      disabled={mayActConfiguring}
                    >
                      {mayActConfiguring ? 'Configuring...' : 'Update mayAct'}
                    </button>
                  </div>
                </div>

                {/* mayAct Diagnostic Panel */}
                {mayActDiagnosis && (
                  <div className="ssp-profile-section">
                    <h3>mayAct Diagnostic</h3>
                    <div className="ssp-diagnosis-panel">
                      <div className="ssp-diagnosis-summary">
                        <div className={`ssp-diagnosis-status ${mayActDiagnosis.diagnosis?.status === 'pass' ? 'ssp-diagnosis--pass' : 'ssp-diagnosis--fail'}`}>
                          {mayActDiagnosis.diagnosis?.status === 'pass' ? '✅' : '❌'} {mayActDiagnosis.diagnosis?.summary}
                        </div>
                      </div>
                      
                      {mayActDiagnosis.checks && (
                        <div className="ssp-diagnosis-checks">
                          {mayActDiagnosis.checks.map((check, index) => (
                            <div key={index} className={`ssp-diagnosis-check ${check.status === 'pass' ? 'ssp-diagnosis--pass' : 'ssp-diagnosis--fail'}`}>
                              <span className="ssp-check-icon">{check.status === 'pass' ? '✅' : '❌'}</span>
                              <span className="ssp-check-text">{check.description}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {mayActDiagnosis.nextStep && (
                        <div className="ssp-diagnosis-next">
                          <strong>Next Step:</strong> {mayActDiagnosis.nextStep}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="ssp-no-profile">
                <h3>No Profile Found</h3>
                <p>Please log in to view your profile.</p>
                <button
                  className="ssp-submit-btn"
                  onClick={() => navigate('/login')}
                >
                  Login
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SelfServicePage;
