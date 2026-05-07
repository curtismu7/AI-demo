import DraggableModal from './DraggableModal';
import FidoStepUpModal from './FidoStepUpModal';
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
  const isStepUp = challengeType === 'step_up';

  // step_up delegates entirely to FidoStepUpModal
  if (isStepUp) {
    return (
      <FidoStepUpModal
        show={!!show}
        contextLine="The agent requires identity verification to continue."
        onSubmit={() => onApprove?.()}
        onCancel={() => onDismiss?.()}
      />
    );
  }

  const footer = (
    <>
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
    </>
  );

  return (
    <DraggableModal
      isOpen={!!show}
      onClose={onDismiss}
      title="Action Requires Your Approval"
      footer={footer}
      defaultWidth={420}
      defaultHeight={320}
      storageKey="gateway-consent-modal"
      zIndex={9995}
      backdropClose={false}
    >
      <div className="dm-scroll">
        <span className="gcm-hitl-badge">HITL Challenge — awaiting approval</span>
        <p style={{ marginTop: 12, fontSize: '0.88rem', color: '#1e293b', lineHeight: 1.5 }}>
          The agent is requesting permission to proceed. Review the details before approving.
        </p>
        {challengeId && (
          <p className="gcm-challenge-id">Challenge ID: {challengeId}</p>
        )}
        {expiresAt && (
          <p className="gcm-expires">Expires: {new Date(expiresAt).toLocaleTimeString()}</p>
        )}
      </div>
    </DraggableModal>
  );
}
