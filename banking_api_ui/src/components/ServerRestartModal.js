/**
 * ServerRestartModal.js
 * 
 * Modal component displayed when the server is restarting (504 error detected).
 * Shows spinner, attempt counter, and retry/dismiss buttons.
 * 
 * Usage: Mount globally in App.js, no props needed
 * State is managed by bankingRestartNotificationService hook
 */

import React from 'react';
import { useRestartModal } from '../services/bankingRestartNotificationService';
import './ServerRestartModal.css';

export default function ServerRestartModal() {
  const { isVisible, attemptCount, maxAttempts, retryNow, closeModal } =
    useRestartModal();

  if (!isVisible) return null;

  return (
    <div
      className="modal-overlay server-restart-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restart-modal-title"
    >
      <div className="modal-content server-restart-content">
        <div className="modal-header">
          <h2 id="restart-modal-title">Server is restarting</h2>
        </div>

        <div className="modal-body">
          {/* Spinner */}
          <div
            className="restart-spinner"
            aria-label="Loading"
            aria-hidden="true"
          />

          {/* Main message */}
          <p className="restart-message">
            The server is temporarily unavailable. Reconnecting...
          </p>

          {/* Attempt counter */}
          <p className="attempt-counter">
            Attempt {attemptCount} of {maxAttempts}
          </p>
        </div>

        {/* Footer with buttons */}
        <div className="modal-footer">
          <button
            onClick={retryNow}
            className="btn btn-blue"
            aria-label="Retry connection immediately"
          >
            Retry Now
          </button>
          <button
            onClick={closeModal}
            className="btn btn-secondary"
            aria-label="Dismiss this notification (retries continue in background)"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
