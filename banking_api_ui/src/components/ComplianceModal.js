import React, { useEffect, useRef, useState } from 'react';
import './ComplianceModal.css';
import ComplianceModalContent from './ComplianceModalContent';

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
        <ComplianceModalContent
          complianceStripState={complianceStripState}
          messages={messages}
          onClearSteps={onClearSteps}
          CHIP_APPLICABLE_STEPS={CHIP_APPLICABLE_STEPS}
          getStepSkipExplanation={getStepSkipExplanation}
        />

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
