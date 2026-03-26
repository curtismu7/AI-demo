// banking_api_ui/src/components/shared/LoadingOverlay.js
import React from 'react';
import './LoadingOverlay.css';

/**
 * Full-screen blocking overlay with a spinner and message.
 * Used for irreversible navigations (logout, OAuth redirect) where the user
 * needs to know something is happening before the page unloads.
 *
 * @param {object}  props
 * @param {boolean} props.show     - Whether the overlay is visible.
 * @param {string}  [props.message] - Primary message line.
 * @param {string}  [props.sub]     - Optional secondary line.
 */
export default function LoadingOverlay({ show, message = 'Please wait…', sub }) {
  if (!show) return null;
  return (
    <div className="lo-backdrop" role="status" aria-live="polite" aria-label={message}>
      <div className="lo-card">
        <span className="lo-spinner" aria-hidden="true" />
        <p className="lo-message">{message}</p>
        {sub && <p className="lo-sub">{sub}</p>}
      </div>
    </div>
  );
}
