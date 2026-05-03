/**
 * @file AgentDemoGuide.jsx
 *
 * Interactive demo guide for Banking Agent compliance flows.
 * Walks users through scenarios that demonstrate:
 * - Scope requirements (RFC 6749 §3.3)
 * - Token exchange (RFC 8693)
 * - Authorization policies (PingOne Authorize)
 * - HITL consent gates
 * - Step-up MFA
 *
 * Usage: Click "📚 Demo Guide" chip to open this window.
 */

import React, { useState } from 'react';
import './AgentDemoGuide.css';

const DEMO_SCENARIOS = [
  {
    id: 'read-only',
    title: '1️⃣ Read-Only Scope (No Token Exchange)',
    description: 'Start simple: read operations don\'t require token exchange.',
    steps: [
      {
        action: 'Try this prompt:',
        prompt: '"What accounts do I have?"',
        explanation: 'The agent calls get_my_accounts with your user token. This only needs banking:read scope, which you already have.',
        watch: ['Token Chain → shows user token decoded', 'Compliance panel → agent-llm-reasoning through claim-diagnostics', 'No token exchange needed (scope already sufficient)'],
      },
      {
        action: 'Then try:',
        prompt: '"Show me my transactions"',
        explanation: 'Same pattern: read operation, no token exchange. Your token already has banking:read scope.',
        watch: ['Notice: no "exchange-required" event', 'No new MCP token created', 'User token used directly'],
      },
    ],
  },
  {
    id: 'scope-denial',
    title: '2️⃣ Scope Denial (403 — Missing Write Scope)',
    description: 'Now request a write operation without write scope. Gateway will reject.',
    steps: [
      {
        action: 'Try this prompt:',
        prompt: '"Transfer $50 from checking to savings"',
        explanation: 'You only have banking:read scope, not banking:write. The BFF gateway will reject (403) because the operation requires write scope.',
        watch: [
          'Error appears: "missing_exchange_scopes" (403)',
          'Token Chain shows gateway denial event',
          'Required scopes displayed: banking:write',
          'User scopes shown: banking:read',
        ],
      },
      {
        action: 'Alternatively, click:',
        prompt: '"🧪 Test Wrong Scope" chip (Testing group)',
        explanation: 'This deliberately tests scope denial by requesting banking:admin scope (which you don\'t have). Shows the exact 403 flow.',
        watch: [
          'Gateway rejection with required_scopes metadata',
          'RFC 6749 §3.3 compliance information',
        ],
      },
    ],
  },
  {
    id: 'token-exchange',
    title: '3️⃣ Token Exchange (RFC 8693 — Get Write Scope)',
    description: 'After the 403 denial, the agent negotiates a new token with write scope.',
    steps: [
      {
        action: 'Prerequisite:',
        prompt: 'Click "📚 Demo Data" (admin, bottom-right) → toggle "🔐 MCP Token Exchange" ON',
        explanation: 'This enables RFC 8693 token exchange at the gateway. Without it, the agent can\'t get a delegated token with write scope.',
        watch: ['After toggle, try the transfer prompt again'],
      },
      {
        action: 'Then try:',
        prompt: '"Transfer $50 from checking to savings"',
        explanation: 'Now with token exchange enabled: (1) Agent requests transfer → Gateway denies (403, missing:write). (2) Agent sees denial, initiates token exchange. (3) New delegated token issued with banking:write. (4) Agent retries with new token → Success (or hits next gate).',
        watch: [
          'Token Chain → 2 token events (user + MCP delegated)',
          'Shows "exchange-required" → "two-exchange-exchange1" → "two-ex-final-token"',
          'MCP token aud claim matches resource server',
          'Compliance panel now shows olb-resource-token step completed',
        ],
      },
    ],
  },
  {
    id: 'authorize-denial',
    title: '4️⃣ Authorize Policy Denial (PingOne Authorize Gate)',
    description: 'Token exchange succeeds, but Authorize policy blocks the operation.',
    steps: [
      {
        action: 'Setup (admin only):',
        prompt: 'Go to "🧪 Authz Test" (admin menu) → Create a rule: "banking:write" → "STEP UP" or "DENY"',
        explanation: 'This creates a PingOne Authorize policy that blocks write operations. It\'s a separate gate from token exchange (even if you have the right scopes, policy can deny).',
        watch: [],
      },
      {
        action: 'Then try:',
        prompt: '"Transfer $50 from checking to savings"',
        explanation: '(1) Agent requests transfer with write token. (2) Token exchange succeeds ✓. (3) BFF calls PingOne Authorize → Policy returns DENY or STEP UP. (4) Agent shows error or triggers MFA.',
        watch: [
          'If DENY: error shows "authorization_failed"',
          'If STEP UP: MFA modal appears',
          'Compliance panel shows gw-denial-metadata (Authorize decision)',
          'Notice: Token exchange worked fine, but Authorize blocked it',
        ],
      },
    ],
  },
  {
    id: 'hitl-gate',
    title: '5️⃣ Human-in-the-Loop (HITL) — Consent Required for High-Value',
    description: 'Large transfers require explicit user consent before executing.',
    steps: [
      {
        action: 'Try this prompt:',
        prompt: '"Transfer $500 from checking to savings"',
        explanation: 'Amount $500 > $250 HITL threshold. Gateway detects this and returns consent_challenge_required (not a 403 error—it\'s a deliberate gate).',
        watch: [
          'Consent modal appears: "Human-in-the-Loop"',
          'Shows threshold: "$250+"',
          'OTP code sent to your email (or fallback stub)',
          'Compliance panel shows gw-hitl-challenge-type',
        ],
      },
      {
        action: 'OR click:',
        prompt: '"🔐 Test HITL Required" chip (Testing group)',
        explanation: 'This transfers $99,999.99 to guarantee HITL gate triggers. Skips the write-scope denial, goes straight to consent modal.',
        watch: [
          'Consent modal with detailed HITL explanation',
          'After approval: transfer re-fires with consentChallengeId',
          'Shows all 10 HITL compliance steps',
        ],
      },
    ],
  },
  {
    id: 'step-up',
    title: '6️⃣ Step-Up MFA (RFC 9470) — Identity Re-Verification',
    description: 'Very sensitive operations require MFA even after successful token exchange.',
    steps: [
      {
        action: 'Try this prompt:',
        prompt: '"Show me my full account details with routing numbers"',
        explanation: 'This requests sensitive data (full account/routing numbers). Requires banking:sensitive:read scope AND step-up MFA (RFC 9470 challenge).',
        watch: [
          'First: Token exchange for banking:sensitive:read scope',
          'Then: MFA modal appears (not a consent modal—authentication challenge)',
          'Compliance panel shows gw-hitl-challenge-type with step_up_required',
        ],
      },
      {
        action: 'OR click:',
        prompt: '"📱 Test OTP Required" chip (Testing group)',
        explanation: 'Directly triggers the sensitive-account-details flow, which requires step-up.',
        watch: [
          'Notice: Step-up is different from HITL (it\'s re-auth, not approval)',
          'RFC 9470 compliance information displayed',
        ],
      },
    ],
  },
  {
    id: 'full-flow',
    title: '🔥 Full Compliance Flow (All 12 Steps)',
    description: 'See the entire flow: token exchange → Authorize → HITL → MFA.',
    steps: [
      {
        action: 'Click:',
        prompt: '"🔥 Full Compliance (12 Steps)" chip (Testing group)',
        explanation: 'This is the ultimate demo. Transfers $99,999.99, which: (1) Requires token exchange for write scope. (2) Passes through Authorize gate (usually). (3) Triggers HITL consent (> $250). (4) After consent approval, triggers MFA (> $500). Shows all 12 compliance steps.',
        watch: [
          'Compliance panel lights up all 12 steps',
          'Token Chain shows full chain (user → MCP token)',
          'Consent modal appears → OTP modal appears',
          'Transfer completes after both gates pass',
        ],
      },
    ],
  },
];

