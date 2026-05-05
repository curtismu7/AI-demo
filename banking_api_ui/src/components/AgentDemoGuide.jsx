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
 * Usage: Click " Agent Demo Guide" to open this window.
 * Reference: See /architecture/flow for live compliance flow diagram.
 */

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import "./AgentDemoGuide.css";

const ALL_12_STEPS = [
  "agent-llm-reasoning",
  "agent-token-init",
  "gw-scope-map",
  "agent-scope-aware-cache",
  "olb-resource-token",
  "gw-denial-metadata",
  "gw-hitl-challenge-type",
  "bff-response-shape",
  "ui-gateway-consent",
  "ui-auto-refire",
  "agent-error-propagation",
  "claim-diagnostics",
];

const STEP_LABELS = {
  "agent-llm-reasoning": "1. LLM Intent Reasoning",
  "agent-token-init": "2. Token Initialization",
  "gw-scope-map": "3. Gateway Scope Mapping",
  "agent-scope-aware-cache": "4. Scope-Aware Caching",
  "olb-resource-token": "5. Resource Token Exchange",
  "gw-denial-metadata": "6. Gateway Denial Metadata",
  "gw-hitl-challenge-type": "7. HITL Challenge Type",
  "bff-response-shape": "8. BFF Response Shape",
  "ui-gateway-consent": "9. UI Consent Modal",
  "ui-auto-refire": "10. Auto-Refire",
  "agent-error-propagation": "11. Error Propagation",
  "claim-diagnostics": "12. Claim Diagnostics",
};

