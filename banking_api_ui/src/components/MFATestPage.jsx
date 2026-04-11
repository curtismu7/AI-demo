import { useState, useEffect, useCallback } from 'react';
import apiClient from '../services/apiClient';
import { notifySuccess, notifyError, notifyInfo } from '../utils/appToast';
import './MFATestPage.css';

/**
 * MFATestPage — comprehensive test page for PingOne MFA functionality
 * Tests: SMS OTP, Email OTP, FIDO2/passkey, Device enrollment, Device management
 * Chase.com-style UI with test cards and fix buttons
 */
export default function MFATestPage() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // SMS OTP test state
  const [smsInitiateStatus, setSmsInitiateStatus] = useState('pending');
  const [smsInitiateError, setSmsInitiateError] = useState(null);
  const [smsDaId, setSmsDaId] = useState(null);
  const [smsDevices, setSmsDevices] = useState([]);
  const [smsOtp, setSmsOtp] = useState('');
  const [smsVerifyStatus, setSmsVerifyStatus] = useState('pending');
  const [smsVerifyError, setSmsVerifyError] = useState(null);

  // Email OTP test state
  const [emailInitiateStatus, setEmailInitiateStatus] = useState('pending');
  const [emailInitiateError, setEmailInitiateError] = useState(null);
  const [emailDaId, setEmailDaId] = useState(null);
  const [emailDevices, setEmailDevices] = useState([]);
  const [emailOtp, setEmailOtp] = useState('');
  const [emailVerifyStatus, setEmailVerifyStatus] = useState('pending');
  const [emailVerifyError, setEmailVerifyError] = useState(null);

  // FIDO2 test state (Task 5 - WebAuthn API integration placeholder)
  const [fidoInitiateStatus, setFidoInitiateStatus] = useState('pending');
  const [fidoInitiateError, setFidoInitiateError] = useState(null);
  const [fidoDaId, setFidoDaId] = useState(null);

  // Device management state
  const [devices, setDevices] = useState([]);
  const [devicesStatus, setDevicesStatus] = useState('pending');
  const [devicesError, setDevicesError] = useState(null);

  // Enrollment state
  const [enrollEmailStatus, setEnrollEmailStatus] = useState('pending');
  const [enrollEmailError, setEnrollEmailError] = useState(null);
  const [fidoEnrollInitStatus, setFidoEnrollInitStatus] = useState('pending');
  const [fidoEnrollInitError, setFidoEnrollInitError] = useState(null);

  const loadConfig = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/api/mfa/test/config');
      if (data.success !== false) {
        setConfig(data);
        setLoading(false);
      } else {
        setError('Failed to load config: ' + data.error);
        setLoading(false);
      }
    } catch (err) {
      console.error('Config error:', err);
      setError('Failed to load config: ' + err.message);
      setLoading(false);
    }
  }, []);

  const loadDevices = useCallback(async () => {
    try {
      setDevicesStatus('pending');
      setDevicesError(null);
      const { data } = await apiClient.get('/api/mfa/test/integration/devices');
      if (data.success) {
        setDevices(data.devices || []);
        setDevicesStatus('passed');
      } else {
        setDevicesStatus('failed');
        setDevicesError(data.error);
      }
    } catch (err) {
      console.error('Devices error:', err);
      setDevicesStatus('failed');
      setDevicesError(err.message);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // SMS OTP test functions
  const testSmsInitiate = useCallback(async () => {
    setSmsInitiateStatus('pending');
    setSmsInitiateError(null);
    try {
      const { data } = await apiClient.post('/api/mfa/test/integration/initiate', { method: 'sms' });
      if (data.success) {
        setSmsDaId(data.daId);
        setSmsDevices(data.devices || []);
        setSmsInitiateStatus('passed');
        notifySuccess('SMS OTP challenge initiated successfully');
      } else {
        setSmsInitiateStatus('failed');
        setSmsInitiateError(data.error);
        notifyError('SMS OTP initiation failed: ' + data.error);
      }
    } catch (err) {
      setSmsInitiateStatus('failed');
      setSmsInitiateError(err.message);
      notifyError('SMS OTP initiation failed: ' + err.message);
    }
  }, []);

  const testSmsVerify = useCallback(async () => {
    if (!smsDaId || !smsOtp || smsDevices.length === 0) {
      notifyError('Please initiate SMS challenge and enter OTP code');
      return;
    }
    setSmsVerifyStatus('pending');
    setSmsVerifyError(null);
    try {
      const { data } = await apiClient.post('/api/mfa/test/integration/verify-otp', {
        daId: smsDaId,
        deviceId: smsDevices[0].id,
        otp: smsOtp
      });
      if (data.success) {
        setSmsVerifyStatus(data.completed ? 'passed' : 'pending');
        if (data.completed) {
          notifySuccess('SMS OTP verified successfully');
        } else {
          notifyInfo('SMS OTP verification in progress');
        }
      } else {
        setSmsVerifyStatus('failed');
        setSmsVerifyError(data.error);
        notifyError('SMS OTP verification failed: ' + data.error);
      }
    } catch (err) {
      setSmsVerifyStatus('failed');
      setSmsVerifyError(err.message);
      notifyError('SMS OTP verification failed: ' + err.message);
    }
  }, [smsDaId, smsDevices, smsOtp]);

  // Email OTP test functions
  const testEmailInitiate = useCallback(async () => {
    setEmailInitiateStatus('pending');
    setEmailInitiateError(null);
    try {
      const { data } = await apiClient.post('/api/mfa/test/integration/initiate', { method: 'email' });
      if (data.success) {
        setEmailDaId(data.daId);
        setEmailDevices(data.devices || []);
        setEmailInitiateStatus('passed');
        notifySuccess('Email OTP challenge initiated successfully');
      } else {
        setEmailInitiateStatus('failed');
        setEmailInitiateError(data.error);
        notifyError('Email OTP initiation failed: ' + data.error);
      }
    } catch (err) {
      setEmailInitiateStatus('failed');
      setEmailInitiateError(err.message);
      notifyError('Email OTP initiation failed: ' + err.message);
    }
  }, []);

  const testEmailVerify = useCallback(async () => {
    if (!emailDaId || !emailOtp || emailDevices.length === 0) {
      notifyError('Please initiate Email challenge and enter OTP code');
      return;
    }
    setEmailVerifyStatus('pending');
    setEmailVerifyError(null);
    try {
      const { data } = await apiClient.post('/api/mfa/test/integration/verify-otp', {
        daId: emailDaId,
        deviceId: emailDevices[0].id,
        otp: emailOtp
      });
      if (data.success) {
        setEmailVerifyStatus(data.completed ? 'passed' : 'pending');
        if (data.completed) {
          notifySuccess('Email OTP verified successfully');
        } else {
          notifyInfo('Email OTP verification in progress');
        }
      } else {
        setEmailVerifyStatus('failed');
        setEmailVerifyError(data.error);
        notifyError('Email OTP verification failed: ' + data.error);
      }
    } catch (err) {
      setEmailVerifyStatus('failed');
      setEmailVerifyError(err.message);
      notifyError('Email OTP verification failed: ' + err.message);
    }
  }, [emailDaId, emailDevices, emailOtp]);

  // FIDO2 test functions (Task 5 - WebAuthn API integration placeholder)
  const testFidoInitiate = useCallback(async () => {
    setFidoInitiateStatus('pending');
    setFidoInitiateError(null);
    try {
      const { data } = await apiClient.post('/api/mfa/test/integration/initiate', { method: 'fido2' });
      if (data.success) {
        setFidoDaId(data.daId);
        setFidoInitiateStatus('passed');
        notifySuccess('FIDO2 challenge initiated successfully');
      } else {
        setFidoInitiateStatus('failed');
        setFidoInitiateError(data.error);
        notifyError('FIDO2 initiation failed: ' + data.error);
      }
    } catch (err) {
      setFidoInitiateStatus('failed');
      setFidoInitiateError(err.message);
      notifyError('FIDO2 initiation failed: ' + err.message);
    }
  }, []);

  // Device enrollment functions
  const testEnrollEmail = useCallback(async () => {
    setEnrollEmailStatus('pending');
    setEnrollEmailError(null);
    try {
      const { data } = await apiClient.post('/api/mfa/test/integration/enroll-email');
      if (data.success) {
        setEnrollEmailStatus('passed');
        notifySuccess('Email device enrolled successfully');
        loadDevices(); // Refresh device list
      } else {
        setEnrollEmailStatus('failed');
        setEnrollEmailError(data.error);
        notifyError('Email enrollment failed: ' + data.error);
      }
    } catch (err) {
      setEnrollEmailStatus('failed');
      setEnrollEmailError(err.message);
      notifyError('Email enrollment failed: ' + err.message);
    }
  }, [loadDevices]);

  const testFidoEnrollInit = useCallback(async () => {
    setFidoEnrollInitStatus('pending');
    setFidoEnrollInitError(null);
    try {
      const { data } = await apiClient.post('/api/mfa/test/integration/enroll-fido2-init');
      if (data.success) {
        setFidoEnrollInitStatus('passed');
        notifySuccess('FIDO2 enrollment initiated');
      } else {
        setFidoEnrollInitStatus('failed');
        setFidoEnrollInitError(data.error);
        notifyError('FIDO2 enrollment initiation failed: ' + data.error);
      }
    } catch (err) {
      setFidoEnrollInitStatus('failed');
      setFidoEnrollInitError(err.message);
      notifyError('FIDO2 enrollment initiation failed: ' + err.message);
    }
  }, []);

  if (loading) {
    return (
      <div className="mfa-test-page">
        <div className="mfa-test-loading">
          <div className="spinner" />
          <p>Loading MFA test environment...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mfa-test-page">
        <div className="mfa-test-error">
          <p className="error-message">⚠️ {error}</p>
          <button type="button" className="mfa-test-button mfa-test-button--primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mfa-test-page">
      <div className="mfa-test-header">
        <h1 className="mfa-test-title">PingOne MFA Test Page</h1>
        <div className="mfa-test-meta">
          <div className="mfa-test-status">
            <span className={`status-indicator ${config?.mfaEnabled ? 'status-indicator--success' : 'status-indicator--error'}`}>
              {config?.mfaEnabled ? 'MFA Enabled' : 'MFA Disabled'}
            </span>
          </div>
          <button
            type="button"
            className="mfa-test-button mfa-test-button--secondary"
            onClick={loadDevices}
          >
            Refresh Devices
          </button>
        </div>
      </div>

      <div className="mfa-test-content">
        {/* Configuration Section */}
        <section className="mfa-test-section">
          <h2 className="mfa-test-section-title">MFA Configuration</h2>
          <div className="config-display">
            <div className="config-item">
              <span className="config-label">Policy ID:</span>
              <span className="config-value">{config?.policyId || 'Not configured'}</span>
            </div>
            <div className="config-item">
              <span className="config-label">ACR Value:</span>
              <span className="config-value">{config?.acrValue || 'Not configured'}</span>
            </div>
            <div className="config-item">
              <span className="config-label">Threshold:</span>
              <span className="config-value">${config?.threshold?.toFixed(2) || '500.00'}</span>
            </div>
          </div>
        </section>

        {/* SMS OTP Test Section */}
        <section className="mfa-test-section">
          <h2 className="mfa-test-section-title">SMS OTP Testing</h2>
          <TestCard
            title="Initiate SMS OTP Challenge"
            status={smsInitiateStatus}
            error={smsInitiateError}
            onTest={testSmsInitiate}
          />
          {smsDaId && (
            <div className="otp-verify-section">
              <h3 className="otp-verify-title">Verify SMS OTP</h3>
              <div className="otp-input-group">
                <input
                  type="text"
                  className="otp-input"
                  placeholder="Enter 6-digit OTP code"
                  value={smsOtp}
                  onChange={(e) => setSmsOtp(e.target.value)}
                  maxLength={6}
                />
                <button
                  type="button"
                  className="mfa-test-button mfa-test-button--primary"
                  onClick={testSmsVerify}
                  disabled={!smsOtp || smsOtp.length !== 6}
                >
                  Verify OTP
                </button>
              </div>
              <TestCard
                title="Verify SMS OTP"
                status={smsVerifyStatus}
                error={smsVerifyError}
              />
            </div>
          )}
        </section>

        {/* Email OTP Test Section */}
        <section className="mfa-test-section">
          <h2 className="mfa-test-section-title">Email OTP Testing</h2>
          <TestCard
            title="Initiate Email OTP Challenge"
            status={emailInitiateStatus}
            error={emailInitiateError}
            onTest={testEmailInitiate}
          />
          {emailDaId && (
            <div className="otp-verify-section">
              <h3 className="otp-verify-title">Verify Email OTP</h3>
              <div className="otp-input-group">
                <input
                  type="text"
                  className="otp-input"
                  placeholder="Enter 6-digit OTP code"
                  value={emailOtp}
                  onChange={(e) => setEmailOtp(e.target.value)}
                  maxLength={6}
                />
                <button
                  type="button"
                  className="mfa-test-button mfa-test-button--primary"
                  onClick={testEmailVerify}
                  disabled={!emailOtp || emailOtp.length !== 6}
                >
                  Verify OTP
                </button>
              </div>
              <TestCard
                title="Verify Email OTP"
                status={emailVerifyStatus}
                error={emailVerifyError}
              />
            </div>
          )}
        </section>

        {/* FIDO2 Test Section - Task 5 (WebAuthn API integration placeholder) */}
        <section className="mfa-test-section">
          <h2 className="mfa-test-section-title">FIDO2/Passkey Testing</h2>
          <TestCard
            title="Initiate FIDO2 Challenge"
            status={fidoInitiateStatus}
            error={fidoInitiateError}
            onTest={testFidoInitiate}
          />
          {fidoDaId && (
            <div className="fido-verify-section">
              <h3 className="fido-verify-title">Verify FIDO2</h3>
              <p className="info-text">FIDO2 verification requires WebAuthn API integration</p>
            </div>
          )}
        </section>

        {/* Device Enrollment Section */}
        <section className="mfa-test-section">
          <h2 className="mfa-test-section-title">Device Enrollment</h2>
          <TestCard
            title="Enroll Email Device"
            status={enrollEmailStatus}
            error={enrollEmailError}
            onTest={testEnrollEmail}
          />
          <TestCard
            title="Initiate FIDO2 Enrollment"
            status={fidoEnrollInitStatus}
            error={fidoEnrollInitError}
            onTest={testFidoEnrollInit}
          />
          <p className="info-text">FIDO2 enrollment completion will be implemented in Task 5</p>
        </section>

        {/* Device Management Section */}
        <section className="mfa-test-section">
          <h2 className="mfa-test-section-title">Device Management</h2>
          <TestCard
            title="List Devices"
            status={devicesStatus}
            error={devicesError}
            onTest={loadDevices}
          />
          {devices.length > 0 && (
            <div className="devices-list">
              <h3 className="devices-list-title">Enrolled Devices</h3>
              <ul className="devices-items">
                {devices.map((device) => (
                  <li key={device.id} className="device-item">
                    <span className="device-type">{device.type}</span>
                    <span className="device-id">{device.id}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// Test Card Component
function TestCard({ title, status, error, onTest }) {
  return (
    <div className={`test-card test-card--${status}`}>
      <div className="test-card-header">
        <h4 className="test-card-title">{title}</h4>
        <span className={`status-badge status-badge--${status}`}>
          {status === 'passed' && '✓ Pass'}
          {status === 'failed' && '✗ Fail'}
          {status === 'pending' && '○ Pending'}
          {status === 'running' && '⟳ Running'}
        </span>
      </div>
      {error && <p className="test-card-error">{error}</p>}
      {onTest && (
        <button
          type="button"
          className="mfa-test-button mfa-test-button--test"
          onClick={onTest}
          disabled={status === 'running'}
        >
          {status === 'running' ? 'Running...' : 'Test'}
        </button>
      )}
    </div>
  );
}
