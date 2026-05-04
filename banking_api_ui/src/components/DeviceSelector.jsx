import React from 'react';
import './DeviceSelector.css';

/**
 * Reusable device selection component for MFA verification flows.
 * Used by TransactionConsentModal, MFATestPage, and other components.
 */
export default function DeviceSelector({
  devices = [],
  selectedDeviceId = null,
  onSelectDevice = () => {},
  onBack = () => {},
  disabled = false,
  title = 'Select how you\'d like to verify this transaction:',
}) {
  const getDeviceLabel = (device) => {
    switch (device.type) {
      case 'FIDO2':
        return 'Security Key (FIDO2)';
      case 'OTP':
        return 'One-Time Code';
      case 'SMS':
        return 'SMS Text Message';
      case 'EMAIL':
        return 'Email Code';
      case 'TOTP':
        return 'Authenticator App';
      case 'BROWSER':
        return 'Remember This Browser';
      default:
        return `${device.type} (${device.id.slice(0, 8)})`;
    }
  };

  return (
    <div className="device-selector">
      <p className="device-selector__title">{title}</p>
      <div className="device-selector__list">
        {devices.map((device) => (
          <button
            key={device.id}
            type="button"
            className={`device-selector__btn device-selector__btn--${device.type.toLowerCase()}${selectedDeviceId === device.id ? ' device-selector__btn--selected' : ''}`}
            onClick={() => onSelectDevice(device.id)}
            disabled={disabled}
          >
            <span className="device-selector__label">
              {getDeviceLabel(device)}
            </span>
            {device.phone && (
              <span className="device-selector__detail">{device.phone}</span>
            )}
            {device.email && (
              <span className="device-selector__detail">{device.email}</span>
            )}
            {device.nickname && (
              <span className="device-selector__detail">{device.nickname}</span>
            )}
          </button>
        ))}
      </div>
      {onBack && (
        <button
          type="button"
          className="device-selector__back-btn"
          onClick={onBack}
          disabled={disabled}
        >
          ← Back
        </button>
      )}
    </div>
  );
}
