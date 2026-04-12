// banking_api_ui/src/components/AgentFlowDiagramPanel.js
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDraggablePanel } from '../hooks/useDraggablePanel';
import { agentFlowDiagram } from '../services/agentFlowDiagramService';
import { useExchangeMode } from '../context/ExchangeModeContext';
import { useEducationUIOptional } from '../context/EducationUIContext';
import TokenExchangeFlowDiagram from './TokenExchangeFlowDiagram';
import './AgentFlowDiagramPanel.css';

function statusBadge(status) {
  const labels = { pending: 'Waiting', active: 'In progress', done: 'Done', error: 'Issue' };
  const cls = `afd-badge afd-badge--${status}`;
  return <span className={cls}>{labels[status] || status}</span>;
}

// Token chain display component
function TokenChainDisplay({ tokenChain, compact = false }) {
  if (!tokenChain || tokenChain.length === 0) return null;
  
  const currentTokens = tokenChain.filter(t => t.eventType === 'auth' || t.eventType === 'exchange');
  
  if (compact) {
    return (
      <div className="afd-token-chain-compact">
        {currentTokens.slice(0, 2).map((token, i) => (
          <div key={token.id} className="afd-token-mini">
            <span className={`afd-token-type afd-token-type--${token.tokenType}`}>
              {token.tokenType?.replace('_', ' ').toUpperCase() || 'TOKEN'}
            </span>
            {token.tokenSub && (
              <span className="afd-token-user">👤 {token.tokenSub.slice(0, 8)}...</span>
            )}
          </div>
        ))}
        {currentTokens.length > 2 && (
          <span className="afd-token-more">+{currentTokens.length - 2}</span>
        )}
      </div>
    );
  }
  
  return (
    <div className="afd-token-chain">
      <div className="afd-token-chain-header">
        <h4>Current Token Chain</h4>
      </div>
      {currentTokens.map((token) => (
        <div key={token.id} className="afd-token-event">
          <div className="afd-token-meta">
            <span className={`afd-token-type afd-token-type--${token.tokenType}`}>
              {token.tokenType?.replace('_', ' ').toUpperCase() || 'TOKEN'}
            </span>
            <span className="afd-token-time">
              {new Date(token.timestamp).toLocaleTimeString()}
            </span>
          </div>
          {token.tokenSub && (
            <div className="afd-token-claim">
              User ID: <code>{token.tokenSub}</code>
            </div>
          )}
          {token.tokenAct && (
            <div className="afd-token-claim">
              Agent: <code>{token.tokenAct.client_id}</code>
            </div>
          )}
          {token.scopes && token.scopes.length > 0 && (
            <div className="afd-token-scopes">
              Scopes: {token.scopes.join(', ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Floating, draggable, resizable live diagram: PingOne → Agent → BFF → MCP → tool.
 * State is driven by agentFlowDiagramService (bankingAgentService + BankingAgent).
 */
export default function AgentFlowDiagramPanel() {
  const [snap, setSnap] = useState(() => agentFlowDiagram.getState());
  const [tokenChain, setTokenChain] = useState([]);
  const [showTokenChain, setShowTokenChain] = useState(false);
  const [showFlowDiagram, setShowFlowDiagram] = useState(false);
  const { mode } = useExchangeMode();
  const edu = useEducationUIOptional();

  const { pos, size, handleDragStart, handleResizeStart } = useDraggablePanel(
    () => ({
      x: Math.max(16, window.innerWidth - 420),
      y: Math.max(72, (window.innerHeight - 480) / 2),
    }),
    { w: 380, h: 440 }
  );

  // Load token chain data
  const loadTokenChain = useCallback(async () => {
    try {
      const res = await fetch('/api/token-chain/current', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTokenChain(data.currentTokens || []);
      }
    } catch (err) {
      console.error('Failed to load token chain:', err);
    }
  }, []);

  useEffect(() => {
    const unsub = agentFlowDiagram.subscribe(setSnap);
    return unsub;
  }, []);

  // Load token chain when agent flow becomes visible
  useEffect(() => {
    if (snap.visible) {
      loadTokenChain();
      setShowTokenChain(true);
    }
  }, [snap.visible, loadTokenChain]);

  // Refresh token chain whenever a tool call completes
  useEffect(() => {
    const onAgentResult = () => {
      if (agentFlowDiagram.getState().visible) {
        loadTokenChain();
      }
    };
    window.addEventListener('banking-agent-result', onAgentResult);
    return () => window.removeEventListener('banking-agent-result', onAgentResult);
  }, [loadTokenChain]);

  // Also poll every 3s while panel is visible so step transitions update the chain
  useEffect(() => {
    if (!snap.visible) return undefined;
    const id = setInterval(loadTokenChain, 3000);
    return () => clearInterval(id);
  }, [snap.visible, loadTokenChain]);

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

        {/* Token Exchange Flow Diagram — collapsible */}
        <div className="afd-flow-section">
          <div className="afd-flow-section-header">
            <span className="afd-flow-section-title">
              {mode === 'double' ? '2-Exchange Flow (RFC 8693 §4)' : '1-Exchange Flow (RFC 8693 §2.1)'}
            </span>
            <button
              type="button"
              className="afd-token-toggle"
              onClick={() => setShowFlowDiagram(v => !v)}
              aria-expanded={showFlowDiagram}
            >
              {showFlowDiagram ? 'Hide' : 'Show'}
            </button>
          </div>
          {showFlowDiagram && (
            <TokenExchangeFlowDiagram
              mode={mode}
              className="afd-flow-diagram"
              onEducation={panelId => edu && edu.open(panelId)}
            />
          )}
        </div>
        
        {/* Token chain display */}
        {showTokenChain && (
          <div className="afd-token-section">
            <div className="afd-token-header">
              <span>Token Chain ({tokenChain.length})</span>
              <button
                type="button"
                className="afd-token-toggle"
                onClick={() => setShowTokenChain(!showTokenChain)}
              >
                {showTokenChain ? 'Hide' : 'Show'}
              </button>
            </div>
            <TokenChainDisplay tokenChain={tokenChain} compact={true} />
          </div>
        )}
        
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
