import { useState, useEffect, useCallback } from 'react';
import apiClient from '../services/apiClient';
import { notifySuccess, notifyError, notifyInfo } from '../utils/appToast';
import './MFATestPage.css';
import ApiCallDisplay from './ApiCallDisplay';

/**
 * Collapsible per-section API call display toggle (Phase 135)
 */
function SectionApiCalls() {
  const [open, setOpen] = useState(false);
  return (
    <div className="section-api-calls">
      <button
        type="button"
        className="section-api-toggle"
        onClick={() => setOpen(o => !o)}
      >
        {open ? '▾ Hide API Calls' : '▸ Show API Calls'}
      </button>
      {open && <ApiCallDisplay sessionId="mfa-test" />}
    </div>
  );
}


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

  // FIDO2 challenge + verify state
  const [fidoChallengeOptions, setFidoChallengeOptions] = useState(null);
  const [fidoVerifyStatus, setFidoVerifyStatus] = useState('pending');
  const [fidoVerifyError, setFidoVerifyError] = useState(null);

  // FIDO2 enrollment complete state
  const [fidoEnrollData, setFidoEnrollData] = useState(null);
  const [fidoEnrollCompleteStatus, setFidoEnrollCompleteStatus] = useState('pending');
  const [fidoEnrollCompleteError, setFidoEnrollCompleteError] = useState(null);

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

  // FIDO2 test functions
  const testFidoInitiate = useCallback(async () => {
    setFidoInitiateStatus('pending');
    setFidoInitiateError(null);
    setFidoChallengeOptions(null);
    try {
      const { data } = await apiClient.post('/api/mfa/test/integration/initiate', { method: 'fido2' });
      if (data.success) {
        setFidoDaId(data.daId);
        setFidoInitiateStatus('passed');
        notifySuccess('FIDO2 challenge initiated — polling for WebAuthn options…');
        // Poll for publicKeyCredentialRequestOptions from challenge status
        try {
          const statusResp = await apiClient.get(`/api/mfa/test/integration/challenge/${data.daId}/status`);
          if (statusResp.data.publicKeyCredentialRequestOptions) {
            setFidoChallengeOptions(statusResp.data.publicKeyCredentialRequestOptions);
          }
        } catch (_e) { /* non-fatal — options may not be ready yet */ }
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

  const testFidoVerify = useCallback(async () => {
    if (!fidoDaId || !fidoChallengeOptions) {
      notifyError('Initiate FIDO2 challenge first, then use your passkey');
      return;
    }
    setFidoVerifyStatus('pending');
    setFidoVerifyError(null);
    try {
      if (!navigator.credentials) throw new Error('WebAuthn not supported in this browser');
      const opts = {
        ...fidoChallengeOptions,
        challenge: Uint8Array.from(atob(fidoChallengeOptions.challenge), c => c.charCodeAt(0)),
      };
      const assertion = await navigator.credentials.get({ publicKey: opts });
      const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
      const assertionPayload = {
        id: assertion.id,
        rawId: toB64(assertion.rawId),
        type: assertion.type,
        response: {
          clientDataJSON: toB64(assertion.response.clientDataJSON),
          authenticatorData: toB64(assertion.response.authenticatorData),
          signature: toB64(assertion.response.signature),
          userHandle: assertion.response.userHandle ? toB64(assertion.response.userHandle) : null,
        },
      };
      const { data } = await apiClient.post('/api/mfa/test/integration/verify-fido2', {
        daId: fidoDaId,
        assertion: assertionPayload,
      });
      if (data.success) {
        setFidoVerifyStatus(data.completed ? 'passed' : 'pending');
        notifySuccess(data.completed ? 'FIDO2 verified ✓' : 'FIDO2 verification in progress');
      } else {
        setFidoVerifyStatus('failed');
        setFidoVerifyError(data.error);
        notifyError('FIDO2 verification failed: ' + data.error);
      }
    } catch (err) {
      setFidoVerifyStatus('failed');
      setFidoVerifyError(err.message);
      notifyError('FIDO2 verification error: ' + err.message);
    }
  }, [fidoDaId, fidoChallengeOptions]);

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
    setFidoEnrollData(null);
    try {
      const { data } = await apiClient.post('/api/mfa/test/integration/enroll-fido2-init');
      if (data.success) {
        setFidoEnrollData(data);
        setFidoEnrollInitStatus('passed');
        notifySuccess('FIDO2 enrollment initiated — click Complete Registration to register your device');
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

  const testFidoEnrollComplete = useCallback(async () => {
    if (!fidoEnrollData?.deviceId || !fidoEnrollData?.publicKeyCredentialCreationOptions) {
      notifyError('Initiate FIDO2 enrollment first');
      return;
    }
    setFidoEnrollCompleteStatus('pending');
    setFidoEnrollCompleteError(null);
    try {
      if (!navigator.credentials) throw new Error('WebAuthn not supported in this browser');
      const creationOpts = fidoEnrollData.publicKeyCredentialCreationOptions;
      const publicKey = {
        ...creationOpts,
        challenge: Uint8Array.from(atob(creationOpts.challenge), c => c.charCodeAt(0)),
        user: {
          ...creationOpts.user,
          id: Uint8Array.from(atob(creationOpts.user.id), c => c.charCodeAt(0)),
        },
      };
      const credential = await navigator.credentials.create({ publicKey });
      const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
      const attestation = {
        id: credential.id,
        rawId: toB64(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: toB64(credential.response.clientDataJSON),
          attestationObject: toB64(credential.response.attestationObject),
        },
      };
      const { data } = await apiClient.post('/api/mfa/test/integration/enroll-fido2-complete', {
        deviceId: fidoEnrollData.deviceId,
        attestation,
      });
      if (data.success) {
        setFidoEnrollCompleteStatus('passed');
        notifySuccess('FIDO2 device registered ✓');
        loadDevices();
      } else {
        setFidoEnrollCompleteStatus('failed');
        setFidoEnrollCompleteError(data.error);
        notifyError('FIDO2 registration failed: ' + data.error);
      }
    } catch (err) {
      setFidoEnrollCompleteStatus('failed');
      setFidoEnrollCompleteError(err.message);
      notifyError('FIDO2 registration error: ' + err.message);
    }
  }, [fidoEnrollData, loadDevices]);

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
        {/* Info banner when using auto-resolved default policy */}
        {config?.policySource === 'auto' && (
          <div className="mfa-test-info-banner" role="status">
            <strong>ℹ️ Using default MFA policy</strong>
            <p>
              <code>PINGONE_MFA_POLICY_ID</code> is not set — the server will automatically resolve
              the default MFA policy from your PingOne environment at runtime.
            </p>
            <p>
              To pin a specific policy: set <code>PINGONE_MFA_POLICY_ID=&lt;id&gt;</code> in your <code>.env</code>.
            </p>
          </div>
        )}

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
          <SectionApiCalls />
        </section>

        {/* SMS OTP Test Section */}
        <section className="mfa-test-section">
          <h2 className="mfa-test-section-title">SMS OTP Testing</h2>
          <WhatIsHappening
            title="SMS OTP — One-Time Password via text message"
            steps={[
              'POST /api/mfa/test/integration/initiate with method=sms → PingOne creates a device authorization (DA)',
              'PingOne sends a 6-digit OTP to the user\'s registered phone number',
              'User enters the OTP; POST /api/mfa/test/integration/verify-otp with the code + daId',
              'PingOne validates the OTP and marks the DA as COMPLETED',
              'The DA ID ties all steps together — it is the session reference for this MFA challenge',
            ]}
            apiFlow={[
              { method: 'POST', endpoint: '/api/mfa/test/integration/initiate', note: 'method=sms' },
              { method: 'POST', endpoint: '/api/mfa/test/integration/verify-otp', note: 'Submit 6-digit code' },
            ]}
          />
          <TestCard
            title="Initiate SMS OTP Challenge"
            status={smsInitiateStatus}
            error={smsInitiateError}
            onTest={testSmsInitiate}
          />
          {smsDaId && (
            <div className="otp-verify-section">
              <DaResponseCard daId={smsDaId} method="sms" />
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
          <SectionApiCalls />
        </section>

        {/* Email OTP Test Section */}
        <section className="mfa-test-section">
          <h2 className="mfa-test-section-title">Email OTP Testing</h2>
          <WhatIsHappening
            title="Email OTP — One-Time Password via email"
            steps={[
              'Identical flow to SMS but OTP is sent to the user\'s registered email address',
              'POST /api/mfa/test/integration/initiate with method=email → PingOne sends OTP email',
              'User retrieves OTP from email and submits via verify-otp endpoint',
            ]}
            apiFlow={[
              { method: 'POST', endpoint: '/api/mfa/test/integration/initiate', note: 'method=email' },
              { method: 'POST', endpoint: '/api/mfa/test/integration/verify-otp', note: 'Submit 6-digit code' },
            ]}
          />
          <TestCard
            title="Initiate Email OTP Challenge"
            status={emailInitiateStatus}
            error={emailInitiateError}
            onTest={testEmailInitiate}
          />
          {emailDaId && (
            <div className="otp-verify-section">
              <DaResponseCard daId={emailDaId} method="email" />
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
          <SectionApiCalls />
        </section>

        {/* FIDO2/Passkey Test Section */}
        <section className="mfa-test-section">
          <h2 className="mfa-test-section-title">FIDO2/Passkey Testing</h2>
          <WhatIsHappening
            title="FIDO2/WebAuthn — Passwordless passkey authentication"
            steps={[
              'POST /api/mfa/test/integration/initiate with method=fido2 → PingOne returns a DA ID',
              'GET /api/mfa/test/integration/challenge/:daId/status → returns publicKeyCredentialRequestOptions',
              'Browser calls navigator.credentials.get({ publicKey }) — OS/browser handles biometric/PIN prompt',
              'The authenticator signs the PingOne challenge with the private key stored on-device',
              'POST /api/mfa/test/integration/verify-fido2 with the signed assertion → PingOne validates signature',
              'No password is ever sent — the private key never leaves the device (FIDO2 security guarantee)',
            ]}
            apiFlow={[
              { method: 'POST', endpoint: '/api/mfa/test/integration/initiate', note: 'method=fido2' },
              { method: 'GET', endpoint: '/api/mfa/test/integration/challenge/:daId/status', note: 'Get WebAuthn options' },
              { method: 'POST', endpoint: '/api/mfa/test/integration/verify-fido2', note: 'Submit assertion' },
            ]}
          />
          <TestCard
            title="Initiate FIDO2 Challenge"
            status={fidoInitiateStatus}
            error={fidoInitiateError}
            onTest={testFidoInitiate}
          />
          {fidoDaId && (
            <div className="fido-verify-section">
              <DaResponseCard daId={fidoDaId} method="fido2" />
              <h3 className="fido-verify-title">Verify FIDO2 Passkey</h3>
              {fidoChallengeOptions ? (
                <>
                  <p className="info-text">WebAuthn options ready. Click below to authenticate with your passkey.</p>
                  <TestCard
                    title="Verify FIDO2 with Passkey"
                    status={fidoVerifyStatus}
                    error={fidoVerifyError}
                    onTest={testFidoVerify}
                  />
                </>
              ) : (
                <p className="info-text">Waiting for WebAuthn credential request options from PingOne…</p>
              )}
            </div>
          )}
          <SectionApiCalls />
        </section>

        {/* Device Enrollment Section */}
        <section className="mfa-test-section">
          <h2 className="mfa-test-section-title">Device Enrollment</h2>
          <WhatIsHappening
            title="Device Enrollment — Registering a New MFA Device"
            steps={[
              'Email enrollment: POST /api/mfa/test/integration/enroll-email → PingOne creates an EMAIL device record for the user',
              'FIDO2 enrollment (Step 1): POST /api/mfa/test/integration/enroll-fido2-init → PingOne returns publicKeyCredentialCreationOptions',
              'FIDO2 enrollment (Step 2): Browser calls navigator.credentials.create() using the challenge — private key stays in device secure enclave',
              'FIDO2 enrollment (Step 3): POST /api/mfa/test/integration/enroll-fido2-complete with attestation → PingOne stores the public key',
              'After enrollment, the device appears in Device Management and can be used for MFA challenges',
            ]}
            apiFlow={[
              { method: 'POST', endpoint: '/api/mfa/test/integration/enroll-email', note: 'Register email device' },
              { method: 'POST', endpoint: '/api/mfa/test/integration/enroll-fido2-init', note: 'Get WebAuthn creation options' },
              { method: 'POST', endpoint: '/api/mfa/test/integration/enroll-fido2-complete', note: 'Submit attestation' },
            ]}
          />
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
          {fidoEnrollData?.publicKeyCredentialCreationOptions && (
            <TestCard
              title="Complete FIDO2 Registration"
              status={fidoEnrollCompleteStatus}
              error={fidoEnrollCompleteError}
              onTest={testFidoEnrollComplete}
            />
          )}
          <SectionApiCalls />
        </section>

        {/* Device Management Section */}
        <section className="mfa-test-section">
          <h2 className="mfa-test-section-title">Device Management</h2>
          <WhatIsHappening
            title="Device Management — Listing Enrolled MFA Devices"
            steps={[
              'GET /api/mfa/test/devices → BFF calls PingOne Management API to list all MFA devices for the authenticated user',
              'Each device has: type (SMS, EMAIL, FIDO2_BIOMETRICS), nickname/email, status (ACTIVE, INACTIVE), and enrolledAt date',
              'Devices are the registered MFA factors — each one can be used to satisfy an MFA challenge',
              'Admins can disable or delete devices via PingOne console or Management API',
            ]}
            apiFlow={[
              { method: 'GET', endpoint: '/api/mfa/test/devices', note: 'List enrolled MFA devices' },
              { method: 'GET', endpoint: '/v1/environments/{envId}/users/{userId}/devices', note: 'PingOne Management API' },
            ]}
          />
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
                    <span className="device-nickname">{device.nickname || device.email || '—'}</span>
                    <span className={`device-status device-status--${(device.status || 'unknown').toLowerCase()}`}>
                      {device.status || 'UNKNOWN'}
                    </span>
                    <span className="device-meta">ID: {device.id?.substring(0, 12)}…</span>
                    {device.createdAt && <span className="device-meta">Enrolled: {new Date(device.createdAt).toLocaleDateString()}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <SectionApiCalls />
        </section>
      </div>
    </div>
  );
}

function WhatIsHappening({ title, steps, apiFlow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="what-is-happening">
      <button type="button" className="wih-toggle" onClick={() => setOpen(o => !o)}>
        <span className="wih-icon">{open ? '▼' : '▶'}</span>
        <span className="wih-label">ℹ️ {title || 'What is happening here?'}</span>
      </button>
      {open && (
        <div className="wih-body">
          {steps && (
            <ol className="wih-steps">
              {steps.map((s, i) => <li key={i} className="wih-step">{s}</li>)}
            </ol>
          )}
          {apiFlow && (
            <div className="wih-api">
              <div className="wih-api-title">API Calls Involved</div>
              {apiFlow.map((a, i) => (
                <div key={i} className="wih-api-row">
                  <span className={`wih-method wih-method--${a.method?.toLowerCase()}`}>{a.method}</span>
                  <code className="wih-endpoint">{a.endpoint}</code>
                  {a.note && <span className="wih-note">{a.note}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DaResponseCard({ daId, method }) {
  const METHOD_LABELS = { sms: 'SMS OTP', email: 'Email OTP', fido2: 'FIDO2/Passkey' };
  return (
    <div className="da-response-card">
      <div className="da-response-card-title">Challenge Initiated — {METHOD_LABELS[method] || method}</div>
      <div className="da-response-card-row">
        <span className="da-label">DA ID</span>
        <code className="da-value">{daId}</code>
        <span className="da-desc">Device Authorization ID — reference for this MFA challenge session</span>
      </div>
      <div className="da-response-card-row">
        <span className="da-label">Status</span>
        <span className="da-value da-value--pending">PENDING</span>
        <span className="da-desc">PENDING = OTP sent. COMPLETED = user verified. EXPIRED = time window passed.</span>
      </div>
      <div className="da-response-card-row">
        <span className="da-label">Method</span>
        <span className="da-value">{METHOD_LABELS[method] || method}</span>
        <span className="da-desc">MFA method PingOne is expecting the user to satisfy</span>
      </div>
    </div>
  );
}

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
