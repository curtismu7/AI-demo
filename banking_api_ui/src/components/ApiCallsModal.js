// banking_api_ui/src/components/ApiCallsModal.js
import React from 'react';
import ApiCallDisplay from './ApiCallDisplay';
import { useDraggablePanel } from '../hooks/useDraggablePanel';
import '../styles/draggablePanel.css';

export default function ApiCallsModal({ open, onClose }) {
  const { pos, size, handleDragStart, createResizeHandler } = useDraggablePanel(
    () => ({
      x: Math.max(20, (window.innerWidth - 700) / 2),
      y: Math.max(20, (window.innerHeight - 500) / 2),
    }),
    { w: 700, h: 500 },
    { storageKey: 'api-calls-modal' }
  );

  if (!open) return null;

  return (
    <div
      className="transaction-consent-popup-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="drp-panel"
        style={{
          position: 'fixed',
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          width: `${size.w}px`,
          height: `${size.h}px`,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-calls-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Draggable header */}
        <div
          className="drp-header"
          onMouseDown={handleDragStart}
          style={{
            padding: '1rem',
            cursor: 'move',
            borderBottom: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
            borderRadius: '0.5rem 0.5rem 0 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 id="api-calls-modal-title" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
            API Calls
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#64748b',
              padding: '0 0.5rem',
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1rem', overflow: 'auto', height: 'calc(100% - 60px)' }}>
          <ApiCallDisplay sessionId="dashboard" />
        </div>

        {/* 8-direction resize handles */}
        <div className="drp-resize-handles">
          <div className="drp-resize-handle drp-resize-handle--nw" onMouseDown={createResizeHandler('nw')} aria-hidden title="Resize from top-left" />
          <div className="drp-resize-handle drp-resize-handle--ne" onMouseDown={createResizeHandler('ne')} aria-hidden title="Resize from top-right" />
          <div className="drp-resize-handle drp-resize-handle--sw" onMouseDown={createResizeHandler('sw')} aria-hidden title="Resize from bottom-left" />
          <div className="drp-resize-handle drp-resize-handle--se" onMouseDown={createResizeHandler('se')} aria-hidden title="Resize from bottom-right" />
          <div className="drp-resize-handle drp-resize-handle--n" onMouseDown={createResizeHandler('n')} aria-hidden title="Resize from top" />
          <div className="drp-resize-handle drp-resize-handle--s" onMouseDown={createResizeHandler('s')} aria-hidden title="Resize from bottom" />
          <div className="drp-resize-handle drp-resize-handle--e" onMouseDown={createResizeHandler('e')} aria-hidden title="Resize from right" />
          <div className="drp-resize-handle drp-resize-handle--w" onMouseDown={createResizeHandler('w')} aria-hidden title="Resize from left" />
        </div>
      </div>
    </div>
  );
}
