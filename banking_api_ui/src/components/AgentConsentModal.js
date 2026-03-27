import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './AgentConsentModal.css';

/**
 * AgentConsentModal
 *
 * In-app consent gate for the AI banking agent.  Shown when the user is
 * authenticated but has not yet accepted the agent delegation agreement.
 *
 * Props:
 *   onAccept  — async callback; called after the server confirms consent.
 *   onDismiss — callback; user closed the modal without accepting.
 */
export default function AgentConsentModal({ onAccept, onDismiss }) {
  const [accepting, setAccepting] = useState(false);
  const [error, setError]         = useState(null);

  const handleAccept = useCallback(async () => {
    setAccepting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/oauth/user/consent', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Server error ${res.status}`);
      }
      const data = await res.json();
      onAccept?.(data);
    } catch (err) {
      setError(err.message || 'Failed to record consent. Please try again.');
      setAccepting(false);
    }
  }, [onAccept]);

  return createPortal(
    <div className="acm-overlay" role="dialog" aria-modal="true" aria-labelledby="acm-title">
      <div className="acm-card">
        <div className="acm-icon" aria-hidden="true">🤖</div>
        <h2 id="acm-title" className="acm-title">Allow AI Agent Access</h2>
        <p className="acm-body">
          The <strong>BX Finance AI Assistant</strong> is requesting permission to act
          on your behalf — for example, checking balances, viewing transactions, and
          initiating transfers.
        </p>
        <ul className="acm-list">
          <li>✅ The agent can only use your account within this session</li>
          <li>✅ All actions are logged and visible in the Token Chain display</li>
          <li>✅ You can revoke access at any time by logging out</li>
          <li>⛔ The agent cannot change your credentials or contact details</li>
        </ul>
        <p className="acm-legal">
          By clicking <em>Allow</em> you consent to allow the BX Finance AI agent to act
          on your behalf for the duration of this session, under the{' '}
          <a
            href="https://www.rfc-editor.org/rfc/rfc8693"
            target="_blank"
            rel="noopener noreferrer"
          >
            RFC 8693 Token Exchange
          </a>{' '}
          delegation model.
        </p>
        {error && <p className="acm-error" role="alert">{error}</p>}
        <div className="acm-actions">
          <button
            type="button"
            className="acm-btn acm-btn--secondary"
            onClick={onDismiss}
            disabled={accepting}
          >
            Not now
          </button>
          <button
            type="button"
            className="acm-btn acm-btn--primary"
            onClick={handleAccept}
            disabled={accepting}
          >
            {accepting ? 'Saving…' : 'Allow'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
