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
  const [size, setSize] = useState({ width: 420, height: 600 });
  const [pos, setPos] = useState({ x: 20, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 420, height: 600, side: null });
  const modalRef = useRef(null);
  const headerRef = useRef(null);

  // Drag handler
  const handleMouseDownHeader = (e) => {
    if (e.target.closest('button')) return; // Don't drag if clicking button
    setIsDragging(true);
    setDragStart({ x: e.clientX - pos.x, y: e.clientY - pos.y });
  };

  // Resize handler for all sides
  const handleMouseDownResize = (e, side) => {
    e.preventDefault();
    setIsResizing(true);
    setResizeStart({ x: e.clientX, y: e.clientY, width: size.width, height: size.height, side });
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
        const side = resizeStart.side;

        let newWidth = resizeStart.width;
        let newHeight = resizeStart.height;
        let newX = resizeStart.x;
        let newY = resizeStart.y;

        // Handle horizontal resize
        if (side === 'left' || side === 'top-left' || side === 'bottom-left') {
          newWidth = Math.max(300, resizeStart.width - deltaX);
          newX = resizeStart.x + resizeStart.width - newWidth;
        } else if (side === 'right' || side === 'top-right' || side === 'bottom-right') {
          newWidth = Math.max(300, resizeStart.width + deltaX);
        }

        // Handle vertical resize
        if (side === 'top' || side === 'top-left' || side === 'top-right') {
          newHeight = Math.max(250, resizeStart.height - deltaY);
          newY = resizeStart.y + resizeStart.height - newHeight;
        } else if (side === 'bottom' || side === 'bottom-left' || side === 'bottom-right') {
          newHeight = Math.max(250, resizeStart.height + deltaY);
        }

        setSize({ width: newWidth, height: newHeight });
        setPos({ x: newX, y: newY });
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

        {/* Resize handles — all sides and corners */}
        {['top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'].map((side) => {
          const cursorMap = {
            'top': 'ns-resize',
            'bottom': 'ns-resize',
            'left': 'ew-resize',
            'right': 'ew-resize',
            'top-left': 'nwse-resize',
            'top-right': 'nesw-resize',
            'bottom-left': 'nesw-resize',
            'bottom-right': 'nwse-resize',
          };
          return (
            <button
              key={side}
              type="button"
              className={`compliance-modal__resize-handle compliance-modal__resize-handle--${side}`}
              onMouseDown={(e) => handleMouseDownResize(e, side)}
              style={{ cursor: isResizing ? cursorMap[side] : 'pointer' }}
              aria-label={`Resize modal from ${side}`}
            />
          );
        })}
      </div>
    </div>
  );
}