export default function AgentDemoGuide({ onClose }) {
  const [activeScenario, setActiveScenario] = useState('read-only');
  const [expandedSteps, setExpandedSteps] = useState({});

  const current = DEMO_SCENARIOS.find((s) => s.id === activeScenario);

  const toggleStepExpanded = (stepIndex) => {
    setExpandedSteps((prev) => ({
      ...prev,
      [stepIndex]: !prev[stepIndex],
    }));
  };

  return (
    <div className="agent-demo-guide-overlay">
      <div className="agent-demo-guide-modal">
        {/* Header */}
        <div className="adg-header">
          <h1>📚 Banking Agent Demo Guide</h1>
          <p className="adg-tagline">Learn compliance flows by doing. Follow the story.</p>
          <button className="adg-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="adg-container">
          {/* Sidebar: Scenario list */}
          <div className="adg-sidebar">
            <div className="adg-sidebar-title">Scenarios</div>
            {DEMO_SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
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
                </div>

                <div className="adg-steps">
                  {current.steps.map((step, idx) => (
                    <div key={idx} className="adg-step">
                      <button
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
                            <strong>Why this works:</strong>
                            <p>{step.explanation}</p>
                          </div>

                          {step.prompt && (
                            <div className="adg-prompt-box">
                              <div className="adg-prompt-label">💬 Copy & paste:</div>
                              <code className="adg-prompt-code">{step.prompt}</code>
                              <button
                                className="adg-copy-btn"
                                onClick={() => {
                                  navigator.clipboard.writeText(step.prompt);
                                  alert('Prompt copied to clipboard!');
                                }}
                              >
                                📋 Copy
                              </button>
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
                      <li>Keep Token Chain panel open (right side) to watch the exchange live</li>
                      <li>Compliance panel shows which steps are active (below agent messages)</li>
                      <li>Each scenario builds on the previous—follow the story top-to-bottom</li>
                      <li>Admin users: check "🧪 Authz Test" page to see PingOne Authorize policies</li>
                      <li>Use test chips (Testing group) to jump to specific scenarios</li>
                      <li>Check "📚 Demo Data" to toggle token exchange, Authorize gates, thresholds</li>
                    </ul>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
