// banking_api_ui/src/utils/authUi.js
/** Shared helpers for re-auth CTAs when the UI shows session/login errors. */

/**
 * True when an inline error message is asking the user to authenticate again.
 * @param {unknown} message
 * @returns {boolean}
 */
export function errorMessageSuggestsLogin(message) {
  if (message == null || typeof message !== 'string') return false;
  const m = message.toLowerCase();
  return (
    m.includes('please log in') ||
    m.includes('log in again') ||
    m.includes('sign in again') ||
    m.includes('session has expired')
  );
}

/** Redirect to customer (end-user) OAuth BFF route. */
export function navigateToCustomerOAuthLogin() {
  const apiUrl =
    process.env.REACT_APP_API_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  window.location.href = `${apiUrl}/api/auth/oauth/user/login`;
}

/** Redirect to admin OAuth BFF route. */
export function navigateToAdminOAuthLogin() {
  const apiUrl =
    process.env.REACT_APP_API_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  window.location.href = `${apiUrl}/api/auth/oauth/login`;
}