const DEMO_SCENARIOS = [
  {
    id: "read-only",
    title: "1. Read-Only Scope (Simple Path)",
    description:
      "Basic read operation: list your accounts. Exercises only token init and caching.",
    applicableSteps: [
      "agent-llm-reasoning",
      "agent-token-init",
      "gw-scope-map",
      "agent-scope-aware-cache",
      "claim-diagnostics",
    ],
    steps: [
      {
        action: "Click test chip:",
        prompt: '" My Accounts" (Banking group)',
        explanation:
          "Agent: (1) Recognizes banking:read intent. (2) Gets your user token (banking:read scope). (3) Calls BFF /api/accounts/my. (4) No token exchange needed—scope is sufficient. (5) Returns account list.",
        watch: [
          " Compliance: Steps 1-4 complete (no exchange needed)",
          "Token Chain: Shows 1 user token (banking:read)",
          'Notice: No "exchange-required" event',
          "Agent response displays accounts immediately",
        ],
      },
    ],
  },
  {
    id: "scope-denial",
    title: "2. Scope Denial (403 + Denial Metadata)",
    description:
      "Write attempt without scope triggers 403 rejection. Gateway returns required_scopes.",
    applicableSteps: [
      "agent-llm-reasoning",
      "agent-token-init",
      "agent-scope-aware-cache",
      "gw-denial-metadata",
      "agent-error-propagation",
    ],
    steps: [
      {
        action: "Click test chip:",
        prompt: '" Test Wrong Scope" (Testing group)',
        explanation:
          "Deliberately tests scope denial path. Makes request with banking:admin scope (not authorized). Gateway returns 403 with required_scopes metadata.",
        watch: [
          " Compliance: Steps 1-2, then denial via step 6",
          "Error shows: required_scopes=[banking:write]",
          "Token Chain: Denial event with metadata",
          "Compliance panel: Shows steps 1-2 only (stops at denial)",
          "Notice: RFC 6749 §3.3 scope enforcement in action",
        ],
      },
    ],
  },
  {
    id: "token-exchange",
    title: "3. Token Exchange (RFC 8693 — Full Exchange)",
    description:
      "After scope denial, agent negotiates new token with write scope using RFC 8693.",
    applicableSteps: [
      "agent-llm-reasoning",
      "agent-token-init",
      "agent-scope-aware-cache",
      "gw-scope-map",
      "olb-resource-token",
      "gw-denial-metadata",
      "bff-response-shape",
      "agent-error-propagation",
      "claim-diagnostics",
    ],
    steps: [
      {
        action: "Setup (admin): Enable token exchange",
        prompt: 'Go to " Demo Config" → toggle " MCP Token Exchange" ON',
        explanation:
          "This enables the gateway to perform RFC 8693 token exchange. Without it, scope denial is fatal. After toggling, the gateway can exchange tokens for delegated scopes.",
        watch: [],
      },
      {
        action: "Then click test chip:",
        prompt: '" Test Wrong Scope" (Testing group)',
        explanation:
          "Agent: (1) Makes request with banking:admin scope. (2) Gateway rejects: 403. (3) Agent initiates RFC 8693 exchange. (4) New token issued with banking:write scope. (5) Agent retries with new token. (6) Operation succeeds.",
        watch: [
          " Compliance: All 9 steps exercised",
          "Token Chain: 3 events (user token → exchange request → new MCP token)",
          "Shows Hop 0→1→2: user → gateway delegated → backend",
          "aud claim changes: user → MCP server audience",
          "Notice: act claim present (agent delegated on behalf of user)",
        ],
      },
    ],
  },
  {
    id: "hitl-gate-enabled",
    title: "4. HITL Consent Gate (Enabled, Amount > Threshold)",
    description:
      "High-value withdrawal triggers HITL consent when amount exceeds threshold (default $250).",
    applicableSteps: [
      "agent-llm-reasoning",
      "agent-token-init",
      "agent-scope-aware-cache",
      "olb-resource-token",
      "gw-scope-map",
      "gw-denial-metadata",
      "gw-hitl-challenge-type",
      "bff-response-shape",
      "ui-gateway-consent",
      "ui-auto-refire",
      "claim-diagnostics",
    ],
    steps: [
      {
        action: "Verify setup:",
        prompt:
          'Go to ⚙️ Controls → confirm "Confirm (consent)" threshold is $250 (default)',
        explanation:
          "HITL consent threshold is configurable via Demo Controls. Default is $250 for HITL, $500 for MFA step-up. Both flags are separate gates.",
        watch: [],
      },
      {
        action: "Then click test chip:",
        prompt: '" Test HITL Transfer" (Testing group)',
        explanation:
          "Sends $99,999.99 transfer. Amount > $250 threshold triggers HITL consent gate. Transfer always requires HITL consent regardless of threshold. User must approve the transaction.",
        watch: [
          " Compliance: All 11 steps (skips step 12 error propagation)",
          "Step 7: Gateway signals consent_challenge_required",
          "Step 9: UI shows GatewayConsentModal",
          "User approves consent + enters verification code",
          "Step 10: Auto-refire with consentChallengeId",
          "Transfer completes after consent verified",
          "Notice: HITL gate can be disabled via Demo Controls (ff_hitl_enabled flag)",
        ],
      },
    ],
  },
  {
    id: "hitl-disabled",
    title: "5. HITL Disabled (Feature Flag Off)",
    description:
      "HITL can be completely disabled for testing. High-value transfers proceed without consent.",
    applicableSteps: [
      "agent-llm-reasoning",
      "agent-token-init",
      "agent-scope-aware-cache",
      "olb-resource-token",
      "gw-scope-map",
      "claim-diagnostics",
    ],
    steps: [
      {
        action: "Setup: Disable HITL",
        prompt:
          'Go to ⚙️ Controls → Feature Flags section → toggle "ff_hitl_enabled" OFF',
        explanation:
          "When HITL is disabled via the feature flag, consent challenges are skipped entirely for all transactions. This is useful for testing the agent behavior without compliance gates.",
        watch: [
          'Flag toggle shows: "✓ ff_hitl_enabled" (checked = enabled; unchecked = disabled)',
          "Notice: Separate from step_up_enabled (MFA is still active if enabled)",
        ],
      },
      {
        action: "Then click test chip:",
        prompt: '" Test HITL Transfer" (Testing group)',
        explanation:
          "Sends $99,999.99 transfer with HITL disabled. Transfer proceeds immediately WITHOUT consent modal. Agent completes operation without consent_challenge_required response.",
        watch: [
          " Compliance: Steps 1-6 only (skips step 7 HITL gate, 9-10 consent modal)",
          "No GatewayConsentModal appears",
          "Transfer completes immediately after approval",
          "Step 7: Gateway does NOT signal consent_challenge_required",
          "Token Chain: No consent challenge event",
          "Notice: This demonstrates flag controls agent behavior",
        ],
      },
      {
        action: "Cleanup:",
        prompt:
          "Re-enable ff_hitl_enabled in Demo Controls for subsequent tests",
        explanation:
          "Set the flag back to enabled for other demo scenarios. HITL defaults to enabled when app starts.",
        watch: [],
      },
    ],
  },
  {
    id: "hitl-threshold-variation",
    title: "6. HITL Threshold Variation (Dynamic Configuration)",
    description:
      "HITL threshold is configurable. Change it to see how agent respects dynamic settings.",
    applicableSteps: [
      "agent-llm-reasoning",
      "agent-token-init",
      "agent-scope-aware-cache",
      "olb-resource-token",
      "gw-hitl-challenge-type",
      "ui-gateway-consent",
      "ui-auto-refire",
      "claim-diagnostics",
    ],
    steps: [
      {
        action: "Setup: Set threshold to $9999",
        prompt:
          'Go to ⚙️ Controls → "Confirm (consent)" field → change value to 9999 → click "Save Thresholds"',
        explanation:
          "The HITL threshold is stored server-side and used for all subsequent requests. Changes take effect immediately.",
        watch: [
          'Threshold field updates and shows "Saved" confirmation',
          "This controls when consent is required for withdrawals/deposits (transfers always require consent)",
        ],
      },
      {
        action: "Test: Withdraw below threshold",
        prompt:
          '" Test Withdraw $100" (if available, or manually request $100 withdrawal)',
        explanation:
          "With threshold set to $9999, a $100 withdrawal does NOT trigger HITL. Agent completes the operation without consent modal.",
        watch: [
          " Compliance: No step 7 (HITL gate skipped)",
          "No GatewayConsentModal appears",
          "Operation completes immediately",
        ],
      },
      {
        action: "Then set threshold to $50",
        prompt:
          'Go to ⚙️ Controls → "Confirm (consent)" field → change value to 50 → click "Save Thresholds"',
        explanation: "Lower the threshold to test the boundary condition.",
        watch: [],
      },
      {
        action: "Test: Withdraw above new threshold",
        prompt: '" Test Withdraw $100" (or similar amount > $50)',
        explanation:
          "Now $100 withdrawal triggers HITL because it exceeds the $50 threshold.",
        watch: [
          " Compliance: Step 7 activates (HITL gate)",
          "GatewayConsentModal appears",
          "User approves → operation continues",
          "Notice: Same amount ($100) behaves differently based on threshold setting",
        ],
      },
      {
        action: "Cleanup:",
        prompt:
          'Reset "Confirm (consent)" to 250 and "MFA step-up" to 500 in Demo Controls',
        explanation: "Restore defaults for other demo scenarios.",
        watch: [],
      },
    ],
  },
  {
    id: "hitl-transfer-always",
    title: "7. HITL Transfer Gate (Always Required)",
    description:
      "Transfers ALWAYS require HITL consent, regardless of amount or threshold.",
    applicableSteps: [
      "agent-llm-reasoning",
      "agent-token-init",
      "agent-scope-aware-cache",
      "olb-resource-token",
      "gw-hitl-challenge-type",
      "ui-gateway-consent",
      "ui-auto-refire",
      "claim-diagnostics",
    ],
    steps: [
      {
        action: "Setup: Raise threshold very high",
        prompt:
          'Go to ⚙️ Controls → "Confirm (consent)" field → change value to 999999 → click "Save Thresholds"',
        explanation:
          "Set threshold extremely high so that regular withdrawals/deposits won't trigger consent. But transfers should still require it.",
        watch: [],
      },
      {
        action: "Test: $1 transfer with high threshold",
        prompt:
          '"Create transfer of $1 from checking to savings" (or use "Test HITL Transfer")',
        explanation:
          "Sends even a tiny $1 transfer. Transfers are special—they ALWAYS require HITL consent, regardless of the threshold setting. This is a security policy: any transfer (moving money between accounts) must have explicit user approval.",
        watch: [
          " Compliance: Step 7 (HITL gate) activates even for $1 transfer",
          "GatewayConsentModal appears (not skipped despite high threshold)",
          "User approves consent",
          "Transfer completes after consent verified",
          "Notice: Withdrawal or deposit at $1 would NOT trigger HITL with $999999 threshold",
          "But transfer at ANY amount always requires HITL",
        ],
      },
      {
        action: "Cleanup:",
        prompt: 'Reset "Confirm (consent)" to 250 in Demo Controls',
        explanation: "Restore default threshold.",
        watch: [],
      },
    ],
  },
  {
    id: "hitl-and-step-up",
    title: "8. HITL + Step-Up MFA (Two Gates)",
    description:
      "High-value transfer triggers both HITL consent AND MFA step-up. Two separate gates.",
    applicableSteps: [
      "agent-llm-reasoning",
      "agent-token-init",
      "agent-scope-aware-cache",
      "olb-resource-token",
      "gw-hitl-challenge-type",
      "ui-gateway-consent",
      "ui-auto-refire",
      "claim-diagnostics",
    ],
    steps: [
      {
        action: "Verify settings:",
        prompt:
          'Go to ⚙️ Controls → confirm "Confirm (consent)" = $250 and "MFA step-up" = $500',
        explanation:
          "HITL and step-up are independent gates with different thresholds. HITL is consent (user approval), step-up is MFA (re-authentication).",
        watch: [],
      },
      {
        action: "Test: Large transfer",
        prompt: '" Test HITL Transfer" (Testing group, sends $99,999.99)',
        explanation:
          "This amount exceeds both thresholds: $99,999.99 > $250 (HITL consent) AND > $500 (MFA step-up). Agent encounters BOTH gates in sequence.",
        watch: [
          " Compliance: HITL gate (step 7) triggers first",
          "GatewayConsentModal appears: user approves consent",
          "Then: MFA step-up modal appears (OTP challenge)",
          "User: Enters OTP code",
          "After both gates pass: Transfer completes",
          "Notice: HITL runs first (user approval), MFA runs second (user re-auth)",
          "Order: HITL → Step-up → Operation",
          "Both can be toggled separately via Demo Controls (ff_hitl_enabled, step_up_enabled)",
        ],
      },
    ],
  },
  {
    id: "hitl-consent-declined",
    title: "9. HITL Consent Declined (User Denies Operation)",
    description:
      "User declines HITL consent. Agent receives error and reports failure to user.",
    applicableSteps: [
      "agent-llm-reasoning",
      "agent-token-init",
      "agent-scope-aware-cache",
      "olb-resource-token",
      "gw-hitl-challenge-type",
      "ui-gateway-consent",
      "agent-error-propagation",
    ],
    steps: [
      {
        action: "Test: Click chip and decline",
        prompt:
          '" Test HITL Transfer" (Testing group) → consent modal appears → click "Decline"',
        explanation:
          'GatewayConsentModal has two buttons: "Approve" and "Decline". When user clicks "Decline", the backend returns an error.',
        watch: [
          " Compliance: Steps 1-7 execute, then step 11 (error propagation)",
          'Consent modal shows "Decline" button',
          'After clicking "Decline": modal closes',
          "Agent receives error: consent_challenge_declined (or similar)",
          'Agent message to user: "I cannot complete this transfer because you declined the consent challenge."',
          "Notice: Operation is NOT retried",
          "Token Chain: Shows declined event",
        ],
      },
    ],
  },
  {
    id: "step-up",
    title: "10. Step-Up MFA (RFC 9470 Separate from HITL)",
    description:
      "Sensitive operations require re-authentication. Tests RFC 9470 step-up MFA challenge (independent from HITL).",
    applicableSteps: [
      "agent-llm-reasoning",
      "agent-token-init",
      "agent-scope-aware-cache",
      "olb-resource-token",
      "gw-scope-map",
      "gw-denial-metadata",
      "gw-hitl-challenge-type",
      "bff-response-shape",
      "ui-gateway-consent",
      "agent-error-propagation",
      "claim-diagnostics",
    ],
    steps: [
      {
        action: "Click test chip:",
        prompt: '" Test OTP Challenge" (Testing group)',
        explanation:
          "Requests sensitive account details (full routing numbers). Triggers step-up MFA (RFC 9470 acr challenge). User must complete MFA to access sensitive data. This gate is independent from HITL.",
        watch: [
          " Compliance: Token exchange (step 5) + step-up gate (step 7)",
          "Step 7: Gateway signals step_up_required (not consent_challenge_required)",
          "UI: Shows OtpStepUpModal (not consent modal)",
          "User: Enters OTP code from email",
          "After MFA verified: Returns sensitive account details",
          "Notice: Step-up is auth challenge (not approval like HITL)",
          "Can be disabled separately via Demo Controls (step_up_enabled flag)",
        ],
      },
    ],
  },
  {
    id: "full-flow",
    title: " Full Compliance (All 12 Steps)",
    description:
      "Ultimate demo: $99,999.99 transfer with HITL enabled. Token exchange → HITL gate → MFA. All steps.",
    applicableSteps: ALL_12_STEPS,
    steps: [
      {
        action: "Verify setup:",
        prompt:
          "Go to ⚙️ Controls → ff_hitl_enabled ON, Confirm threshold $250, MFA threshold $500",
        explanation: "All gates enabled with default thresholds.",
        watch: [],
      },
      {
        action: "Click test chip:",
        prompt: '" Full Compliance (12 Steps)" (Testing group)',
        explanation:
          "Sends $99,999.99 transfer. Amount triggers HITL consent (step 7), then MFA step-up (also step 7 or separate logic). Exercises all 12 steps end-to-end including both consent and auth challenges.",
        watch: [
          " ALL 12 STEPS light up in compliance panel",
          "Token Chain: Full exchange shown",
          "Step 7: HITL consent_challenge_required",
          "Consent modal: Approve consent",
          "Step 7 (or 9-10): MFA challenge",
          "MFA modal: Enter OTP code",
          "Transfer: Completes after both gates pass",
          "See: How each step flows into the next",
          "Reference: /architecture/flow diagram matches live execution",
        ],
      },
    ],
  },
];

