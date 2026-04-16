// banking_api_ui/src/components/shared/SpinnerHost.js
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useSpinner } from '../../context/SpinnerContext';
import { spinnerActivity } from '../../services/spinnerActivityService';
import './LoadingOverlay.css';

/**
 * Global spinner overlay — rendered once in App.js via createPortal.
 * Reads state from SpinnerContext (which subscribes to spinnerService).
 * Shows a full-screen overlay with a colored ring, contextual message,
 * the live API endpoint in a blue monospace chip, and (for admin users)
 * a scrolling activity feed of server events below.
 */
export default function SpinnerHost() {
  const { visible, message, color, endpoint } = useSpinner();
  const [activityEvents, setActivityEvents] = useState([]);
  const feedRef = useRef(null);
  const prevEndpointRef = useRef(null);

  // Start/stop activity polling when spinner visibility changes
  useEffect(() => {
    if (visible) {
      spinnerActivity.start();
      const unsub = spinnerActivity.subscribe(setActivityEvents);
      return () => {
        unsub();
        spinnerActivity.stop();
      };
    } else {
      spinnerActivity.stop();
      setActivityEvents([]);
    }
  }, [visible]);

  // Add client-side event when endpoint changes (in-flight API call)
  useEffect(() => {
    if (visible && endpoint && endpoint !== prevEndpointRef.current) {
      // Extract method and url from "METHOD url" format
      const spaceIdx = endpoint.indexOf(' ');
      if (spaceIdx > 0) {
        const method = endpoint.slice(0, spaceIdx);
        const url = endpoint.slice(spaceIdx + 1);
        spinnerActivity.addClientEvent(method, url);
      }
    }
    prevEndpointRef.current = endpoint;
  }, [visible, endpoint]);

  // Auto-scroll feed to bottom when new events arrive
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [activityEvents]);

  if (!visible) return null;

  const accentColor = color || 'var(--chase-navy)';

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
        {activityEvents.length > 0 && (
          <div className="lo-activity-feed" ref={feedRef}>
            {activityEvents.map((evt) => (
              <div key={evt.id} className="lo-activity-line">
                <span className="lo-activity-icon">{evt.icon}</span>
                <span className="lo-activity-time">{evt.timeDelta}</span>
                <span className="lo-activity-msg">{evt.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
