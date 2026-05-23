import React from 'react';
import { navigateToCustomerOAuthLogin } from '../utils/authUi';
import './UserTokenStatusBar.css';

/**
 * UserTokenStatusBar
 *
 * Renders a status strip below DashboardHeader showing the user session state.
 *
 * States:
 *   - Loading: tokenSecondsLeft === null && user !== null → shimmer
 *   - Active:  tokenSecondsLeft > 0 → clickable pill with countdown
 *   - Expired: tokenSecondsLeft === 0 && user !== null → warning + re-login
 *   - Anonymous: user === null → not-logged-in + login button
 *
 * @param {object|null} props.user - Session user object or null
 * @param {number|null} props.tokenSecondsLeft - Seconds until token expiry (live countdown)
 * @param {function} props.onOpenModal - Called when user clicks the active pill
 */
export default function UserTokenStatusBar({ user, tokenSecondsLeft, onOpenModal }) {
  function formatCountdown(seconds) {
    if (seconds === null || seconds < 0) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  // Not logged in
  if (!user) {
    return (
      <div className="utsb" role="status" aria-label="Session status">
        <span className="utsb__anonymous">Not logged in</span>
        <button
          type="button"
          className="utsb__login-btn"
          onClick={navigateToCustomerOAuthLogin}
        >
          Login
        </button>
      </div>
    );
  }

  // Token data still loading
  if (tokenSecondsLeft === null) {
    return (
      <div className="utsb" role="status" aria-label="Session status">
        <span className="utsb__shimmer" aria-hidden="true" />
      </div>
    );
  }

  // Expired
  if (tokenSecondsLeft <= 0) {
    return (
      <div className="utsb" role="status" aria-label="Session status">
        <span className="utsb__expired">⚠ Session expired</span>
        <button
          type="button"
          className="utsb__login-btn"
          onClick={navigateToCustomerOAuthLogin}
        >
          Re-login
        </button>
      </div>
    );
  }

  // Active
  return (
    <div className="utsb" role="status" aria-label="Session status">
      <button
        type="button"
        className="utsb__active"
        onClick={onOpenModal}
        title="View token details"
      >
        <span className="utsb__dot" aria-hidden="true" />
        User session active · {formatCountdown(tokenSecondsLeft)}
      </button>
    </div>
  );
}
