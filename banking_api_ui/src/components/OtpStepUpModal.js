import React, { useState, useRef, useEffect } from 'react';

/**
 * OtpStepUpModal — MFA OTP collection modal for HITL step-up challenges
 * 
 * Props:
 *   - show (boolean): Control modal visibility
 *   - contextLine (string): Brief explanation (e.g., "Transfer over $500 requires verification")
 *   - onSubmit (function): Called with OTP when user clicks "Verify"
 *   - onCancel (function): Called when user clicks "Cancel"
 */
export default function OtpStepUpModal({ show, onSubmit, onCancel, contextLine = '' }) {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // Auto-focus input when modal shows
  useEffect(() => {
    if (show && inputRef.current) {
      inputRef.current.focus();
    }
  }, [show]);

  const handleSubmit = () => {
    // Validate OTP: must be 6 digits
    if (!otp.trim()) {
      setError('Enter the 6-digit code');
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter 6 digits only');
      return;
    }
    // Valid OTP — call handler and clear
    onSubmit(otp);
    setOtp('');
    setError('');
  };

  const handleCancel = () => {
    setOtp('');
    setError('');
    onCancel();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (!show) return null;

  return (
    <div className="otp-step-up-overlay">
      <div className="otp-step-up-modal">
        <div className="otp-step-up-modal__header">
          <h2 className="otp-step-up-modal__title">🔐 Verify Your Identity</h2>
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
            // Only allow digits, limit to 6
            const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
            setOtp(digits);
            if (error) setError(''); // Clear error on input change
          }}
          onKeyDown={handleKeyDown}
          maxLength="6"
          inputMode="numeric"
          aria-label="Verification code"
        />

        {error && <div className="otp-step-up-modal__error">{error}</div>}
        <p className="otp-step-up-modal__hint">Check your email for the verification code</p>

        <div className="otp-step-up-modal__actions">
          <button
            type="button"
            className="otp-step-up-modal__btn-primary"
            onClick={handleSubmit}
          >
            Verify
          </button>
          <button
            type="button"
            className="otp-step-up-modal__btn-ghost"
            onClick={handleCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
