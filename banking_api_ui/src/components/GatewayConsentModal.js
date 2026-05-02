import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDraggablePanel } from '../hooks/useDraggablePanel';
import FidoStepUpModal from './FidoStepUpModal';
import '../styles/draggablePanel.css';
import './GatewayConsentModal.css';

/**
 * GatewayConsentModal
 *
 * Rendered when the BFF returns HTTP 403 with body.error === 'hitl_required'.
 *
 * Props:
 *   show           — boolean
 *   challengeId    — string
 *   challengeType  — 'consent' | 'step_up'
 *   expiresAt      — string (ISO date)
 *   onApprove      — callback on consent approval
 *   onDismiss      — callback on cancel / escape
 */
export default function GatewayConsentModal({
  show,
  challengeId,
  challengeType,
  expiresAt,
  onApprove,
  onDismiss,
}) {
  useEffect(() => {
    if (!show) return;
    const onKey = (e) => { if (e.key === 'Escape') onDismiss?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [show, onDismiss]);

  const { pos, handleDragStart } = useDraggablePanel(
    () => ({
      x: Math.max(20, (window.innerWidth  - 420) / 2),
      y: Math.max(20, (window.innerHeight - 320) / 2),
    }),
    { w: 420, h: 'auto' }
  );

  if (!show) return null;

  const isStepUp = challengeType === 'step_up';

  const card = (
    <>
      <div className="drp-backdrop" />
      <div
        className="gcm-card"
        role="dialog"
        aria-label={isStepUp ? 'Identity Verification Required' : 'Action Requires Your Approval'}
        style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 9995 }}
      >
        {/* Drag handle / title */}
        <div
          className="gcm-drag-handle"
          onMouseDown={handleDragStart}
        >
          <span className="gcm-title">
            {isStepUp ? '🔐 Identity Verification Required' : '🛡️ Action Requires Your Approval'}
          </span>
          <span className="gcm-hitl-badge">🔒 HITL Challenge — awaiting approval</span>
        </div>

        {/* Body */}
        <div className="gcm-body">
          <p>
            {isStepUp
              ? 'The agent is requesting elevated access. Verify your identity to continue.'
              : 'The agent is requesting permission to proceed. Review the details before approving.'}
          </p>
          {challengeId && (
            <p className="gcm-challenge-id">Challenge ID: {challengeId}</p>
          )}
          {expiresAt && (
            <p className="gcm-expires">Expires: {new Date(expiresAt).toLocaleTimeString()}</p>
          )}
        </div>

        {/* Footer — consent only; step_up delegates to FidoStepUpModal */}
        {!isStepUp && (
          <div className="gcm-footer">
            <button
              type="button"
              className="gcm-btn-approve"
              onClick={() => onApprove?.()}
            >
              Approve
            </button>
            <button
              type="button"
              className="gcm-btn-cancel"
              onClick={() => onDismiss?.()}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Step-up delegates MFA to FidoStepUpModal */}
      {isStepUp && (
        <FidoStepUpModal
          show={true}
          contextLine="The agent requires identity verification to continue."
          onSubmit={() => onApprove?.()}
          onCancel={() => onDismiss?.()}
        />
      )}
    </>
  );

  return createPortal(card, document.body);
}
