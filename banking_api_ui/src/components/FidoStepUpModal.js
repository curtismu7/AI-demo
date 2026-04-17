import React, { useState, useEffect } from 'react';

/**
 * FidoStepUpModal — FIDO2/Passkey verification modal for HITL step-up challenges
 * 
 * Props:
 *   - show (boolean): Control modal visibility
 *   - contextLine (string): Brief explanation (e.g., "Transfer over $500 requires verification")
 *   - onSubmit (function): Called with credential response when verification succeeds
 *   - onCancel (function): Called when user clicks "Cancel" or verification fails
 *   - fallbackToOtp (function): Called when user clicks "Use OTP Instead"
 */
export default function FidoStepUpModal({ show, onSubmit, onCancel, contextLine = '', fallbackToOtp }) {
  const [status, setStatus] = useState('ready'); // 'ready', 'waiting', 'error', 'timeout'
  const [errorMsg, setErrorMsg] = useState('');
  const timeoutRef = React.useRef(null);

  // Trigger WebAuthn verification when modal shows
  useEffect(() => {
    if (!show) return;

    setStatus('waiting');
    setErrorMsg('');

    // Set 60 second timeout
    timeoutRef.current = setTimeout(() => {
      setStatus('timeout');
      setErrorMsg('Passkey verification timed out. Please try again or use a code instead.');
    }, 60000);

    // Listen for FIDO verification events from the backend/authentication flow
    const handleFidoSuccess = (event) => {
      clearTimeout(timeoutRef.current);
      if (event.detail?.credentialResponse) {
        setStatus('ready');
        onSubmit?.(event.detail.credentialResponse);
      }
    };

    const handleFidoError = (event) => {
      clearTimeout(timeoutRef.current);
      setStatus('error');
      setErrorMsg(event.detail?.message || 'Passkey verification failed. Please try again.');
    };

    window.addEventListener('fido-verification-success', handleFidoSuccess);
    window.addEventListener('fido-verification-error', handleFidoError);

    return () => {
      clearTimeout(timeoutRef.current);
      window.removeEventListener('fido-verification-success', handleFidoSuccess);
      window.removeEventListener('fido-verification-error', handleFidoError);
    };
  }, [show, onSubmit]);

  const handleCancel = () => {
    clearTimeout(timeoutRef.current);
    setStatus('ready');
    setErrorMsg('');
    onCancel?.();
  };

  const handleTryOtp = () => {
    clearTimeout(timeoutRef.current);
    setStatus('ready');
    setErrorMsg('');
    fallbackToOtp?.();
  };

  if (!show) return null;

  const isError = status === 'error' || status === 'timeout';
  const isWaiting = status === 'waiting';

  return (
    <div className="otp-step-up-overlay">
      <div className="otp-step-up-modal otp-step-up-modal--fido2">
        <div className="otp-step-up-modal__header">
          <h2 className="otp-step-up-modal__title">🔐 Verify with Passkey</h2>
        </div>

        <p className="otp-step-up-modal__lead">
          {contextLine || 'Step-up authentication required to complete this action'}
        </p>

        <div className="otp-step-up-modal__fido-status">
          {isWaiting && (
            <>
              <div className="push-waiting-spinner"></div>
              <p className="otp-step-up-modal__status-text">
                Waiting for passkey verification…
              </p>
              <p className="otp-step-up-modal__hint">
                Use your device's biometric scanner or PIN to verify
              </p>
            </>
          )}

          {isError && (
            <>
              <p className="otp-step-up-modal__error">❌ {errorMsg}</p>
              <p className="otp-step-up-modal__hint">
                Try again with your passkey or use a verification code instead
              </p>
            </>
          )}

          {status === 'ready' && !isWaiting && !isError && (
            <>
              <div className="push-waiting-spinner"></div>
              <p className="otp-step-up-modal__status-text">
                Initializing passkey verification…
              </p>
            </>
          )}
        </div>

        <div className="otp-step-up-modal__actions">
          <button
            type="button"
            className="otp-step-up-modal__btn-primary"
            onClick={handleTryOtp}
            disabled={isWaiting}
          >
            Use Code Instead
          </button>
          <button
            type="button"
            className="otp-step-up-modal__btn-ghost"
            onClick={handleCancel}
            disabled={isWaiting}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
