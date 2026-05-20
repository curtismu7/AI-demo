import { useState, useCallback } from "react";
import DraggableModal from "./DraggableModal";
import "./AgentConsentModal.css";

/**
 * AgentConsentModal
 *
 * Used in two modes:
 *   1. High-risk transaction consent — when a `transaction` prop is provided.
 *      Shows the transaction details and, on "Authorize", calls onAccept() directly.
 *   2. Agent access consent (legacy) — no `transaction` prop.
 *      POSTs to /api/auth/oauth/user/consent before calling onAccept().
 *
 * Props:
 *   transaction — optional { type, amount, fromAccountId, toAccountId, description }
 *   onAccept    — callback; called after consent is confirmed.
 *   onDismiss   — callback; user closed the modal without accepting.
 */
export default function AgentConsentModal({
  transaction,
  onAccept,
  onDismiss,
  hitlThreshold = 500,
}) {
  const [accepting, setAccepting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState(null);

  const handleAccept = useCallback(async () => {
    setAccepting(true);
    setError(null);
    if (transaction) {
      // Transaction consent mode — no server round-trip; caller handles the challenge flow
      onAccept?.();
      return;
    }
    try {
      const res = await fetch("/api/auth/oauth/user/consent", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Server error ${res.status}`);
      }
      const data = await res.json();
      onAccept?.(data);
    } catch (err) {
      setError(err.message || "Failed to record consent. Please try again.");
      setAccepting(false);
    }
  }, [onAccept, transaction]);

  const txType = transaction?.type || "transaction";
  const txTypeLabel = txType.charAt(0).toUpperCase() + txType.slice(1);
  const title = transaction
    ? `Authorize ${txTypeLabel}`
    : "Allow AI Agent Access";

  const footer = (
    <>
      <button
        type="button"
        className="acm-btn acm-btn--primary"
        onClick={handleAccept}
        disabled={accepting || (transaction && !agreed)}
      >
        {accepting ? "Processing…" : transaction ? "Agree & Continue" : "Allow"}
      </button>
      <button
        type="button"
        className="acm-btn acm-btn--secondary"
        onClick={onDismiss}
        disabled={accepting}
      >
        Cancel
      </button>
    </>
  );

  return (
    <DraggableModal
      isOpen
      onClose={onDismiss}
      title={title}
      footer={footer}
      defaultWidth={480}
      defaultHeight={580}
      storageKey="agent-consent-modal-v2"
      zIndex={100070}
      backdropClose={false}
    >
      {/* HITL persistent badge */}
      <div className="acm-hitl-badge" aria-live="polite">
        <span className="acm-hitl-badge__label">
          Human-in-the-Loop — <strong>manual approval required</strong>
        </span>
      </div>

      <div className="acm-body-wrap">
        {transaction ? (
          <>
            <p className="acm-body">
              Review the details below before authorizing this action. The agent
              cannot proceed without your explicit approval.
            </p>

            <ul className="acm-list acm-list--transaction">
              <li>
                <strong>Amount:</strong> $
                {Number(transaction.amount || 0).toFixed(2)}
              </li>
              {transaction.type === "transfer" && transaction.fromAccountId && (
                <li>
                  <strong>From:</strong> {transaction.fromAccountId}
                </li>
              )}
              {(transaction.type === "transfer" ||
                transaction.type === "deposit") &&
                transaction.toAccountId && (
                  <li>
                    <strong>To:</strong> {transaction.toAccountId}
                  </li>
                )}
              {transaction.type === "withdrawal" &&
                transaction.fromAccountId && (
                  <li>
                    <strong>From:</strong> {transaction.fromAccountId}
                  </li>
                )}
              {transaction.description && (
                <li>
                  <strong>Note:</strong> {transaction.description}
                </li>
              )}
            </ul>

            {Number(transaction.amount || 0) >= hitlThreshold && (
              <div className="acm-high-value-warning">
                This transaction exceeds ${hitlThreshold.toLocaleString()}.
                Please verify before confirming.
              </div>
            )}

            <ul className="acm-list">
              <li>
                A one-time verification code will be sent to your registered
                email
              </li>
              <li>This action is recorded in the audit trail</li>
            </ul>

            <label className="acm-agree-label">
              <input
                type="checkbox"
                className="acm-agree-cb"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                I have reviewed the transaction details above and authorize this
                action
              </span>
            </label>
          </>
        ) : (
          <>
            <p className="acm-body">
              The <strong>AI Banking Assistant</strong> is requesting permission
              to act on your behalf — checking balances, viewing transactions,
              and initiating transfers.
            </p>
            <ul className="acm-list">
              <li>The agent can only act within this session</li>
              <li>
                All actions are logged and visible in the Token Chain display
              </li>
              <li>You can revoke access at any time by logging out</li>
              <li>
                The agent cannot change your credentials or contact details
              </li>
            </ul>
          </>
        )}

        {error && (
          <p className="acm-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </DraggableModal>
  );
}
