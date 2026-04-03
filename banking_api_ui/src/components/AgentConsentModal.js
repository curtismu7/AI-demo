import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDraggablePanel } from '../hooks/useDraggablePanel';
import '../styles/draggablePanel.css';
import './AgentConsentModal.css';

/**
 * AgentConsentModal
 *
 * Used in two modes:
 *   1. High-risk transaction consent — when a `transaction` prop is provided.
 *      Shows the transaction details and, on "Authorize", calls onAccept() directly.
 *   2. Agent access consent (legacy) — no `transaction` prop.
 *      POSTs to /api/auth/oauth/user/consent before calling onAccept().
 *
 * Draggable from the header, resizable from the bottom-right grip.
 *
 * Props:
 *   transaction — optional { type, amount, fromAccountId, toAccountId, description }
 *   onAccept    — callback; called after consent is confirmed.
 *   onDismiss   — callback; user closed the modal without accepting.
 */
export default function AgentConsentModal({ transaction, onAccept, onDismiss }) {
  const [accepting, setAccepting] = useState(false);
  const [error, setError]         = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onDismiss?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  const { pos, size, handleDragStart, handleResizeStart } = useDraggablePanel(
    () => ({
      x: Math.max(20, (window.innerWidth  - 460) / 2),
      y: Math.max(20, (window.innerHeight - 580) / 2),
    }),
    { w: 460, h: 520 }
  );

  const handleAccept = useCallback(async () => {
    setAccepting(true);
    setError(null);
    if (transaction) {
      // Transaction consent mode — no server round-trip; caller handles the challenge flow
      onAccept?.();
      return;
    }
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
  }, [onAccept, transaction]);

  return createPortal(
    <>
      {/* Dim backdrop — does NOT close on click (consent is an intentional gate) */}
      <div className="drp-backdrop" />

      {/* Draggable + resizable card */}
      <div
        className="acm-card"
        style={{
          position: 'fixed',
          left:     pos.x,
          top:      pos.y,
          width:    size.w,
          height:   size.h,
          zIndex:   9991,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="acm-title"
      >
        {/* Drag handle — header area */}
        <div
          className="acm-drag-handle"
          onMouseDown={handleDragStart}
          title="Drag to move"
        >
          <span className="acm-icon" aria-hidden="true">{transaction ? '💸' : '🤖'}</span>
          <h2 id="acm-title" className="acm-title">
            {transaction
              ? `Authorize ${(transaction.type || 'Transaction').charAt(0).toUpperCase() + (transaction.type || 'transaction').slice(1)}`
              : 'Allow AI Agent Access'}
          </h2>
        </div>

        {/* Scrollable body */}
        <div className="acm-body-wrap">
          {transaction ? (
            <>
              <p className="acm-body">
                The AI banking assistant is requesting your authorization to complete a
                {' '}<strong>high-value {transaction.type || 'transaction'}</strong>.
                Review the details below and click <em>Authorize</em> to proceed.
              </p>
              <ul className="acm-list acm-list--transaction">
                <li>💰 <strong>Amount:</strong> ${Number(transaction.amount || 0).toFixed(2)}</li>
                {transaction.type === 'transfer' && transaction.fromAccountId && (
                  <li>📤 <strong>From account:</strong> {transaction.fromAccountId}</li>
                )}
                {(transaction.type === 'transfer' || transaction.type === 'deposit') && transaction.toAccountId && (
                  <li>📥 <strong>To account:</strong> {transaction.toAccountId}</li>
                )}
                {(transaction.type === 'withdrawal') && transaction.fromAccountId && (
                  <li>📤 <strong>From account:</strong> {transaction.fromAccountId}</li>
                )}
                {transaction.description && (
                  <li>📝 <strong>Note:</strong> {transaction.description}</li>
                )}
              </ul>
              <ul className="acm-list">
                <li>✅ A one-time verification code will be sent to your email</li>
                <li>✅ The code expires in 10 minutes</li>
                <li>✅ This transaction is logged in the Token Chain display</li>
                <li>⛔ The agent cannot alter amounts or accounts after you authorize</li>
              </ul>
              <p className="acm-legal">
                By clicking <em>Authorize</em> you confirm you have reviewed the transaction
                details and consent to proceed. A verification code will be sent to your
                registered email address.
              </p>
            </>
          ) : (
            <>
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
            </>
          )}
          {error && <p className="acm-error" role="alert">{error}</p>}
        </div>

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
            {accepting ? 'Saving…' : transaction ? 'Authorize' : 'Allow'}
          </button>
        </div>

        {/* Resize grip */}
        <div
          className="drp-resize-grip"
          onMouseDown={handleResizeStart}
          aria-hidden
          title="Drag to resize"
        />
      </div>
    </>,
    document.body
  );
}