export default function AgentDemoGuide({
  onClose,
  initialActiveScenario,
  initialExpandedSteps,
  isPopout,
}) {
  const [activeScenario, setActiveScenario] = useState(
    initialActiveScenario || "read-only",
  );
  const [expandedSteps, setExpandedSteps] = useState(
    initialExpandedSteps || {},
  );
  const [copiedStepId, setCopiedStepId] = useState(null);
  const [size, setSize] = useState({ width: 1000, height: 750 });
  const [pos, setPos] = useState({ x: 20, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({
    mouseX: 0,
    mouseY: 0,
    posX: 0,
    posY: 0,
    width: 1000,
    height: 750,
    side: null,
  });
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
        broadcastChannelRef.current = new BroadcastChannel("demo-guide-modal");
      }
      broadcastChannelRef.current.postMessage({
        type: "state-update",
        data: {
          activeScenario,
          expandedSteps,
        },
      });
    } catch (e) {
      console.warn("BroadcastChannel not supported:", e.message);
    }
  }, [activeScenario, expandedSteps]);

  // Drag handler
  const handleMouseDownHeader = (e) => {
    if (e.target.closest("button")) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pos.x, y: e.clientY - pos.y });
  };

  // Resize handler for all sides
  const handleMouseDownResize = (e, side) => {
    e.preventDefault();
    setIsResizing(true);
    setResizeStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: pos.x,
      posY: pos.y,
      width: size.width,
      height: size.height,
      side,
    });
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

        if (side === "left" || side === "top-left" || side === "bottom-left") {
          newWidth = Math.max(600, resizeStart.width - deltaX);
          newX = resizeStart.posX + resizeStart.width - newWidth;
        } else if (
          side === "right" ||
          side === "top-right" ||
          side === "bottom-right"
        ) {
          newWidth = Math.max(600, resizeStart.width + deltaX);
        }

        if (side === "top" || side === "top-left" || side === "top-right") {
          newHeight = Math.max(500, resizeStart.height - deltaY);
          newY = resizeStart.posY + resizeStart.height - newHeight;
        } else if (
          side === "bottom" ||
          side === "bottom-left" ||
          side === "bottom-right"
        ) {
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

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
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
    // Extract just the chip name: " Test Wrong Scope" from " Test Wrong Scope" (Testing group)
    const chipMatch = prompt.match(/"[^"]*"/);
    const textToCopy = chipMatch ? chipMatch[0] : prompt;
    navigator.clipboard.writeText(textToCopy);
    setCopiedStepId(stepId);
    setTimeout(() => setCopiedStepId(null), 2000);
  };

  const handleSetupClick = (setupPrompt) => {
    if (setupPrompt.includes("Authz Test")) {
      navigate("/authz-test");
    } else if (setupPrompt.includes("Demo Config")) {
      navigate("/admin");
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
          style={{
            cursor: isDragging ? "grabbing" : "grab",
            userSelect: "none",
          }}
        >
          <h2 id="adg-modal-title" className="adg-modal-title">
            Banking Agent Demo Guide
          </h2>
          <div className="compliance-modal__header-buttons">
            <button
              type="button"
              className="adg-popout-btn"
              onClick={(e) => {
                e.stopPropagation();
                try {
                  sessionStorage.setItem(
                    "demo_guide_modal_popout",
                    JSON.stringify({
                      activeScenario,
                      expandedSteps,
                    }),
                  );
                } catch (_) {}
                window.open(
                  "/demo-guide-popout",
                  "DemoGuidePopout",
                  "width=1150,height=800,resizable=yes,scrollbars=yes",
                );
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
          <p className="adg-tagline">
            Real request scenarios mapped to 12 compliance steps. See
            /architecture/flow for live diagram.
          </p>
        </div>

        <div className="adg-container">
          {/* Sidebar: Scenario list */}
          <div className="adg-sidebar">
            <div className="adg-sidebar-title">Scenarios</div>
            {DEMO_SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                className={`adg-scenario-btn ${activeScenario === scenario.id ? "active" : ""}`}
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
                          {expandedSteps[idx] ? "▼" : "▶"}
                        </span>
                        <span className="adg-step-action">{step.action}</span>
                        {step.prompt && (
                          <code className="adg-prompt-preview">
                            {step.prompt}
                          </code>
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
                                {copiedStepId ===
                                  `${activeScenario}-${idx}` && (
                                  <span className="adg-copy-checkmark">
                                    ✓ Copied!
                                  </span>
                                )}
                              </div>
                              <code className="adg-prompt-code">
                                {step.prompt}
                              </code>
                              <button
                                type="button"
                                className="adg-copy-btn"
                                onClick={() =>
                                  handleCopyPrompt(
                                    step.prompt,
                                    `${activeScenario}-${idx}`,
                                  )
                                }
                              >
                                {copiedStepId === `${activeScenario}-${idx}`
                                  ? "✓"
                                  : "📋 Copy"}
                              </button>
                              {step.action.includes("Setup") && (
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
                              <div className="adg-watch-label">
                                👀 Watch for:
                              </div>
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
                      <li>
                        Open Token Chain panel (right sidebar) to watch token
                        events live
                      </li>
                      <li>
                        Compliance panel (below messages) shows which steps are
                        active
                      </li>
                      <li>
                        Follow scenarios top-to-bottom to understand the story
                      </li>
                      <li>
                        Reference:{" "}
                        <a
                          href="/architecture/flow"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          /architecture/flow
                        </a>{" "}
                        shows live compliance diagram
                      </li>
                      <li>Each step lights up as it executes in real-time</li>
                      <li>
                        Thresholds: HITL $250, MFA $500 (configurable via ⚙️
                        Controls)
                      </li>
                      <li>
                        Feature Flags: HITL, step-up, authorize, and token
                        exchange are all independently toggleable
                      </li>
                      <li>
                        Scenarios 4-9 focus on HITL consent gates with different
                        configurations; scenario 10 covers separate MFA step-up
                      </li>
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
        {[
          "top",
          "bottom",
          "left",
          "right",
          "top-left",
          "top-right",
          "bottom-left",
          "bottom-right",
        ].map((side) => {
          const cursorMap = {
            top: "ns-resize",
            bottom: "ns-resize",
            left: "ew-resize",
            right: "ew-resize",
            "top-left": "nwse-resize",
            "top-right": "nesw-resize",
            "bottom-left": "nesw-resize",
            "bottom-right": "nwse-resize",
          };
          return (
            <button
              key={side}
              type="button"
              className={`adg-resize-handle adg-resize-handle--${side}`}
              onMouseDown={(e) => handleMouseDownResize(e, side)}
              style={{ cursor: isResizing ? cursorMap[side] : "pointer" }}
              aria-label={`Resize modal from ${side}`}
            />
          );
        })}
      </div>
    </>,
    document.body,
  );
}
