// banking_api_ui/src/utils/dashboardToast.js
import React from 'react';
import { toast } from 'react-toastify';
import { errorMessageSuggestsLogin } from './authUi';

/**
 * Show an error toast; session-style messages get a Sign in action (customer BFF).
 * @param {string} message
 * @param {() => void} onSignIn
 */
export function toastCustomerError(message, onSignIn) {
  if (message == null || message === '') return;
  if (errorMessageSuggestsLogin(message)) {
    toast.error(
      <div className="dashboard-toast-error">
        <p className="dashboard-toast-error__text">{message}</p>
        <button type="button" className="dashboard-toast-error__btn" onClick={onSignIn}>
          Sign in
        </button>
      </div>,
      { autoClose: 20000 }
    );
    return;
  }
  toast.error(message);
}

/**
 * Admin dashboard session errors — Sign in uses admin OAuth.
 * @param {string} message
 * @param {() => void} onAdminSignIn
 */
export function toastAdminSessionError(message, onAdminSignIn) {
  if (message == null || message === '') return;
  if (errorMessageSuggestsLogin(message)) {
    toast.error(
      <div className="dashboard-toast-error">
        <p className="dashboard-toast-error__text">{message}</p>
        <button type="button" className="dashboard-toast-error__btn" onClick={onAdminSignIn}>
          Admin sign in
        </button>
      </div>,
      { autoClose: 20000 }
    );
    return;
  }
  toast.error(message);
}
