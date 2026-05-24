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
 *   - Active:  tokenSecondsLeft > 0 → username + user ID + countdown + "View Token" button
 *   - Expired: tokenSecondsLeft <= 0 && user !== null → warning + re-login
 *   - Anonymous: user === null → not-logged-in + login button
 *
 * @param {object|null} props.user - Session user object ({ firstName, lastName, email, id, role }) or null
 * @param {number|null} props.tokenSecondsLeft - Seconds until token expiry (live countdown)
 * @param {function} props.onOpenModal - Called when user clicks "View Token"
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
          Sign In
        </button>
      </div>
    );
  }

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.email || 'User';
  const userId = user.id || null;

  // Token data still loading
  if (tokenSecondsLeft === null) {
    return (
      <div className="utsb" role="status" aria-label="Session status">
        <span className="utsb__shimmer" aria-hidden="true" />
        <span className="utsb__sr-only">Loading session status…</span>
      </div>
    );
  }

  // Expired
  if (tokenSecondsLeft <= 0) {
    return (
      <div className="utsb" role="status" aria-label="Session status">
        <span className="utsb__user-info">
          <span className="utsb__name">{displayName}</span>
          {userId && <span className="utsb__id" title="User ID">{userId}</span>}
        </span>
        <span className="utsb__expired">⚠️ Session expired</span>
        <button
          type="button"
          className="utsb__login-btn"
          onClick={navigateToCustomerOAuthLogin}
        >
          Sign In
        </button>
      </div>
    );
  }

  // Active
  return (
    <div className="utsb" role="status" aria-label="Session status">
      <span className="utsb__dot" aria-hidden="true" />
      <span className="utsb__user-info">
        <span className="utsb__name">{displayName}</span>
        {userId && <span className="utsb__id" title="User ID">{userId}</span>}
      </span>
      <span className="utsb__countdown">
        <span className="utsb__sr-only">Token expires in </span>
        {formatCountdown(tokenSecondsLeft)}
      </span>
      <button
        type="button"
        className="utsb__view-btn"
        onClick={onOpenModal}
        title="View token details"
      >
        View Token
      </button>
    </div>
  );
}
