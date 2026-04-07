// banking_api_ui/src/components/agent/ResponsiveAgentDock.js
import React, { useState, useEffect, useRef } from 'react';
import './AgentLayout.css';

/**
 * Responsive agent dock that adapts to different screen sizes and layouts
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Agent content
 * @param {'bottom'|'side'|'floating'|'inline'} props.placement - Dock placement
 * @param {boolean} props.isOpen - Whether dock is open
 * @param {Function} props.onClose - Callback when dock is closed
 * @param {boolean} props.collapsible - Whether dock can be collapsed
 * @param {boolean} props.resizable - Whether dock can be resized
 * @param {number} props.defaultHeight - Default height for bottom placement
 * @param {number} props.defaultWidth - Default width for side placement
 */
export default function ResponsiveAgentDock({
  children,
  placement = 'bottom',
  isOpen = true,
  onClose,
  collapsible = true,
  resizable = true,
  defaultHeight = 400,
  defaultWidth = 400,
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [dimensions, setDimensions] = useState({ 
    width: defaultWidth, 
    height: defaultHeight 
  });
  const [isResizing, setIsResizing] = useState(false);
  const [screenSize, setScreenSize] = useState('desktop');
  const dockRef = useRef(null);
  const resizeHandleRef = useRef(null);

  // Determine screen size based on window width
  useEffect(() => {
    const updateScreenSize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setScreenSize('mobile');
      } else if (width < 1024) {
        setScreenSize('tablet');
      } else {
        setScreenSize('desktop');
      }
    };

    updateScreenSize();
    window.addEventListener('resize', updateScreenSize);
    return () => window.removeEventListener('resize', updateScreenSize);
  }, []);

  // Auto-adjust placement based on screen size
  const getEffectivePlacement = () => {
    if (screenSize === 'mobile') {
      return 'floating'; // Mobile always uses floating overlay
    }
    if (screenSize === 'tablet' && placement === 'side') {
      return 'bottom'; // Tablets prefer bottom placement
    }
    return placement;
  };

  // Handle resize functionality
  const handleResizeStart = (e) => {
    if (!resizable) return;
    
    setIsResizing(true);
    e.preventDefault();
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = dimensions.width;
    const startHeight = dimensions.height;

    const handleMouseMove = (moveEvent) => {
      if (!isResizing) return;

      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      if (getEffectivePlacement() === 'side') {
        const newWidth = Math.max(300, Math.min(800, startWidth + deltaX));
        setDimensions(prev => ({ ...prev, width: newWidth }));
      } else {
        const newHeight = Math.max(200, Math.min(window.innerHeight * 0.8, startHeight - deltaY));
        setDimensions(prev => ({ ...prev, height: newHeight }));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && onClose) {
      onClose();
    }
  };

  const effectivePlacement = getEffectivePlacement();
  const dockClasses = `agent-dock agent-dock-${effectivePlacement} ${isCollapsed ? 'agent-dock-collapsed' : ''} ${isResizing ? 'agent-dock-resizing' : ''}`;

  // Render different layouts based on placement
  const renderDock = () => {
    const commonProps = {
      className: dockClasses,
      ref: dockRef,
      onKeyDown: handleKeyDown,
      style: {
        ...(effectivePlacement === 'side' && { width: isCollapsed ? 60 : dimensions.width }),
        ...(effectivePlacement === 'bottom' && { height: isCollapsed ? 60 : dimensions.height }),
      },
    };

    if (effectivePlacement === 'floating') {
      return (
        <div {...commonProps} className={`${dockClasses} agent-dock-floating`}>
          <div className="agent-dock-content">
            {isCollapsed ? renderCollapsedContent() : children}
          </div>
          {renderControls()}
        </div>
      );
    }

    return (
      <div {...commonProps}>
        <div className="agent-dock-content">
          {isCollapsed ? renderCollapsedContent() : children}
        </div>
        {renderControls()}
        {renderResizeHandle()}
      </div>
    );
  };

  const renderCollapsedContent = () => (
    <div className="agent-dock-collapsed-content">
      <button
        className="agent-dock-expand-btn"
        onClick={() => setIsCollapsed(false)}
        aria-label="Expand agent dock"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    </div>
  );

  const renderControls = () => (
    <div className="agent-dock-controls">
      {collapsible && (
        <button
          className="agent-dock-control-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {isCollapsed ? (
              <path d="m9 18 6-6-6-6" />
            ) : (
              <path d="m15 18-6-6 6-6" />
            )}
          </svg>
        </button>
      )}
      
      {onClose && (
        <button
          className="agent-dock-control-btn"
          onClick={onClose}
          aria-label="Close agent dock"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );

  const renderResizeHandle = () => {
    if (!resizable) return null;

    const handleClasses = `agent-dock-resize-handle agent-dock-resize-${effectivePlacement}`;
    
    return (
      <div
        ref={resizeHandleRef}
        className={handleClasses}
        onMouseDown={handleResizeStart}
        aria-label="Resize dock"
      >
        <div className="agent-dock-resize-grip">
          <div className="agent-dock-resize-line" />
          <div className="agent-dock-resize-line" />
          <div className="agent-dock-resize-line" />
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="agent-dock-wrapper">
      {renderDock()}
      {/* Backdrop for mobile floating mode */}
      {effectivePlacement === 'floating' && (
        <div 
          className="agent-dock-backdrop" 
          onClick={onClose}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
