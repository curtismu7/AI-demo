import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import bffAxios from '../services/bffAxios';
import './Profile.css';

function DeviceIcon({ type }) {
  const t = (type || '').toUpperCase();
  if (t === 'EMAIL') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <title>Email device</title>
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    );
  }
  if (t === 'TOTP') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <title>Authenticator app device</title>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12,6 12,12 16,14" />
      </svg>
    );
  }
  if (t === 'FIDO2') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <title>Security key device</title>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <title>Mobile device</title>
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}

export default function Profile({ user }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: user?.phone || '',
  });

  const [devices, setDevices] = useState([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const res = await bffAxios.get('/api/auth/mfa/devices');
      setDevices(res.data.devices || []);
    } catch {
      setDevices([]);
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await bffAxios.patch('/api/self-service/users/me', formData);
      toast.success('Profile updated successfully');
      setIsEditing(false);
    } catch (err) {
      toast.error(err.response?.data?.error_description || err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
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

  const handleRemoveDevice = async (deviceId) => {
    setRemovingId(deviceId);
    try {
      await bffAxios.delete(`/api/auth/mfa/devices/${deviceId}`);
      toast.success('Device removed');
      setDevices(prev => prev.filter(d => d.id !== deviceId));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove device');
    } finally {
      setRemovingId(null);
    }
  };

  const accountStatus = user?.enabled === false ? 'DISABLED' : 'ACCOUNT OK';
  const mfaEnabled = devices.length > 0 ? 'Yes' : 'No';

  return (
    <div className="up-page">
      <div className="up-heading">
        <h1>User Portal</h1>
        <p>Manage your profile and multi-factor authentication devices.</p>
      </div>

      {/* Profile Information */}
      <div className="up-card">
        <div className="up-card__header">
          <span className="up-card__title">Profile Information</span>
          {!isEditing && (
            <button type="button" className="up-btn up-btn--edit" onClick={() => setIsEditing(true)}>
              Edit Profile
            </button>
          )}
        </div>

        {isEditing ? (
          <form onSubmit={handleSubmit} className="up-form">
            <div className="up-form__row">
              <div className="up-form__field">
                <label htmlFor="firstName">FIRST NAME</label>
                <input id="firstName" name="firstName" value={formData.firstName} onChange={handleChange} required />
              </div>
              <div className="up-form__field">
                <label htmlFor="lastName">LAST NAME</label>
                <input id="lastName" name="lastName" value={formData.lastName} onChange={handleChange} required />
              </div>
              <div className="up-form__field">
                <label htmlFor="email">EMAIL</label>
                <input id="email" type="email" name="email" value={formData.email} onChange={handleChange} required />
              </div>
            </div>
            <div className="up-form__row">
              <div className="up-form__field">
                <label htmlFor="phone">PHONE</label>
                <input id="phone" type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="—" />
              </div>
            </div>
            <div className="up-form__actions">
              <button type="button" className="up-btn up-btn--secondary" onClick={handleCancel}>Cancel</button>
              <button type="submit" className="up-btn up-btn--edit" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        ) : (
          <div className="up-fields">
            <div className="up-field">
              <span className="up-field__label">FIRST NAME</span>
              <span className="up-field__value">{user?.firstName || '—'}</span>
            </div>
            <div className="up-field">
              <span className="up-field__label">LAST NAME</span>
              <span className="up-field__value">{user?.lastName || '—'}</span>
            </div>
            <div className="up-field">
              <span className="up-field__label">EMAIL</span>
              <span className="up-field__value">{user?.email || '—'}</span>
            </div>
            <div className="up-field">
              <span className="up-field__label">USERNAME</span>
              <span className="up-field__value">{user?.username || '—'}</span>
            </div>
            <div className="up-field">
              <span className="up-field__label">PHONE</span>
              <span className="up-field__value">{user?.phone || '—'}</span>
            </div>
            <div className="up-field">
              <span className="up-field__label">ACCOUNT STATUS</span>
              <span className={`up-field__value up-field__value--status${accountStatus === 'ACCOUNT OK' ? ' ok' : ' disabled'}`}>
                {accountStatus}
              </span>
            </div>
            <div className="up-field">
              <span className="up-field__label">MFA ENABLED</span>
              <span className={`up-field__value up-field__value--status${mfaEnabled === 'Yes' ? ' ok' : ''}`}>
                {devicesLoading ? '…' : mfaEnabled}
              </span>
            </div>
            <div className="up-field up-field--wide">
              <span className="up-field__label">USER ID</span>
              <span className="up-field__value up-field__value--mono">{user?.oauthId || user?.id || '—'}</span>
            </div>
          </div>
        )}
      </div>

      {/* MFA Devices */}
      <div className="up-card">
        <div className="up-card__header">
          <span className="up-card__title">MFA Devices</span>
        </div>

        <div className="up-mfa-layout">
          <div className="up-device-list">
            <span className="up-device-list__label">Your Devices</span>

            {devicesLoading && (
              <div className="up-device-empty">Loading devices…</div>
            )}
            {!devicesLoading && devices.length === 0 && (
              <div className="up-device-empty">No MFA devices enrolled.</div>
            )}
            {!devicesLoading && devices.map(device => (
              <div key={device.id} className="up-device">
                <div className="up-device__icon">
                  <DeviceIcon type={device.type} />
                </div>
                <div className="up-device__info">
                  <span className="up-device__name">{device.type}</span>
                  <span className="up-device__sub">
                    {device.type}{device.maskedContact ? ` • ${device.maskedContact}` : ''}
                  </span>
                </div>
                <span className="up-device__badge">
                  ✅ Verified
                </span>
                <button
                  type="button"
                  className="up-btn up-btn--remove"
                  onClick={() => handleRemoveDevice(device.id)}
                  disabled={removingId === device.id}
                >
                  {removingId === device.id ? '…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>

          <div className="up-manage-panel">
            <span className="up-manage-panel__label">Manage Devices</span>
            <p className="up-manage-panel__desc">Add a new MFA device to your account</p>
            <button type="button" className="up-btn up-btn--add" onClick={() => toast.info('Device enrollment coming soon')}>
              + Add New Device
            </button>
            <button type="button" className="up-btn up-btn--refresh" onClick={loadDevices} disabled={devicesLoading}>
              ↻ Refresh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
