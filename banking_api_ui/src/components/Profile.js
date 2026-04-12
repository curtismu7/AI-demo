// banking_api_ui/src/components/Profile.js
import React, { useState } from 'react';
import { toast } from 'react-toastify';
import './Profile.css';

export default function Profile({ user, onLogout }) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: user?.phone || '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // In a real implementation, this would call an API to update the user profile
    toast.success('Profile updated successfully!');
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFormData({
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      email: user?.email || '',
      phone: user?.phone || '',
    });
    setIsEditing(false);
  };

  return (
    <div className="profile-container">
      <div className="profile-header">
        <h2>Profile Settings</h2>
        <p>Manage your personal information and preferences</p>
      </div>

      <div className="profile-card">
        <div className="profile-avatar">
          <div className="avatar-circle">
            {(user?.firstName?.[0] || '?').toUpperCase()}
          </div>
        </div>

        <div className="profile-content">
          {isEditing ? (
            <form onSubmit={handleSubmit} className="profile-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="firstName">First Name</label>
                  <input
                    type="text"
                    id="firstName"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="lastName">Last Name</label>
                  <input
                    type="text"
                    id="lastName"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="phone">Phone Number</label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="(555) 123-4567"
                />
              </div>

              <div className="form-actions">
                <button type="button" onClick={handleCancel} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          ) : (
            <div className="profile-display">
              <div className="profile-info">
                <div className="info-row">
                  <span className="info-label">Name:</span>
                  <span className="info-value">
                    {user?.firstName} {user?.lastName}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Email:</span>
                  <span className="info-value">{user?.email}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Phone:</span>
                  <span className="info-value">{user?.phone || 'Not provided'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Role:</span>
                  <span className="info-value">
                    {user?.role === 'admin' ? '👑 Administrator' : '👤 Customer'}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Account Status:</span>
                  <span className="info-value status-active">✅ Active</span>
                </div>
              </div>

              <div className="profile-actions">
                <button 
                  onClick={() => setIsEditing(true)} 
                  className="btn btn-primary"
                >
                  Edit Profile
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="profile-sections">
        <div className="profile-section">
          <h3>Security Settings</h3>
          <p>Manage your password, two-factor authentication, and security preferences.</p>
          <button className="btn btn-outline">Manage Security</button>
        </div>

        <div className="profile-section">
          <h3>Notification Preferences</h3>
          <p>Control how you receive alerts and updates about your account.</p>
          <button className="btn btn-outline">Manage Notifications</button>
        </div>

        <div className="profile-section">
          <h3>Privacy Settings</h3>
          <p>Manage your data privacy and sharing preferences.</p>
          <button className="btn btn-outline">Manage Privacy</button>
        </div>
      </div>

      <style jsx>{`
        .profile-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem;
        }

        .profile-header {
          margin-bottom: 2rem;
        }

        .profile-header h2 {
          margin: 0 0 0.5rem 0;
          color: #333;
        }

        .profile-header p {
          margin: 0;
          color: #666;
        }

        .profile-card {
          display: flex;
          gap: 2rem;
          background: white;
          border-radius: 8px;
          padding: 2rem;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          margin-bottom: 2rem;
        }

        .profile-avatar {
          flex-shrink: 0;
        }

        .avatar-circle {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: #4f46e5;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
          font-weight: bold;
        }

        .profile-content {
          flex: 1;
        }

        .profile-form .form-row {
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .form-group {
          flex: 1;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: #333;
        }

        .form-group input {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 1rem;
        }

        .form-group input:focus {
          outline: none;
          border-color: #4f46e5;
          box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
        }

        .form-actions {
          display: flex;
          gap: 1rem;
          margin-top: 1.5rem;
        }

        .profile-display {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .profile-info {
          flex: 1;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 0;
          border-bottom: 1px solid #f0f0f0;
        }

        .info-row:last-child {
          border-bottom: none;
        }

        .info-label {
          font-weight: 500;
          color: #666;
        }

        .info-value {
          color: #333;
        }

        .status-active {
          color: #10b981;
          font-weight: 500;
        }

        .profile-actions {
          flex-shrink: 0;
        }

        .profile-sections {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .profile-section {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .profile-section h3 {
          margin: 0 0 0.5rem 0;
          color: #333;
        }

        .profile-section p {
          margin: 0 0 1rem 0;
          color: #666;
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

        .btn-secondary {
          background: #6b7280;
          color: white;
        }

        .btn-secondary:hover {
          background: #4b5563;
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

        @media (max-width: 768px) {
          .profile-container {
            padding: 1rem;
          }

          .profile-card {
            flex-direction: column;
            text-align: center;
            gap: 1.5rem;
          }

          .profile-display {
            flex-direction: column;
            gap: 1rem;
          }

          .form-row {
            flex-direction: column;
          }

          .info-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.25rem;
          }
        }
      `}</style>
    </div>
  );
}
