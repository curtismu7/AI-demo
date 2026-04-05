// banking_api_ui/src/components/AgentFlowDiagramPanel.js
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDraggablePanel } from '../hooks/useDraggablePanel';
import { agentFlowDiagram } from '../services/agentFlowDiagramService';
import './AgentFlowDiagramPanel.css';

function statusBadge(status) {
  const labels = { pending: 'Waiting', active: 'In progress', done: 'Done', error: 'Issue' };
  const cls = `afd-badge afd-badge--${status}`;
  return <span className={cls}>{labels[status] || status}</span>;
}

/**
 * Floating, draggable, resizable live diagram: PingOne → Agent → BFF → MCP → tool.
 * State is driven by agentFlowDiagramService (bankingAgentService + BankingAgent).
 */
export default function AgentFlowDiagramPanel() {
  const [snap, setSnap] = useState(() => agentFlowDiagram.getState());

  const { pos, size, handleDragStart, handleResizeStart } = useDraggablePanel(
    () => ({
      x: Math.max(16, window.innerWidth - 420),
      y: Math.max(72, (window.innerHeight - 480) / 2),
    }),
    { w: 380, h: 440 }
  );

  useEffect(() => agentFlowDiagram.subscribe(setSnap), []);

  useEffect(() => {
    const onOpen = () => {
      agentFlowDiagram.open();
      if (!agentFlowDiagram.getState().steps?.length) {
        agentFlowDiagram.reset();
      }
    };
    window.addEventListener('agent-flow-diagram-open', onOpen);
    return () => window.removeEventListener('agent-flow-diagram-open', onOpen);
  }, []);

  const handleClose = useCallback(() => {
    agentFlowDiagram.close();
  }, []);

  useEffect(() => {
    if (!snap.visible) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [snap.visible, handleClose]);

  if (!snap.visible) return null;

  const { steps, hint, phase, toolName, serverEvents = [] } = snap;

  const panel = (
    <div
      className="afd-panel"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
      }}
      role="dialog"
      aria-modal="false"
      aria-labelledby="afd-title"
    >
      <div className="afd-header" onPointerDown={handleDragStart}>
        <span className="afd-header-icon" aria-hidden>
          🔀
        </span>
        <div className="afd-header-text">
          <h2 id="afd-title" className="afd-title">
            Agent request flow
          </h2>
          <span className="afd-subtitle">
            {phase === 'running' ? 'Live' : phase === 'done' ? 'Complete' : phase === 'error' ? 'Completed with errors' : 'Overview'}
            {toolName ? ` · ${toolName}` : ''}
          </span>
        </div>
        <div className="afd-header-actions">
          <button
            type="button"
            className="afd-btn"
            onClick={() => agentFlowDiagram.reset()}
            title="Clear diagram (keep panel open)"
            aria-label="Reset diagram"
          >
            ↺
          </button>
          <button type="button" className="afd-btn afd-btn--close" onClick={handleClose} title="Close" aria-label="Close">
            ×
          </button>
        </div>
      </div>

      <div className="afd-body">
        {hint && steps.length === 0 && <p className="afd-hint">{hint}</p>}
        {hint && steps.length > 0 && phase === 'idle' && <p className="afd-hint">{hint}</p>}
        {steps.length === 0 && !hint && <p className="afd-empty">Use the Banking Agent (e.g. My Accounts) — this panel updates on each MCP tool call.</p>}
        {steps.length > 0 && (
          <div className="afd-flow" aria-live="polite">
            {steps.map((step, i) => (
              <div key={step.id || i} className={`afd-step afd-step--${step.status}`}>
                <div className="afd-step-rail" aria-hidden>
                  <span className="afd-step-dot" />
                  {i < steps.length - 1 && <span className="afd-step-line" />}
                </div>
                <div className="afd-step-card">
                  <h3 className="afd-step-title">{step.title}</h3>
                  <p className="afd-step-detail">{step.detail}</p>
                  {statusBadge(step.status)}
                </div>
              </div>
            ))}
          </div>
        )}
        {serverEvents.length > 0 && (
          <div className="afd-sse-block" aria-live="polite">
            <h3 className="afd-sse-title">Live server phases (SSE)</h3>
            <ul className="afd-sse-list">
              {serverEvents.map((ev, idx) => (
                <li key={`${ev.phase}-${ev.t || idx}-${idx}`} className="afd-sse-row">
                  <span className="afd-sse-label">{ev.label}</span>
                  <span className="afd-sse-detail">{ev.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="afd-resize-grip" onMouseDown={handleResizeStart} title="Resize" aria-hidden />
    </div>
  );

  return createPortal(panel, document.body);
}
