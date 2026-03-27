// banking_api_ui/src/components/SessionReauthBanner.js
import React from 'react';
import { navigateToAdminOAuthLogin, navigateToCustomerOAuthLogin } from '../utils/authUi';

/**
 * Fixed on-page notice when the session is invalid and the user must sign in again.
 * @param {{ message: string, role: 'admin' | 'customer', onDismiss: () => void }} props
 */
export default function SessionReauthBanner({ message, role, onDismiss }) {
  const handleSignIn = () => {
    if (role === 'admin') navigateToAdminOAuthLogin();
    else navigateToCustomerOAuthLogin();
  };

  const signInLabel = role === 'admin' ? 'Admin sign in' : 'Sign in';

  return (
    <div className="session-reauth-banner" role="alert" aria-live="assertive">
      <div className="session-reauth-banner__inner">
        <p className="session-reauth-banner__text">{message}</p>
        <div className="session-reauth-banner__actions">
          <button type="button" className="session-reauth-banner__btn session-reauth-banner__btn--primary" onClick={handleSignIn}>
            {signInLabel}
          </button>
          <button type="button" className="session-reauth-banner__btn session-reauth-banner__btn--ghost" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
