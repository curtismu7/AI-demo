// banking_api_ui/src/components/shared/SpinnerHost.js
import React from 'react';
import ReactDOM from 'react-dom';
import { useSpinner } from '../../context/SpinnerContext';
import './LoadingOverlay.css';

/**
 * Global spinner overlay — rendered once in App.js via createPortal.
 * Reads state from SpinnerContext (which subscribes to spinnerService).
 * Shows a full-screen overlay with a colored ring, contextual message,
 * and the live API endpoint in a blue monospace chip.
 */
export default function SpinnerHost() {
  const { visible, message, color, endpoint } = useSpinner();

  if (!visible) return null;

  const accentColor = color || '#2563eb';

  return ReactDOM.createPortal(
    <div
      className="lo-backdrop"
      role="status"
      aria-live="polite"
      aria-label={message || 'Loading…'}
    >
      <div
        className="lo-card"
        style={{ borderTopColor: accentColor }}
      >
        <span
          className="lo-spinner"
          style={{ borderTopColor: accentColor }}
          aria-hidden="true"
        />
        <p className="lo-message">{message || 'Please wait…'}</p>
        {endpoint && (
          <code className="lo-endpoint">{endpoint}</code>
        )}
      </div>
    </div>,
    document.body
  );
}
