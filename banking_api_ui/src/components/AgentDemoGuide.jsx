/**
 * @file AgentDemoGuide.jsx
 *
 * Interactive demo guide for Banking Agent compliance flows.
 * Maps real agent request scenarios to the 12 compliance verification steps:
 *
 * 1. agent-llm-reasoning — Natural language intent parsing
 * 2. agent-token-init — User OAuth token acquisition
 * 3. gw-scope-map — Gateway scope validation
 * 4. agent-scope-aware-cache — Caching by scope + audience
 * 5. olb-resource-token — RFC 8693 token exchange
 * 6. gw-denial-metadata — Gateway rejection signals (scope/audience/policy)
 * 7. gw-hitl-challenge-type — Gateway HITL/step-up signal
 * 8. bff-response-shape — BFF response formatting
 * 9. ui-gateway-consent — Consent modal in UI
 * 10. ui-auto-refire — Operation re-fired after consent
 * 11. agent-error-propagation — Error handling
 * 12. claim-diagnostics — Token claim analysis
 *
 * Usage: Click "📚 Agent Demo Guide" to open this window.
 * Reference: See /architecture/flow for live compliance flow diagram.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import './AgentDemoGuide.css';

const ALL_12_STEPS = [
  'agent-llm-reasoning',
  'agent-token-init',
  'gw-scope-map',
  'agent-scope-aware-cache',
  'olb-resource-token',
  'gw-denial-metadata',
  'gw-hitl-challenge-type',
  'bff-response-shape',
  'ui-gateway-consent',
  'ui-auto-refire',
  'agent-error-propagation',
  'claim-diagnostics',
];

const STEP_LABELS = {
  'agent-llm-reasoning': '1. LLM Intent Reasoning',
  'agent-token-init': '2. Token Initialization',
  'gw-scope-map': '3. Gateway Scope Mapping',
  'agent-scope-aware-cache': '4. Scope-Aware Caching',
  'olb-resource-token': '5. Resource Token Exchange',
  'gw-denial-metadata': '6. Gateway Denial Metadata',
  'gw-hitl-challenge-type': '7. HITL Challenge Type',
  'bff-response-shape': '8. BFF Response Shape',
  'ui-gateway-consent': '9. UI Consent Modal',
  'ui-auto-refire': '10. Auto-Refire',
  'agent-error-propagation': '11. Error Propagation',
  'claim-diagnostics': '12. Claim Diagnostics',
};

const DEMO_SCENARIOS = [
  {
    id: 'read-only',
    title: '1️⃣ Read-Only Scope (Simple Path)',
    description: 'Basic read operation: "What accounts do I have?" — exercises only token init and caching.',
    applicableSteps: [
      'agent-llm-reasoning',
      'agent-token-init',
      'gw-scope-map',
      'agent-scope-aware-cache',
      'claim-diagnostics',
    ],
    steps: [
      {
        action: 'Send this prompt:',
        prompt: '"What accounts do I have?"',
        explanation: 'Agent: (1) Parses NL → get_my_accounts intent. (2) Gets your user token (banking:read scope). (3) Calls BFF /api/accounts/my. (4) No token exchange needed—scope is sufficient. (5) Returns account list.',
        watch: [
          '✅ Compliance: Steps 1-4 complete (no exchange needed)',
          'Token Chain: Shows 1 user token (banking:read)',
          'Notice: No "exchange-required" event',
          'Agent response displays accounts immediately',
        ],
      },
    ],
  },
  {
    id: 'scope-denial',
    title: '2️⃣ Scope Denial (403 + Denial Metadata)',
    description: 'Write attempt without scope: "Transfer $50" → 403 rejection. Gateway returns required_scopes.',
    applicableSteps: [
      'agent-llm-reasoning',
      'agent-token-init',
      'agent-scope-aware-cache',
      'gw-denial-metadata',
      'agent-error-propagation',
    ],
    steps: [
      {
        action: 'Send this prompt:',
        prompt: '"Transfer $50 from checking to savings"',
        explanation: 'Agent: (1) Parses → create_transfer intent. (2) Tries BFF /api/banking-agent/message with banking:read token. (3) Gateway rejects: 403 "missing_exchange_scopes". (4) Response includes required_scopes: ["banking:write"]. (5) Agent shows error with metadata.',
        watch: [
          '✅ Compliance: Steps 1-2, then denial via step 6',
          'Error shows: required_scopes=[banking:write]',
          'Token Chain: Denial event with metadata',
          'Compliance panel: Shows steps 1-2 only (stops at denial)',
        ],
      },
      {
        action: 'OR click test chip:',
        prompt: '"🧪 Test Wrong Scope" (Testing group)',
        explanation: 'Deliberately tests scope denial path. Makes request with banking:admin scope (not authorized). Gateway returns 403 with required_scopes metadata.',
        watch: [
          '✅ Demonstrates: scope denial + metadata capture',
          'Shows RFC 6749 §3.3 scope enforcement',
        ],
      },
    ],
  },
  {
    id: 'token-exchange',
    title: '3️⃣ Token Exchange (RFC 8693 — Full 5-Step Exchange)',
    description: 'After scope denial, agent negotiates new token with write scope. Exercises RFC 8693.',
    applicableSteps: [
      'agent-llm-reasoning',
      'agent-token-init',
      'agent-scope-aware-cache',
      'gw-scope-map',
      'olb-resource-token',
      'gw-denial-metadata',
      'bff-response-shape',
      'agent-error-propagation',
      'claim-diagnostics',
    ],
    steps: [
      {
        action: 'First, enable exchange:',
        prompt: 'Admin → "🎛 Demo Config" → toggle "🔐 MCP Token Exchange" ON',
        explanation: 'This enables the gateway to perform RFC 8693 token exchange. Without it, scope denial is fatal.',
        watch: [],
      },
      {
        action: 'Then send:',
        prompt: '"Transfer $50 from checking to savings"',
        explanation: 'Agent: (1) Parses → create_transfer. (2) Sends with banking:read token. (3) Gateway rejects: 403. (4) Agent initiates RFC 8693 exchange (step 5). (5) New token issued with banking:write. (6) Agent retries with new token. (7) BFF processes transfer (success or next gate).',
        watch: [
          '✅ Compliance: All 9 steps exercised',
          'Token Chain: 3 events (user token → exchange request → new MCP token)',
          'Shows Hop 0→1→2: user → gateway delegated → backend',
          'aud claim changes: user → MCP server audience',
          'Compliance panel: Steps 1-5 complete, then continues',
        ],
      },
    ],
  },
  {
    id: 'authorize-denial',
    title: '4️⃣ PingOne Authorize Denial (Policy Gate)',
    description: 'Token exchange succeeds, but Authorize policy blocks it. Separate from scope.',
    applicableSteps: [
      'agent-llm-reasoning',
      'agent-token-init',
      'agent-scope-aware-cache',
      'olb-resource-token',
      'gw-scope-map',
      'gw-denial-metadata',
      'agent-error-propagation',
      'claim-diagnostics',
    ],
    steps: [
      {
        action: 'Setup (admin):',
        prompt: 'Go to "⚖️ Authz Test" → Create policy: banking:write → DENY',
        explanation: 'Creates a PingOne Authorize policy that blocks write operations, even with correct scope/token.',
        watch: [],
      },
      {
        action: 'Then send:',
        prompt: '"Transfer $50 from checking to savings"',
        explanation: 'Agent: (1-5) Token exchange succeeds (has write scope). (6) BFF calls PingOne Authorize. (7) Policy returns DENY (step 7). (8) BFF rejects with authorization_failed. (9) Agent shows error.',
        watch: [
          '✅ Compliance: Token exchange succeeds, but policy gate blocks',
          'Notice: Not a 403 scope error—token is valid',
          'Token Chain: Shows full exchange + Authorize decision',
          'Error message: authorization_failed (vs. missing_scopes)',
          'Demonstrate: Scopes ≠ Policies (independent gates)',
        ],
      },
    ],
  },
  {
    id: 'hitl-gate',
    title: '5️⃣ HITL Consent Gate (> $250)',
    description: 'High-value transfer requires explicit user consent. $99,999.99 triggers consent modal.',
    applicableSteps: [
      'agent-llm-reasoning',
      'agent-token-init',
      'agent-scope-aware-cache',
      'olb-resource-token',
      'gw-scope-map',
      'gw-denial-metadata',
      'gw-hitl-challenge-type',
      'bff-response-shape',
      'ui-gateway-consent',
      'ui-auto-refire',
      'claim-diagnostics',
    ],
    steps: [
      {
        action: 'Click test chip:',
        prompt: '"🔐 Test HITL Transfer" (Testing group)',
        explanation: 'Sends real $99,999.99 transfer. Amount > $250 threshold triggers HITL (Human-in-the-Loop) consent gate.',
        watch: [
          '✅ Compliance: All 11 steps (skips step 12 error propagation)',
          'Step 7: Gateway signals consent_challenge_required',
          'Step 9: UI shows AgentConsentModal',
          'User approves consent + enters OTP',
          'Step 10: Auto-refire with consentChallengeId',
          'Transfer completes after consent verified',
        ],
      },
      {
        action: 'OR try:',
        prompt: '"Transfer $500 from checking to savings"',
        explanation: 'Any amount > $250 triggers HITL. The consent modal appears with the threshold amount displayed.',
        watch: [
          'Consent challenge: "Transactions over $250 require approval"',
          'After approval: MFA may trigger (if amount > $500)',
        ],
      },
    ],
  },
  {
    id: 'step-up',
    title: '6️⃣ Step-Up MFA (RFC 9470 — > $500)',
    description: 'Sensitive operations require re-authentication. RFC 9470 step-up challenge.',
    applicableSteps: [
      'agent-llm-reasoning',
      'agent-token-init',
      'agent-scope-aware-cache',
      'olb-resource-token',
      'gw-scope-map',
      'gw-denial-metadata',
      'gw-hitl-challenge-type',
      'bff-response-shape',
      'ui-gateway-consent',
      'agent-error-propagation',
      'claim-diagnostics',
    ],
    steps: [
      {
        action: 'Click test chip:',
        prompt: '"📱 Test OTP Required" (Testing group)',
        explanation: 'Requests sensitive account details (full routing numbers). Triggers step-up MFA (RFC 9470 acr challenge).',
        watch: [
          '✅ Compliance: Token exchange (step 5) + step-up gate (step 7)',
          'Step 7: Gateway signals step_up_required (not consent)',
          'UI: Shows OtpStepUpModal (not consent modal)',
          'User: Enters OTP code from email',
          'After MFA verified: Returns account details',
          'Notice: Step-up is auth challenge (not approval)',
        ],
      },
      {
        action: 'OR try:',
        prompt: '"Show me my full account details with routing numbers"',
        explanation: 'Requests banking:sensitive:read. Requires banking:sensitive:read scope + step-up MFA.',
        watch: [
          'Token exchange: Gets banking:sensitive:read scope',
          'Then: Step-up MFA challenge appears',
          'After: Sensitive data displayed',
        ],
      },
    ],
  },
  {
    id: 'full-flow',
    title: '🔥 Full Compliance (All 12 Steps)',
    description: 'Ultimate demo: $99,999.99 transfer. Token exchange → Authorize → HITL → MFA.',
    applicableSteps: ALL_12_STEPS,
    steps: [
      {
        action: 'Click:',
        prompt: '"🔥 Full Compliance (12 Steps)" (Testing group)',
        explanation: 'Sends $99,999.99 transfer. Amount triggers HITL (step 7), then MFA (>$500). Exercises all 12 steps end-to-end.',
        watch: [
          '✅ ALL 12 STEPS light up in compliance panel',
          'Token Chain: Full exchange shown',
          'Consent modal: Approve consent',
          'MFA modal: Enter OTP code',
          'Transfer: Completes after both gates pass',
          'See: How each step flows into the next',
          'Reference: /architecture/flow diagram matches live execution',
        ],
      },
    ],
  },
];

export default function AgentDemoGuide({ onClose, initialActiveScenario, initialExpandedSteps, isPopout }) {
  const [activeScenario, setActiveScenario] = useState(initialActiveScenario || 'read-only');
  const [expandedSteps, setExpandedSteps] = useState(initialExpandedSteps || {});
  const [copiedStepId, setCopiedStepId] = useState(null);
  const [size, setSize] = useState({ width: 1000, height: 750 });
  const [pos, setPos] = useState({ x: 20, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ mouseX: 0, mouseY: 0, posX: 0, posY: 0, width: 1000, height: 750, side: null });
  const modalRef = useRef(null);
  const headerRef = useRef(null);
  const broadcastChannelRef = useRef(null);

  const current = DEMO_SCENARIOS.find((s) => s.id === activeScenario);
  const currentIndex = DEMO_SCENARIOS.findIndex((s) => s.id === activeScenario);

  const handlePrevious = () => {
    if (currentIndex > 0) {
      const prevScenario = DEMO_SCENARIOS[currentIndex - 1];
      setActiveScenario(prevScenario.id);
      setExpandedSteps({});
    }
  };

  const handleNext = () => {
    if (currentIndex < DEMO_SCENARIOS.length - 1) {
      const nextScenario = DEMO_SCENARIOS[currentIndex + 1];
      setActiveScenario(nextScenario.id);
      setExpandedSteps({});
    }
  };

  // Broadcast state to pop-out window when data changes
  useEffect(() => {
    try {
      if (!broadcastChannelRef.current) {
        broadcastChannelRef.current = new BroadcastChannel('demo-guide-modal');
      }
      broadcastChannelRef.current.postMessage({
        type: 'state-update',
        data: {
          activeScenario,
          expandedSteps,
        }
      });
    } catch (e) {
      console.warn('BroadcastChannel not supported:', e.message);
    }
  }, [activeScenario, expandedSteps]);

  // Drag handler
  const handleMouseDownHeader = (e) => {
    if (e.target.closest('button')) return;
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

        if (side === 'left' || side === 'top-left' || side === 'bottom-left') {
          newWidth = Math.max(600, resizeStart.width - deltaX);
          newX = resizeStart.posX + resizeStart.width - newWidth;
        } else if (side === 'right' || side === 'top-right' || side === 'bottom-right') {
          newWidth = Math.max(600, resizeStart.width + deltaX);
        }

        if (side === 'top' || side === 'top-left' || side === 'top-right') {
          newHeight = Math.max(500, resizeStart.height - deltaY);
          newY = resizeStart.posY + resizeStart.height - newHeight;
        } else if (side === 'bottom' || side === 'bottom-left' || side === 'bottom-right') {
          newHeight = Math.max(500, resizeStart.height + deltaY);
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

  const toggleStepExpanded = (stepIndex) => {
    setExpandedSteps((prev) => ({
      ...prev,
      [stepIndex]: !prev[stepIndex],
    }));
  };

  const navigate = useNavigate();

  const handleCopyPrompt = (prompt, stepId) => {
    navigator.clipboard.writeText(prompt);
    setCopiedStepId(stepId);
    setTimeout(() => setCopiedStepId(null), 2000);
  };

  const handleSetupClick = (setupPrompt) => {
    if (setupPrompt.includes('Authz Test')) {
      navigate('/authz-test');
    } else if (setupPrompt.includes('Demo Config')) {
      navigate('/admin');
    }
  };

  return createPortal(
    <>
      <div className="agent-demo-guide-overlay" />
      <div
        ref={modalRef}
        className="agent-demo-guide-modal"
        style={{
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          width: `${size.width}px`,
          height: `${size.height}px`,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="adg-modal-title"
      >
        {/* Header — draggable */}
        <div
          ref={headerRef}
          className="adg-drag-header"
          onMouseDown={handleMouseDownHeader}
          style={{ cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
        >
          <h2 id="adg-modal-title" className="adg-modal-title">
            📚 Banking Agent Demo Guide
          </h2>
          <div className="compliance-modal__header-buttons">
            <button
              type="button"
              className="adg-popout-btn"
              onClick={(e) => {
                e.stopPropagation();
                try {
                  sessionStorage.setItem('demo_guide_modal_popout', JSON.stringify({
                    activeScenario,
                    expandedSteps,
                  }));
                } catch (_) {}
                window.open('/demo-guide-popout', 'DemoGuidePopout', 'width=1150,height=800,resizable=yes,scrollbars=yes');
                onClose();
              }}
              aria-label="Open in new window"
              title="Open modal in new window"
            >
              ⧉
            </button>
            <button
              type="button"
              className="adg-close-btn"
              onClick={onClose}
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Header info */}
        <div className="adg-header">
          <p className="adg-tagline">Real request scenarios mapped to 12 compliance steps. See /architecture/flow for live diagram.</p>
        </div>

        <div className="adg-container">
          {/* Sidebar: Scenario list */}
          <div className="adg-sidebar">
            <div className="adg-sidebar-title">Scenarios</div>
            {DEMO_SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                className={`adg-scenario-btn ${activeScenario === scenario.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveScenario(scenario.id);
                  setExpandedSteps({});
                }}
              >
                {scenario.title}
              </button>
            ))}
          </div>

          {/* Main: Scenario detail */}
          <div className="adg-main">
            {current && (
              <>
                <div className="adg-scenario-header">
                  <h2>{current.title}</h2>
                  <p className="adg-description">{current.description}</p>

                  {/* Show applicable steps */}
                  <div className="adg-applicable-steps">
                    <div className="adg-steps-label">Exercises steps:</div>
                    <div className="adg-steps-list">
                      {current.applicableSteps.map((stepId) => (
                        <span key={stepId} className="adg-step-badge">
                          {STEP_LABELS[stepId]}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="adg-steps">
                  {current.steps.map((step, idx) => (
                    <div key={idx} className="adg-step">
                      <button
                        type="button"
                        className="adg-step-header"
                        onClick={() => toggleStepExpanded(idx)}
                      >
                        <span className="adg-step-toggle">
                          {expandedSteps[idx] ? '▼' : '▶'}
                        </span>
                        <span className="adg-step-action">{step.action}</span>
                        {step.prompt && (
                          <code className="adg-prompt-preview">{step.prompt}</code>
                        )}
                      </button>

                      {expandedSteps[idx] && (
                        <div className="adg-step-content">
                          <div className="adg-explanation">
                            <strong>What happens:</strong>
                            <p>{step.explanation}</p>
                          </div>

                          {step.prompt && (
                            <div className="adg-prompt-box">
                              <div className="adg-prompt-label">
                                💬 Copy & paste:
                                {copiedStepId === `${activeScenario}-${idx}` && (
                                  <span className="adg-copy-checkmark">✓ Copied!</span>
                                )}
                              </div>
                              <code className="adg-prompt-code">{step.prompt}</code>
                              <button
                                type="button"
                                className="adg-copy-btn"
                                onClick={() => handleCopyPrompt(step.prompt, `${activeScenario}-${idx}`)}
                              >
                                {copiedStepId === `${activeScenario}-${idx}` ? '✓' : '📋 Copy'}
                              </button>
                              {step.action.includes('Setup') && (
                                <button
                                  type="button"
                                  className="adg-setup-btn"
                                  onClick={() => handleSetupClick(step.prompt)}
                                >
                                  🔗 Go to Setup
                                </button>
                              )}
                            </div>
                          )}

                          {step.watch.length > 0 && (
                            <div className="adg-watch-box">
                              <div className="adg-watch-label">👀 Watch for:</div>
                              <ul className="adg-watch-list">
                                {step.watch.map((item, i) => (
                                  <li key={i}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Footer: Tips */}
                <div className="adg-footer">
                  <div className="adg-tips">
                    <strong>💡 Pro Tips:</strong>
                    <ul>
                      <li>Open Token Chain panel (right sidebar) to watch token events live</li>
                      <li>Compliance panel (below messages) shows which steps are active</li>
                      <li>Follow scenarios top-to-bottom to understand the story</li>
                      <li>Reference: <a href="/architecture/flow" target="_blank" rel="noopener noreferrer">/architecture/flow</a> shows live compliance diagram</li>
                      <li>Each step lights up as it executes in real-time</li>
                      <li>Thresholds: HITL $250, MFA $500 (verify in Demo Config)</li>
                    </ul>
                  </div>

                  {/* Navigation buttons */}
                  <div className="adg-nav-buttons">
                    <button
                      type="button"
                      className="adg-nav-btn adg-nav-btn--prev"
                      onClick={handlePrevious}
                      disabled={currentIndex === 0}
                      aria-label="Previous scenario"
                    >
                      ← Previous
                    </button>
                    <div className="adg-scenario-counter">
                      {currentIndex + 1} / {DEMO_SCENARIOS.length}
                    </div>
                    <button
                      type="button"
                      className="adg-nav-btn adg-nav-btn--next"
                      onClick={handleNext}
                      disabled={currentIndex === DEMO_SCENARIOS.length - 1}
                      aria-label="Next scenario"
                    >
                      Next →
                    </button>
                    <button
                      type="button"
                      className="adg-nav-btn adg-nav-btn--close"
                      onClick={onClose}
                      aria-label="Close guide"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
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
              className={`adg-resize-handle adg-resize-handle--${side}`}
              onMouseDown={(e) => handleMouseDownResize(e, side)}
              style={{ cursor: isResizing ? cursorMap[side] : 'pointer' }}
              aria-label={`Resize modal from ${side}`}
            />
          );
        })}
      </div>
    </>,
    document.body
  );
}
