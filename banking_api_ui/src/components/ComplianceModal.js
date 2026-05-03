import React from 'react';
import './ComplianceModal.css';

/**
 * Modal dialog for displaying MCP Compliance Checklist
 * Replaces FloatingPanel for the compliance view in agent
 */
export default function ComplianceModal({
  open,
  onClose,
  complianceStripState,
  messages,
  onClearSteps,
  CHIP_APPLICABLE_STEPS,
  getStepSkipExplanation,
}) {
  if (!open) return null;

  return (
    <div className="compliance-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="compliance-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="compliance-modal__header">
          <div className="compliance-modal__title-block">
            <h2 className="compliance-modal__title">MCP Compliance Checklist</h2>
            {complianceStripState?.complianceActionLabel && (
              <span className="compliance-modal__action-label">
                {complianceStripState.complianceActionLabel}
              </span>
            )}
          </div>
          <button
            type="button"
            className="compliance-modal__close"
            onClick={onClose}
            aria-label="Close compliance modal"
            title="Close modal (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="compliance-modal__body" aria-live="polite">
          {/* Last response */}
          {messages && messages.length > 0 && messages[messages.length - 1]?.role === 'assistant' && (
            <div className="compliance-modal__last-response">
              <div className="compliance-modal__last-response-label">Last Response</div>
              <div className="compliance-modal__last-response-body">
                {messages[messages.length - 1].content}
              </div>
            </div>
          )}

          {/* Steps list */}
          {!complianceStripState?.complianceSteps || complianceStripState.complianceSteps.length === 0 ? (
            <div className="compliance-modal__empty">
              No compliance data yet — run an MCP tool call to start.
            </div>
          ) : (
            <>
              <ol className="compliance-modal__list">
                {complianceStripState.complianceSteps.flatMap((step) => {
                  const isActive = step.id === complianceStripState.complianceStep;
                  const icon =
                    step.status === 'done'
                      ? '✅'
                      : step.status === 'error'
                        ? '❌'
                        : isActive
                          ? '⚙'
                          : '○';
                  const applicableSteps = complianceStripState.complianceActionId
                    ? CHIP_APPLICABLE_STEPS?.[complianceStripState.complianceActionId] || []
                    : [];
                  const isApplicable = applicableSteps.includes(step.id);
                  const items = [];

                  if (step.id === 'olb-resource-token') {
                    items.push(
                      <li
                        key="intent-delegation-badge"
                        className="compliance-modal__group-badge"
                      >
                        Intent-Bound Delegation
                      </li>,
                    );
                  }

                  items.push(
                    <li
                      key={step.id}
                      className={
                        'compliance-modal__item' +
                        (isActive ? ' active' : '') +
                        (' ' + step.status) +
                        (isApplicable && step.status === 'pending' ? ' applicable' : '')
                      }
                    >
                      <span className="compliance-modal__icon">{icon}</span>
                      <span className="compliance-modal__label">{step.label}</span>
                    </li>,
                  );
                  // Add inline explanation for non-applicable pending steps
                  if (
                    step.status === 'pending' &&
                    !isApplicable &&
                    complianceStripState?.complianceActionId &&
                    getStepSkipExplanation
                  ) {
                    items.push(
                      <li
                        key={`${step.id}-skip-reason`}
                        className="compliance-modal__skip-reason"
                      >
                        {getStepSkipExplanation(
                          complianceStripState.complianceActionId,
                          step.id,
                        )}
                      </li>,
                    );
                  }
                  return items;
                })}
              </ol>

              {/* Skip note */}
              {(() => {
                if (!complianceStripState?.complianceActionId) return null;
                const applicable =
                  CHIP_APPLICABLE_STEPS?.[complianceStripState.complianceActionId] || [];
                const skipped = complianceStripState.complianceSteps.filter(
                  (s) => s.status === 'pending' && !applicable.includes(s.id),
                );
                if (skipped.length === 0) return null;
                return (
                  <div className="compliance-modal__skip-note">
                    <strong>
                      {skipped.length} step{skipped.length > 1 ? 's' : ''} not triggered
                    </strong>
                    {' '}— gateway denial and HITL steps only fire on
                    scope-upgrade or permission-required operations (e.g. Sensitive Account
                    Details).
                  </div>
                );
              })()}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="compliance-modal__footer">
          <button
            type="button"
            className="compliance-modal__clear-btn"
            onClick={() => {
              try {
                onClearSteps?.();
              } catch (_) {}
            }}
            title="Reset all steps to pending"
          >
            Clear
          </button>
          <button type="button" className="compliance-modal__close-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
