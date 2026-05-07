import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [resizeStart, setResizeStart] = useState({ mouseX: 0, mouseY: 0, posX: 0, posY: 0, width: 420, height: 600, side: null });
  const modalRef = useRef(null);
  const headerRef = useRef(null);
  const broadcastChannelRef = useRef(null);

  // Broadcast state to pop-out window when data changes
  useEffect(() => {
    try {
      if (!broadcastChannelRef.current) {
        broadcastChannelRef.current = new BroadcastChannel('compliance-modal');
      }
      broadcastChannelRef.current.postMessage({
        type: 'state-update',
        data: {
          complianceStripState,
          messages: messages.slice(-20),
        }
      });
    } catch (e) {
      console.warn('BroadcastChannel not supported:', e.message);
    }
  }, [complianceStripState, messages]);

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
    setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, posX: pos.x, posY: pos.y, width: size.width, height: size.height, side });
  };

  // Mouse move for drag/resize
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e) => {
      if (isDragging) {
        setPos({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
      }
      if (isResizing) {
        const deltaX = e.clientX - resizeStart.mouseX;
        const deltaY = e.clientY - resizeStart.mouseY;
        const side = resizeStart.side;

        let newWidth = resizeStart.width;
        let newHeight = resizeStart.height;
        let newX = resizeStart.posX;
        let newY = resizeStart.posY;

        // Handle horizontal resize
        if (side === 'left' || side === 'top-left' || side === 'bottom-left') {
          newWidth = Math.max(300, resizeStart.width - deltaX);
          newX = resizeStart.posX + resizeStart.width - newWidth;
        } else if (side === 'right' || side === 'top-right' || side === 'bottom-right') {
          newWidth = Math.max(300, resizeStart.width + deltaX);
        }

        // Handle vertical resize
        if (side === 'top' || side === 'top-left' || side === 'top-right') {
          newHeight = Math.max(250, resizeStart.height - deltaY);
          newY = resizeStart.posY + resizeStart.height - newHeight;
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

  return createPortal(
    <div
      ref={modalRef}
      className="compliance-modal"
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
      }}
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
          <div className="compliance-modal__header-buttons">
            <button
              type="button"
              className="compliance-modal__popout-icon"
              onClick={(e) => {
                e.stopPropagation();
                try {
                  sessionStorage.setItem('compliance_modal_popout', JSON.stringify({
                    complianceStripState,
                    messages: messages.slice(-20),
                  }));
                } catch (_) {}
                window.open('/compliance-modal-popout', 'ComplianceModalPopout', 'width=520,height=750,resizable=yes,scrollbars=yes');
                onClose();
              }}
              aria-label="Open in new window"
              title="Open modal in new window"
            >
              ⧉
            </button>
            <button
              type="button"
              className="compliance-modal__close-icon"
              onClick={onClose}
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <ComplianceModalContent
          complianceStripState={complianceStripState}
          messages={messages}
          onClearSteps={onClearSteps}
          CHIP_APPLICABLE_STEPS={CHIP_APPLICABLE_STEPS}
          getStepSkipExplanation={getStepSkipExplanation}
        />

        {/* Footer */}
        <div className="compliance-modal__footer">
          <button type="button" className="compliance-modal__close-btn" onClick={onClose}>
            Close
          </button>
        </div>

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
      </div>,
    document.body
  );
}
