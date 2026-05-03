import React, { useEffect, useRef, useState } from 'react';
import './ComplianceModal.css';

/**
 * Resizable, draggable modal for MCP Compliance Checklist.
 * Used by floating, bottom, and middle agent layouts.
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
  const [size, setSize] = useState({ width: 400, height: 600 });
  const [pos, setPos] = useState({ x: 300, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0 });
  const modalRef = useRef(null);
  const headerRef = useRef(null);

  // Drag handler
  const handleMouseDownHeader = (e) => {
    if (e.target.closest('button')) return; // Don't drag if clicking button
    setIsDragging(true);
    setDragStart({ x: e.clientX - pos.x, y: e.clientY - pos.y });
  };

  // Resize handler
  const handleMouseDownResize = (e) => {
    e.preventDefault();
    setIsResizing(true);
    setResizeStart({ x: e.clientX, y: e.clientY, width: size.width, height: size.height });
  };

  // Mouse move for drag/resize
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e) => {
      if (isDragging) {
        setPos({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
      }
      if (isResizing) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;
        setSize({
          width: Math.max(300, resizeStart.width + deltaX),
          height: Math.max(250, resizeStart.height + deltaY),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragStart, resizeStart]);

  if (!open) return null;

  return (
    <div className="compliance-modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="compliance-modal"
        style={{
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          width: `${size.width}px`,
          height: `${size.height}px`,
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="compliance-modal-title"
      >
        {/* Header — draggable */}
        <div
          ref={headerRef}
          className="compliance-modal__drag-header"
          onMouseDown={handleMouseDownHeader}
          style={{ cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
        >
          <h2 id="compliance-modal-title" className="compliance-modal__modal-title">
            MCP Compliance Checklist
          </h2>
          <button
            type="button"
            className="compliance-modal__close-icon"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="compliance-modal__body" aria-live="polite" style={{ flex: 1, overflowY: 'auto', paddingRight: 8 }}>
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
                  const icon = step.status === 'done' ? '✅' : step.status === 'error' ? '❌' : isActive ? '⚙' : '○';
                  const applicableSteps = complianceStripState.complianceActionId
                    ? CHIP_APPLICABLE_STEPS?.[complianceStripState.complianceActionId] || []
                    : [];
                  const isApplicable = applicableSteps.includes(step.id);
                  const items = [];

                  if (step.id === 'olb-resource-token') {
                    items.push(
                      <li key="intent-delegation-badge" className="compliance-modal__group-badge">
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
                  if (
                    step.status === 'pending' &&
                    !isApplicable &&
                    complianceStripState?.complianceActionId &&
                    getStepSkipExplanation
                  ) {
                    items.push(
                      <li key={`${step.id}-skip-reason`} className="compliance-modal__skip-reason">
                        {getStepSkipExplanation(complianceStripState.complianceActionId, step.id)}
                      </li>,
                    );
                  }
                  return items;
                })}
              </ol>

              {(() => {
                if (!complianceStripState?.complianceActionId) return null;
                const applicable = CHIP_APPLICABLE_STEPS?.[complianceStripState.complianceActionId] || [];
                const skipped = complianceStripState.complianceSteps.filter(
                  (s) => s.status === 'pending' && !applicable.includes(s.id),
                );
                if (skipped.length === 0) return null;
                return (
                  <div className="compliance-modal__skip-note">
                    <strong>{skipped.length} step{skipped.length > 1 ? 's' : ''} not triggered</strong>
                    {' '}— gateway denial and HITL steps only fire on scope-upgrade or permission-required operations (e.g. Sensitive Account Details).
                  </div>
                );
              })()}
            </>
          )}

          {/* Footer */}
          <div className="compliance-modal__footer" style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8, marginTop: 8 }}>
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
          </div>
        </div>

        {/* Resize handle */}
        <button
          type="button"
          className="compliance-modal__resize-handle"
          onMouseDown={handleMouseDownResize}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              handleMouseDownResize(e);
            }
          }}
          style={{ cursor: isResizing ? 'nwse-resize' : 'pointer' }}
          aria-label="Resize modal"
        />
      </div>
    </div>
  );
}
