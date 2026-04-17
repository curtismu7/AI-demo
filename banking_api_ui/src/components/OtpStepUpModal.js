import React, { useState, useRef, useEffect } from 'react';

/**
 * OtpStepUpModal — MFA OTP collection modal for HITL step-up challenges
 *
 * Modes:
 *   - "stub" (default): Simple OTP input -> onSubmit(otp) — original behavior
 *   - "p1mfa": PingOne MFA multi-step flow (device picker -> OTP/push/FIDO -> complete)
 */
export default function OtpStepUpModal({
  show, onSubmit, onCancel, contextLine = '',
  allowFido, onSwitchToFido,
  mode = 'stub',
  daId, devices = [], onP1MfaComplete, onP1MfaError,
}) {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // P1MFA state machine
  const [p1Step, setP1Step] = useState('pick-device');
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [p1Error, setP1Error] = useState('');
  const pollRef = useRef(null);

  const apiBase = process.env.REACT_APP_API_URL || '';

  // Auto-focus input when modal shows (stub mode)
  useEffect(() => {
    if (show && mode === 'stub' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [show, mode]);

  // Reset P1MFA state when modal opens
  useEffect(() => {
    if (show && mode === 'p1mfa') {
      setP1Step(devices.length > 0 ? 'pick-device' : 'error');
      setSelectedDeviceId(null);
      setP1Error(devices.length > 0 ? '' : 'No enrolled MFA devices found.');
      setOtp('');
    }
  }, [show, mode, devices.length]);

  // Cleanup push polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Stub mode handlers

  const handleSubmit = () => {
    if (!otp.trim()) {
      setError('Enter the 6-digit code');
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter 6 digits only');
      return;
    }
    onSubmit(otp);
    setOtp('');
    setError('');
  };

  const handleCancel = () => {
    setOtp('');
    setError('');
    if (pollRef.current) clearInterval(pollRef.current);
    onCancel();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (mode === 'stub') handleSubmit();
      else if (mode === 'p1mfa' && p1Step === 'otp') handleP1OtpSubmit();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  // P1MFA handlers

  const handleSelectDevice = async (device) => {
    setSelectedDeviceId(device.id);
    setP1Error('');
    try {
      const resp = await fetch(`${apiBase}/api/auth/mfa/challenge/${daId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: device.id }),
      });
      if (resp.status === 410) {
        setP1Step('error');
        setP1Error('MFA session expired \u2014 please try again');
        return;
      }
      if (!resp.ok) throw new Error(`Device selection failed: ${resp.status}`);
      const data = await resp.json();

      if (data.status === 'COMPLETED' && data.completed) {
        onP1MfaComplete?.();
        return;
      }

      switch (data.status) {
        case 'OTP_REQUIRED':
          setP1Step('otp');
          break;
        case 'PUSH_CONFIRMATION_REQUIRED':
          setP1Step('push');
          startPushPolling();
          break;
        case 'ASSERTION_REQUIRED':
          setP1Step('fido');
          handleFidoAssertion(data);
          break;
        default:
          setP1Step('error');
          setP1Error(`Unexpected MFA status: ${data.status}`);
      }
    } catch (err) {
      console.error('[OtpStepUpModal] Device selection error:', err);
      setP1Step('error');
      setP1Error('Failed to select device. Please try again.');
    }
  };

  const handleP1OtpSubmit = async () => {
    if (!otp.trim()) {
      setError('Enter the 6-digit code');
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter 6 digits only');
      return;
    }
    setError('');
    try {
      const resp = await fetch(`${apiBase}/api/auth/mfa/challenge/${daId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: selectedDeviceId, otp }),
      });
      if (resp.status === 410) {
        setP1Step('error');
        setP1Error('MFA session expired \u2014 please try again');
        return;
      }
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        setError(errData.message || 'Incorrect code. Please try again.');
        return;
      }
      const data = await resp.json();
      if (data.completed) {
        setOtp('');
        onP1MfaComplete?.();
      } else {
        setError('Verification not complete. Please try again.');
      }
    } catch (err) {
      console.error('[OtpStepUpModal] P1MFA OTP submit error:', err);
      setError('Verification failed. Please try again.');
    }
  };

  const startPushPolling = () => {
    let elapsed = 0;
    pollRef.current = setInterval(async () => {
      elapsed += 3000;
      if (elapsed >= 60000) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setP1Step('error');
        setP1Error('Push notification timed out. Try another method.');
        return;
      }
      try {
        const resp = await fetch(`${apiBase}/api/auth/mfa/challenge/${daId}/status`, {
          credentials: 'include',
        });
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.completed) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          onP1MfaComplete?.();
        } else if (data.status === 'PUSH_CONFIRMATION_TIMED_OUT') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setP1Step('error');
          setP1Error('Push notification timed out. Try another method.');
        }
      } catch (err) {
        // Silently retry on network error
      }
    }, 3000);
  };

  const handleFidoAssertion = async () => {
    try {
      const statusResp = await fetch(`${apiBase}/api/auth/mfa/challenge/${daId}/status`, {
        credentials: 'include',
      });
      if (!statusResp.ok) throw new Error('Failed to get FIDO options');
      const statusData = await statusResp.json();
      const options = statusData.publicKeyCredentialRequestOptions;

      if (!options) throw new Error('No FIDO options available');

      const credential = await navigator.credentials.get({ publicKey: options });
      if (!credential) throw new Error('No credential returned');

      const assertion = {
        id: credential.id,
        rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
        type: credential.type,
        response: {
          authenticatorData: btoa(String.fromCharCode(...new Uint8Array(credential.response.authenticatorData))),
          clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(credential.response.clientDataJSON))),
          signature: btoa(String.fromCharCode(...new Uint8Array(credential.response.signature))),
        },
      };

      const resp = await fetch(`${apiBase}/api/auth/mfa/challenge/${daId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assertion }),
      });
      if (!resp.ok) throw new Error('FIDO verification failed');
      const result = await resp.json();
      if (result.completed) {
        onP1MfaComplete?.();
      } else {
        setP1Step('error');
        setP1Error('FIDO verification incomplete. Try another method.');
      }
    } catch (err) {
      console.error('[OtpStepUpModal] FIDO assertion error:', err);
      setP1Step('error');
      setP1Error('Passkey verification failed. Try another method.');
    }
  };

  const handleBackToDevicePicker = () => {
    setP1Step('pick-device');
    setP1Error('');
    setOtp('');
    setError('');
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const deviceIcon = (type) => {
    switch (type?.toLowerCase()) {
      case 'email': return '\u{1F4E7}';
      case 'totp': return '\u{1F522}';
      case 'fido2': return '\u{1F511}';
      case 'push': return '\u{1F4F1}';
      default: return '\u{1F510}';
    }
  };

  if (!show) return null;

  // P1MFA mode rendering

  if (mode === 'p1mfa') {
    return (
      <div className="otp-step-up-overlay">
        <div className="otp-step-up-modal">
          <div className="otp-step-up-modal__header">
            <h2 className="otp-step-up-modal__title">{'\u{1F510}'} Verify Your Identity</h2>
          </div>

          <p className="otp-step-up-modal__lead">
            {contextLine || 'Step-up authentication required to complete this action'}
          </p>

          {/* Device Picker */}
          {p1Step === 'pick-device' && (
            <div className="otp-step-up-modal__device-list">
              <p className="otp-step-up-modal__hint" style={{ marginBottom: 8 }}>Select a verification method:</p>
              {devices.map((device) => (
                <button
                  key={device.id}
                  type="button"
                  className="otp-step-up-modal__device-item"
                  onClick={() => handleSelectDevice(device)}
                >
                  <span className="otp-step-up-modal__device-icon">{deviceIcon(device.type)}</span>
                  <span>{device.name || device.type || 'Unknown device'}</span>
                </button>
              ))}
            </div>
          )}

          {/* OTP Input (P1MFA) */}
          {p1Step === 'otp' && (
            <>
              <input
                ref={inputRef}
                type="text"
                className={`otp-step-up-modal__input ${error ? 'otp-step-up-modal__input--error' : ''}`}
                placeholder="000000"
                value={otp}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtp(digits);
                  if (error) setError('');
                }}
                onKeyDown={handleKeyDown}
                maxLength="6"
                inputMode="numeric"
                aria-label="Verification code"
                autoFocus
              />
              {error && <div className="otp-step-up-modal__error">{error}</div>}
              <p className="otp-step-up-modal__hint">Enter the code from your device</p>
            </>
          )}

          {/* Push Waiting */}
          {p1Step === 'push' && (
            <>
              <div className="push-waiting-spinner" style={{ margin: '16px auto' }}></div>
              <p style={{ textAlign: 'center', fontWeight: 500 }}>Push notification sent to your device</p>
              <p className="otp-step-up-modal__hint">Approve the notification on your phone</p>
            </>
          )}

          {/* FIDO Waiting */}
          {p1Step === 'fido' && (
            <>
              <p style={{ textAlign: 'center', fontSize: '2rem', margin: '16px 0 8px' }}>{'\u{1F511}'}</p>
              <p style={{ textAlign: 'center', fontWeight: 500 }}>Waiting for passkey verification{'\u2026'}</p>
              <p className="otp-step-up-modal__hint">Use your device biometric or PIN</p>
            </>
          )}

          {/* Error */}
          {p1Step === 'error' && (
            <div className="otp-step-up-modal__error">{p1Error}</div>
          )}

          <div className="otp-step-up-modal__actions">
            {p1Step === 'otp' && (
              <button type="button" className="otp-step-up-modal__btn-primary" onClick={handleP1OtpSubmit}>
                Verify
              </button>
            )}
            {(p1Step === 'error' || p1Step === 'push') && (
              <button type="button" className="otp-step-up-modal__btn-primary" onClick={handleBackToDevicePicker}>
                Try another method
              </button>
            )}
            <button type="button" className="otp-step-up-modal__btn-ghost" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Stub mode rendering (original behavior)

  return (
    <div className="otp-step-up-overlay">
      <div className="otp-step-up-modal">
        <div className="otp-step-up-modal__header">
          <h2 className="otp-step-up-modal__title">{'\u{1F510}'} Verify Your Identity</h2>
        </div>

        <p className="otp-step-up-modal__lead">
          {contextLine || 'Step-up authentication required to complete this action'}
        </p>

        <input
          ref={inputRef}
          type="text"
          className={`otp-step-up-modal__input ${error ? 'otp-step-up-modal__input--error' : ''}`}
          placeholder="000000"
          value={otp}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
            setOtp(digits);
            if (error) setError('');
          }}
          onKeyDown={handleKeyDown}
          maxLength="6"
          inputMode="numeric"
          aria-label="Verification code"
        />

        {error && <div className="otp-step-up-modal__error">{error}</div>}
        <p className="otp-step-up-modal__hint">Check your email for the verification code</p>

        <div className="otp-step-up-modal__actions">
          {allowFido && (
            <button
              type="button"
              className="otp-step-up-modal__method-toggle"
              onClick={() => onSwitchToFido?.()}
            >
              Use Passkey instead {'\u2192'}
            </button>
          )}
          <button type="button" className="otp-step-up-modal__btn-primary" onClick={handleSubmit}>
            Verify
          </button>
          <button type="button" className="otp-step-up-modal__btn-ghost" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
