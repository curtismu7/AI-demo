import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEducationUIOptional } from "../context/EducationUIContext";
import { useIndustryBranding } from "../context/IndustryBrandingContext";
import { useVertical } from "../vertical/useVertical";
import { useTokenChainOptional } from "../context/TokenChainContext";
import TokenChainModal from "./TokenChainModal";
import { navigateToCustomerOAuthLogin } from "../utils/authUi";
import {
  AGENT_CONSENT_BLOCK_USER_MESSAGE,
  isAgentBlockedByConsentDecline,
  setAgentBlockedByConsentDecline,
} from "../services/agentAccessConsent";
import { agentFlowDiagram } from "../services/agentFlowDiagramService";
import { appendTokenEvents } from "../services/apiTrafficStore";
import { fetchNlStatus } from "../services/demoAgentNlService";
import {
  callMcpTool,
  createDeposit,
  createDepositWithConsent,
  createTransfer,
  createTransferWithConsent,
  createWithdrawal,
  createWithdrawalWithConsent,
  getAccountBalance,
  getMyAccounts,
  getMyTransactions,
  refreshOAuthSession,
  sendAgentMessage,
} from "../services/demoAgentService";
import bffAxios from "../services/bffAxios";
import { getCachedStatus } from "../services/cachedStatusService";
import { loadPublicConfig } from "../services/configService";
import { spinner } from "../services/spinnerService";
import {
  notifyError,
  notifyInfo,
  notifySuccess,
  toast,
} from "../utils/appToast";
import { isPublicMarketingAgentPath } from "../utils/embeddedAgentFabVisibility";
import AccountDetailsPanel from "./AccountDetailsPanel";
import VerticalResult from "./VerticalResult";
import AgentConsentModal from "./AgentConsentModal";
import AgentDemoGuide from "./AgentDemoGuide";
import BankingChips, { PINGONE_ADMIN_CHIP_IDS } from "./BankingChips";
import VerticalHero from "./VerticalHero";
import ComplianceModal from "./ComplianceModal";
import GatewayConsentModal from "./GatewayConsentModal";
import { EDU } from "./education/educationIds";
import FidoStepUpModal from "./FidoStepUpModal";
import MCPToolsListModal from "./MCPToolsListModal";
import OtpStepUpModal from "./OtpStepUpModal";
import QuickLoginModal from "./QuickLoginModal";
import { InlineMd, MarkdownContent } from "./shared/MarkdownText";
import TransactionConsentModal from "./TransactionConsentModal";
import "./BankingAgent.css";
import { postAppEvent } from "../services/appEventClient";
import sessionStorageService from "../services/sessionStorageService";
import PendingActionManager from "../services/pendingActionManager";
import {
  extractAccounts,
  normalizeAccount,
  validateHttpResponse,
  safeResponseJson,
} from "../services/apiResponseValidator";
import { getColdStartRetryDelays } from "../services/apiErrorHandler";
import APP_CONFIG from "../services/appConfig";
import { useCustomChips } from "../hooks/useCustomChips";
import AgentModeSelector from "./AgentModeSelector";
import useLangchainProvider from "../hooks/useLangchainProvider";
import { claimPendingNl, clampPanelPosition, makeReentrancyGuard, isAbortError, anySignal } from "./demoAgentSafety";
// AG-UI Step 3 — hooks (feature-flagged; only active when ff_agui_enabled=true)
import { useAgentRun } from "../hooks/useAgentRun";
import { useAgentState } from "../hooks/useAgentState";
import { useNewItems } from "../hooks/useNewItems";
// AG-UI Steps 5–6 — observability stores (push model; replaces poll when flag is on)
import { appendMcpCall } from "../services/mcpCallStore";
import { appendAuthorizeDecision } from "../services/authorizeDecisionStore";

// Phase 266 H2 audit: TokenChain credentialPath stamping origins per setTokenEvents call:
//   line 3433 (scopeTestRes.tokenEvents)  — origin: scope-test path via callMcpTool; credentialPath: oauth_bearer (default; stamped by bankingAgentService)
//   line 3503 (audTestRes.tokenEvents)    — origin: aud-test path via callMcpTool; credentialPath: oauth_bearer (default; stamped by bankingAgentService)
//   line 4060 (tokenEventsErr)            — origin: error path from callMcpTool response; credentialPath: stamped by bankingAgentService before throw
//   line 4259 (tokenEvents)               — origin: bankingAgentService.callMcpTool success path ✓ stamped
//   line 5811 (response.tokenEvents)      — origin: sendAgentMessage (LangGraph/NL agent path); credentialPath: oauth_bearer (default; no credential swap on NL agent path)
//   line 6052 (data.tokenEvents)          — origin: scope_upgrade token exchange; credentialPath: oauth_bearer (default; BFF /api/scope/upgrade path)
//   line 7042 (response.tokenEvents)      — origin: HITL replay sendAgentMessage; credentialPath: oauth_bearer (default; same as NL agent path)
// Conclusion: all 7 existing call sites produce oauth_bearer chains. The three new Phase 266
// credential paths (api_key, dual_token, bankingdata) will all flow through bankingAgentService.callMcpTool
// where the stamp is applied. No additional stamping needed at BankingAgent call sites.

/** NL message to replay after customer OAuth redirect from marketing agent (sessionStorage). */
const BX_AGENT_PENDING_NL_KEY = "bx_agent_pending_nl";

/** Session expiry countdown timer component */
function SessionExpiryTimer({ sessionInfo, className = "" }) {
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [isExpiringSoon, setIsExpiringSoon] = useState(false);

  useEffect(() => {
    if (!sessionInfo?.expiresAt) return;

    const calculateTimeRemaining = () => {
      const now = Date.now();
      const expiresAt = new Date(sessionInfo.expiresAt).getTime();
      const remaining = Math.max(0, expiresAt - now);

      setTimeRemaining(remaining);
      setIsExpiringSoon(
        remaining > 0 && remaining < APP_CONFIG.SESSION_EXPIRY_WARNING_MS,
      );
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [sessionInfo?.expiresAt]);

  if (!timeRemaining || timeRemaining <= 0) return null;

  const formatTime = (ms) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`ba-session-timer ${isExpiringSoon ? "ba-session-timer--expiring" : ""} ${className}`}
      title={`Session expires in ${formatTime(timeRemaining)}`}
    >
      <span className="ba-session-timer-icon">{"\u23f0"}</span>
      <span className="ba-session-timer-text">{formatTime(timeRemaining)}</span>
    </div>
  );
}

const ACTION_GROUPS = {
  account: [
    {
      id: "accounts",
      label: "My Accounts",
      desc: "List all your accounts",
      rfcs: ["8693", "7515", "7662"],
    },
    {
      id: "balance",
      label: "Check Balance",
      desc: "Balance for an account",
      rfcs: ["8693", "7515"],
    },
    {
      id: "sensitive-account-details",
      label: "View Sensitive Account Details",
      desc: "View full account number and routing number (requires consent)",
      rfcs: ["8693", "7515", "9470"],
    },
    {
      id: "sequential_think",
      label: "Think Through a Question",
      desc: "Reason step-by-step through a banking question or decision",
      rfcs: [],
    },
    {
      id: "logout",
      label: "Log Out",
      desc: "Sign out of your account",
      rfcs: [],
    },
  ],
  transaction: [
    {
      id: "transactions",
      label: "Recent Transactions",
      desc: "View recent activity",
      rfcs: ["8693", "7515"],
    },
    {
      id: "deposit",
      label: "Deposit",
      desc: "Deposit into an account",
      rfcs: ["8693", "7515", "6749"],
    },
    {
      id: "withdraw",
      label: "Withdraw",
      desc: "Withdraw from an account",
      rfcs: ["8693", "7515", "6749"],
    },
    {
      id: "transfer",
      label: "Transfer",
      desc: "Transfer between accounts",
      rfcs: ["8693", "7515", "6749", "9470"],
    },
  ],
  admin: [
    {
      id: "mcp_tools",
      label: "MCP Tools",
      desc: "List all available MCP tools",
      rfcs: [],
    },
    {
      id: "query_user",
      label: "Query User by Email",
      desc: "Check if a user exists by email address",
      rfcs: [],
    },
  ],
  ai: [
    {
      id: "ai_ask",
      label: "Ask AI Anything",
      desc: "Free-form question routed to active LLM (Ollama or Helix)",
      rfcs: [],
    },
    {
      id: "ai_helix_demo",
      label: "LLM Demo: Ask Helix",
      desc: "Ask Helix LLM a financial question (if configured)",
      rfcs: [],
    },
    {
      id: "ai_explain",
      label: "Explain a Concept",
      desc: "Ask the LLM to explain an OAuth or banking concept",
      rfcs: [],
    },
    {
      id: "ai_helix_explain",
      label: "LLM Demo: Explain w/ Helix",
      desc: "Explain an OAuth or banking concept using Helix LLM",
      rfcs: [],
    },
    {
      id: "ai_analyze",
      label: "Summarize How MCP Works",
      desc: "Ask the LLM to summarize the MCP tool flow in this demo",
      rfcs: [],
    },
    {
      id: "ai_advice",
      label: "Financial Advice",
      desc: "Ask the LLM for generic financial advice or tips",
      rfcs: [],
    },
    {
      id: "ai_helix_advice",
      label: "LLM Demo: Helix Financial Advice",
      desc: "Get financial tips from Helix LLM",
      rfcs: [],
    },
  ],
  testing: [
    {
      id: "demo_guide",
      label: " Demo Guide",
      desc: "Interactive guide: learn how to demo the agent, what prompts to use, what to watch for",
      rfcs: [],
    },
    {
      id: "test_full_compliance_flow",
      label: "Full Compliance (12 Steps)",
      desc: "High-value sensitive account transfer with MFA + HITL — exercises ALL 12 compliance steps end-to-end",
      rfcs: ["8693", "7515", "7662", "9470", "6749"],
    },
    {
      id: "test_wrong_scope",
      label: "Test Wrong Scope",
      desc: "Send request with unauthorized scope (auth rejection)",
      rfcs: ["6749"],
    },
    {
      id: "test_wrong_audience",
      label: "Test Wrong Audience",
      desc: "Send request with wrong audience (auth rejection)",
      rfcs: ["8693", "8707"],
    },
    {
      id: "test_hitl_required",
      label: "Test HITL Transfer",
      desc: "Attempt high-value transfer (requires consent)",
      rfcs: ["8693", "9470"],
    },
    {
      id: "transfer_600_test",
      label: "Transfer $600",
      desc: "Test HITL consent + MFA flow with $600 transfer",
      rfcs: ["8693", "7515", "7662", "9470"],
    },
    {
      id: "test_otp_required",
      label: "Test OTP Challenge",
      desc: "Trigger OTP/MFA step-up authentication",
      rfcs: ["9470"],
    },
    {
      id: "demo_intent_delegation",
      label: "Intent-Bound Transfer",
      desc: "High-value transfer with intent-bound delegation: RFC 8693 constraint enforcement + HITL consent",
      rfcs: ["8693", "8707", "9470"],
    },
    {
      id: "demo_nl_routing",
      label: "NL: Ask the Agent",
      desc: "Natural language query routed through LLM — exercises step 1a (LLM routing) in compliance checklist",
      rfcs: [],
    },
    {
      id: "api_key_demo",
      label: "API-Key Path Demo",
      desc: "Exercise gateway API-key credential swap (Path A) — tool 'special_offers' via Phase 266 gateway router",
      rfcs: ["8693"],
    },
    {
      id: "dual_token_demo",
      label: "Access + ID-Token Path Demo",
      desc: "Exercise gateway dual-token path (Path B) — tool 'user_profile_card' via Phase 266 gateway router",
      rfcs: ["8693", "8707"],
    },
  ],
};

// Steps each chip exercises — used to highlight applicable rows in the compliance panel
const CHIP_APPLICABLE_STEPS = {
  accounts: [
    "agent-llm-reasoning",
    "agent-token-init",
    "gw-scope-map",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "claim-diagnostics",
  ],
  transactions: [
    "agent-llm-reasoning",
    "agent-token-init",
    "gw-scope-map",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "claim-diagnostics",
  ],
  mcp_tools: [
    "agent-llm-reasoning",
    "agent-token-init",
    "gw-scope-map",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "claim-diagnostics",
  ],
  balance: [
    "agent-llm-reasoning",
    "agent-token-init",
    "gw-scope-map",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "claim-diagnostics",
  ],
  deposit: [
    "agent-llm-reasoning",
    "agent-token-init",
    "gw-scope-map",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "claim-diagnostics",
  ],
  withdraw: [
    "agent-llm-reasoning",
    "agent-token-init",
    "gw-scope-map",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "claim-diagnostics",
  ],
  transfer: [
    "agent-llm-reasoning",
    "agent-token-init",
    "gw-scope-map",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "claim-diagnostics",
  ],
  sequential_think: [
    "agent-llm-reasoning",
    "agent-token-init",
    "gw-scope-map",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "claim-diagnostics",
  ],
  query_user: [
    "agent-llm-reasoning",
    "agent-token-init",
    "gw-scope-map",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "claim-diagnostics",
  ],
  "sensitive-account-details": [
    "agent-llm-reasoning",
    "agent-token-init",
    "gw-scope-map",
    "gw-hitl-challenge-type",
    "agent-error-propagation",
    "agent-recovery-branch",
    "ui-gateway-consent",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "claim-diagnostics",
  ],
  test_full_compliance_flow: [
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
  ],
  test_wrong_scope: [
    "agent-llm-reasoning",
    "agent-token-init",
    "agent-scope-aware-cache",
  ],
  test_wrong_audience: [
    "agent-llm-reasoning",
    "agent-token-init",
    "agent-scope-aware-cache",
    "bff-login-resume",
  ],
  test_hitl_required: [
    "agent-llm-reasoning",
    "agent-token-init",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "gw-scope-map",
    "gw-denial-metadata",
    "bff-response-shape",
    "gw-hitl-challenge-type",
    "ui-gateway-consent",
    "ui-auto-refire",
  ],
  transfer_600_test: [
    "agent-llm-reasoning",
    "agent-token-init",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "gw-scope-map",
    "gw-denial-metadata",
    "bff-response-shape",
    "gw-hitl-challenge-type",
    "ui-gateway-consent",
    "ui-auto-refire",
  ],
  test_otp_required: [
    "agent-llm-reasoning",
    "agent-token-init",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "gw-scope-map",
    "gw-denial-metadata",
    "gw-hitl-challenge-type",
  ],
  demo_intent_delegation: [
    "agent-llm-reasoning",
    "agent-token-init",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "gw-scope-map",
    "gw-denial-metadata",
    "bff-response-shape",
    "gw-hitl-challenge-type",
    "ui-gateway-consent",
    "ui-auto-refire",
  ],
  demo_nl_routing: [
    "agent-llm-reasoning",
    "agent-token-init",
    "gw-scope-map",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "claim-diagnostics",
  ],
  ai_ask: [
    "agent-llm-reasoning",
    "agent-token-init",
    "gw-scope-map",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "claim-diagnostics",
  ],
  ai_helix_demo: [
    "agent-llm-reasoning",
    "agent-token-init",
    "gw-scope-map",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "claim-diagnostics",
  ],
  ai_explain: [
    "agent-llm-reasoning",
    "agent-token-init",
    "gw-scope-map",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "claim-diagnostics",
  ],
  ai_helix_explain: [
    "agent-llm-reasoning",
    "agent-token-init",
    "gw-scope-map",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "claim-diagnostics",
  ],
  ai_analyze: [
    "agent-llm-reasoning",
    "agent-token-init",
    "gw-scope-map",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "claim-diagnostics",
  ],
  ai_advice: [
    "agent-llm-reasoning",
    "agent-token-init",
    "gw-scope-map",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "claim-diagnostics",
  ],
  ai_helix_advice: [
    "agent-llm-reasoning",
    "agent-token-init",
    "gw-scope-map",
    "agent-scope-aware-cache",
    "olb-resource-token",
    "claim-diagnostics",
  ],
};

// Backwards compatibility: flat ACTIONS array from ACTION_GROUPS
const ACTIONS = Object.values(ACTION_GROUPS).flat();

/**
 * Explains why a specific compliance step is skipped (not applicable) for a given action.
 * Maps step ID → human-readable explanation for that action type.
 */
function getStepSkipExplanation(actionId, stepId) {
  const explanations = {
    // Test Wrong Audience: only auth init, no scope/gateway/consent flow
    test_wrong_audience: {
      "gw-scope-map":
        "Audience error caught at token init, no scope mapping needed",
      "gw-denial-metadata":
        "Auth error returned directly, no gateway denial structure",
      "bff-response-shape":
        "Audience mismatch returns error before denial formatting",
      "gw-hitl-challenge-type": "No HITL flow for auth errors",
      "agent-error-propagation":
        "Agent never receives tool list; init fails first",
      "agent-recovery-branch": "No login/HITL branch for audience mismatch",
      "agent-scope-aware-cache": "Already attempted at token init; fails there",
      "olb-resource-token": "Token exchange not required for auth failures",
      "ui-gateway-consent": "No consent dialog for authentication errors",
      "ui-auto-refire": "No re-fire after login for wrong audience",
      "claim-diagnostics": "Basic auth error, no claim inspection needed",
    },
    // Test Wrong Scope: auth succeeds but scope check fails at agent level
    test_wrong_scope: {
      "gw-scope-map":
        "Agent doesn't request tool list (tests scope rejection directly)",
      "gw-denial-metadata": "No gateway denial for simple scope mismatch",
      "bff-response-shape": "BFF error bypasses denial formatting",
      "gw-hitl-challenge-type": "No HITL flow for scope errors",
      "agent-error-propagation":
        "Agent detects scope missing before calling tools",
      "agent-recovery-branch":
        "Scope error is terminal, no login/HITL recovery",
      "olb-resource-token": "Token exchange fails at agent validation",
      "ui-gateway-consent": "No consent dialog for scope errors",
      "ui-auto-refire": "No re-fire after scope rejection",
      "claim-diagnostics": "Scope error detected before claim inspection",
    },
    // Simple read operations: no HITL, no gateway denial, just MCP call
    accounts: {
      "gw-denial-metadata": "Read-only operation, no gateway denial needed",
      "bff-response-shape": "No 401/403 JSON-RPC error response",
      "gw-hitl-challenge-type": "No HITL (Human-In-The-Loop) required",
      "agent-error-propagation": "No error branch for successful auth",
      "agent-recovery-branch": "No error recovery needed",
      "bff-login-resume": "No pending intent storage for simple reads",
      "ui-gateway-consent": "No HITL consent dialog needed",
      "ui-auto-refire": "No re-fire after successful auth",
    },
    transactions: {
      "gw-denial-metadata": "Read-only operation, no gateway denial needed",
      "bff-response-shape": "No 401/403 JSON-RPC error response",
      "gw-hitl-challenge-type": "No HITL required",
      "agent-error-propagation": "No error branch",
      "agent-recovery-branch": "No error recovery",
      "bff-login-resume": "No pending intent storage",
      "ui-gateway-consent": "No HITL consent dialog",
      "ui-auto-refire": "No re-fire needed",
    },
    balance: {
      "gw-denial-metadata": "Read-only, no gateway denial",
      "bff-response-shape": "No error response",
      "gw-hitl-challenge-type": "No HITL required",
      "agent-error-propagation": "No error branch",
      "agent-recovery-branch": "No recovery needed",
      "bff-login-resume": "No pending intent",
      "ui-gateway-consent": "No HITL consent",
      "ui-auto-refire": "No re-fire",
    },
    // Write operations (no HITL threshold) follow same pattern
    deposit: {
      "gw-denial-metadata": "Transaction below HITL threshold, no denial",
      "bff-response-shape": "No 401/403 response",
      "gw-hitl-challenge-type": "Amount below HITL minimum",
      "agent-error-propagation": "No error for successful transaction",
      "agent-recovery-branch": "No error recovery",
      "bff-login-resume": "No pending intent for approved transaction",
      "ui-gateway-consent": "No HITL consent (below threshold)",
      "ui-auto-refire": "No re-fire after approval",
    },
    withdraw: {
      "gw-denial-metadata": "Transaction below HITL threshold",
      "bff-response-shape": "No error response",
      "gw-hitl-challenge-type": "Amount below HITL minimum",
      "agent-error-propagation": "No error branch",
      "agent-recovery-branch": "No recovery needed",
      "bff-login-resume": "No pending intent",
      "ui-gateway-consent": "No HITL consent (below threshold)",
      "ui-auto-refire": "No re-fire",
    },
    transfer: {
      "gw-denial-metadata": "Transaction below HITL threshold",
      "bff-response-shape": "No error response",
      "gw-hitl-challenge-type": "Amount below HITL minimum",
      "agent-error-propagation": "No error branch",
      "agent-recovery-branch": "No recovery needed",
      "bff-login-resume": "No pending intent",
      "ui-gateway-consent": "No HITL consent (below threshold)",
      "ui-auto-refire": "No re-fire",
    },
    // HITL: all steps apply or most apply
    test_hitl_required: {
      "agent-scope-aware-cache":
        "Omitted: HITL test doesn't use full token exchange",
      "olb-resource-token": "Omitted: test uses simplified flow",
      "claim-diagnostics": "Omitted: test skips claim diagnostics",
    },
    transfer_600_test: {
      "agent-scope-aware-cache":
        "Omitted: HITL test doesn't use full token exchange",
      "olb-resource-token": "Omitted: test uses simplified flow",
      "claim-diagnostics": "Omitted: test skips claim diagnostics",
    },
  };

  const actionExplanations = explanations[actionId] || {};
  return actionExplanations[stepId] || "Not applicable to this action type";
}

// ─── Suggested prompts — role-aware ──────────────────────────────────────────

const SUGGESTIONS_CUSTOMER = [
  "Show me my accounts",
  "Show me my full account details",
  "Transfer $100 from checking to savings",
  "Deposit $50 into checking",
];

const SUGGESTIONS_ADMIN = [
  "Show all customer accounts",
  "Show me last 5 errors",
  "What is step-up auth?",
];

const SUGGESTIONS_CONFIG_CUSTOMER = [
  "How do I change industry branding (e.g. FunnyBank) on the config page?",
  "How do Agent MCP scopes limit transfers vs read-only?",
  "What PingOne or OAuth environment variables does this app need?",
  "How should I set redirect URIs for local development?",
  "What OAuth scopes does the BFF use?",
  "What is PKCE and why does this app use it?",
  "List MCP tools",
  "How do I fix invalid_redirect_uri?",
];

const SUGGESTIONS_CONFIG_ADMIN = [
  "How do I add a new industry preset (colors, logo) to this demo?",
  "What is agent_mcp_allowed_scopes and how does token exchange use it?",
  "What worker app credentials does the API server need in production?",
  "What redirect URIs should I register in PingOne for this demo?",
  "Show me last 5 errors",
  "List MCP tools",
  "How does token exchange work for the MCP server?",
  "What is CIBA?",
];

/**
 * Chat copy when the BFF has a cookie but no live OAuth tokens.
 * Adapts to store quota/auth errors vs. healthy Redis but missing OAuth tokens in this session.
 */
function buildSessionNotHydratedChat(storeError, sessionStoreHealthy = null) {
  const isQuota =
    storeError && storeError.includes("max requests limit exceeded");
  const isMissingAuth =
    storeError &&
    (storeError.includes("WRONGPASS") || storeError.includes("unauthorized"));

  let secondLine;
  if (isQuota) {
    secondLine =
      "The Upstash Redis daily request quota is exhausted — the session store cannot save or load tokens until the quota resets.";
  } else if (isMissingAuth) {
    secondLine =
      "The session store rejected credentials (WRONGPASS or unauthorized).";
  } else if (storeError) {
    secondLine = `The session store reported an error: ${storeError}`;
  } else if (sessionStoreHealthy === true) {
    secondLine =
      "The session store is healthy, but this browser session does not have OAuth access tokens. The server rebuilt your identity from the signed _auth cookie (sessionRestored / accessTokenStub in session debug).";
  } else {
    secondLine =
      'This session has no OAuth tokens (cookie-only or failed save after login). It is not the same as "Redis is down".';
  }

  const lines = [
    "Your browser shows you as signed in, but the AI Agent needs OAuth tokens on the server for MCP and NL.",
    secondLine,
    "",
    'Diagnose: use "Open session debug" (uses ?deep=1) — compares Redis row vs req.session; sessionStoreHealthy can be true while accessTokenStub is true.',
    "",
  ];

  if (isQuota) {
    lines.push(
      "Fix options:",
      "  1. Wait — Upstash free-tier quota resets at midnight UTC automatically.",
      "  2. Upgrade — go to console.upstash.com and upgrade the database to Pay-As-You-Go.",
      "  3. Recreate — create a new Upstash database and update KV_REST_API_URL + KV_REST_API_TOKEN in Vercel.",
      "",
      "After the quota resets or the database is replaced, sign out and sign in again.",
    );
  } else if (isMissingAuth) {
    lines.push(
      "Fix: In Vercel → Settings → Environment Variables, confirm these are set and correct:",
      "  • KV_REST_API_URL",
      "  • KV_REST_API_TOKEN",
      "Apply to Production, redeploy, sign out, sign in again.",
    );
  } else if (storeError) {
    lines.push(
      "Fix: sign out and sign in again after the store error is resolved. Check Vercel logs for session-store or OAuth callback errors.",
    );
  } else {
    lines.push(
      "Fix:",
      "  1. Sign out completely, then sign in again with PingOne (writes fresh tokens into the server session).",
      '  2. If it still happens right after login, check Vercel logs for "[oauth/user/callback] Session save FAILED".',
    );
  }

  lines.push(
    "",
    sessionStoreHealthy === true
      ? '"Refresh access token" only helps if the server already holds a refresh token. With a stub token, use Sign out and sign in again.'
      : 'After a fresh login you want sessionStoreType: "upstash-rest" and sessionStoreHealthy: true. "Refresh access token" cannot fix a missing session store.',
  );

  return lines.join("\n");
}

/** Fallback when session response is not available (no healthy flag). */
const SESSION_NOT_HYDRATED_CHAT = buildSessionNotHydratedChat(null, null);

/**
 * Picks the signed-in user from Backend-for-Frontend (BFF) status responses and reads cookie-only / Vercel hydration flag from GET /api/auth/session.
 */
function resolveSessionFromAuthTrio(admin, endUser, session) {
  const found =
    admin?.authenticated && admin.user
      ? admin.user
      : endUser?.authenticated && endUser.user
        ? endUser.user
        : session?.authenticated && session.user
          ? session.user
          : null;
  return { found, cookieOnlyBffSession: !!session?.cookieOnlyBffSession };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(n) {
  return typeof n === "number"
    ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : n;
}

/** Unwrap MCP `tools/call` shape `{ content: [{ text: "<json>" }] }` for display logic. */
function normalizeAgentToolResult(result) {
  if (!result) return result;
  if (
    result.content &&
    Array.isArray(result.content) &&
    result.content[0]?.text
  ) {
    try {
      return JSON.parse(result.content[0].text);
    } catch {
      return result;
    }
  }

  return result;
}

const _BANKING_ACCT_TYPES = /^(checking|savings|loan|chequing)$/i;

/**
 * Vertical account-type consistency guard — runs immediately after get_my_accounts returns.
 * If the active vertical expects non-banking account types (e.g. "Pro Member") but the MCP
 * result still carries banking labels (CHECKING/SAVINGS — stale data from a reseed race),
 * this rewrites the accountType on each account in-place so every downstream consumer
 * (formatResult, AccountsTable, liveAccounts) sees the correct vertical type without needing
 * its own fallback. Mutates a deep-clone of the response — never the original.
 *
 * @param {object} mcpResponse - raw response from callMcpTool("get_my_accounts")
 * @param {object|null} terminology - active vertical's terminology object (null = banking)
 * @returns {object} - mcpResponse with accountTypes corrected if needed, or original if not
 */
function enforceVerticalAccountTypes(mcpResponse, terminology) {
  const verticalTypes = terminology?.accountTypes;
  if (!verticalTypes?.length || !mcpResponse) return mcpResponse;

  const normalized = normalizeAgentToolResult(mcpResponse);
  const accounts = normalized?.accounts;
  if (!Array.isArray(accounts) || !accounts.length) return mcpResponse;

  const hasStaleBankingType = accounts.some(
    (a) => _BANKING_ACCT_TYPES.test(a.accountType || a.account_type || a.type || "")
  );
  if (!hasStaleBankingType) return mcpResponse;

  // Stale banking types detected — rewrite in a cloned response tree
  const patched = accounts.map((a, idx) => {
    const raw = a.accountType || a.account_type || a.type || "";
    if (_BANKING_ACCT_TYPES.test(raw)) {
      const correctType = verticalTypes[idx] || verticalTypes[0];
      return { ...a, accountType: correctType, account_type: correctType, type: correctType };
    }
    return a;
  });

  // Rebuild the MCP content blob with the patched accounts
  try {
    const inner = { ...normalized, accounts: patched };
    if (mcpResponse?.content?.[0]?.text) {
      return {
        ...mcpResponse,
        content: [{ ...mcpResponse.content[0], text: JSON.stringify(inner) }],
      };
    }
    return inner;
  } catch {
    return mcpResponse;
  }
}

/**
 * Build the payload expected by POST /api/transactions/consent-challenge
 * from the agent actionId + form values (same keys used in runAction).
 */
function buildConsentIntent(actionId, form) {
  const amount = parseFloat(form.amount);
  if (actionId === "deposit") {
    return {
      type: "deposit",
      toAccountId: form.accountId || form.toId,
      fromAccountId: null,
      amount,
      description: form.note || "Agent deposit",
    };
  }
  if (actionId === "withdraw") {
    return {
      type: "withdrawal",
      fromAccountId: form.accountId || form.fromId,
      toAccountId: null,
      amount,
      description: form.note || "Agent withdrawal",
    };
  }
  if (actionId === "transfer" || actionId === "transfer_600_test") {
    return {
      type: "transfer",
      fromAccountId: form.fromId,
      toAccountId: form.toId,
      amount,
      description: form.note || "Agent transfer",
    };
  }
  return null;
}

/** Maps MCP JSON (including deposit/transfer/withdraw shapes) to results panel + dashboard event types. */
function inferAgentResultTypeAndData(normalized) {
  if (!normalized || typeof normalized !== "object")
    return { resultType: null, resultData: null };
  if (normalized.accounts)
    return { resultType: "accounts", resultData: normalized.accounts };
  if (normalized.transactions)
    return { resultType: "transactions", resultData: normalized.transactions };
  if (normalized.balance !== undefined && normalized.error === undefined) {
    return { resultType: "balance", resultData: normalized.balance };
  }
  if (normalized.transaction_id || normalized.transactionId || normalized.id) {
    return { resultType: "confirm", resultData: normalized };
  }
  if (normalized.transaction?.id)
    return { resultType: "confirm", resultData: normalized };
  if (
    normalized.success === true &&
    (normalized.operation === "transfer" ||
      normalized.operation === "deposit" ||
      normalized.operation === "withdrawal")
  ) {
    return { resultType: "confirm", resultData: normalized };
  }
  return { resultType: null, resultData: null };
}

/** True when the tool returned an error object (local MCP or consent JSON), not a data payload. */
function isAgentToolErrorResult(normalized) {
  if (!normalized || typeof normalized !== "object") return false;
  if (normalized.accounts || normalized.transactions) return false;
  if (normalized.transaction_id || normalized.transactionId || normalized.id)
    return false;
  if (normalized.balance !== undefined && normalized.error === undefined)
    return false;
  return Boolean(normalized.error);
}

/** Format HTTP trace entries (MCP server → banking API calls) for display in chat */
function formatHttpTrace(trace) {
  if (!trace || trace.length === 0) return "";
  const lines = ["\n\n Banking API calls:"];
  trace.forEach((entry, i) => {
    const status = entry.status
      ? ` → ${entry.status} ${entry.ok ? "✅" : "❌"}`
      : entry.ok
        ? " ✅"
        : " ❌";
    lines.push(
      `\n${i + 1}. ${entry.method} ${entry.url}${status} (${entry.durationMs}ms)`,
    );
    if (entry.requestBody) {
      const body = JSON.stringify(entry.requestBody, null, 2).slice(0, 300);
      lines.push(`\n// Request body\n${body}\n`);
    }
    if (entry.responseBody !== undefined) {
      const resp = JSON.stringify(entry.responseBody, null, 2).slice(0, 400);
      lines.push(`\n// Response\n${resp}\n`);
    }
    if (entry.error) {
      lines.push(`_Error: ${entry.error}_`);
    }
  });
  return lines.join("\n");
}

export function formatResult(result, terminology) {
  const termAccount = terminology?.account || "Account";
  const termBalance = terminology?.balance || "Balance";
  const r = normalizeAgentToolResult(result);
  if (!r) return "No data returned.";
  if (r.error === "hitl_required") {
    const t = r.hitl_threshold_usd ?? APP_CONFIG.THRESHOLDS.HITL_DEFAULT;
    return `${r.message || "Human approval is required for this amount."}\n\nUse the main dashboard to complete the consent flow for amounts over $${t}. The assistant cannot supply a browser consent challenge.`;
  }
  if (isAgentToolErrorResult(r)) {
    let errorMsg = `❌ ${typeof r.message === "string" ? r.message : r.error}`;
    // Include original MCP request for debugging
    if (r.originalRequest) {
      const reqStr = JSON.stringify(r.originalRequest, null, 2).slice(0, 500); // Truncate for display
      errorMsg += `\n\n Original request:\n\n${reqStr}${Object.keys(r.originalRequest).length > 5 ? "\n..." : ""}\n`;
    }
    // Include HTTP trace (request → response to banking API)
    if (r.httpTrace && r.httpTrace.length > 0) {
      errorMsg += formatHttpTrace(r.httpTrace);
    }
    return errorMsg;
  }
  // Accounts list
  if (r.accounts) {
    const BANKING_TYPES = /^(checking|savings|loan|chequing)$/i;
    const verticalTypes = terminology?.accountTypes || [];
    return r.accounts
      .filter(Boolean)
      .map((a, idx) => {
        // Use the actual account type from the server — vertical-seeded accounts carry the
        // correct domain type (e.g. "Pro Member", "Primary Care"). Fool-proof fallback: if
        // we're in a non-banking vertical but the server returned a banking type (stale data
        // from a race on reseed), substitute the vertical's accountTypes label so the user
        // never sees "CHECKING" or "SAVINGS" in a sports/healthcare/retail context.
        let rawType = a.accountType || a.account_type || a.type || "";
        if (terminology && verticalTypes.length && BANKING_TYPES.test(rawType)) {
          rawType = verticalTypes[idx] || verticalTypes[0] || termAccount;
        }
        const displayType = rawType || termAccount;
        const num = a.accountNumber || a.account_number || "";
        const name = (!terminology && a.name && a.name !== a.id)
          ? `${a.name} (${num || "—"})`
          : `${displayType} (${num || "—"})`;

        return `${name} — ${formatCurrency(a.balance)} ${a.currency || "USD"}`;
      })
      .join("\n\n");
  }
  // Transactions list
  if (r.transactions) {
    return r.transactions
      .slice(0, 10)
      .map(
        (t) =>
          `${t.type}: ${formatCurrency(t.amount)} — ${t.description || ""}\n  ${new Date(t.date || t.created_at || t.createdAt).toLocaleDateString()}`,
      )
      .join("\n\n");
  }
  // Balance response
  if (r.balance !== undefined) {
    return `${termBalance}: ${formatCurrency(r.balance)}`;
  }
  // Transaction confirmation (single transaction)
  if (r.transaction_id || r.transactionId || r.id) {
    return `Transaction confirmed\nTransaction ID: ${r.transaction_id || r.transactionId || r.id}\nAmount: ${formatCurrency(r.amount)}`;
  }
  // Transfer / deposit / withdrawal confirmation (MCP server shape: success + operation)
  if (r.success === true && r.operation) {
    const op = r.operation;
    const lines = [
      r.message || `${op.charAt(0).toUpperCase() + op.slice(1)} confirmed`,
    ];
    if (op === "transfer") {
      lines.push(`Amount: ${formatCurrency(r.amount)}`);
      lines.push(`From: ${r.fromAccountId}  →  To: ${r.toAccountId}`);
    } else if (op === "deposit") {
      lines.push(`Amount: ${formatCurrency(r.amount)}`);
      lines.push(`To: ${r.toAccountId}`);
    } else if (op === "withdrawal") {
      lines.push(`Amount: ${formatCurrency(r.amount)}`);
      lines.push(`From: ${r.fromAccountId}`);
    }
    if (r.withdrawalTransaction?.id)
      lines.push(`Debit ID: ${r.withdrawalTransaction.id}`);
    if (r.depositTransaction?.id)
      lines.push(`Credit ID: ${r.depositTransaction.id}`);
    if (r.transactionId || r.transaction?.id)
      lines.push(`Transaction ID: ${r.transactionId || r.transaction?.id}`);
    return lines.join("\n");
  }
  return JSON.stringify(r, null, 2);
}

// ─── Exported terminology helpers (used in tests and internally) ──────────────

/** Returns the appropriate results panel title using vertical terminology. */
export function buildResultsPanelTitle(resultType, terminology) {
  if (resultType === "accounts") return terminology?.accounts || "Accounts";
  if (resultType === "transactions") return terminology?.transactions || "Recent Transactions";
  if (resultType === "balance") return terminology?.balance || "Balance";
  return resultType || "Results";
}

/** Returns the clarification question strings, adjusted for vertical terminology. */
export function buildClarificationQuestions(terminology) {
  const termAccounts  = terminology?.accounts       || "accounts";
  const termHighValue = terminology?.highValueAction || "Transfer";
  const termTypes     = terminology?.accountTypes    || ["checking", "savings"];
  return {
    transfer: `Which ${termAccounts} would you like to ${termHighValue.toLowerCase()} between? (e.g. ${termTypes[0] || "account"} to ${termTypes[1] || "account"})`,
    accounts: `Which ${termAccounts} would you like to view?`,
  };
}


// ─── Results Panel (side panel showing rich formatted data next to the agent) ──

const _BANKING_TYPES_RE = /^(checking|savings|loan|chequing)$/i;

export function AccountsTable({ accounts, terminology }) {
  if (!accounts?.length)
    return <p className="bar-rp-empty">No accounts found.</p>;

  const verticalTypes = terminology?.accountTypes || [];

  const resolveAccountType = (a, idx) => {
    const raw = a.accountType || a.account_type || a.type || "";
    // Fool-proof: substitute banking type labels when in a non-banking vertical
    if (terminology && verticalTypes.length && _BANKING_TYPES_RE.test(raw)) {
      return verticalTypes[idx] || verticalTypes[0] || terminology.account || "Account";
    }
    return raw || terminology?.account || "Account";
  };

  const getFriendlyAccountName = (account) => {
    if (!account) return terminology?.account || "Account";
    // Use server-stored name for banking vertical (no terminology overlay)
    if (!terminology && account.name && account.name !== account.id) {
      return account.name;
    }
    const accountNumber = account.accountNumber || account.account_number || account.id || "";
    const accountLabel = terminology?.account || "Account";
    return accountNumber ? `${accountLabel} (${accountNumber.slice(-4)})` : accountLabel;
  };

  return (
    <table className="bar-rp-table">
      <thead>
        <tr>
          <th>Type</th>
          <th>{(terminology?.account || "Account")} Name</th>
          <th>{terminology?.balance || "Balance"}</th>
        </tr>
      </thead>
      <tbody>
        {accounts.filter(Boolean).map((a, i) => (
          <tr key={a.account_number || a.id || i}>
            <td>{resolveAccountType(a, i)}</td>
            <td>
              <span className="bar-rp-account-name">
                {getFriendlyAccountName(a)}
              </span>
            </td>
            <td className="bar-rp-amount">{formatCurrency(a.balance)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TransactionsTable({ transactions, terminology }) {
  if (!transactions?.length)
    return <p className="bar-rp-empty">No transactions found.</p>;
  return (
    <table className="bar-rp-table">
      <thead>
        <tr>
          <th>{terminology?.transaction || "Type"}</th>
          <th>{terminology?.balance || "Amount"}</th>
          <th>Description</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {transactions.slice(0, 20).map((t, i) => (
          <tr key={t.id || i}>
            <td>
              <span
                className={`bar-rp-type bar-rp-type-${(t.type || "").toLowerCase()}`}
              >
                {t.type}
              </span>
            </td>
            <td className="bar-rp-amount">{formatCurrency(t.amount)}</td>
            <td className="bar-rp-desc" title={t.description || ""}>
              {t.description || "—"}
            </td>
            <td className="bar-rp-date">
              {new Date(
                t.date || t.created_at || t.createdAt || Date.now(),
              ).toLocaleDateString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Renders sequential_think reasoning steps as a collapsible block. */
function ReasoningSteps({ steps, conclusion }) {
  if (!steps?.length && !conclusion) {
    return (
      <div className="ba-reasoning ba-reasoning--empty">
        <span className="ba-reasoning__icon" aria-hidden>
          [R]
        </span>
        <span
          className="ba-reasoning__label"
          style={{
            color: "var(--color-text-secondary,#6b7280)",
            fontSize: "0.85rem",
            marginLeft: 6,
          }}
        >
          Sequential thinking unavailable (MCP server not connected)
        </span>
      </div>
    );
  }
  return (
    <details className="ba-reasoning" open>
      <summary className="ba-reasoning__summary">
        <span className="ba-reasoning__icon" aria-hidden>
          [R]
        </span>
        <span className="ba-reasoning__label">
          Reasoning ({steps?.length ?? 0} steps)
        </span>
      </summary>
      <div className="ba-reasoning__body">
        <ol className="ba-reasoning__steps">
          {steps.map((step, i) => (
            <li key={i} className="ba-reasoning__step">
              <span className="ba-reasoning__step-title">{step.title}</span>
              {step.description && (
                <p className="ba-reasoning__step-desc">{step.description}</p>
              )}
            </li>
          ))}
        </ol>
        {conclusion && (
          <p className="ba-reasoning__conclusion"> {conclusion}</p>
        )}
      </div>
    </details>
  );
}

/** Renders MCP-style tool step chips (read/update account, transactions) between user ask and reply. */
function ToolProgressChips({ steps }) {
  const [expandedIdx, setExpandedIdx] = React.useState(null);
  if (!steps?.length) return null;
  return (
    <ul className="ba-tool-progress" aria-label="Tool calls">
      {steps.map((s, i) => {
        const isExpanded = expandedIdx === i;
        const hasError = s.status === "error" && s.error;
        return (
          <li
            key={`${s.name}-${i}`}
            className={`ba-tool-chip${hasError ? " ba-tool-chip--error" : ""}`}
          >
            <div
              className="ba-tool-chip-row"
              onClick={() => hasError && setExpandedIdx(isExpanded ? null : i)}
              style={{ cursor: hasError ? "pointer" : "default" }}
            >
              <span className="ba-tool-chip-ico" aria-hidden />
              <span className="ba-tool-chip-name">{s.name}</span>
              <span className="ba-tool-chip-sep">·</span>
              <span
                className={`ba-tool-chip-status ba-tool-chip-status--${s.status}`}
              >
                {s.status === "running"
                  ? "Running…"
                  : s.status === "success"
                    ? "Success"
                    : "Failed"}
              </span>
              <span className="ba-tool-chip-chev" aria-hidden>
                {hasError ? (isExpanded ? "▾" : "▸") : "›"}
              </span>
            </div>
            {hasError && isExpanded && (
              <div className="ba-tool-chip-detail">
                <div className="ba-tool-chip-detail-row">
                  <span className="ba-tool-chip-detail-label">Tool</span>
                  <code>{s.error.tool || s.name}</code>
                </div>
                {s.error.code && (
                  <div className="ba-tool-chip-detail-row">
                    <span className="ba-tool-chip-detail-label">Code</span>
                    <code>{s.error.code}</code>
                  </div>
                )}
                {s.error.message && (
                  <div className="ba-tool-chip-detail-row">
                    <span className="ba-tool-chip-detail-label">Message</span>
                    <span>{s.error.message}</span>
                  </div>
                )}
                <div className="ba-tool-chip-detail-hint">
                  See the chat response below for full policy explanation and
                  fix hints.
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function MessageContent({ text, isTokenEvent, terminology }) {
  // Detect and format account data as tables (remove emojis)
  // Matches lines emitted by formatResult: "Type (****NNNN) — $X.XX USD"
  const accountPattern = /^(.+?)\s*\(([^)]+)\)\s*—\s*(\$[\d,]+\.\d{2}(?:\s+\w+)?)\s*$/gm;
  const accountMatches = [...text.matchAll(accountPattern)];

  if (accountMatches.length > 0) {
    const rows = accountMatches.map((match) => ({
      account: match[1].trim(),
      id: match[2].trim(),
      balance: match[3].trim(),
    }));

    return (
      <table className="ba-msg-table">
        <thead>
          <tr>
            <th>{terminology?.accounts || "Account"}</th>
            <th>ID</th>
            <th>{terminology?.balance || "Balance"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row.account}-${idx}`}>
              <td>
                <strong>{row.account}</strong>
              </td>
              <td>{row.id}</td>
              <td>{row.balance}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // Detect and format transaction data as tables
  const transactionPattern =
    /^(transfer_out|transfer_in|deposit|withdrawal|balance):\s*(.+?)(?=\n|$)/gm;
  const hasTransactions = transactionPattern.test(text);

  if (hasTransactions) {
    const rows = [];
    const lines = text.split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (!line) {
        i++;
        continue;
      }

      const match = line.match(
        /^(transfer_out|transfer_in|deposit|withdrawal|balance):\s*(.+)/,
      );
      if (match) {
        const [, type, content] = match;
        const nextLine = lines[i + 1]?.trim();
        const isDateLike =
          nextLine &&
          /^\d{4}-\d{2}-\d{2}|^\d{1,2}\/\d{1,2}\/\d{4}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/.test(
            nextLine,
          );
        const date = isDateLike ? nextLine : "--";
        rows.push({ type, content, date });
        i += 2;
      } else {
        i++;
      }
    }

    if (rows.length > 0) {
      return (
        <table className="ba-msg-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Details</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`${row.type}-${row.content}-${idx}`}>
                <td>
                  <strong>{row.type}</strong>
                </td>
                <td>{row.content}</td>
                <td>{row.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
  }

  // Structured RFC annotation card ("Transfer complete — what just happened:")
  if (text.includes("what just happened:")) {
    const lines = text.split("\n");
    const title = lines[0];
    const entries = [];
    const footer = [];
    let pastFirstBlank = false;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) {
        if (entries.length > 0) pastFirstBlank = true;
        continue;
      }
      if (pastFirstBlank) footer.push(line);
      else entries.push(line);
    }
    return (
      <div className="ba-rfc-card">
        <div className="ba-rfc-card__title">
          <InlineMd text={title} />
        </div>
        {entries.length > 0 && (
          <div className="ba-rfc-card__entries">
            {entries.map((entry, i) => {
              const dash = entry.indexOf(" — ");
              const key = dash >= 0 ? entry.slice(0, dash) : null;
              const val = dash >= 0 ? entry.slice(dash + 3) : entry;
              return (
                <div
                  key={entry}
                  className={`ba-rfc-card__entry${i % 2 ? " ba-rfc-card__entry--alt" : ""}`}
                >
                  {key && <strong className="ba-rfc-card__key">{key}</strong>}
                  {key && <span className="ba-rfc-card__sep"> — </span>}
                  <InlineMd text={val} />
                </div>
              );
            })}
          </div>
        )}
        {footer.length > 0 && (
          <div className="ba-rfc-card__footer">
            {footer.map((line) => (
              <div key={line} className="ba-rfc-card__footer-row">
                <InlineMd text={line} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <MarkdownContent
      text={text}
      className={
        isTokenEvent ? "ba-msg-body ba-msg-body--event" : "ba-msg-body"
      }
    />
  );
}

export function ResultsPanel({ panel, onClose, style }) {
  const [size, setSize] = useState({ width: 340, height: 420 });
  const resizingRef = useRef(null);

  const onResizeMouseDown = useCallback(
    (e, dir) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = size.width;
      const startH = size.height;
      resizingRef.current = { startX, startY, startW, startH, dir };

      const onMove = (ev) => {
        const {
          startX: sx,
          startY: sy,
          startW: sw,
          startH: sh,
          dir: d,
        } = resizingRef.current;
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        setSize({
          width: d === "e" || d === "se" ? Math.max(240, sw + dx) : sw,
          height: d === "s" || d === "se" ? Math.max(160, sh + dy) : sh,
        });
      };
      const onUp = () => {
        resizingRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.userSelect = "none";
      document.body.style.cursor =
        dir === "se" ? "nwse-resize" : dir === "e" ? "ew-resize" : "s-resize";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [size],
  );

  if (!panel) return null;
  return (
    <aside
      className="banking-agent-results-panel"
      style={{ ...style, width: size.width, maxHeight: size.height }}
      aria-label="Results"
    >
      <div className="bar-rp-header">
        <span className="bar-rp-title">{panel.title}</span>
        <button
          type="button"
          className="bar-rp-close"
          onClick={onClose}
          aria-label="Close results"
        >
          x
        </button>
      </div>
      <div className="bar-rp-body">
        {panel.type === "accounts" && <AccountsTable accounts={panel.data} terminology={panel.terminology} />}
        {panel.type === "transactions" && (
          <TransactionsTable transactions={panel.data} terminology={panel.terminology} />
        )}
        {panel.type === "balance" && (
          <div className="bar-rp-balance">
            <span className="bar-rp-balance-label">{panel.terminology?.balance || "Balance"}</span>
            <span className="bar-rp-balance-value">
              {formatCurrency(panel.data)}
            </span>
          </div>
        )}
        {panel.type === "confirm" && (
          <div className="bar-rp-confirm">
            <span className="bar-rp-confirm-icon">✅</span>
            <div className="bar-rp-confirm-body">
              <div className="bar-rp-confirm-label">{panel.title}</div>
              {panel.data?.transaction_id && (
                <div>
                  Transaction ID: <code>{panel.data.transaction_id}</code>
                </div>
              )}
              {panel.data?.amount && (
                <div>Amount: {formatCurrency(panel.data.amount)}</div>
              )}
            </div>
          </div>
        )}
        {panel.type === "text" && (
          <div className="bar-rp-text">{panel.data}</div>
        )}
        {panel.type === "vertical" && (
          <VerticalResult descriptor={panel.descriptor} data={panel.data} />
        )}
      </div>
      {/* Resize handles */}
      <div
        className="bar-rp-resize-e"
        onMouseDown={(e) => onResizeMouseDown(e, "e")}
        aria-hidden
      />
      <div
        className="bar-rp-resize-s"
        onMouseDown={(e) => onResizeMouseDown(e, "s")}
        aria-hidden
      />
      <div
        className="bar-rp-resize-se"
        onMouseDown={(e) => onResizeMouseDown(e, "se")}
        aria-label="Resize"
        title="Drag to resize"
      />
    </aside>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function buildCustomerGreeting(u, manifestGreeting) {
  const name = (u && (u.firstName || (u.name && u.name.split(' ')[0]))) || 'there';
  if (manifestGreeting) return manifestGreeting.replace('{name}', name);
  return `Hi ${name}! I'm your AI assistant. I can help with your accounts, explain the OAuth flows behind the scenes, and more. What would you like to do?`;
}

function welcomeMessage(
  u,
  focus = "banking",
  brandShortName = "AI Demo",
  customerGreetingOverride = null,
) {
  if (focus === "config") {
    if (!u) {
      return `Ask about PingOne, redirect URIs, OAuth scopes, Agent MCP scopes (limit transfers vs read-only), environment variables, and industry branding (${brandShortName} vs other presets) for this demo.`;
    }
    const name = u.firstName || u.name?.split(" ")[0] || "there";
    if (u.role === "admin") {
      return `Hi ${name} — you're on Application Configuration. Ask about environment IDs, worker apps, redirect URIs, OAuth, Industry & branding (ui_industry_preset), or Agent MCP scopes (agent_mcp_allowed_scopes) — turn off transfers for a read-only agent demo; the BFF runs RFC 8693 token exchange on each tool call with the selected scopes. Banking shortcuts are hidden here. Theme: ${brandShortName}.`;
    }
    return `Hi ${name} — you're on Application Configuration. Ask how to connect PingOne, switch branding (e.g. FunnyBank), or limit the agent with Agent MCP scopes (e.g. disable transfers). Theme: ${brandShortName}.`;
  }
  if (!u) return "You're signed in! What would you like to do?";
  const name = u.firstName || u.name?.split(" ")[0] || "there";
  if (u.role === "admin") {
    return `Welcome, ${name}! As an admin you can query accounts system-wide, view all transactions, manage users, and explore PingOne OAuth flows. What would you like to do?`;
  }
  return buildCustomerGreeting(u, customerGreetingOverride);
}

function normalizeBankingParams(params) {
  const p = { ...(params || {}) };
  if (p.account_id && !p.accountId) p.accountId = p.account_id;
  if (p.from_account_id && !p.fromId) p.fromId = p.from_account_id;
  if (p.to_account_id && !p.toId) p.toId = p.to_account_id;
  return p;
}

/**
 * Parses simple log-focused prompts into a structured query command.
 */
function parseLogPrompt(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  const lower = t.toLowerCase();

  const errorMatch =
    lower.match(
      /(?:show|list|give me|get)\s+(?:me\s+)?(?:the\s+)?last\s+(\d+)\s+errors?/,
    ) || lower.match(/last\s+(\d+)\s+errors?/);
  if (errorMatch) {
    return {
      type: "errors",
      limit: Math.min(Math.max(parseInt(errorMatch[1], 10) || 5, 1), 50),
    };
  }

  const loginMatch =
    lower.match(/last\s+success(?:ful)?\s+login\s+for\s+([a-z0-9._@-]+)/i) ||
    lower.match(/last\s+login\s+for\s+([a-z0-9._@-]+)/i);
  if (loginMatch) {
    return { type: "last_login", username: loginMatch[1] };
  }

  return null;
}

// ─── Education topic inline messages (module-level for performance) ───────────

const TOPIC_MESSAGES = {
  [EDU.LOGIN_FLOW]: `Authorization Code + PKCE Flow:\n\n1. App generates code_verifier (random 64 bytes) + code_challenge (SHA-256 hash)\n2. Browser redirects to PingOne /as/authorize with challenge\n3. User authenticates → PingOne redirects back with code\n4. Backend-for-Frontend (BFF) exchanges code + verifier for tokens (server-side only)\n5. Browser never sees the token — only a session cookie\n\nPKCE prevents interception: even if code is stolen, attacker can't exchange it without the verifier.`,
  [EDU.TOKEN_EXCHANGE]: `RFC 8693 Token Exchange (User token → MCP token):\n\nWhy: The user token has broad scope. The MCP server needs a narrowly-scoped MCP token for least-privilege.\n\nHow:\n• Backend-for-Frontend (BFF) holds the User token (session access token)\n• Backend-for-Frontend (BFF) calls PingOne /as/token with grant_type=urn:ietf:params:oauth:grant-type:token-exchange\n• User token is subject_token; agent client credentials are actor_token\n• PingOne validates may_act on the User token and issues an MCP token\n• MCP token has: sub=user, act={client_id=agent}, narrow scope, MCP audience\n\nmay_act on the User token → act on the MCP token — proving delegation chain.`,
  [EDU.MAY_ACT]: `may_act / act Claims (RFC 8693 §4.1):\n\nmay_act on the User token: "this client is allowed to act on my behalf"\n  { "sub": "user-uuid", "may_act": { "client_id": "bff-admin-client" } }\n\nact on the MCP token (exchanged token): "this action was delegated"\n  { "sub": "user-uuid", "act": { "client_id": "bff-admin-client" } }\n\nThe MCP server validates act to confirm the Backend-for-Frontend (BFF) is the authorized actor — not just any client that got a token.`,
  [EDU.MCP_PROTOCOL]: `Model Context Protocol (MCP):\n\nMCP is a JSON-RPC 2.0 protocol over WebSocket (or stdio/SSE) for AI tools.\n\nHandshake:\n  initialize → { protocolVersion, capabilities, serverInfo }\n  → notifications/initialized (client notification)\n\nDiscovery:\n  tools/list → [{ name, description, inputSchema }]\n\nExecution:\n  tools/call { name, arguments } → { content: [{ type, text }] }\n\nIn this demo:\n  Browser → Backend-for-Frontend (BFF) (/api/mcp/tool) → MCP Server (WebSocket) → Demo API\n\nToken flow: Backend-for-Frontend (BFF) performs RFC 8693 exchange before forwarding tool calls.`,
  [EDU.INTROSPECTION]: `RFC 7662 Token Introspection (BFF → PingOne):\n\nThe BFF (not the MCP server) calls PingOne introspection in two places:\n  1. At login — immediately after the OAuth callback to confirm the session is live\n  2. Before every MCP tool call — to catch revoked/expired sessions before token exchange\n\n  POST /as/introspect\n  { token: "...", token_type_hint: "access_token" }\n  → { active: true, sub, scope, exp, aud, client_id }\n\nWhy introspection for the user token specifically?\n• Catches revoked sessions in real time (JWKS cannot detect revocation)\n• The result is shown in the Token Chain as "user-token-introspection"\n\nAll other tokens (agent CC token, exchanged MCP tokens) use RFC 7515 JWKS\nsignature verification instead — local, fast, and tamper-evident.`,
  [EDU.STEP_UP]: `Step-Up Authentication (RFC 9470):\n\nTriggered when a high-value action requires stronger auth:\n• Transfer amount ≥ threshold (set in Security Settings) → require MFA\n• BFF returns HTTP 428 with WWW-Authenticate: Bearer scope="step_up"\n\nTwo methods:\n1. OTP / CIBA: PingOne sends code to registered device (out-of-band)\n2. Redirect: Browser → /api/auth/oauth/user/stepup?acr_values=Multi_Factor → PingOne MFA\n\nAfter the user completes MFA — PingOne (the AS) authorizes based on:\n  • Scope: confirms transfer is allowed under this policy\n  • ACR: confirms MFA assurance level was achieved\n  • Threshold: token issued only after identity verification at required level\n\nPingOne issues a new elevated token:\n  { acr: "Multi_Factor", scope: "transfer", sub: user }\nBFF receives it → introspects it (RFC 7662) to confirm active + acr claims\nBFF re-exchanges it for a narrowly-scoped MCP token (RFC 8693)\nExchanged token JWKS-verified (RFC 7515) before any tool call\nOriginal transaction retried automatically.`,
  [EDU.AGENT_GATEWAY]: `Agent Gateway / Resource Indicators (RFC 8707):\n\nRFC 8707: client specifies the resource URI when requesting a token\n  /as/token?resource=https://mcp.example.com\n  → token aud = "https://mcp.example.com"\n\nRFC 9728: Protected Resource Metadata\n  GET https://mcp.example.com/.well-known/oauth-protected-resource\n  → { resource, authorization_servers, scopes_supported }\n\nThis lets a dynamic AI agent discover what auth is needed before attempting a tool call — no hardcoded configuration.`,
  [EDU.PINGONE_AUTHORIZE]: `PingOne Authorize (DaVinci):\n\nPingOne Authorize evaluates access policies at runtime using DaVinci flows.\n\nIn this demo it drives:\n• Step-up MFA triggers (ACR values like "Multi_factor")\n• CIBA push notifications to the user's device\n• Dynamic consent for high-value transactions\n\nThe acr_values parameter in /as/authorize tells PingOne which DaVinci policy to run.`,
  [EDU.CIMD]: `Client ID Metadata Document (CIMD / RFC 7591):\n\nTraditional OAuth: client_id is an opaque string, pre-registered in the AS.\nCIMD: client_id is a URL you control — it hosts the client's metadata.\n\nThe AS fetches the URL to discover:\n  { redirect_uris, grant_types, scope, client_name, logo_uri, … }\n\nBenefits:\n• No pre-registration — client registers itself\n• Client controls updates (change the hosted document)\n• Works across AS instances that support DCR/RFC 7591\n\nIn this demo: click "Simulate" in the CIMD panel to see PingOne dynamic client registration.`,
  [EDU.LANGCHAIN]: `LangChain (LCEL + Ollama):\n\nLangChain 0.3.x modernises AI agent composition:\n• LCEL (LangChain Expression Language): chain = prompt | llm.bind_tools(tools)\n• Local inference via Ollama — no cloud API keys required\n• Security: all LLM calls stay on localhost — nothing leaves your network\n\nIn this demo: the Chat Widget badge shows the active Ollama model.\nDeep dive: open /langchain or click the badge → Learn more`,
  [EDU.HUMAN_IN_LOOP]: `Human-in-the-loop (HITL) for the AI agent:\n\n• Over $500 the server issues a consent challenge in your session; after you confirm in the consent popup, POST /transactions must include matching consentChallengeId (one-time use).\n• The agent cannot complete that path without your browser session.\n• If you decline, this demo disables the assistant until you sign out and sign in again.\n• HITL differs from MITM (attack). Open the drawer: What is HITL · Patterns & best practices · This app and the agent · Declining and lockout.`,
};

// ─── Inline HITL consent card (middle / dock surfaces) ─────────────────

/**
 * @param {object} props
 * @param {'float' | 'inline'} [props.mode]
 * @param {boolean} [props.embeddedDockBottom] When inline, stack chat on top and suggestions below (dashboard bottom bar)
 * @param {'banking' | 'config'} [props.embeddedFocus] When `config`, dock on Application Configuration emphasizes setup (not transfers).
 * @param {boolean} [props.distinctFloatingChrome] When floating, stronger card/chrome so it reads as a separate widget vs the page.
 * @param {boolean} [props.splitColumnChrome] Inline mode: compact "assistant" chrome for token | agent | banking columns (navy header, chat bubbles).
 */

// Chips that always call the real API regardless of LLM mode.
// Helix has no account data access and would hallucinate if sent as NL prompts.
const API_DIRECT_CHIPS = new Set([
  "accounts", "transactions", "balance", "transfer", "deposit", "withdraw", "feature",
  "mcp_tools", "sensitive-account-details",
  "test_wrong_scope", "test_wrong_audience", "test_hitl_required",
  "transfer_600_test", "test_otp_required",
  "demo_intent_delegation", "test_full_compliance_flow",
]);

// NL prompts for conversational chips in Helix (LLM-only) mode.
// API_DIRECT_CHIPS are excluded — they bypass Helix entirely.
const CHIP_NL_PROMPTS = {
  biggest_purchase: "What is my biggest purchase?",
  spending_summary: "Give me a spending summary",
  query_user: "Query user by email: ",
  sequential_think: "Think: Should I transfer money from checking to savings?",
  demo_nl_routing: "What is my checking account balance?",
  ai_ask: "What can you help me with?",
  ai_helix_demo: "Tell me about interest rates",
  ai_explain: "Explain how token exchange works",
  ai_helix_explain: "Explain what OAuth scopes are",
  ai_analyze: "Summarize how MCP tool delegation works in this demo",
  ai_advice: "Give me some financial advice",
  ai_helix_advice: "What are some tips for saving money?",
};

export default function BankingAgent({
  user,
  onLogout,
  mode = "float",
  embeddedDockBottom = false,
  embeddedFocus = "banking",
  distinctFloatingChrome = false,
  splitColumnChrome = false,
  showPopOut = false,
  onPopout,
  surfaceHostEl = null,
}) {
  const isInline = mode === "inline";
  const isBottomDock = isInline && embeddedDockBottom;
  const isConfigEmbeddedFocus = embeddedFocus === "config";
  const splitChrome = Boolean(splitColumnChrome && isInline);
  // Phase 246: also show Actions popout for dashboard inline agents that use distinctFloatingChrome
  const useActionsPopout =
    !isInline || Boolean(distinctFloatingChrome && isInline);
  const { preset: industryPreset } = useIndustryBranding();
  const brandShortName = industryPreset.shortName;
  const edu = useEducationUIOptional();
  const tokenChain = useTokenChainOptional();
  const { chips: customChips, groups: customGroups } = useCustomChips();
  const { mode: agentProviderMode } = useLangchainProvider();
  const { pageManifest, agentManifest } = useVertical();
  const themeAgent = agentManifest?.agent;
  const themeManifest = pageManifest;
  const terminology = pageManifest?.terminology;
  // Always start collapsed on page load — never restore open state from localStorage.
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  /** Discovery popout — "All actions" overlay. */
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [discoverySearch, setDiscoverySearch] = useState("");
  const discoveryTriggerRef = useRef(null);
  const actionsPopoutRef = useRef(null);

  /** Close discovery popout on Escape. First Escape clears search; second closes popout. */
  useEffect(() => {
    if (!showDiscovery) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (discoverySearch) {
          setDiscoverySearch("");
        } else {
          setShowDiscovery(false);
          discoveryTriggerRef.current?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showDiscovery, discoverySearch]);

  // Reset scroll to top only when the dropdown first opens
  useEffect(() => {
    if (showDiscovery && actionsPopoutRef.current) {
      actionsPopoutRef.current.scrollTop = 0;
    }
  }, [showDiscovery]);

  // Position the actions popout as fixed so it escapes panel overflow:hidden clipping.
  useEffect(() => {
    if (!showDiscovery || !actionsPopoutRef.current || !discoveryTriggerRef.current) return;
    const reposition = () => {
      const trigger = discoveryTriggerRef.current;
      const popout = actionsPopoutRef.current;
      if (!trigger || !popout) return;
      const rect = trigger.getBoundingClientRect();
      const popoutWidth = 320;
      // Align right edge of popout with right edge of trigger; clamp to viewport
      let left = rect.right - popoutWidth;
      if (left < 8) left = 8;
      if (left + popoutWidth > window.innerWidth - 8) left = window.innerWidth - 8 - popoutWidth;
      popout.style.left = `${left}px`;
      popout.style.top = `${rect.bottom + 4}px`;
    };
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [showDiscovery]);

  const [nlInput, setNlInput] = useState("");
  const [inputHistory, setInputHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [nlLoading, setNlLoading] = useState(false);
  const [nlMeta, setNlMeta] = useState(null);
  const activeLlmProvider = nlMeta?.activeLlmProvider ?? null;
  // Degraded-mode banner: true when the user selected an LLM provider (Helix)
  // but routing fell back to the heuristic parser (Helix unreachable / not
  // configured). Drives a persistent banner in the panel header. Cleared as
  // soon as a Helix-sourced answer comes back.
  const [helixDegraded, setHelixDegraded] = useState(false);
  const [modelAdvisory, setModelAdvisory] = useState(null);
  const modelAdvisoryTimerRef = useRef(null);
  // Single-slot conversation state for clarification follow-ups.
  // Set when we asked "Which account?"/"How much?" and we're waiting on
  // the user's next message to fill that slot. Shape: { action, slot, asked }.
  // - action: one of 'balance' | 'deposit' | 'withdraw' | 'transfer'
  // - slot:   which field of the action's params the next message fills
  //           (e.g. 'accountType' for balance, free-text-parse for others).
  // Cleared the moment we consume it OR a turn later if user changed topic.
  const [pendingClarification, setPendingClarification] = useState(null);
  /** Set when returning from PingOne with a pending banking NL line to run after session exists. */
  const [nlResumeAfterAuth, setNlResumeAfterAuth] = useState(null);
  const nlSendGuardRef = useRef(null);
  if (!nlSendGuardRef.current) nlSendGuardRef.current = makeReentrancyGuard();
  const sendAbortRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [sessionTokens, setSessionTokens] = useState({ input: 0, output: 0 });
  const [lifetimeTokens, setLifetimeTokens] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('ba_tokens_lifetime') || 'null');
      return stored && typeof stored.input === 'number' ? stored : { input: 0, output: 0 };
    } catch (_) {
      return { input: 0, output: 0 };
    }
  });
  const [loading, setLoading] = useState(false);
  /** null = loading; which OAuth flows have client IDs + environment */
  const [oauthConfig, setOauthConfig] = useState(null);
  /** {x,y} when panel has been dragged; null = CSS-anchored default position */
  const [dragPos, setDragPos] = useState(null);
  /** Panel dimensions for resizing — floating default is large enough for header, chips, and two-column body */
  const [panelSize, setPanelSize] = useState({ width: 620, height: 540 });
  const panelSizeRef = useRef(panelSize);
  useEffect(() => {
    panelSizeRef.current = panelSize;
  }, [panelSize]);
  /** Side panel showing rich results next to the agent */
  const [resultPanel, setResultPanel] = useState(null);
  const resultPanelRef = useRef(null);
  /** Live bounding rect of the agent panel — used to anchor the results pop-out */
  const [agentBounds, setAgentBounds] = useState(null);
  /** MCP server connection status for header display */
  const [mcpStatus, setMcpStatus] = useState({
    toolCount: null,
    connected: false,
  });
  /** Real accounts from /api/accounts/my — used for the balance/deposit/withdraw/transfer form
   *  dropdowns so IDs always match what the server has stored (avoids chk-{uid} mismatch). */
  const [liveAccounts, setLiveAccounts] = useState([]);
  /**
   * Self-detected session user — populated by independent auth check so the
   * agent knows the session even if the parent App.js user prop hasn't resolved yet.
   */
  const [sessionUser, setSessionUser] = useState(null);
  const sessionUserRef = useRef(null);
  sessionUserRef.current = sessionUser;
  const [sessionRefreshing, setSessionRefreshing] = useState(false);
  /** True while the 2s reconnect poll is actively running (shows "Reconnecting…" banner). */
  const [, setSessionReconnecting] = useState(false);
  /** True when identity came from _auth cookie / stub token — MCP and NL need a Redis-backed session. */
  const [cookieOnlyBffSession, setCookieOnlyBffSession] = useState(false);
  /** Avoid repeating the session-fix error bubble after we showed it on load or after a failed action. */
  const sessionFixBubbleShownRef = useRef(false);
  /** User declined high-value consent — tools/chat disabled until sign-out (agentAccessConsent). */
  // Always start false — the block is session-scoped, not page-load-scoped.
  // Clear any stale localStorage value immediately so refresh/login never shows the banner.
  // OTP step-up modal state (Phase 174)
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpContextLine, setOtpContextLine] = useState("");
  const pendingOtpActionRef = useRef(null);
  // Callback to fire after OTP step-up completes (e.g. sensitive data fetch post-HITL)
  const pendingStepUpCallbackRef = useRef(null);
  // MCP tools list modal state
  const [showMcpToolsModal, setShowMcpToolsModal] = useState(false);
  const [mcpToolsList, setMcpToolsList] = useState([]);
  // Demo guide modal state
  const [showDemoGuide, setShowDemoGuide] = useState(false);
  // Account details panel state
  const [accountDetailsPanel, setAccountDetailsPanel] = useState(null);
  const [accountDetailsPanelPos, setAccountDetailsPanelPos] = useState({
    x: 200,
    y: 100,
  });
  // FIDO2 + P1MFA state (Phase 174-03/04)
  const [stepUpMethod, setStepUpMethod] = useState("otp"); // 'otp' or 'fido'
  const [supportsFido, setSupportsFido] = useState(false);
  const [p1mfaMode, setP1mfaMode] = useState(false);
  const [p1mfaDaId, setP1mfaDaId] = useState(null);
  const [p1mfaDevices, setP1mfaDevices] = useState([]);
  const [consentBlocked, setConsentBlocked] = useState(false);
  const [txErrorModal, setTxErrorModal] = useState(null); // { title, message } or null
  const [complianceStripState, setComplianceStripState] = useState(() => {
    try {
      const s = agentFlowDiagram.getState();
      return {
        complianceStep: s.complianceStep || null,
        complianceSteps: s.complianceSteps || [],
      };
    } catch {
      return { complianceStep: null, complianceSteps: [] };
    }
  });
  const [showCompliancePanel, setShowCompliancePanel] = useState(() => {
    try {
      localStorage.removeItem("ba_show_compliance_panel");
    } catch {}
    return false;
  });
  const [complianceSlideout, setComplianceSlideout] = useState(() => {
    try {
      return localStorage.getItem("ba_compliance_slideout") === "1";
    } catch {
      return false;
    }
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  // Detect FIDO2/WebAuthn support on mount
  useEffect(() => {
    setSupportsFido(
      typeof window !== "undefined" && window.PublicKeyCredential !== undefined,
    );
  }, []);
  /** Group expand/collapse state for chip categories — defaults per D-06, persisted in localStorage. */
  const [chipGroupsState, setChipGroupsState] = useState(() => {
    try {
      const saved = localStorage.getItem("ba_chip_groups_state");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Failed to load ba_chip_groups_state from localStorage:", e);
    }
    // Default state per D-06: Account expanded, Transaction and Admin collapsed
    return {
      account: true,
      transaction: false,
      admin: false,
      ai: false,
      testing: false,
    };
  });

  /** Persist chipGroupsState changes to localStorage. */
  useEffect(() => {
    try {
      localStorage.setItem(
        "ba_chip_groups_state",
        JSON.stringify(chipGroupsState),
      );
    } catch (e) {
      console.warn("Failed to save ba_chip_groups_state to localStorage:", e);
    }
  }, [chipGroupsState]);

  /** Reset chipGroupsState when layout mode changes (floating ↔ inline ↔ bottom-dock).
   *  Prevents stale expanded groups persisting in the DOM after switching layouts.
   */
  useEffect(() => {
    setChipGroupsState((prev) => ({
      account: true,
      transaction: false,
      admin: false,
      ai: false,
      testing: false,
    }));
  }, [useActionsPopout, isBottomDock]);

  /** Toggle expanded/collapsed state for a group. */
  const toggleGroupExpanded = (groupName) => {
    setChipGroupsState((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  /** True when any action group is currently expanded. */
  const anyExpanded = Object.values(chipGroupsState).some(Boolean);

  /** Collapse all action groups. */
  const collapseAllGroups = () => {
    setChipGroupsState(
      Object.fromEntries(Object.keys(ACTION_GROUPS).map((k) => [k, false])),
    );
  };

  /** Expand all action groups. */
  const expandAllGroups = () => {
    setChipGroupsState(
      Object.fromEntries(Object.keys(ACTION_GROUPS).map((k) => [k, true])),
    );
  };

  /** Token chain visibility and width — persisted to localStorage. */
  const [showTokenChain, setShowTokenChain] = useState(() => {
    // Always start hidden in popup windows so the token chain doesn't appear as a side menu
    if (typeof window !== "undefined" && window.opener) return false;
    try {
      const saved = localStorage.getItem("ba_token_chain_show");
      if (saved !== null) return saved === "true";
    } catch {}
    return false; // Default: hidden
  });

  const [tokenChainWidth] = useState(() => {
    try {
      const saved = localStorage.getItem("ba_token_chain_width");
      if (saved !== null)
        return Math.max(50, Math.min(600, parseInt(saved, 10)));
    } catch {}
    return 280; // Default: 280px
  });

  /** Persist token chain visibility to localStorage. */
  useEffect(() => {
    try {
      localStorage.setItem("ba_token_chain_show", String(showTokenChain));
    } catch (e) {
      console.warn("Failed to save ba_token_chain_show to localStorage:", e);
    }
  }, [showTokenChain]);

  /** Persist token chain width to localStorage. */
  useEffect(() => {
    try {
      localStorage.setItem("ba_token_chain_width", String(tokenChainWidth));
    } catch (e) {
      console.warn("Failed to save ba_token_chain_width to localStorage:", e);
    }
  }, [tokenChainWidth]);

  /** Show/hide RFC info token-event messages in chat. Persisted. */
  const [showRfcInfo, setShowRfcInfo] = useState(() => {
    try {
      const saved = localStorage.getItem("ba_show_rfc_info");
      if (saved !== null) return saved === "true";
    } catch {}
    return false; // Default: hide RFC info for clean chat
  });
  useEffect(() => {
    try {
      localStorage.setItem("ba_show_rfc_info", String(showRfcInfo));
    } catch {}
  }, [showRfcInfo]);

  /** Whether the heuristic fast-path is enabled (ff_heuristic_enabled). false = LLM-only mode. */
  const [heuristicEnabled, setHeuristicEnabled] = useState(true);
  /** Whether the floating results panel is enabled (ff_agent_results_panel). false = panel hidden; results inline only. */
  const [agentResultsPanelEnabled, setAgentResultsPanelEnabled] = useState(false);
  /** Whether AG-UI streaming is enabled (ff_agui_enabled). false = legacy sendAgentMessage path. */
  const [aguiEnabled, setAguiEnabled] = useState(false);
  // AG-UI hooks — only active when aguiEnabled=true; state and run are no-ops otherwise
  const { state: aguiState, handlers: aguiHandlers, reset: aguiReset } = useAgentState();
  const { run: aguiRun, abort: aguiAbort, isRunning: aguiRunning } = useAgentRun(aguiHandlers);
  // Refs for stable thread ID and active run ID (needed by HITL resume)
  const aguiThreadIdRef = React.useRef(null);
  const aguiActiveRunIdRef = React.useRef(null);
  const [llmFlagSaving, setLlmFlagSaving] = useState(false);

  /** Render a single action button with optional emoji-only styling. */
  const renderChip = (action, groupName) => {
    return (
      <button
        key={action.id}
        type="button"
        className={
          "ba-action-item ba-action-chip" +
          (complianceStripState.complianceActionId === action.id
            ? " ba-action-chip--active-test"
            : "")
        }
        onClick={() => handleActionClick(action.id)}
        disabled={
          loading ||
          (consentBlocked && action.id !== "logout") ||
          (showOtpModal && action.id !== "logout")
        }
        title={action.desc || action.label}
      >
        {action.label}
      </button>
    );
  };

  /** Ordered group list for the discovery popout. */
  const allDiscoveryGroups = useMemo(() => {
    const allGroups = [
      { id: "custom", label: "Custom Actions" },
      ...customGroups,
    ];
    const customEntries = allGroups
      .map((g) => ({
        key: g.id,
        label: g.label,
        chips: customChips
          .filter((c) => (c.groupId || "custom") === g.id)
          .map((c) => ({
            id: c.id,
            label: c.label,
            desc: c.desc || "",
            rfcs: [],
          })),
        isEducation: false,
      }))
      .filter((g) => g.chips.length > 0);
    return [
      {
        key: "account",
        label: "Account",
        chips: ACTION_GROUPS.account,
        isEducation: false,
      },
      {
        key: "transaction",
        label: "Transaction",
        chips: ACTION_GROUPS.transaction,
        isEducation: false,
      },
      {
        key: "admin",
        label: "Admin",
        chips: ACTION_GROUPS.admin,
        isEducation: false,
      },
      {
        key: "testing",
        label: "Testing",
        chips: ACTION_GROUPS.testing,
        isEducation: false,
      },
      ...customEntries,
    ];
  }, [customChips, customGroups]);

  /** Live filtered view of allDiscoveryGroups based on discoverySearch. */
  const filteredDiscoveryGroups = useMemo(() => {
    const q = discoverySearch.trim().toLowerCase();
    if (!q) return allDiscoveryGroups;
    return allDiscoveryGroups
      .map((group) => ({
        ...group,
        chips: group.chips.filter((c) => c.label.toLowerCase().includes(q)),
      }))
      .filter((g) => g.chips.length > 0);
  }, [discoverySearch, allDiscoveryGroups]);

  /** Render ACTION_GROUPS with collapsible headers, count badges, and collapse-all toolbar. */
  const renderActionGroups = () => {
    const allCustomGroups = [
      { id: "custom", label: "Custom Actions" },
      ...customGroups,
    ];
    const customGroupMap = Object.fromEntries(
      allCustomGroups
        .map((g) => [
          g.id,
          customChips
            .filter((c) => (c.groupId || "custom") === g.id)
            .map((c) => ({
              id: c.id,
              label: c.label,
              desc: c.desc || "",
              rfcs: [],
            })),
        ])
        .filter(([, chips]) => chips.length > 0),
    );
    let groupsToRender = { ...ACTION_GROUPS, ...customGroupMap };
    if (isConfigEmbeddedFocus) {
      const logoutAction = ACTION_GROUPS.account?.filter((a) => a.id === "logout") || [];
      groupsToRender = { admin: [...(ACTION_GROUPS.admin || []), ...logoutAction] };
    } else if (effectiveUser?.role !== "admin") {
      const { admin: _admin, ...rest } = groupsToRender;
      groupsToRender = rest;
    }

    return (
      <>
        <div className="ba-chips-toolbar">
          <button
            type="button"
            className="ba-collapse-all-btn"
            onClick={anyExpanded ? collapseAllGroups : expandAllGroups}
          >
            {anyExpanded ? "Collapse all" : "Expand all"}
          </button>
        </div>

        {Object.entries(groupsToRender).map(([groupName, actions]) => {
          const isExpanded = !!chipGroupsState[groupName];
          const capitalizedName =
            groupName.charAt(0).toUpperCase() + groupName.slice(1);
          return (
            <div
              key={groupName}
              className={"ba-action-group ba-action-group--" + groupName}
            >
              <button
                className="ba-group-header"
                onClick={() => toggleGroupExpanded(groupName)}
                type="button"
                title={
                  (isExpanded ? "Collapse" : "Expand") +
                  " " +
                  capitalizedName +
                  " actions"
                }
              >
                <span className="ba-group-name">{capitalizedName}</span>
                <span className="ba-group-count">({actions.length})</span>
                <span
                  className={
                    "ba-group-toggle " + (isExpanded ? "expanded" : "collapsed")
                  }
                >
                  {isExpanded ? "▼" : "▶"}
                </span>
              </button>
              <div
                className={
                  "ba-group-content " + (isExpanded ? "" : "collapsed")
                }
              >
                {actions.map((action) => renderChip(action, groupName))}
              </div>
            </div>
          );
        })}
      </>
    );
  };
  /** True when the user has accepted the in-app agent consent agreement. */
  /** Missing-scopes error from token exchange — shows config-fix modal. */
  const [scopeErrorModal, setScopeErrorModal] = useState(null);
  /** Pending action awaiting scope-upgrade consent — replayed automatically after exchange. */
  const pendingScopeUpgradeRef = useRef(null);

  /** Gateway HITL challenge — GatewayConsentModal on hitl_required from /api/banking-agent/message. */
  const [gatewayHitlChallenge, setGatewayHitlChallenge] = useState(null);

  /** Pending HITL intent — shows AgentConsentModal (transaction mode) before OTP. */
  const [hitlPendingIntent, setHitlPendingIntent] = useState(null);

  /** Challenge ID issued after the user clicks Authorize in AgentConsentModal. */
  const [hitlChallengeId, setHitlChallengeId] = useState(null);
  /** Pending action awaiting CIBA step-up approval (ref: read in event listener closure). */
  const pendingStepUpActionRef = useRef(null);
  /** Pending action awaiting auth-challenge login (ref: read in event listener closure).
   *  Also persisted to sessionStorage so it survives PingOne full-page redirect. */
  const pendingAuthChallengeActionRef = useRef(
    (() => {
      try {
        const stored = sessionStorage.getItem("_agent_pending_auth_action");
        if (stored) {
          sessionStorage.removeItem("_agent_pending_auth_action");
          return JSON.parse(stored);
        }
      } catch {
        /* ignore */
      }
      return null;
    })(),
  );

  const bottomRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const nlInputRef = useRef(null);
  const toolProgressIdRef = useRef(null);
  const panelRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // On the /agent route the inline/full-page instance is shown — hide duplicate float
  const isAgentPage = location.pathname === "/agent";
  /** Landing `/`: agent success/info/error toasts use longer autoClose (readable for guests). */
  const agentToastMs = useMemo(() => {
    const slow = isPublicMarketingAgentPath(location.pathname);
    return {
      successAction: slow ? 7500 : 2500,
      toolsLoaded: slow ? 7000 : 2000,
      errShort: slow ? 10000 : 5000,
      infoToken: slow ? 8500 : 4500,
    };
  }, [location.pathname]);

  useEffect(() => {
    const sync = () => setConsentBlocked(isAgentBlockedByConsentDecline());
    window.addEventListener("bankingAgentConsentBlockChanged", sync);
    return () =>
      window.removeEventListener("bankingAgentConsentBlockChanged", sync);
  }, []);

  useEffect(() => {
    return agentFlowDiagram.subscribe((state) => {
      setComplianceStripState({
        complianceStep: state.complianceStep || null,
        complianceSteps: state.complianceSteps || [],
        complianceActionLabel: state.complianceActionLabel || null,
        complianceActionId: state.complianceActionId || null,
      });
    });
  }, []);

  // Clear parent's consent decline state on mount (React Rule: no setState in render initializers)
  useEffect(() => {
    setAgentBlockedByConsentDecline(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for UserDashboard confirming a HITL consent challenge.
  // The modal already executes the transaction — we just surface the success message in the agent.
  useEffect(() => {
    const onConfirmed = (e) => {
      const { actionId, successMsg } = e.detail || {};
      const label = ACTIONS.find((a) => a.id === actionId)?.label || actionId;
      addMessage(
        "assistant",
        `✅ ${label} approved and completed.\n\n${successMsg || "The transaction went through after your consent."}`,
        actionId,
      );
      notifySuccess(`✅ ${label} complete`);
    };
    window.addEventListener("banking-agent-hitl-confirmed", onConfirmed);
    return () =>
      window.removeEventListener("banking-agent-hitl-confirmed", onConfirmed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist open state so the panel survives a page refresh
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (isInline) return;
    try {
      localStorage.setItem("banking-agent-open", String(isOpen));
    } catch {}
  }, [isOpen, isInline]);

  // Floating mode: always collapse on route changes. Explicit open intents
  // (Agent nav button → `banking-agent-open` event, return from /config with
  // state.scrollToAgent/openAgent) re-open the panel via their own effects below.
  // Do not tie this to user/session (see REGRESSION_LOG — auth sync was resetting isOpen and closing the panel).
  useEffect(() => {
    if (isInline) return;
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    setIsOpen(false);
    // location.pathname is the intentional trigger — fire on every route change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, isInline]);

  // Auto-open when returning from /config (Config.js navigates back with scrollToAgent:true)
  // Also handles Agent nav button redirect (state.openAgent)
  useEffect(() => {
    if (location.state?.scrollToAgent || location.state?.openAgent) {
      setIsOpen(true);
      window.history.replaceState({}, "");
    }
  }, [location.state]);

  // Open floating panel when 'banking-agent-open' event is dispatched (e.g. nav Agent button)
  useEffect(() => {
    if (isInline) return;
    const handler = () => setIsOpen(true);
    window.addEventListener("banking-agent-open", handler);
    return () => window.removeEventListener("banking-agent-open", handler);
  }, [isInline]);

  // Pre-fill NL input from external event (e.g. "Test Revocation" button after kill switch)
  useEffect(() => {
    const handler = (e) => {
      const msg = e.detail?.message;
      if (!msg) return;
      setNlInput(msg);
      setTimeout(() => nlInputRef.current?.focus(), 50);
    };
    window.addEventListener("banking-agent-prefill", handler);
    return () => window.removeEventListener("banking-agent-prefill", handler);
  }, []);

  // Open demo guide when event dispatched from side menu
  useEffect(() => {
    const handler = () => setShowDemoGuide(true);
    window.addEventListener("agent-demo-guide-open", handler);
    return () => window.removeEventListener("agent-demo-guide-open", handler);
  }, []);

  // Reset conversation when demo is cleared (no full page reload needed)
  useEffect(() => {
    const currentUser = user || sessionUser;
    const handler = () => {
      const freshWelcome = currentUser
        ? [
            {
              id: `${Date.now()}-w`,
              role: "assistant",
              content: welcomeMessage(
                currentUser,
                embeddedFocus,
                brandShortName,
                themeAgent && themeAgent.greeting,
              ),
            },
          ]
        : [];
      setMessages(freshWelcome);
      setNlInput("");
      setInputHistory([]);
      setHistoryIndex(-1);
    };
    window.addEventListener("demo-reset-complete", handler);
    return () => window.removeEventListener("demo-reset-complete", handler);
  }, [user, sessionUser, embeddedFocus, brandShortName, industryPreset.id, themeAgent]);

  // Auto-open when redirected back from OAuth login (?oauth=success in URL)
  useEffect(() => {
    if (searchParams.get("oauth") === "success") {
      // Atomically claim the pending NL command BEFORE any retry timer fires.
      // This guarantees exactly one instance/retry replays it (prevents
      // double-execute of a banking command; REGRESSION_PLAN §4 2026-05-18).
      // Claimed on effect entry: if session hydration never succeeds the
      // command is intentionally dropped, not retained for a later page load.
      const pendingNl = claimPendingNl(BX_AGENT_PENDING_NL_KEY);

      setIsOpen(true);
      // Strip oauth params from URL so they don't re-trigger on navigation
      const url = new URL(window.location.href);
      url.searchParams.delete("oauth");
      url.searchParams.delete("stepup");
      window.history.replaceState({}, "", url.toString());

      // Auth cookie is set on the callback response, but on Vercel the status
      // check may land on a cold instance before Redis propagates.  Retry with
      // increasing backoff (immediate, 600, 1400, 2500 ms).
      const retryDelays = getColdStartRetryDelays();
      const timers = [];
      retryDelays.forEach((delay, i) => {
        const t = setTimeout(async () => {
          const result = await Promise.all([
            getCachedStatus("/api/auth/oauth/status").catch(() => null),
            getCachedStatus("/api/auth/oauth/user/status").catch(() => null),
            getCachedStatus("/api/auth/session").catch(() => null),
          ]);
          const [admin, endUser, session] = result;
          const { found, cookieOnlyBffSession: cookieOnly } =
            resolveSessionFromAuthTrio(admin, endUser, session);
          if (found) {
            setCookieOnlyBffSession(cookieOnly);
            setSessionUser(found);
            if (pendingNl) {
              setNlResumeAfterAuth(pendingNl);
            }
            setMessages((prev) => {
              if (prev.length > 0) return prev;
              const welcome = {
                id: `${Date.now()}-w`,
                role: "assistant",
                content: welcomeMessage(
                  found,
                  embeddedFocus,
                  brandShortName,
                  themeAgent && themeAgent.greeting,
                ),
              };
              if (cookieOnly) {
                sessionFixBubbleShownRef.current = true;
                return [
                  welcome,
                  {
                    id: `${Date.now()}-fix`,
                    role: "error",
                    content: buildSessionNotHydratedChat(
                      session?.sessionStoreError ?? null,
                      session?.sessionStoreHealthy ?? null,
                    ),
                    showSessionFixActions: true,
                  },
                ];
              }
              return [welcome];
            });
            // Dispatch on every successful retry so pendingAuthChallengeActionRef replay fires
            // even when the 0ms check races against Redis on cold-start
            window.dispatchEvent(new CustomEvent("userAuthenticated"));
            // Cancel remaining retries
            timers.forEach(clearTimeout);
          }
        }, delay);
        timers.push(t);
      });
      return () => timers.forEach(clearTimeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Auto-open when the user prop transitions from null → authenticated user
  // (fires on initial mount when App.js has already resolved the session,
  //  and again if the user changes while the component is mounted)
  // Also replaces a sole initial greeting when themeAgent resolves asynchronously
  // after the initial render (vertical manifest race condition).
  useEffect(() => {
    if (!user) return;
    setMessages((prev) => {
      const isSoleGreeting =
        prev.length === 1 &&
        prev[0].role === "assistant" &&
        !prev[0].tool;
      if (prev.length > 0 && !isSoleGreeting) return prev;
      return [
        {
          id: Date.now().toString(),
          role: "assistant",
          content: welcomeMessage(
            user,
            embeddedFocus,
            brandShortName,
            themeAgent && themeAgent.greeting,
          ),
        },
      ];
    });
  }, [user, embeddedFocus, brandShortName, industryPreset.id, themeAgent]);

  // Effective user: prefer prop (App.js state), fall back to self-detected session
  const effectiveUser = user || sessionUser;
  const isLoggedIn = !!effectiveUser;
  /** Marketing `/` guests may chat (education / hints); banking triggers PingOne + return here. */
  const marketingGuestChatEnabled = useMemo(() => {
    const p = (location.pathname || "").replace(/\/$/, "") || "/";
    return !isLoggedIn && isPublicMarketingAgentPath(p);
  }, [isLoggedIn, location.pathname]);
  const isConfigured = oauthConfig && (oauthConfig.admin || oauthConfig.user);

  // Fetch real account IDs from the server whenever the user logs in.
  // Also re-runs when the vertical changes because themeManifest.id changes,
  // which causes isLoggedIn's referencing closure to re-evaluate. We call the
  // imperative helper directly from the vertical-switch effect below.
  const fetchLiveAccounts = useCallback(() => {
    fetch("/api/accounts/my", { credentials: "include", _silent: true })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.accounts?.length) return;
        setLiveAccounts(
          data.accounts.map((a) => ({
            id: a.id,
            name: a.name || a.accountType || "Account",
            type: a.accountType || a.account_type || "checking",
            balance: a.balance || 0,
            accountNumber: a.accountNumber || a.account_number || a.id,
          })),
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchLiveAccounts();
  }, [isLoggedIn, fetchLiveAccounts]);

  // Re-fetch accounts when the vertical switches so stale banking accounts
  // are replaced with the new vertical's seeded data.
  const prevVerticalRef = useRef(null);
  useEffect(() => {
    const vid = themeManifest?.id ?? null;
    if (vid !== prevVerticalRef.current) {
      prevVerticalRef.current = vid;
      if (isLoggedIn) fetchLiveAccounts();
    }
  }, [themeManifest, isLoggedIn, fetchLiveAccounts]);

  const suggestionList = useMemo(() => {
    if (isConfigEmbeddedFocus) {
      return effectiveUser?.role === "admin"
        ? SUGGESTIONS_CONFIG_ADMIN
        : SUGGESTIONS_CONFIG_CUSTOMER;
    }
    return effectiveUser?.role === "admin"
      ? SUGGESTIONS_ADMIN
      : SUGGESTIONS_CUSTOMER;
  }, [isConfigEmbeddedFocus, effectiveUser?.role]);

  /**
   * Independently check auth endpoints.  Called on mount, on panel open, and
   * when the 'userAuthenticated' event fires (App.js dispatches this after login).
   * Checks all three session types: admin OAuth, end-user OAuth, and basic auth.
   * Does NOT dispatch userAuthenticated — that caused an infinite loop with App.js
   * (App listens → checkOAuthSession → agent listener → checkSelfAuth → dispatch → …).
   * Mount / OAuth-retry paths dispatch once when they first discover a session.
   */
  const checkSelfAuth = useCallback(() => {
    Promise.all([
      getCachedStatus("/api/auth/oauth/status").catch(() => null),
      getCachedStatus("/api/auth/oauth/user/status").catch(() => null),
      getCachedStatus("/api/auth/session").catch(() => null),
    ]).then(([admin, endUser, session]) => {
      const { found, cookieOnlyBffSession: cookieOnly } =
        resolveSessionFromAuthTrio(admin, endUser, session);
      setCookieOnlyBffSession(cookieOnly);
      if (found) {
        setSessionUser(found);
        // Clear any stale consent-decline block — user has a fresh session.
        setAgentBlockedByConsentDecline(false);
      }
    });
  }, []);

  // P1 — When the BFF returns cookieOnlyBffSession:true, poll /api/auth/session
  // every 2s for up to 10s. Once the Upstash write has propagated (cookieOnlyBffSession
  // becomes false) clear the banner and let normal interaction resume.
  useEffect(() => {
    if (!cookieOnlyBffSession) {
      setSessionReconnecting(false);
      return;
    }
    setSessionReconnecting(true);
    let attempts = 0;
    const MAX_ATTEMPTS = 5; // 5 × 2s = 10s
    const interval = setInterval(async () => {
      attempts += 1;
      try {
        const r = await fetch("/api/auth/session", {
          credentials: "include",
          _silent: true,
        });
        if (r.ok) {
          const data = await r.json();
          if (!data.cookieOnlyBffSession) {
            setCookieOnlyBffSession(false);
            setSessionReconnecting(false);
            clearInterval(interval);
            return;
          }
        }
      } catch (_) {
        /* non-fatal */
      }
      if (attempts >= MAX_ATTEMPTS) {
        setSessionReconnecting(false);
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [cookieOnlyBffSession]);

  /** RFC 6749 refresh — does not log out; retries server-side session tokens. */
  const handleSessionRefresh = useCallback(async () => {
    setSessionRefreshing(true);
    try {
      const r = await refreshOAuthSession();
      if (r.ok) {
        notifySuccess("Access token refreshed. You can retry your action.");
        checkSelfAuth();
      } else {
        notifyError(
          "Could not refresh — use Sign in again or reload the page.",
        );
      }
    } catch (e) {
      notifyError(e?.message || "Refresh failed");
    } finally {
      setSessionRefreshing(false);
    }
  }, [checkSelfAuth]);

  // Check on mount — auto-open if already authenticated (e.g. page refresh after login)
  useEffect(() => {
    Promise.all([
      getCachedStatus("/api/auth/oauth/status").catch(() => null),
      getCachedStatus("/api/auth/oauth/user/status").catch(() => null),
      getCachedStatus("/api/auth/session").catch(() => null),
    ]).then(([admin, endUser, session]) => {
      const { found, cookieOnlyBffSession: cookieOnly } =
        resolveSessionFromAuthTrio(admin, endUser, session);
      setCookieOnlyBffSession(cookieOnly);
      if (found) {
        setSessionUser(found);
        // Clear any stale consent-decline block from previous sessions.
        setAgentBlockedByConsentDecline(false);
        const welcome = {
          id: `${Date.now()}-w`,
          role: "assistant",
          content: welcomeMessage(
            found,
            embeddedFocus,
            brandShortName,
            themeAgent && themeAgent.greeting,
          ),
        };
        if (cookieOnly) {
          sessionFixBubbleShownRef.current = true;
          setMessages([
            welcome,
            {
              id: `${Date.now()}-fix`,
              role: "error",
              content: buildSessionNotHydratedChat(
                session?.sessionStoreError ?? null,
                session?.sessionStoreHealthy ?? null,
              ),
              showSessionFixActions: true,
            },
          ]);
        } else {
          // Prepend welcome without wiping auto-loaded account/transaction messages that may have raced ahead.
          // If a non-tool assistant message already exists (duplicate welcome), skip.
          setMessages((prev) => {
            if (prev.length === 0) return [welcome];
            if (prev.some((m) => m.role === "assistant" && !m.tool))
              return prev;
            return [welcome, ...prev];
          });
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInline, embeddedFocus]);

  // Re-check when App.js confirms a login, and auto-open the agent
  useEffect(() => {
    const onAuth = () => {
      checkSelfAuth();
      setMessages((prev) =>
        prev.length === 0
          ? [
              {
                id: Date.now().toString(),
                role: "assistant",
                content: welcomeMessage(
                  user || sessionUserRef.current,
                  embeddedFocus,
                  brandShortName,
                  themeAgent && themeAgent.greeting,
                ),
              },
            ]
          : prev,
      );
    };
    window.addEventListener("userAuthenticated", onAuth);
    return () => window.removeEventListener("userAuthenticated", onAuth);
  }, [
    checkSelfAuth,
    user,
    isInline,
    embeddedFocus,
    brandShortName,
    industryPreset.id,
    themeAgent,
  ]);

  // Auto-retry after CIBA step-up approval
  useEffect(() => {
    const onStepUpApproved = () => {
      agentFlowDiagram.completeMfaChallenge(true);
      if (!pendingStepUpActionRef.current) return;
      const { actionId, form, method } = pendingStepUpActionRef.current;
      pendingStepUpActionRef.current = null;
      const methodLabel = method === "ciba" ? "CIBA" : "Email OTP";
      const ts = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      addMessage(
        "assistant",
        `✅ ${methodLabel} approved — continuing your request (${ts})`,
        actionId,
      );
      runAction(actionId, form, { isRefire: true });
    };
    const onStepUpCancelled = () =>
      agentFlowDiagram.completeMfaChallenge(false);
    window.addEventListener("cibaStepUpApproved", onStepUpApproved);
    window.addEventListener("cibaStepUpCancelled", onStepUpCancelled);
    return () => {
      window.removeEventListener("cibaStepUpApproved", onStepUpApproved);
      window.removeEventListener("cibaStepUpCancelled", onStepUpCancelled);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-retry after login (auth challenge path)
  useEffect(() => {
    const onAuthChallengeLogin = () => {
      if (!pendingAuthChallengeActionRef.current) return;
      const { actionId, form } = pendingAuthChallengeActionRef.current;
      pendingAuthChallengeActionRef.current = null;
      PendingActionManager.clear();
      addMessage(
        "assistant",
        "✅ Signed in — retrying your request…",
        actionId,
      );
      runAction(actionId, form, { isRefire: true });
    };
    window.addEventListener("userAuthenticated", onAuthChallengeLogin);
    return () =>
      window.removeEventListener("userAuthenticated", onAuthChallengeLogin);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-check when panel opens (catches sessions established after mount)
  useEffect(() => {
    if (isOpen) checkSelfAuth();
  }, [isOpen, checkSelfAuth]);

  // Mutual exclusion: close agent when an education panel opens
  useEffect(() => {
    if (edu?.panel) setIsOpen(false);
  }, [edu?.panel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mutual exclusion: close any open education panel when agent opens.
  // Deps intentionally omit edu?.panel — if edu.panel is included, this effect fires when
  // the user opens an edu panel (edu.panel null→set), sees isOpen=true (stale render snapshot),
  // and immediately calls edu.close(), killing the panel before it renders.
  useEffect(() => {
    if (isOpen && edu?.panel) edu.close();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check config status from IndexedDB cache whenever panel opens
  useEffect(() => {
    if (isOpen && !isLoggedIn) {
      loadPublicConfig()
        .then((cfg) => {
          const env = !!cfg.pingone_environment_id;
          setOauthConfig({
            admin: env && !!cfg.admin_client_id,
            user: env && !!cfg.user_client_id,
          });
        })
        .catch(() => setOauthConfig({ admin: false, user: false }));
    }
  }, [isOpen, isLoggedIn]);

  useEffect(() => {
    if (!isOpen) return;
    const el = messagesContainerRef.current;
    if (!el) return;
    // requestAnimationFrame ensures scrollHeight is measured after the browser paints new content
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isOpen, loading, nlLoading]);

  useEffect(() => {
    if (!isOpen) return;
    if (!isLoggedIn && !marketingGuestChatEnabled) return;
    fetchNlStatus()
      .then(setNlMeta)
      .catch(() => setNlMeta({ geminiConfigured: false }));
    // Load feature flags to sync UI-controlled toggles
    fetch("/api/admin/feature-flags", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const heuristicFlag = data?.flags?.find((f) => f.id === "ff_heuristic_enabled");
        if (heuristicFlag != null) setHeuristicEnabled(Boolean(heuristicFlag.value));
        const panelFlag = data?.flags?.find((f) => f.id === "ff_agent_results_panel");
        if (panelFlag != null) setAgentResultsPanelEnabled(Boolean(panelFlag.value));
        const aguiFlag = data?.flags?.find((f) => f.id === "ff_agui_enabled");
        if (aguiFlag != null) setAguiEnabled(Boolean(aguiFlag.value));
      })
      .catch(() => {});
  }, [isOpen, isLoggedIn, marketingGuestChatEnabled]);

  // Keep MCP status lightweight here to avoid auth/noise calls while browsing dashboards.
  useEffect(() => {
    if (!isOpen || !isLoggedIn) return;
    setMcpStatus({ toolCount: ACTIONS.length, connected: true });
  }, [isOpen, isLoggedIn]);

  // AG-UI Step 3 — sync streamed messages from aguiState into the chat thread.
  // Only active when ff_agui_enabled=true; no-op otherwise.
  // Each new assistant message from AG-UI appears as a chat bubble as it streams.
  useEffect(() => {
    if (!aguiEnabled) return;
    const lastMsg = aguiState.messages[aguiState.messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;
    // Update or add the final assistant message in the BA chat thread
    setMessages((prev) => {
      const existing = prev.findIndex((m) => m.id === lastMsg.id);
      if (existing !== -1) {
        const next = [...prev];
        next[existing] = { ...next[existing], text: lastMsg.content, streaming: lastMsg.streaming };
        return next;
      }
      // New message: append
      return [...prev, { id: lastMsg.id, sender: 'assistant', text: lastMsg.content, streaming: lastMsg.streaming }];
    });
  }, [aguiEnabled, aguiState.messages]);

  // AG-UI Step 3 — sync observability slices into TokenChain when flag is on.
  useEffect(() => {
    if (!aguiEnabled || !aguiState.tokenEvents.length) return;
    if (tokenChain) {
      tokenChain.setTokenEvents('agent', aguiState.tokenEvents);
    }
  }, [aguiEnabled, aguiState.tokenEvents, tokenChain]);

  // AG-UI token usage — accumulate into Token Teller when agent reports counts.
  useEffect(() => {
    if (!aguiEnabled) return;
    const usage = aguiState.lastTokenUsage;
    if (!usage || (!usage.inputTokens && !usage.outputTokens)) return;
    const inc = { input: usage.inputTokens ?? 0, output: usage.outputTokens ?? 0 };
    setSessionTokens((prev) => ({ input: prev.input + inc.input, output: prev.output + inc.output }));
    setLifetimeTokens((prev) => {
      const next = { input: prev.input + inc.input, output: prev.output + inc.output };
      try { localStorage.setItem('ba_tokens_lifetime', JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }, [aguiEnabled, aguiState.lastTokenUsage]); // eslint-disable-line react-hooks/exhaustive-deps

  // AG-UI Step 5 — push MCP traffic entries into mcpCallStore (live, no polling).
  const onNewMcpEntries = useCallback((newEntries) => {
    for (const entry of newEntries) {
      appendMcpCall(
        entry.tool,
        entry.durationMs != null ? 200 : 0,
        entry.durationMs ?? null,
        entry.direction === 'response' ? entry.payload : null,
        entry.direction === 'response' && entry.payload?.error ? String(entry.payload.error) : null,
      );
    }
  }, []);
  useNewItems(aguiState.mcpTraffic, aguiEnabled, onNewMcpEntries);

  // AG-UI Step 6 — push Authorize decisions into authorizeDecisionStore (live, no polling).
  const onNewAuthorizeDecisions = useCallback((newDecisions) => {
    for (const d of newDecisions) appendAuthorizeDecision(d);
  }, []);
  useNewItems(aguiState.authorizeDecisions, aguiEnabled, onNewAuthorizeDecisions);

  // AG-UI cleanup — abort in-flight run and reset state on unmount.
  useEffect(() => {
    return () => {
      aguiAbort();
      aguiReset();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AG-UI Step 7 — HITL via interrupt: show GatewayConsentModal when the agent suspends.
  // aguiState.hitlPending is set by useAgentState on RUN_FINISHED { outcome.type: 'interrupt' }.
  const [aguiHitlPending, setAguiHitlPending] = React.useState(null);
  useEffect(() => {
    if (!aguiEnabled) return;
    setAguiHitlPending(aguiState.hitlPending);
  }, [aguiEnabled, aguiState.hitlPending]);

  const handleAguiHitlApprove = useCallback(() => {
    const interrupt = aguiHitlPending;
    if (!interrupt) return;
    setAguiHitlPending(null);
    const threadId = aguiThreadIdRef.current || ('ba-' + Date.now());
    const runId = 'resume-' + Date.now();
    aguiActiveRunIdRef.current = runId;
    setNlLoading(true);
    // Pass the full conversation history so the agent has context after resume.
    // Map from UI message shape { id, role, content } to ReasonMessage { role, content }.
    const conversationHistory = (aguiState.messages || [])
      .filter((m) => !m.streaming)
      .map(({ role, content }) => ({ role, content }));
    aguiRun({
      threadId,
      runId,
      messages: conversationHistory,
      resume: [{ interruptId: interrupt.id, status: 'approved' }],
    }).finally(() => setNlLoading(false));
  }, [aguiHitlPending, aguiRun, aguiState.messages]);

  const handleAguiHitlDismiss = useCallback(() => {
    const interrupt = aguiHitlPending;
    if (!interrupt) return;
    setAguiHitlPending(null);
    const threadId = aguiThreadIdRef.current || ('ba-' + Date.now());
    const runId = 'cancel-' + Date.now();
    // Pass conversation history even for cancel so the agent can acknowledge gracefully.
    const conversationHistory = (aguiState.messages || [])
      .filter((m) => !m.streaming)
      .map(({ role, content }) => ({ role, content }));
    aguiRun({
      threadId,
      runId,
      messages: conversationHistory,
      resume: [{ interruptId: interrupt.id, status: 'cancelled' }],
    });
  }, [aguiHitlPending, aguiRun, aguiState.messages]);

    // Cancel any previous in-flight send, create a fresh AbortController, and
  // return the new signal. Called once at the top of every real send path.
  const beginAbortableSend = useCallback(() => {
    // Abort any prior in-flight send. Load-bearing: the nlResumeAfterAuth
    // effect is NOT reentrancy-guard-protected, so it can supersede a
    // guarded send's I/O — cancel it rather than let it race.
    if (sendAbortRef.current) {
      try { sendAbortRef.current.abort(); } catch (_) {}
    }
    const c = new AbortController();
    sendAbortRef.current = c;
    return c.signal;
  }, []);

  // Clamp a floating-panel position into the current viewport using the
  // latest panel size (read via ref so listeners needn't resubscribe).
  const clampDragPosToViewport = useCallback((prev) => {
    if (!prev) return prev;
    return clampPanelPosition(prev, panelSizeRef.current, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }, []);

  // ── Drag-to-move ──────────────────────────────────────────────────────────
  // Uses pointer capture so dragging continues off-screen onto a second monitor.
  const handleDragStart = useCallback((e) => {
    // Don't intercept button/input clicks
    if (e.target.closest("button, input, textarea, select")) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    // Always anchor to current visual position and exit expanded mode so panelStyle
    // uses the drag coordinates (isExpanded causes the centered style to win otherwise)
    setIsExpanded(false);
    setDragPos({ x: rect.left, y: rect.top });
    e.preventDefault();
    document.body.style.userSelect = "none";

    // Capture pointer on the panel so events keep firing even off-browser-window
    const target = panelRef.current || e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch (_) {
      /* noop if not pointer event */
    }

    function onMove(ev) {
      if (!isDraggingRef.current) return;
      // No clamping — allow drag to second screen
      const x = ev.clientX - dragOffsetRef.current.x;
      const y = ev.clientY - dragOffsetRef.current.y;
      setDragPos({ x, y });
    }
    function onUp() {
      isDraggingRef.current = false;
      document.body.style.userSelect = "";
      // Drag itself is unclamped (second-monitor drag is intentional); on
      // RELEASE, pull the panel back so the header strip stays reachable.
      setDragPos(clampDragPosToViewport);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  }, [clampDragPosToViewport]);

  // (drag listeners now attached inline in handleDragStart via pointer capture)
  useEffect(() => {
    /* no-op — kept for hook ordering stability */
  }, []);

  // Resize handler — works whether the panel is at CSS default position or has been dragged.
  // Supports all 8 directions: n, ne, e, se, s, sw, w, nw.
  // N/W/NW/NE/SW directions shift dragPos so the opposite edge stays fixed.
  const handleResize = useCallback(
    (e, direction) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget;
      // Pointer capture keeps events firing even when the cursor leaves the handle
      try {
        target.setPointerCapture(e.pointerId);
      } catch (_) {}
      document.body.style.userSelect = "none";

      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = panelSize.width;
      const startHeight = panelSize.height;

      // Exit expanded mode on resize (same as drag)
      setIsExpanded(false);

      // Capture starting position from current dragPos or from getBoundingClientRect.
      // Must be done synchronously so onMove calculations are anchored correctly.
      let startPosX, startPosY;
      const rect = panelRef.current?.getBoundingClientRect();
      if (dragPos) {
        startPosX = dragPos.x;
        startPosY = dragPos.y;
      } else if (rect) {
        startPosX = rect.left;
        startPosY = rect.top;
        setDragPos({ x: rect.left, y: rect.top });
      } else {
        startPosX = 0;
        startPosY = 0;
      }

      function onMove(ev) {
        const deltaX = ev.clientX - startX;
        const deltaY = ev.clientY - startY;
        const MIN_W = 280,
          MIN_H = 220;
        const MAX_W = Math.floor(window.innerWidth * 0.95);
        const MAX_H = Math.floor(window.innerHeight * 0.95);

        let newWidth = startWidth;
        let newHeight = startHeight;
        let newX = startPosX;
        let newY = startPosY;

        // Right edge — grows rightward, position unchanged
        if (direction === "e" || direction === "se" || direction === "ne") {
          newWidth = Math.min(MAX_W, Math.max(MIN_W, startWidth + deltaX));
        }
        // Left edge — grows leftward, left position shifts
        if (direction === "w" || direction === "sw" || direction === "nw") {
          newWidth = Math.min(MAX_W, Math.max(MIN_W, startWidth - deltaX));
          newX = startPosX + (startWidth - newWidth);
        }
        // Bottom edge — grows downward, position unchanged
        if (direction === "s" || direction === "se" || direction === "sw") {
          newHeight = Math.min(MAX_H, Math.max(MIN_H, startHeight + deltaY));
        }
        // Top edge — grows upward, top position shifts
        if (direction === "n" || direction === "ne" || direction === "nw") {
          newHeight = Math.min(MAX_H, Math.max(MIN_H, startHeight - deltaY));
          newY = startPosY + (startHeight - newHeight);
        }

        setPanelSize({ width: newWidth, height: newHeight });
        setDragPos({ x: newX, y: newY });
      }

      function onUp() {
        document.body.style.userSelect = "";
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
      }

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [panelSize, dragPos],
  );

  // Panel position: override CSS anchoring when user has dragged the window
  // In inline mode the CSS (.ba-mode-inline) handles size — no inline style needed
  const panelStyle = isInline
    ? {}
    : isExpanded
      ? {
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(94vw, 520px)",
          height: "min(85vh, 720px)",
          maxWidth: 560,
          maxHeight: "85vh",
          right: "auto",
          bottom: "auto",
        }
      : dragPos
        ? {
            left: dragPos.x,
            top: dragPos.y,
            bottom: "auto",
            right: "auto",
            width: panelSize.width,
            height: panelSize.height,
            transform: "none",
          }
        : {
            width: panelSize.width,
            height: panelSize.height,
            transform: "none",
          };
  /** Results panel width (CSS) — keep gap in sync when dragging / expanded layout */
  const resultsPanelWidthPx = 340;

  // In inline mode the panel is always visible; in float mode respect the open/closed state
  const effectiveIsOpen = isInline || isOpen;

  // Keep agentBounds fresh whenever the panel resizes (chips expand/collapse, resize handle use)
  useEffect(() => {
    const update = () => {
      const rect = panelRef.current?.getBoundingClientRect();
      if (rect)
        setAgentBounds({
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        });
    };
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (ro && panelRef.current) ro.observe(panelRef.current);
    update();
    return () => ro?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveIsOpen, panelSize, isExpanded]);

  // Also update bounds on drag (ResizeObserver fires only on size changes, not position)
  useEffect(() => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect)
      setAgentBounds({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });
  }, [dragPos]);

  // Recover the floating panel if the viewport shrinks (or rotates) while the
  // panel was dragged near/over an edge. Float mode only — inline uses CSS.
  useEffect(() => {
    if (isInline) return;
    function onResize() {
      setDragPos(clampDragPosToViewport);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isInline, clampDragPosToViewport]);

  const resultsPanelStyle = useMemo(() => {
    const gap = 12;
    const rpW = resultsPanelWidthPx;
    // Anchor to actual agent panel bounds when available — works for all modes (inline, drag, expanded, default)
    if (agentBounds) {
      const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
      const topEdge = Math.max(8, agentBounds.top);
      const maxH = Math.min(
        (typeof window !== "undefined" ? window.innerHeight : 800) -
          topEdge -
          16,
        520,
      );
      // Place the results panel to the LEFT of the agent, pushed right if it would overflow
      const desiredLeft = Math.max(8, agentBounds.left - rpW - gap);
      return {
        position: "fixed",
        left: Math.min(desiredLeft, vw - rpW - 8),
        top: topEdge,
        bottom: "auto",
        right: "auto",
        maxHeight: maxH,
        zIndex: 10058,
      };
    }
    // Fallbacks when bounds not yet measured
    if (isInline) {
      // Try to read panel bounds synchronously from the ref (avoids CSS flash at wrong position)
      const rect = panelRef.current?.getBoundingClientRect();
      if (rect) {
        const topEdge = Math.max(8, rect.top);
        const maxH = Math.min(window.innerHeight - topEdge - 16, 520);
        const desiredLeft = Math.max(8, rect.left - rpW - gap);
        return {
          position: "fixed",
          left: Math.min(desiredLeft, window.innerWidth - rpW - 8),
          top: topEdge,
          bottom: "auto",
          right: "auto",
          maxHeight: maxH,
          zIndex: 10058,
        };
      }
      // Ref not yet mounted — use off-screen coords to prevent CSS flash at wrong edge
      return { position: "fixed", left: -9999, top: -9999, zIndex: -1 };
    }
    if (dragPos) {
      return {
        position: "fixed",
        left: Math.max(8, dragPos.x - rpW - gap),
        top: dragPos.y,
        bottom: "auto",
        right: "auto",
        zIndex: 10058,
      };
    }
    if (isExpanded) {
      return {
        position: "fixed",
        left: `max(8px, calc(50vw - min(94vw, 520px) / 2 - ${gap}px - ${rpW}px))`,
        top: "50vh",
        transform: "translateY(-50%)",
        bottom: "auto",
        right: "auto",
        zIndex: 10058,
      };
    }
    return undefined;
  }, [dragPos, isExpanded, isInline, resultsPanelWidthPx, agentBounds]);

  function addMessage(role, content, tool, extra = {}) {
    const { id: exId, ...rest } = extra;
    const id = exId || `${Date.now()}`;
    // Ensure content is always a string for React rendering
    const contentString =
      typeof content === "string" ? content : JSON.stringify(content);
    setMessages((prev) => [
      ...prev,
      { id, role, content: contentString ?? "", tool, ...rest },
    ]);
  }

  function markToolProgressOutcome(success, errorDetail = null) {
    const tid = toolProgressIdRef.current;
    if (!tid) return;
    toolProgressIdRef.current = null;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === tid && m.role === "tool-progress"
          ? {
              ...m,
              steps: (m.steps || []).map((s) => ({
                ...s,
                status: success ? "success" : "error",
                ...(!success && errorDetail ? { error: errorDetail } : {}),
              })),
            }
          : m,
      ),
    );
  }

  /** Show overlay then redirect to PingOne login. */
  async function handleLoginAction(actionId) {
    const label = actionId === "login_admin" ? "Admin" : "Customer";
    spinner.show(`Signing in as ${label}…`, "Redirecting to PingOne");
    // Save any pending prompt so it can be re-executed after OAuth return.
    // nlInput holds the current typed/pre-filled text; capture it before navigation.
    const pendingText = (nlInput || "").trim();
    if (pendingText) {
      sessionStorageService.setItem(BX_AGENT_PENDING_NL_KEY, pendingText);
    }
    const apiUrl = process.env.REACT_APP_API_URL || window.location.origin;
    if (actionId === "login_admin") {
      setTimeout(() => {
        window.location.href = `${apiUrl}/api/auth/oauth/login`;
      }, 150);
      return;
    }
    if (actionId === "login_user") {
      let usePiFlow = false;
      try {
        const r = await fetch("/api/admin/config", { credentials: "include" });
        const j = await r.json();
        const cfg = j?.config || {};
        if (cfg.marketing_customer_login_mode === "slide_pi_flow")
          usePiFlow = true;
      } catch (_) {
        /* keep default redirect */
      }
      setTimeout(() => {
        const p = (location.pathname || "").replace(/\/$/, "") || "/";
        const params = new URLSearchParams();
        if (isPublicMarketingAgentPath(p))
          params.set("return_to", p === "/dashboard" ? "/dashboard" : "/");
        if (usePiFlow) params.set("use_pi_flow", "1");
        const q = params.toString();
        window.location.href = `${apiUrl}/api/auth/oauth/user/login${q ? `?${q}` : ""}`;
      }, 150);
      return;
    }
    // Default behavior for other action IDs
    let usePiFlow = false;
    try {
      const r = await fetch("/api/admin/config", { credentials: "include" });
      const j = await r.json();
      const cfg = j?.config || {};
      if (cfg.marketing_customer_login_mode === "slide_pi_flow")
        usePiFlow = true;
    } catch (_) {
      /* keep default redirect */
    }
    setTimeout(() => {
      const p = (location.pathname || "").replace(/\/$/, "") || "/";
      const params = new URLSearchParams();
      if (isPublicMarketingAgentPath(p))
        params.set("return_to", p === "/dashboard" ? "/dashboard" : "/");
      if (usePiFlow) params.set("use_pi_flow", "1");
      const q = params.toString();
      window.location.href = `${apiUrl}/api/auth/oauth/user/login${q ? `?${q}` : ""}`;
    }, 150);
  }

  /**
   * Runs a banking tool. When fromNl is true, skips the extra user bubble (NL already echoed the ask).
   */
  async function runAction(actionId, form, opts = {}) {
    if (isAgentBlockedByConsentDecline()) {
      addMessage("assistant", AGENT_CONSENT_BLOCK_USER_MESSAGE);
      return;
    }
    // Layer-zero auth gate: save pending action and auto-redirect to PingOne so the
    // request replays automatically after login (via onAuthChallengeLogin)
    if (!isLoggedIn) {
      pendingAuthChallengeActionRef.current = { actionId, form };
      PendingActionManager.save({ actionId, form });
      addMessage(
        "assistant",
        " Signing you in — your request will run automatically after you sign in.",
      );
      handleLoginAction("login_user");
      return;
    }
    // nlSource: when this action was reached via the NL pipeline, the routing
    // engine ("heuristic" | "helix" | "ollama" | ...) is threaded here so the
    // assistant result carries the same source pill the conversational
    // answers already render (see msg.source label, ~line 8300).
    // hitlRetryChallengeId: set on a HITL-approval refire so the write tool
    // echoes the approved challenge id back to the BFF gate (verified → consent
    // gate discharged → retry PERMITs instead of re-issuing the 428). Named
    // distinctly from the component-scope `hitlChallengeId` state (direct-UI
    // consent modal) to avoid shadowing it inside runAction.
    const { skipUserLabel = false, isRefire = false, nlSource = null, hitlRetryChallengeId = null } = opts;
    const resultExtra = nlSource ? { source: nlSource } : {};
    const label = ACTIONS.find((a) => a.id === actionId)?.label || actionId;
    if (!skipUserLabel) {
      addMessage("user", label);
    }
    if (!isRefire) {
      try {
        agentFlowDiagram.resetComplianceSteps(label, actionId);
      } catch (_) {}
      try {
        agentFlowDiagram.startLlmReasoning(label);
      } catch (_) {}
    }
    setLoading(true);
    postAppEvent("agent", "info", "Agent processing started", {
      tag: "agent/processing-start",
      metadata: { userId: effectiveUser?.id || effectiveUser?.username },
    });

    // Toast: show in-progress indicator
    const toastId = `agent-${actionId}-${Date.now()}`;
    toast.info(`${label}...`, { toastId, autoClose: false, isLoading: true });

    try {
      // Chips/tool-progress messages removed per user request (show only user + assistant messages)

      let response;
      switch (actionId) {
        case "demo_guide":
          // Show the interactive demo guide modal
          toast.dismiss(toastId);
          setShowDemoGuide(true);
          setLoading(false);
          toolProgressIdRef.current = null;
          return;
        case "accounts":
          toast.update(toastId, { render: " Calling get_my_accounts…" });
          response = await getMyAccounts();
          response = { ...response, result: enforceVerticalAccountTypes(response.result, terminology) };
          break;
        case "mortgage_demo": {
          // Phase 267 Path A — api_key disposition, end-to-end:
          //   1. Call gateway MCP tool 'show_mortgage' (apikey disposition)
          //   2. Gateway enforces mortgage:read on the user bearer
          //   3. Gateway drops the OAuth bearer, attaches the service API key
          //   4. Gateway calls demo_mortgage_service (X-API-Key + X-User-Sub)
          //   5. Navigate to /path/mortgage with the payload in location.state
          // Destination route is hard-coded (T-266-04-01: no open-redirect).
          toast.update(toastId, {
            render:
              " Routing to mortgage path (gateway swaps OAuth bearer for service API key)…",
          });
          let mortgageResp;
          try {
            mortgageResp = await callMcpTool("show_mortgage", {});
          } catch (e) {
            console.error(
              "[BankingAgent] mortgage_demo dispatch failed:",
              e?.message,
            );
            toast.dismiss(toastId);
            setLoading(false);
            toolProgressIdRef.current = null;
            addMessage(
              "assistant",
              `Could not load mortgage data: ${e?.message || "gateway call failed"}.`,
              actionId,
              resultExtra,
            );
            return;
          }
          const mortgageMcp = mortgageResp?.result;
          const mortgageNorm = normalizeAgentToolResult(mortgageMcp);
          // Scope gate / backend error → JSON-RPC error surfaces as { error, message }.
          if (isAgentToolErrorResult(mortgageNorm)) {
            toast.dismiss(toastId);
            setLoading(false);
            toolProgressIdRef.current = null;
            const insufficient =
              mortgageNorm.error === "insufficient_scope" ||
              /scope/i.test(mortgageNorm.message || "");
            addMessage(
              "assistant",
              insufficient
                ? `The agent's access token does not carry the mortgage:read scope, so the gateway refused to swap it for the mortgage service API key. Sign out and sign back in to consent to mortgage access, then try "show mortgage data" again.`
                : `Could not load mortgage data: ${mortgageNorm.message || "backend error"}.`,
              actionId,
              resultExtra,
            );
            return;
          }
          const mortgageMeta = mortgageMcp?._meta || {};
          const mortgagePayload = {
            mortgage: mortgageNorm.mortgage,
            apiKeyMaskedLast4: mortgageMeta.apiKeyMaskedLast4,
            message: mortgageNorm.note || mortgageMeta.note,
            backend: {
              source: mortgageNorm.source,
              authMechanism: mortgageNorm.authMechanism,
              note: mortgageNorm.note,
            },
          };
          if (tokenChain && Array.isArray(mortgageResp?.tokenEvents)) {
            tokenChain.setTokenEvents(actionId, mortgageResp.tokenEvents);
          }
          toast.dismiss(toastId);
          setLoading(false);
          toolProgressIdRef.current = null;
          navigate("/path/mortgage", { state: { mortgagePayload } });
          return;
        }
        case "vertical_feature_demo": {
          // Path A — api_key disposition for all non-banking verticals.
          // The active vertical's featurePage config drives tool name, scope error message,
          // and field rendering on VerticalFeaturePage. Falls back to show_mortgage so the
          // chip never silently does nothing on the banking vertical.
          const fp = themeManifest?.featurePage;
          const featureTool = fp?.mcpTool || "show_mortgage";
          const featureRoute = "/path/feature";
          const scopeName = themeManifest?.scopes?.featureScope || "feature";
          toast.update(toastId, {
            render: ` Routing to feature path (gateway swaps OAuth bearer for service API key)…`,
          });
          let featureResp;
          try {
            featureResp = await callMcpTool(featureTool, {});
          } catch (e) {
            console.error("[BankingAgent] vertical_feature_demo dispatch failed:", e?.message);
            toast.dismiss(toastId);
            setLoading(false);
            toolProgressIdRef.current = null;
            addMessage("assistant", `Could not load feature data: ${e?.message || "gateway call failed"}.`, actionId, resultExtra);
            return;
          }
          const featureMcp  = featureResp?.result;
          const featureNorm = normalizeAgentToolResult(featureMcp);
          if (isAgentToolErrorResult(featureNorm)) {
            toast.dismiss(toastId);
            setLoading(false);
            toolProgressIdRef.current = null;
            const insufficient =
              featureNorm.error === "insufficient_scope" ||
              /scope/i.test(featureNorm.message || "");
            addMessage(
              "assistant",
              insufficient
                ? (fp?.scopeError || `The agent's access token does not carry the ${scopeName} scope. Sign out and sign back in to consent, then try again.`)
                : `Could not load feature data: ${featureNorm.message || "backend error"}.`,
              actionId,
              resultExtra,
            );
            return;
          }
          const featureMeta = featureMcp?._meta || {};
          const featurePayload = {
            ...(featureMcp || {}),
            apiKeyMaskedLast4: featureMeta.apiKeyMaskedLast4,
            message: featureNorm.note || featureMeta.note,
            backend: {
              source: featureNorm.source,
              authMechanism: featureNorm.authMechanism,
              note: featureNorm.note,
            },
          };
          if (tokenChain && Array.isArray(featureResp?.tokenEvents)) {
            tokenChain.setTokenEvents(actionId, featureResp.tokenEvents);
          }
          toast.dismiss(toastId);
          setLoading(false);
          toolProgressIdRef.current = null;
          navigate(featureRoute, { state: { featurePayload } });
          return;
        }
        case "transactions":
          toast.update(toastId, { render: " Calling get_my_transactions…" });
          response = await getMyTransactions();
          break;
        case "balance":
          toast.update(toastId, { render: " Calling get_account_balance…" });
          response = await getAccountBalance(form.accountId);
          break;
        case "deposit":
          toast.update(toastId, { render: "⬇️ Calling create_deposit…" });
          response = await createDeposit(
            form.accountId || form.toId,
            parseFloat(form.amount),
            form.note,
            hitlRetryChallengeId,
          );
          break;
        case "withdraw":
          toast.update(toastId, { render: "⬆️ Calling create_withdrawal…" });
          response = await createWithdrawal(
            form.accountId || form.fromId,
            parseFloat(form.amount),
            form.note,
            hitlRetryChallengeId,
          );
          break;
        case "transfer":
          toast.update(toastId, { render: "↔️ Calling create_transfer…" });
          response = await createTransfer(
            form.fromId,
            form.toId,
            parseFloat(form.amount),
            form.note,
            hitlRetryChallengeId,
          );
          break;
        case "sensitive-account-details": {
          try {
            agentFlowDiagram.markHitlPreConsent();
          } catch (_) {}
          // Gate behind HITL — show consent card first, fetch data only after user confirms.
          addMessage(
            "assistant",
            " Sensitive Account Data Request\n\nThis will reveal your full account numbers, routing numbers, SWIFT, and IBAN. Please confirm before proceeding.",
            actionId,
          );
          toast.dismiss(toastId);
          setLoading(false);
          toolProgressIdRef.current = null;
          setHitlPendingIntent({
            actionId: "sensitive-account-details",
            form,
            intentPayload: {
              type: "Sensitive Data Access",
              description:
                "Full account numbers · Routing numbers · SWIFT / IBAN",
              amount: 0,
            },
            threshold: 1, // 0 < 1 → not flagged as high-value
            isSensitiveData: true,
          });
          return;
        }
        case "mcp_tools": {
          toast.update(toastId, { render: " Fetching MCP tool list…" });
          agentFlowDiagram.startInspectorToolsList();
          let mcpRes;
          try {
            mcpRes = await fetch("/api/mcp/inspector/tools", {
              credentials: "include",
            });
          } catch (netErr) {
            agentFlowDiagram.completeInspectorToolsList({
              ok: false,
              errorMessage: netErr.message || "Network error",
            });
            throw netErr;
          }
          if (!mcpRes.ok) {
            agentFlowDiagram.completeInspectorToolsList({
              ok: false,
              errorMessage: `HTTP ${mcpRes.status}`,
            });
            throw new Error(`MCP tools fetch failed: ${mcpRes.status}`);
          }
          let data;
          try {
            data = await mcpRes.json();
          } catch (parseErr) {
            agentFlowDiagram.completeInspectorToolsList({
              ok: false,
              errorMessage: parseErr.message || "Invalid JSON",
            });
            throw parseErr;
          }
          // MFA gate: server requires step-up before listing tools.
          if (data.mfa_required) {
            agentFlowDiagram.completeInspectorToolsList({
              ok: false,
              errorMessage: "mfa_required",
            });
            toast.update(toastId, {
              render:
                " MFA verification required to load tools — verify your identity below",
              type: "warning",
              isLoading: false,
              autoClose: 6000,
            });
            setLoading(false);
            toolProgressIdRef.current = null;
            // Store pending action so cibaStepUpApproved can retry tools/list
            pendingStepUpActionRef.current = {
              actionId,
              form,
              method: data.step_up_method || "email",
            };
            window.dispatchEvent(
              new CustomEvent("agentStepUpRequested", {
                detail: { step_up_method: data.step_up_method || "email" },
              }),
            );
            return;
          }
          const tools = data.tools || [];
          agentFlowDiagram.completeInspectorToolsList({
            ok: true,
            source: data._source || "mcp_server",
          });
          // Show tools in modal instead of chat message
          setMcpToolsList(tools);
          setShowMcpToolsModal(true);
          addMessage(
            "assistant",
            ` MCP Tools (${tools.length} available) — check the popup window`,
            "tools/list",
          );
          toast.update(toastId, {
            render: `✅ ${tools.length} tools loaded`,
            type: "success",
            isLoading: false,
            autoClose: agentToastMs.toolsLoaded,
          });
          setLoading(false);
          toolProgressIdRef.current = null;
          return;
        }
        case "web_search": {
          toast.update(toastId, { render: "\u{1F50D} Searching the web…" });
          const q = encodeURIComponent(form.query || "");
          let srRes;
          try {
            srRes = await fetch(`/api/banking-agent/search?q=${q}`, {
              credentials: "include",
            });
          } catch (netErr) {
            throw new Error(`Web search network error: ${netErr.message}`);
          }
          const srData = await srRes.json().catch(() => ({}));
          if (!srRes.ok) {
            if (srData.error === "BRAVE_NOT_CONFIGURED") {
              addMessage(
                "assistant",
                `\u26A0\uFE0F Web search is not configured.\n\n${srData.message || "Set BRAVE_SEARCH_API_KEY in the server environment to enable web search."}`,
                actionId,
              );
              toast.dismiss(toastId);
              setLoading(false);
              toolProgressIdRef.current = null;
              return;
            }
            throw new Error(srData.message || `Search failed: ${srRes.status}`);
          }
          const srResults = (srData.results || [])
            .map(
              (r, i) =>
                `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description || ""}`,
            )
            .join("\n\n");
          addMessage(
            "assistant",
            `\u{1F50D} Web search results for "${srData.query || form.query || ""}":\n\n${srResults || "No results found."}`,
            actionId,
          );
          toast.update(toastId, {
            render: "\u2705 Search complete",
            type: "success",
            isLoading: false,
            autoClose: agentToastMs.toolsLoaded,
          });
          setLoading(false);
          toolProgressIdRef.current = null;
          return;
        }
        // ── Testing scenarios ──────────────────────────────────────────────────
        case "test_wrong_scope": {
          // Exercises the BFF gateway scope denial flow: calls an admin-only MCP tool
          // (admin_get_all_users) with an end-user token lacking the required scope.
          // The gateway should respond with 403 + required_scopes metadata.
          // RFC 6749 §3.3 — Resource servers MUST reject tokens that don't carry required scopes.
          toast.update(toastId, {
            render:
              "⚠️ Calling admin tool with customer token (no admin scope)…",
          });
          let scopeTestRes;
          try {
            // admin_get_all_users requires admin scope not in customer token
            scopeTestRes = await callMcpTool("admin_get_all_users", {});
          } catch (scopeErr) {
            scopeTestRes = {
              error: scopeErr.code || scopeErr.message,
              status: scopeErr.status,
              missingScopes: scopeErr.missingScopes,
              tokenEvents: scopeErr.tokenEvents || [],
            };
          }
          const scopeRejected =
            scopeTestRes?.status === 403 ||
            scopeTestRes?.error === "agent_mcp_scope_denied" ||
            scopeTestRes?.error?.includes("scope");
          const scopeOutcome = scopeRejected
            ? `✅ Gateway correctly rejected (403): required_scopes=[${(scopeTestRes.missingScopes || []).join(", ") || "admin"}]`
            : `❌ Expected 403 denial, got: ${scopeTestRes?.error || scopeTestRes?.status || "success"}`;
          addMessage(
            "token-event",
            [
              "⚠️ Authorization Test: Insufficient Scope (RFC 6749 §3.3)",
              "",
              scopeOutcome,
              "",
              "Step 4b-c: Gateway denial includes required_scopes metadata",
              `Status: ${scopeTestRes?.status || "?"}`,
              `Error: ${scopeTestRes?.error || "none"}`,
              `Missing scopes: [${(scopeTestRes?.missingScopes || []).join(", ") || "admin"}]`,
              "",
              "RFC 6749 §3.3 — The `scope` parameter limits what an access token can do.",
              "   Resource servers MUST reject requests where the token lacks required scopes.",
              "RFC 8693 §2.1 — Token exchange can only narrow (not expand) scopes.",
              "   MCP token inherits user token's scopes; cannot gain new scopes.",
            ].join("\n"),
            actionId,
          );
          if (scopeTestRes?.tokenEvents?.length) {
            tokenChain?.setTokenEvents(actionId, scopeTestRes.tokenEvents);
          }
          toast.update(toastId, {
            render: scopeRejected
              ? "✅ Scope rejection + denial metadata confirmed"
              : "❌ Expected 403 denial not received",
            type: scopeRejected ? "info" : "error",
            isLoading: false,
            autoClose: agentToastMs.toolsLoaded,
          });
          setLoading(false);
          toolProgressIdRef.current = null;
          return;
        }
        case "test_wrong_audience": {
          // Calls the MCP tool endpoint with a deliberately wrong audience value in the
          // exchange request by temporarily disabling mcp_resource_uri and requesting a
          // non-existent audience. The RFC 8693 exchange will fail with an audience error.
          // RFC 8693 §2.1 + RFC 8707 — token exchange requires the `audience` to match a
          // resource server the AS is authorised to issue for.
          toast.update(toastId, {
            render: "⚠️ Testing wrong audience on MCP token exchange…",
          });
          let audTestRes;
          try {
            // Request a tool whose exchange will target a nonsense audience
            const apiBase = process.env.REACT_APP_API_URL || "";
            const r = await fetch(`${apiBase}/api/mcp/tool`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              _silent: true,
              body: JSON.stringify({
                tool: "get_my_accounts",
                params: {},
                _testAudience: "https://invalid-audience.example.com",
              }),
            });
            audTestRes = await r.json();
            audTestRes._httpStatus = r.status;
          } catch (audErr) {
            audTestRes = { error: audErr.message };
          }
          // Gateway should reject with 403 if audience validation is enforced
          const audRejected = audTestRes._httpStatus >= 400;
          const audOutcome = audRejected
            ? `✅ Gateway correctly rejected (${audTestRes._httpStatus}): ${audTestRes.error || "invalid audience"}`
            : `ℹ️ Server fell back to local handler (token exchange skipped or not configured) — HTTP ${audTestRes._httpStatus ?? 200}`;
          addMessage(
            "token-event",
            [
              "⚠️ Authorization Test: Wrong Audience (RFC 8693 §2.1 · RFC 8707)",
              "",
              audOutcome,
              "",
              "Step 5b-c: Gateway denial includes audience validation",
              `Status: ${audTestRes._httpStatus ?? "?"}`,
              `Error: ${audTestRes?.error || "none"}`,
              "",
              "RFC 8693 §2.1 — The `audience` parameter in a token exchange request identifies which",
              "   resource server the resulting token is valid for. The AS verifies it against its policy.",
              "RFC 8707 — Resource Indicators bind access tokens to specific resource URIs.",
              "   A token issued for `banking-api.example.com` MUST be rejected by `mcp-server.example.com`.",
              "   The `aud` claim in the MCP token must exactly match the MCP server's registered audience.",
              "",
              "Open Token Chain ↗ → MCP access token → `aud` claim to see the audience after exchange.",
            ].join("\n"),
            actionId,
          );
          if (audTestRes?.tokenEvents?.length) {
            tokenChain?.setTokenEvents(actionId, audTestRes.tokenEvents);
          }
          toast.update(toastId, {
            render: audRejected
              ? "✅ Audience rejection confirmed"
              : "ℹ️ Audience test sent",
            type: "info",
            isLoading: false,
            autoClose: agentToastMs.toolsLoaded,
          });
          setLoading(false);
          toolProgressIdRef.current = null;
          return;
        }
        case "test_hitl_required": {
          // Routes through the real transfer path with a high-value amount that exceeds the HITL
          // threshold ($500). Uses live account IDs so the transfer lookup succeeds server-side.
          // HITL (Human-in-the-Loop) pauses the agent and requires explicit user consent before
          // the operation proceeds — a key security pattern for agentic AI systems.
          toast.update(toastId, {
            render:
              " Sending high-value transfer to trigger Human-in-the-Loop (HITL)…",
          });
          const hitlAccounts =
            liveAccounts && liveAccounts.length >= 2 ? liveAccounts : null;
          const hitlFrom =
            hitlAccounts?.find(
              (a) => a.type === "checking" || a.type === "chk",
            ) || hitlAccounts?.[0];
          const hitlTo =
            hitlAccounts?.find(
              (a) => a.type === "savings" || a.type === "sav",
            ) || hitlAccounts?.[1];
          if (!hitlFrom || !hitlTo) {
            addMessage(
              "assistant",
              [
                "⚠️ HITL Test: accounts not loaded",
                "",
                "Need at least 2 accounts (checking + savings) to run this test.",
                "Try clicking My Accounts first to load your account list.",
              ].join("\n"),
              actionId,
            );
            toast.dismiss(toastId);
            setLoading(false);
            toolProgressIdRef.current = null;
            return;
          }
          addMessage(
            "token-event",
            [
              " Human-in-the-Loop (HITL) Test",
              "",
              `Attempting transfer of $99,999.99 from ${hitlFrom.name || hitlFrom.type} → ${hitlTo.name || hitlTo.type}`,
              "This exceeds the HITL threshold — the agent will be paused pending your consent.",
              "",
              "HITL Gate — High-value agentic transactions require explicit human approval before",
              "   the AI agent can proceed. The agent is paused until you approve or deny in the modal.",
              "PingOne Authorize — The consent decision can be enforced via a PingOne Authorize policy,",
              "   making the approval decision auditable and policy-driven (not just a frontend guard).",
            ].join("\n"),
            actionId,
          );
          response = await createTransfer(
            hitlFrom.id,
            hitlTo.id,
            APP_CONFIG.THRESHOLDS.DEMO_LARGE_TRANSFER,
            "Test HITL threshold",
          );
          // Falls through to normalizeAgentToolResult — HITL gate fires there and shows consent modal
          break;
        }
        case "transfer_600_test": {
          // Test HITL consent + MFA flow with a realistic $600 transfer
          toast.update(toastId, {
            render: "Initiating $600 transfer to test HITL consent + MFA flow…",
          });
          const testAccounts =
            liveAccounts && liveAccounts.length >= 2 ? liveAccounts : null;
          // Find account with sufficient balance for $600 transfer (prioritize savings over checking)
          const testFrom =
            testAccounts?.find(
              (a) =>
                (a.type === "savings" || a.type === "sav") && a.balance >= 600,
            ) ||
            testAccounts?.find(
              (a) =>
                (a.type === "checking" || a.type === "chk") && a.balance >= 600,
            ) ||
            testAccounts?.find((a) => a.balance >= 600) ||
            testAccounts?.[0];
          const testTo =
            testAccounts?.find(
              (a) => a.type === "savings" || a.type === "sav",
            ) ||
            testAccounts?.find(
              (a) => a.type === "checking" || a.type === "chk",
            ) ||
            testAccounts?.[1];
          if (!testFrom || !testTo) {
            addMessage(
              "assistant",
              [
                "⚠️ Transfer Test: accounts not loaded",
                "",
                "Need at least 2 accounts (checking + savings) to run this test.",
                "Try clicking My Accounts first to load your account list.",
              ].join("\n"),
              actionId,
            );
            toast.dismiss(toastId);
            setLoading(false);
            toolProgressIdRef.current = null;
            return;
          }
          addMessage(
            "token-event",
            [
              "Testing HITL Consent + MFA Flow",
              "",
              `Attempting transfer of $${APP_CONFIG.THRESHOLDS.DEMO_HITL_TRANSFER} from ${testFrom.name || testFrom.type} → ${testTo.name || testTo.type}`,
              "",
              "Expected flow:",
              "  1. Consent modal appears (HITL gate triggers at $250+)",
              "  2. Review transaction details and check 'I agree'",
              "  3. Click 'Agree & send code'",
              "  4. Device selection modal appears (select OTP or FIDO2)",
              "  5. Complete MFA challenge (OTP: enter 123456 or code from email)",
              "  6. Transaction completes",
            ].join("\n"),
            actionId,
          );
          try {
            // Call HTTP endpoint directly (not MCP) to trigger authorization + HITL
            const httpRes = await fetch("/api/transactions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                fromAccountId: testFrom.id,
                toAccountId: testTo.id,
                amount: APP_CONFIG.THRESHOLDS.DEMO_HITL_TRANSFER,
                type: "transfer",
                description: "HITL + MFA test",
              }),
            });
            const httpBody = await httpRes.json();
            console.log(
              "[Transfer600Test] HTTP Transfer status:",
              httpRes.status,
            );
            console.log("[Transfer600Test] HTTP Transfer body:", httpBody);
            response = { result: httpBody, status: httpRes.status };

            // If 428 (HITL), show consent modal
            if (httpRes.status === 428) {
              toast.dismiss(toastId);
              setLoading(false);
              setHitlPendingIntent({
                actionId: "transfer_600_test",
                form: {
                  fromId: testFrom.id,
                  toId: testTo.id,
                  amount: String(APP_CONFIG.THRESHOLDS.DEMO_HITL_TRANSFER),
                  note: "HITL + MFA test",
                },
                intentPayload: {
                  type: "transfer",
                  description: `Transfer $${APP_CONFIG.THRESHOLDS.DEMO_HITL_TRANSFER}`,
                  amount: APP_CONFIG.THRESHOLDS.DEMO_HITL_TRANSFER,
                },
                threshold: 250,
              });
              return;
            }

            // If 403 (deny), format as error result
            if (httpRes.status === 403) {
              response.result = {
                ok: false,
                error: httpBody.error,
                ...httpBody,
              };
            }
          } catch (err) {
            console.error("[Transfer600Test] Transfer failed:", err);
            addMessage("assistant", `Error: ${err.message}`);
            toast.dismiss(toastId);
            setLoading(false);
            return;
          }
          // Falls through to normalizeAgentToolResult for 200/other responses
          break;
        }
        case "demo_intent_delegation": {
          // Demonstrates intent-bound, constraint-based delegation:
          // RFC 8693 token exchange narrows scope+audience (constraint enforcement),
          // HITL consent gate enforces the delegated spend limit before the agent proceeds.
          toast.update(toastId, {
            render:
              " Intent-Bound Transfer — RFC 8693 constraints + HITL consent gate…",
          });
          const intentAccounts =
            liveAccounts && liveAccounts.length >= 2 ? liveAccounts : null;
          const intentFrom =
            intentAccounts?.find(
              (a) => a.type === "checking" || a.type === "chk",
            ) || intentAccounts?.[0];
          const intentTo =
            intentAccounts?.find(
              (a) => a.type === "savings" || a.type === "sav",
            ) || intentAccounts?.[1];
          if (!intentFrom || !intentTo) {
            addMessage(
              "assistant",
              [
                "⚠️ Intent-Bound Transfer: accounts not loaded",
                "",
                "Need at least 2 accounts (checking + savings) to run this demo.",
                "Try clicking My Accounts first to load your account list.",
              ].join("\n"),
              actionId,
            );
            toast.dismiss(toastId);
            setLoading(false);
            toolProgressIdRef.current = null;
            return;
          }
          addMessage(
            "token-event",
            [
              " Intent-Bound Delegation Demo",
              "",
              `Attempting transfer of $99,999.99 from ${intentFrom.name || intentFrom.type} → ${intentTo.name || intentTo.type}`,
              "",
              "RFC 8693 Token Exchange — The agent's MCP token is scope- and audience-constrained",
              "   (write scope, MCP server audience) — the delegated intent is encoded in the token.",
              "HITL Consent Gate — Transfer exceeds threshold; agent is paused pending your explicit approval.",
              "   This enforces the spend constraint and delegates only what was authorized.",
            ].join("\n"),
            actionId,
          );
          response = await createTransfer(
            intentFrom.id,
            intentTo.id,
            APP_CONFIG.THRESHOLDS.DEMO_LARGE_TRANSFER,
            "Intent-bound delegation demo",
          );
          // Falls through to normalizeAgentToolResult — HITL gate fires there and shows consent modal
          break;
        }
        case "test_full_compliance_flow": {
          // Comprehensive test exercising ALL 12 compliance steps:
          // 1. agent-llm-reasoning — NL intent routing
          // 2. agent-token-init — token acquisition
          // 3. gw-scope-map — scope mapping at gateway
          // 4. agent-scope-aware-cache — scoped caching
          // 5. olb-resource-token — token exchange for resource
          // 6. gw-denial-metadata — gateway denial signals
          // 7. gw-hitl-challenge-type — HITL challenge type detection
          // 8. bff-response-shape — BFF response formatting
          // 9. ui-gateway-consent — consent modal in UI
          // 10. ui-auto-refire — auto-refire after consent
          // 11. agent-error-propagation — error propagation
          // 12. claim-diagnostics — token claim analysis
          toast.update(toastId, {
            render:
              " Full Compliance Flow: high-value sensitive transfer (HITL + MFA)…",
          });
          const compAccounts =
            liveAccounts && liveAccounts.length >= 2 ? liveAccounts : null;
          // Find account with sufficient balance for $600 transfer (prioritize savings over checking)
          const compFrom =
            compAccounts?.find(
              (a) =>
                (a.type === "savings" || a.type === "sav") && a.balance >= 600,
            ) ||
            compAccounts?.find(
              (a) =>
                (a.type === "checking" || a.type === "chk") && a.balance >= 600,
            ) ||
            compAccounts?.find((a) => a.balance >= 600) ||
            compAccounts?.[0];
          const compTo =
            compAccounts?.find(
              (a) => a.type === "savings" || a.type === "sav",
            ) ||
            compAccounts?.find(
              (a) => a.type === "checking" || a.type === "chk",
            ) ||
            compAccounts?.[1];
          if (!compFrom || !compTo) {
            addMessage(
              "assistant",
              [
                "⚠️ Full Compliance Test: accounts not loaded",
                "",
                "Need at least 2 accounts to run this test.",
                "Try clicking My Accounts first to load your account list.",
              ].join("\n"),
              actionId,
            );
            toast.dismiss(toastId);
            setLoading(false);
            toolProgressIdRef.current = null;
            return;
          }
          addMessage(
            "token-event",
            [
              " FULL COMPLIANCE FLOW TEST (All 12 Steps)",
              "",
              `Attempting $${APP_CONFIG.THRESHOLDS.DEMO_HITL_TRANSFER} transfer from ${compFrom.name || compFrom.type} → ${compTo.name || compTo.type}`,
              "This scenario exercises all 12 compliance steps:",
              "",
              "- Step 1: LLM intent reasoning (NL → transfer intent)",
              "- Step 2: Token initialization (get user token)",
              "- Step 3: Gateway scope mapping (write scope)",
              "- Step 4: Scope-aware caching",
              "- Step 5: Resource token exchange (RFC 8693)",
              "- Step 6: Gateway denial metadata collection",
              "- Step 7: HITL challenge type detection (>$250)",
              "- Step 8: BFF response formatting with consent challenge",
              "- Step 9: UI consent modal display",
              "- Step 10: Auto-refire after user approves consent",
              "- Step 11: Error propagation (if MFA needed)",
              "- Step 12: Token claim diagnostics + MFA verification",
              "",
              "Approve the consent modal → MFA step-up will be required → transfer completes",
            ].join("\n"),
            actionId,
          );
          try {
            // Call HTTP endpoint directly (not MCP) to trigger authorization + HITL
            const httpRes = await fetch("/api/transactions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                fromAccountId: compFrom.id,
                toAccountId: compTo.id,
                amount: APP_CONFIG.THRESHOLDS.DEMO_HITL_TRANSFER,
                type: "transfer",
                description: " Full compliance scenario test",
              }),
            });
            const httpBody = await httpRes.json();
            console.log(
              "[FullCompliance] HTTP Transfer status:",
              httpRes.status,
            );
            console.log("[FullCompliance] HTTP Transfer body:", httpBody);
            response = { result: httpBody, status: httpRes.status };

            // If 428 (HITL), show consent modal
            if (httpRes.status === 428) {
              console.log(
                "[FullCompliance] Detected HITL, showing consent modal",
              );
              toast.dismiss(toastId);
              setLoading(false);
              setHitlPendingIntent({
                actionId: "full_compliance_test",
                form: {
                  fromId: compFrom.id,
                  toId: compTo.id,
                  amount: String(APP_CONFIG.THRESHOLDS.DEMO_HITL_TRANSFER),
                  note: "Full compliance scenario test",
                },
                intentPayload: {
                  type: "transfer",
                  description: `Transfer $${APP_CONFIG.THRESHOLDS.DEMO_HITL_TRANSFER}`,
                  amount: APP_CONFIG.THRESHOLDS.DEMO_HITL_TRANSFER,
                },
                threshold: 250,
              });
              return;
            }

            // If 403 (deny), format as error result
            if (httpRes.status === 403) {
              response.result = {
                ok: false,
                error: httpBody.error,
                ...httpBody,
              };
              console.log("[FullCompliance] Formatted as deny response");
            }
          } catch (err) {
            console.error("[FullCompliance] Transfer failed:", err);
            addMessage("assistant", `Error: ${err.message}`);
            toast.dismiss(toastId);
            setLoading(false);
            return;
          }
          // Falls through to normalizeAgentToolResult — consent + MFA gates fire here
          break;
        }
        case "test_otp_required": {
          // Triggers the sensitive-account-details flow which requires step-up MFA via RFC 9470.
          // RFC 9470 (OAuth 2.0 Step-Up Authentication Challenge Protocol) defines how resource
          // servers signal that a stronger authentication is required via WWW-Authenticate challenges.
          toast.update(toastId, {
            render: " Triggering step-up authentication (RFC 9470)…",
          });
          // Fetch live thresholds so the message can quote exact values
          let _thresholds = {
            confirm_threshold_usd: APP_CONFIG.THRESHOLDS.HITL_DEFAULT,
            mfa_threshold_usd: APP_CONFIG.THRESHOLDS.MFA_DEFAULT,
          };
          try {
            const _tr = await fetch("/api/config/thresholds", {
              credentials: "include",
            });
            if (_tr.ok) _thresholds = await _tr.json();
          } catch (_) {
            /* non-fatal */
          }
          const _stepUpThreshold =
            _thresholds.mfa_threshold_usd ?? APP_CONFIG.THRESHOLDS.MFA_DEFAULT;
          const _hitlThreshold =
            _thresholds.confirm_threshold_usd ??
            APP_CONFIG.THRESHOLDS.HITL_DEFAULT;
          // Fetch live thresholds so the message can quote exact values
          const stepUpRes = await sendAgentMessage(
            "Show me my full account details with routing numbers",
          );
          if (stepUpRes.stepUpRequired) {
            addMessage(
              "token-event",
              [
                " Step-Up Authentication Test (RFC 9470)",
                "",
                "✅ Step-up challenge correctly triggered.",
                "",
                "RFC 9470 — OAuth 2.0 Step-Up Authentication Challenge Protocol.",
                "   A resource server can require stronger authentication (higher `acr`) for sensitive operations.",
                "   The server returns a challenge; the client must obtain a new token with the required `acr` value.",
                "acr claim — Authentication Context Class Reference. `Multi_Factor` or `MFA` indicates",
                "   the user authenticated with a second factor (OTP, FIDO2, push notification).",
                "",
                `Current thresholds (Admin → Security Settings):`,
                `   • Step-up MFA:   transfers/withdrawals ≥ $${_stepUpThreshold} trigger an MFA challenge`,
                `   • HITL consent:  transfers/withdrawals ≥ $${_hitlThreshold} require explicit approval`,
                "",
                "Complete the OTP challenge below — the agent will resume after your identity is verified.",
              ].join("\n"),
              actionId,
            );
            toast.update(toastId, {
              render: " Step-up challenge triggered — verify identity below",
              type: "info",
              isLoading: false,
              autoClose: 6000,
            });
            setLoading(false);
            toolProgressIdRef.current = null;
            window.dispatchEvent(
              new CustomEvent("agentStepUpRequested", {
                detail: { step_up_method: stepUpRes.stepUpMethod || "email" },
              }),
            );
            return;
          }
          addMessage(
            "token-event",
            [
              " Step-Up Authentication Test (RFC 9470)",
              "",
              stepUpRes.reply ||
                "Step-up not triggered — MFA may already be satisfied for this session.",
              "",
              "RFC 9470 — Step-up is only triggered when the session `acr` is below the required level.",
              "   If you already authenticated with MFA, the challenge is skipped (acr already satisfied).",
              "",
              `Current thresholds (Admin → Security Settings):`,
              `   • Step-up MFA:   transfers/withdrawals ≥ $${_stepUpThreshold} trigger an MFA challenge`,
              `   • HITL consent:  transfers/withdrawals ≥ $${_hitlThreshold} require explicit approval`,
              `   Since your session acr is already at the required level, no new challenge was issued.`,
            ].join("\n"),
            actionId,
          );
          toast.update(toastId, {
            render: "✅ Step-up test complete",
            type: "info",
            isLoading: false,
            autoClose: agentToastMs.toolsLoaded,
          });
          setLoading(false);
          toolProgressIdRef.current = null;
          return;
        }
        case "ai_ask":
          toast.update(toastId, { render: "Reasoning…" });
          response = await callMcpTool("sequential_think", {
            query: "What can I help you with today?",
          });
          break;
        case "ai_helix_demo":
          toast.update(toastId, { render: "Reasoning…" });
          response = await callMcpTool("sequential_think", {
            query: "What are best practices for account security?",
          });
          break;
        case "ai_explain":
          toast.update(toastId, { render: "Reasoning…" });
          response = await callMcpTool("sequential_think", {
            query:
              "Explain how OAuth 2.0 and RFC 8693 token exchange work in this demo",
          });
          break;
        case "ai_helix_explain":
          toast.update(toastId, { render: "Reasoning…" });
          response = await callMcpTool("sequential_think", {
            query: "Explain the difference between OAuth and SAML",
          });
          break;
        case "ai_analyze":
          toast.update(toastId, { render: "Reasoning…" });
          response = await callMcpTool("sequential_think", {
            query: "Summarize how the MCP tool flow works in this demo",
          });
          break;
        case "ai_advice":
          toast.update(toastId, { render: "Reasoning…" });
          response = await callMcpTool("sequential_think", {
            query:
              "What are some good tips for managing checking and savings accounts?",
          });
          break;
        case "ai_helix_advice":
          toast.update(toastId, { render: "Reasoning…" });
          response = await callMcpTool("sequential_think", {
            query:
              "Give me 5 tips for reducing transaction fees and managing money better",
          });
          break;
        case "api_key_demo": {
          // Phase 266/267 Path A: exercise the gateway API-key credential swap.
          // Tool name 'show_mortgage' is the canonical apikey-disposition tool
          // (Phase 267 replaced the Phase 266 'special_offers' stub). Gateway
          // swaps OAuth bearer for service API key, records swap in
          // _meta.tokenEvents. This chip only demonstrates the swap and routes
          // to the info page (it does NOT render the mortgage payload — that's
          // the 'mortgage_demo' chip / "show mortgage data").
          // Destination route is hard-coded (T-266-04-01: no open-redirect via infoPageHint).
          toast.update(toastId, {
            render: "Routing to API-key credential path…",
          });
          try {
            await callMcpTool("show_mortgage", {});
          } catch (e) {
            console.error(
              "[BankingAgent] api_key_demo dispatch failed:",
              e?.message,
            );
          }
          setLoading(false);
          toolProgressIdRef.current = null;
          navigate("/path/apikey-info");
          return;
        }
        case "dual_token_demo": {
          // Phase 266 Path B: exercise the gateway dual-token (access + id_token) path.
          // Tool name 'user_profile_card' is defined ONLY by Phase 266-01 gateway router.
          // R2: gateway forwards to /api/resource-server/identity; SPA page fetches it directly.
          // Destination route is hard-coded (T-266-04-01: no open-redirect via infoPageHint).
          toast.update(toastId, {
            render: "Routing to access + id-token credential path…",
          });
          try {
            await callMcpTool("user_profile_card", {});
          } catch (e) {
            console.error(
              "[BankingAgent] dual_token_demo dispatch failed:",
              e?.message,
            );
          }
          setLoading(false);
          toolProgressIdRef.current = null;
          navigate("/path/dualtoken-info");
          return;
        }
        default: {
          const customChip = customChips.find((c) => c.id === actionId);
          if (customChip) {
            toast.update(toastId, { render: "Reasoning…" });
            response = await callMcpTool("sequential_think", {
              query: customChip.prompt,
            });
            break;
          }
          throw new Error(`Unknown action: ${actionId}`);
        }
      }

      const normalized = normalizeAgentToolResult(response.result);

      if (isAgentToolErrorResult(normalized)) {
        markToolProgressOutcome(false);
        const tokenEventsErr = response.tokenEvents || [];
        if (tokenChain && tokenEventsErr.length > 0) {
          tokenChain.setTokenEvents(actionId, tokenEventsErr);
        }

        console.log(`[DEBUG-FRONTEND-ERROR]  RECEIVED ERROR FROM MCP:
  normalized.error: ${normalized.error}
  normalized.consent_challenge_required: ${normalized.consent_challenge_required}
  normalized.step_up_required: ${normalized.step_up_required}
  normalized.hitl_threshold_usd: ${normalized.hitl_threshold_usd}
  normalized.amount_threshold: ${normalized.amount_threshold}
  normalized.debug_mcp_consent_handler: ${normalized.debug_mcp_consent_handler}
  normalized.debug_mcp_stepup_handler: ${normalized.debug_mcp_stepup_handler}
  full normalized: ${JSON.stringify(normalized)}`);

        const consent = normalized.error === "hitl_required";

        console.log(`[DEBUG-FRONTEND-DECISION]  DECISION POINT:
  consent=${consent}
  will show consent modal: ${consent}
  will show stepup modal: ${!consent && (normalized.step_up_required === true || normalized.error === "step_up_required")}`);

        if (consent) {
          try {
            agentFlowDiagram.markHitlPreConsent();
          } catch (_) {}

          // Build intent from MCP error response (which includes amount, accounts, type)
          // Fall back to form object if MCP response doesn't have the details
          let intentPayload;
          if (normalized.amount !== undefined && normalized.fromAccountId) {
            console.log(`[DEBUG-FRONTEND-INTENT]  Building consent intent from MCP error response:
  amount: $${normalized.amount}
  fromAccountId: ${normalized.fromAccountId}
  toAccountId: ${normalized.toAccountId}
  type: ${normalized.type}`);
            intentPayload = {
              type: normalized.type || "transfer",
              fromAccountId:
                normalized.fromAccountId || normalized.from_account_id,
              toAccountId: normalized.toAccountId || normalized.to_account_id,
              amount: normalized.amount,
              description:
                form.note || `Agent ${normalized.type || "transfer"}`,
            };
          } else {
            console.log(
              `[DEBUG-FRONTEND-INTENT]  Building consent intent from form object`,
            );
            intentPayload = buildConsentIntent(actionId, form);
          }
          if (!intentPayload) {
            // Unexpected: consent required but no intent builder for this action.
            addMessage(
              "assistant",
              `⚠️ This action requires consent but the transaction details could not be determined. Please use the dashboard to complete it.`,
              actionId,
            );
            toast.dismiss(toastId);
            setLoading(false);
            return;
          }
          addMessage(
            "assistant",
            ` Human-in-the-Loop (HITL) — your manual approval is required.\n\nTransactions over $${normalized.hitl_threshold_usd ?? APP_CONFIG.THRESHOLDS.HITL_DEFAULT} require your consent before the agent can proceed. The agent is paused and cannot continue until you approve or cancel.\n\nReview the authorization popup, then enter the verification code sent to your email.`,
            actionId,
          );
          toast.dismiss(toastId);
          setHitlPendingIntent({
            actionId,
            form,
            intentPayload,
            threshold:
              normalized.hitl_threshold_usd ??
              APP_CONFIG.THRESHOLDS.HITL_DEFAULT,
          });
        } else if (
          normalized.step_up_required === true ||
          normalized.error === "step_up_required"
        ) {
          // Set context for modal
          let contextLine = "Identity verification required";
          if (normalized.step_up_reason) {
            contextLine = normalized.step_up_reason;
          } else if (
            normalized.amount_threshold &&
            normalized.transaction_amount > normalized.amount_threshold
          ) {
            const threshold = normalized.amount_threshold;
            contextLine = `Transfer over $${threshold} requires identity verification`;
          } else if (form) {
            contextLine = "This action requires identity verification";
          }

          // Store pending action and show modal
          setOtpContextLine(contextLine);
          pendingOtpActionRef.current = { actionId, form };

          // Check for P1MFA mode
          if (normalized.step_up_method === "p1mfa") {
            try {
              const apiBase = process.env.REACT_APP_API_URL || "";
              const mfaResp = await fetch(`${apiBase}/api/auth/mfa/challenge`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
              });
              if (!mfaResp.ok)
                throw new Error(`MFA initiation failed: ${mfaResp.status}`);
              const { daId, devices } = await mfaResp.json();
              setP1mfaDaId(daId);
              setP1mfaDevices(devices || []);
              setP1mfaMode(true);
            } catch (err) {
              console.error(
                "[BankingAgent] P1MFA initiation failed, falling back to stub:",
                err,
              );
              setP1mfaMode(false);
            }
          } else {
            setP1mfaMode(false);
          }

          // Determine FIDO vs OTP for standalone FIDO flow
          if (
            normalized.step_up_method === "fido" ||
            (normalized.allow_fido && supportsFido)
          ) {
            setStepUpMethod("fido");
          } else {
            setStepUpMethod("otp");
          }

          setShowOtpModal(true);

          // Show waiting message
          addMessage(
            "assistant",
            " Waiting for MFA verification… Enter the code from your email in the modal above.",
            `mfa-step-${Date.now()}`,
          );
          toast.dismiss(toastId);
          agentFlowDiagram.completeMfaChallenge(null); // Pending
          setLoading(false);
          return;
        } else if (
          normalized.authChallenge &&
          normalized.authChallenge.authorizationUrl
        ) {
          const loginUrl =
            (process.env.REACT_APP_API_URL || "") +
            "/api/auth/oauth/user/login";
          pendingAuthChallengeActionRef.current = { actionId, form };
          // Persist to sessionStorage so it survives the PingOne full-page redirect
          PendingActionManager.save({ actionId, form });
          addMessage(
            "assistant",
            ` Login required.\n\nThis operation requires you to be signed in. Click the button below — your request will resume automatically after you authenticate.`,
            actionId,
          );
          addMessage(
            "assistant",
            '<a href="' +
              loginUrl +
              '" style="display:inline-block;margin-top:8px;padding:8px 16px;background:#4f7df3;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Sign in →</a>',
            actionId,
          );
          toast.dismiss(toastId);
          setLoading(false);
          return;
        } else {
          addMessage(
            "assistant",
            formatResult(response.result),
            actionId,
            resultExtra,
          );
          toast.dismiss(toastId);
          const isTransactionAction = [
            "transfer",
            "deposit",
            "withdraw",
          ].includes(actionId);
          if (isTransactionAction) {
            const _rawMsg = normalized.message || normalized.error || "Request failed";
            setTxErrorModal({
              title: "Transaction Failed",
              message: typeof _rawMsg === "string" ? _rawMsg : JSON.stringify(_rawMsg),
            });
          } else {
            notifyError(
              `❌ ${normalized.message || normalized.error || "Request failed"}`,
              { autoClose: agentToastMs.errShort },
            );
          }
        }
        setLoading(false);
        return;
      }

      markToolProgressOutcome(true);

      // Push token events to TokenChainContext (updates TokenChainDisplay on dashboard)
      const tokenEvents = response.tokenEvents || [];
      if (tokenChain && tokenEvents.length > 0) {
        tokenChain.setTokenEvents(actionId, tokenEvents);
      }

      // Show inline token event summary in the chat + dedicated toasts
      if (tokenEvents.length > 0) {
        const exchanged = tokenEvents.find(
          (e) =>
            e.id === "exchanged-token" ||
            e.id === "two-ex-final-token" ||
            e.id === "two-ex-exchange1",
        );
        const required = tokenEvents.find((e) => e.id === "exchange-required");
        const badScopes = tokenEvents.find(
          (e) => e.id === "user-scopes-insufficient",
        );
        const failed = tokenEvents.find((e) => e.id === "exchange-failed");
        const userTokEv = tokenEvents.find((e) => e.id === "user-token");
        const JWKS_VER_IDS = new Set([
          "exchanged-token-verified",
          "agent-actor-token-verified",
          "two-ex-agent-actor-verified",
          "two-ex-exchange1-verified",
          "two-ex-mcp-actor-verified",
          "two-ex-final-token-verified",
        ]);
        const jwksVerified = tokenEvents.find(
          (e) => JWKS_VER_IDS.has(e.id) && e.extra?.verified,
        );
        const jwksDegraded =
          jwksVerified?.extra?.fallbackMethod === "introspection";

        let tokenMsg = null;
        if (exchanged) {
          const introspectionLine =
            "✅ RFC 7662  Introspection         user token validated";
          const exchangeLine =
            "✅ RFC 8693  Token Exchange        user token → MCP-scoped token";
          const jwksLine = jwksDegraded
            ? "⚠️ RFC 7515  JWKS unavailable    verified via RFC 7662 introspection fallback"
            : jwksVerified?.extra?.verified
              ? `✅ RFC 7515  JWKS Signature        verified (${jwksVerified.extra.alg || "RS256"}, kid: ${jwksVerified.extra.kid || "—"})`
              : "   RFC 7515  JWKS Signature        (not verified)";
          const audLine =
            exchanged.audExpected !== undefined && exchanged.audMatches
              ? `✅ RFC 8707  Resource Indicator    aud bound to "${exchanged.audActual ?? exchanged.audienceNarrowed}"`
              : exchanged.audExpected !== undefined
                ? `❌ RFC 8707  Resource Indicator    aud mismatch — got "${exchanged.audActual}" expected "${exchanged.audExpected}"`
                : `✅ RFC 8707  Resource Indicator    aud: ${exchanged.audienceNarrowed || (Array.isArray(exchanged.claims?.aud) ? exchanged.claims.aud.join(", ") : exchanged.claims?.aud) || "—"}`;

          const mayActStatus = !userTokEv
            ? "⚠️ not available"
            : userTokEv.mayActPresent && userTokEv.mayActValid
              ? `✅ valid — ${userTokEv.mayActDetails || "delegation authorised"}`
              : userTokEv.mayActPresent && !userTokEv.mayActValid
                ? `❌ mismatch — ${userTokEv.mayActDetails || "client_id does not match BFF"}`
                : "⚠️ absent from user token";

          const actStatus = exchanged.actPresent
            ? `✅ BFF confirmed — ${exchanged.actDetails || "delegation proof present"}`
            : "⚠️ subject-only exchange (no delegation proof)";

          tokenMsg = [
            "Security Verification — RFC 8693 Token Exchange",
            "",
            introspectionLine,
            exchangeLine,
            jwksLine,
            audLine,
            "",
            `may_act:  ${mayActStatus}`,
            `act:      ${actStatus}`,
            `aud:      ${exchanged.audienceNarrowed || exchanged.claims?.aud || "—"}`,
            `scope:    ${exchanged.scopeNarrowed || exchanged.claims?.scope || "—"} (narrowed)`,
          ].join("\n");
          notifyInfo(
            `Token Exchange complete — MCP token issued (aud: ${exchanged.audienceNarrowed || "set"}, scope: ${exchanged.scopeNarrowed || "narrowed"})`,
            { autoClose: agentToastMs.infoToken },
          );
        } else if (required) {
          tokenMsg = [
            "Token Exchange (RFC 8693): not configured",
            "   Tools ran via local fallback — the user access token was NOT sent to the MCP server.",
            "",
            "To enable full RFC 8693 exchange:",
            '   1. Create a PingOne Resource Server  audience: "demo_mcp_server"',
            "   2. Set MCP_RESOURCE_URI=demo_mcp_server  (Config UI or Vercel env)",
            "   3. Enable Token Exchange grant on the Admin OAuth app in PingOne",
            "   4. Sign out and sign in again",
          ].join("\n");
          // Info-only: tools still work via local fallback
          // Chat already gets the full RFC 8693 setup explanation via addMessage('token-event').
          // Suppress the toast — the success toast is already shown and a concurrent info/error
          // toast would confuse users who just saw "Deposit complete".
        } else if (badScopes) {
          tokenMsg = [
            "⚠️ User token has insufficient scopes for RFC 8693 exchange",
            `   ${badScopes.explanation || "Need at least 5 OAuth scopes on the user token"}`,
            "",
            "Fix: Sign out → sign in again with a PingOne app that requests more scopes",
            "(openid, profile, email + banking scopes like read, accounts:read).",
          ].join("\n");
          notifyError(
            "❌ Sign in again with broader scopes (at least 5) for MCP token exchange",
            { autoClose: 7000 },
          );
        } else if (failed) {
          // When the server fell back to local handler after exchange failure,
          // the operation succeeded — show a soft info message, not an error toast.
          if (response._localFallback && response._exchangeFailed) {
            tokenMsg = [
              "⚠️ Token Exchange (RFC 8693) skipped — ran via local fallback",
              "   The exchange was attempted but PingOne could not grant the required scopes.",
              "   The banking operation completed successfully using the local handler.",
              "",
              "   To enable full RFC 8693 exchange, ensure the user token carries",
              "   read / write scopes (not just ai:agent:read).",
            ].join("\n");
            // No error toast — the tool result handled it as a success
          } else {
            tokenMsg = [
              `❌ Token Exchange (RFC 8693) failed: ${failed.error || "unknown error"}`,
              "",
              userTokEv?.mayActPresent
                ? '   may_act was present — check that:\n   • PingOne has Token Exchange grant enabled on the admin OAuth app\n   • Audience policy allows "demo_mcp_server"\n   • may_act.client_id matches the BFF client'
                : "   may_act was absent — this is likely the cause.\n   Go to /demo-data → Enable may_act → sign out and sign in again.",
            ].join("\n");
            notifyError(
              `❌ Token Exchange failed: ${failed.error || "unknown error"}`,
              { autoClose: 6000 },
            );
          }
        }
        if (tokenMsg) {
          addMessage("token-event", tokenMsg, actionId);
        }
      }

      // Populate results panel + notify hosting dashboard (same CustomEvent in both display modes)
      const isWriteAction = ["transfer", "deposit", "withdraw"].includes(
        actionId,
      );
      let displayNormalized = normalizeAgentToolResult(response.result);
      if (isWriteAction) {
        try {
          const txRes = await getMyTransactions(30);
          const txNorm = normalizeAgentToolResult(txRes.result);
          if (Array.isArray(txNorm?.transactions)) {
            displayNormalized = txNorm;
          }
        } catch {
          // MCP getMyTransactions failed — fall back to direct REST so the panel still shows fresh data
          try {
            const r = await fetch("/api/transactions/my?limit=30", {
              credentials: "include",
            });
            if (r.ok) {
              const d = await r.json();
              if (d?.transactions?.length)
                displayNormalized = { transactions: d.transactions };
            }
          } catch {
            // keep write payload for inferAgentResultTypeAndData
          }
        }
        // Refresh live account balances after write operations so form dropdowns are current
        fetch("/api/accounts/my", { credentials: "include", _silent: true })
          .then(async (r) => {
            const validation = validateHttpResponse(r, "/api/accounts/my");
            if (!validation.isValid) return null;
            return safeResponseJson(r, "/api/accounts/my");
          })
          .then((data) => {
            if (!data) return;
            const validated = extractAccounts(data);
            if (!validated || validated.length === 0) return;
            const normalized = validated
              .map((a) => normalizeAccount(a))
              .filter((a) => a !== null);
            if (normalized.length > 0) {
              setLiveAccounts(normalized);
            }
          })
          .catch((err) => {
            console.warn("[Account Refresh] Failed:", err.message);
          });
      }

      const { resultType, resultData } =
        inferAgentResultTypeAndData(displayNormalized);

      // Always dispatch so Flow Inspector (OAuthInspectorSection) refreshes token data
      // regardless of whether we could infer a structured result type.
      {
        const eventType = isWriteAction
          ? "confirm"
          : resultType || "tool_complete";
        window.dispatchEvent(
          new CustomEvent("banking-agent-result", {
            detail: { type: eventType, data: resultData, label },
          }),
        );
      }

      if (resultType) {
        const titleMap = {
          accounts:      terminology?.accounts     || "Accounts",
          transactions:  terminology?.transactions || "Recent Transactions",
          balance:       terminology?.balance      || "Balance",
          confirm: `${label} confirmed`,
        };
        setResultPanel({
          type: resultType,
          title: titleMap[resultType],
          data: resultData,
          terminology,
        });
      }

      // Always add the result to the chat, including accounts/transactions/balance
      // that also display in the side panel. This ensures the response is visible
      // in the main agent conversation flow.
      addMessage(
        "assistant",
        formatResult(response.result),
        actionId,
        resultExtra,
      );

      // Append HTTP trace (banking API call detail) as a token-event so it
      // shares the RFC-info checkbox gate at the render filter (line ~8120).
      // Previously rendered as 'assistant' which made every successful read
      // action look like two assistant bubbles ("Balance: $X" + JSON dump).
      const successTrace = response.result?.httpTrace;
      if (successTrace && successTrace.length > 0) {
        addMessage("token-event", formatHttpTrace(successTrace), actionId);
      }

      // ── Post-result educational RFC annotation ──
      {
        const exchanged = tokenEvents.find(
          (e) =>
            e.id === "exchanged-token" ||
            e.id === "two-ex-final-token" ||
            e.id === "two-ex-exchange1",
        );
        if (isWriteAction) {
          addMessage(
            "token-event",
            [
              `✅ ${label} complete — what just happened:`,
              "",
              exchanged
                ? `RFC 8693 Token Exchange — MCP token scoped to \`${exchanged.audienceNarrowed || "mcp-server"}\`, scope \`${exchanged.scopeNarrowed || "write"}\``
                : `Local handler — RFC 8693 token exchange not configured or skipped`,
              `HITL gate (RFC 8693 §2.1) — Transfers over the threshold require your explicit consent before the agent proceeds. The agent cannot self-approve: enforcement is server-side, before tool execution.`,
              "",
              `RFCs in play — \`RFC 8693\` (token exchange) · \`RFC 6749 §3.3\` (scope) · \`RFC 8707\` (audience binding)`,
              `Open Token Chain ↗ to inspect the MCP access token's \`act\`, \`aud\`, and \`scope\` claims.`,
            ].join("\n"),
            actionId,
          );
        } else if (exchanged) {
          addMessage(
            "token-event",
            [
              ` Authorized by scope ${exchanged.scopeNarrowed || "read"} · · audience ${exchanged.audienceNarrowed || "mcp-server"}`,
              `   RFC 6749 §3.3 — every MCP call requires a scoped token; read operations use read, writes require write.`,
              `   RFC 8707 — the resource indicator binds the token to this specific audience and prevents it being accepted elsewhere.`,
            ].join("\n"),
            actionId,
          );
        }
      }

      postAppEvent("agent", "info", "Agent processing complete", {
        tag: "agent/processing-end",
        metadata: { userId: effectiveUser?.id || effectiveUser?.username },
      });
      // Dismiss loading toast and show success
      toast.update(toastId, {
        render: `✅ ${label} complete`,
        type: "success",
        isLoading: false,
        autoClose: agentToastMs.successAction,
        closeButton: true,
        draggable: true,
      });
    } catch (err) {
      // Debug: log all error details for troubleshooting
      const _errDetail = {
        code: err?.code,
        statusCode: err?.statusCode,
        message: err?.message,
        needsAuth: err?.need_auth,
        fullErr: err,
      };
      console.log(`[BankingAgent] ${actionId} error:`, _errDetail);
      // Store for ErrorBoundary "Error Details" panel (dev only)
      if (process.env.NODE_ENV === 'development') {
        try {
          window.__lastAgentError = {
            action: actionId,
            timestamp: new Date().toISOString(),
            code: err?.code,
            statusCode: err?.statusCode,
            message: err?.message,
            needsAuth: err?.need_auth,
            tokenEvents: err?.tokenEvents?.length ?? 0,
          };
        } catch (_) { /* ignore */ }
      }

      markToolProgressOutcome(
        false,
        err
          ? {
              code: err.gatewayErrorCode || err.code,
              message: err.message,
              tool: err.tool || actionId,
            }
          : null,
      );
      toast.dismiss(toastId);

      // Phase 187 D-05: BFF signaled need_auth — save pending action then redirect so
      // onAuthChallengeLogin can auto-replay after OAuth callback
      if (err?.need_auth) {
        pendingAuthChallengeActionRef.current = { actionId, form };
        PendingActionManager.save({ actionId, form });
        addMessage(
          "assistant",
          " MCP requires your authorization — logging you in…",
        );
        handleLoginAction("login_user");
        setLoading(false);
        return;
      }

      if (actionId === "mcp_tools") {
        const st = agentFlowDiagram.getState();
        if (st.phase === "running" && st.toolName === "tools/list") {
          agentFlowDiagram.completeInspectorToolsList({
            ok: false,
            errorMessage: err.message || "Request failed",
          });
        }
      }

      const isConnErr =
        err.message.includes("timed out") ||
        err.message.includes("ECONNREFUSED") ||
        err.message.includes("ENETUNREACH") ||
        err.message.includes("mcp_error") ||
        err.message.includes("Failed to fetch") ||
        err.message.includes("502");

      const mcpToolsUnauthorized =
        actionId === "mcp_tools" &&
        /MCP tools fetch failed:\s*401/i.test(String(err?.message || ""));

      const hydrationAuthFailure =
        err?.code === "session_not_hydrated" ||
        (cookieOnlyBffSession &&
          (err?.statusCode === 401 ||
            err?.code === "authentication_required" ||
            mcpToolsUnauthorized ||
            /sign in to use the banking agent/i.test(
              String(err?.message || ""),
            )));

      const killSwitchActivated = (() => {
        try {
          return !!localStorage.getItem("kill_switch_activated");
        } catch (_) {
          return false;
        }
      })();

      if (isConnErr) {
        notifyError(" MCP server unreachable — check your server connection", {
          autoClose: 8000,
        });
      } else if (err?.code === "hitl_required") {
        // 428 Precondition Required — HITL consent required for transaction
        let intentPayload;

        // For transfer_600_test, build payload from liveAccounts since form is empty
        if (actionId === "transfer_600_test" && liveAccounts?.length >= 2) {
          const testFrom =
            liveAccounts.find(
              (a) => a.type === "checking" || a.type === "chk",
            ) || liveAccounts[0];
          const testTo =
            liveAccounts.find(
              (a) => a.type === "savings" || a.type === "sav",
            ) || liveAccounts[1];
          intentPayload = {
            type: "transfer",
            fromAccountId: testFrom?.id,
            toAccountId: testTo?.id,
            amount: APP_CONFIG.THRESHOLDS.DEMO_HITL_TRANSFER,
            description: "HITL + MFA test",
          };
        } else {
          intentPayload = buildConsentIntent(actionId, form);
        }

        if (!intentPayload) {
          notifyError(
            "Could not start consent flow — transaction details missing.",
          );
          setLoading(false);
          toast.dismiss(toastId);
          return;
        }
        addMessage(
          "assistant",
          ` Human-in-the-Loop (HITL) — your manual approval is required.\n\nTransactions over $${APP_CONFIG.THRESHOLDS.HITL_DEFAULT} require your consent before the agent can proceed. The agent is paused and cannot continue until you approve or cancel.\n\nReview the authorization popup, then enter the verification code sent to your email.`,
          actionId,
        );
        toast.dismiss(toastId);
        setHitlPendingIntent({
          actionId,
          form,
          intentPayload,
          threshold: APP_CONFIG.THRESHOLDS.HITL_DEFAULT,
        });
        setLoading(false);
      } else if (err?.statusCode === 428 || err?.response?.status === 428) {
        // 428 Precondition Required — token expired during MFA
        setShowLoginModal(true);
      } else if (hydrationAuthFailure && cookieOnlyBffSession) {
        // Inline session-fix banner already shown on load for cookie-only Backend-for-Frontend (BFF); avoid duplicate toasts.
      } else if (err?.code === "session_not_hydrated") {
        notifyError(
          "Sign in again: server session has no tokens (Vercel needs Redis/Upstash + redeploy, then sign out & sign in).",
          { autoClose: 12000 },
        );
      } else if (err?.statusCode === 401 && killSwitchActivated) {
        // Kill switch was activated — token revoked at PingOne → introspection returns active: false
        const ksData = (() => {
          try {
            return JSON.parse(localStorage.getItem("kill_switch_activated"));
          } catch (_) {
            return null;
          }
        })();
        window.dispatchEvent(
          new CustomEvent("token-chain-inject", {
            detail: {
              tool: "Test Revocation",
              events: [
                {
                  id: "introspection-denied",
                  label:
                    'RFC 7662 Introspection: { "active": false } — Token Revoked',
                  status: "failed",
                  tokenType: "introspection",
                  rfc: "RFC 7662",
                  explanation:
                    'PingOne introspection returned { "active": false }. The access token was revoked by the STOP AGENT kill switch and is no longer valid. This confirms end-to-end token revocation: the authorization server rejected the token.',
                  ...(ksData
                    ? {
                        killSwitchReason: ksData.reason,
                        revokedAt: ksData.revokedAt,
                      }
                    : {}),
                },
              ],
            },
          }),
        );
        addMessage(
          "assistant",
          'Introspection Denied — Token Revoked\n\nPingOne returned { "active": false }. The access token was revoked by the STOP AGENT kill switch.\n\nOpen the Token Chain to see the RFC 7662 introspection result. Sign out and sign back in to get a fresh token.',
          actionId,
        );
      } else if (
        err?.statusCode === 401 &&
        (err?.response?.error === "unauthenticated" ||
          /Login required/i.test(String(err?.message || "")))
      ) {
        // Phase 122: Non-logged-in users attempting banking actions
        addMessage(
          "assistant",
          " You need to sign in first to perform banking operations. Tap Customer Sign In in the left panel to get started.",
        );
      } else if (
        (err?.statusCode === 401 ||
          err?.code === "authentication_required" ||
          /sign in to use the banking agent/i.test(String(err?.message || ""))) &&
        !isLoggedIn
      ) {
        setShowLoginModal(true);
      } else if (err?.code === "missing_exchange_scopes") {
        addMessage(
          "token-event",
          [
            "❌ RFC 6749 §3.3 — Scope Error: missing required scopes",
            `   Token lacks: \`${(err.missingScopes || []).join(", ") || "write"}`,
            "   RFC 6749 §3.3: access tokens carry a scope claim; resource servers MUST reject tokens missing required scopes.",
            "   RFC 8693 §2.1: token exchange cannot expand scopes — the MCP token can only carry scopes already on the user token.",
            "",
            "Fix: Sign out → sign in with the PingOne app that requests the required banking scopes.",
          ].join("\n"),
          actionId,
        );
        setScopeErrorModal({
          missingScopes: err.missingScopes || [],
          userScopes: err.userScopes || "(none)",
          requiredScopes: err.requiredScopes || "",
          tokenEvents: err.tokenEvents || [],
        });
      } else if (err?.code === "mcp_scope_denied") {
        // Phase 211: scope-upgrade flow — save pending action and show consent modal
        // Phase 210 enforcement: MCP server returned JSON-RPC -32005 (INSUFFICIENT_SCOPE)
        addMessage(
          "token-event",
          [
            "⚠️ OAuth 2.0 §3.3 — Scope Gate: write required",
            `   Tool ${err.tool || actionId} requires: ${(err.requiredScopes || []).join(", ")}`,
            `   Your MCP token is missing: \`${(err.missingScopes || []).join(", ")}`,
            "   The MCP server returned JSON-RPC -32005 (INSUFFICIENT_SCOPE).",
            "   Approve the scope upgrade below to exchange for a write-capable token (RFC 8693).",
          ].join("\n"),
          actionId,
        );
        // Phase 211: save pending action for auto-replay after scope upgrade
        pendingScopeUpgradeRef.current = { actionId, form };
        setScopeErrorModal({
          missingScopes: err.missingScopes || [],
          userScopes: (err.availableScopes || []).join(" ") || "(none)",
          requiredScopes: (err.requiredScopes || []).join(" "),
          tokenEvents: err.tokenEvents || [],
          scopeUpgradeState: "error", // Phase 211: 4-state machine
        });
      } else if (err?.code === "mcp_step_up_required") {
        // MCP Authorize gate: PingOne (or simulated) requires step-up MFA before tool access
        const contextLine =
          err.message ||
          "MCP tool access requires identity verification (PingOne Authorize policy)";
        setOtpContextLine(contextLine);
        pendingOtpActionRef.current = { actionId, form };
        // Attempt P1MFA challenge
        try {
          const apiBase = process.env.REACT_APP_API_URL || "";
          const mfaResp = await fetch(`${apiBase}/api/auth/mfa/challenge`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
          });
          if (mfaResp.ok) {
            const { daId, devices } = await mfaResp.json();
            setP1mfaDaId(daId);
            setP1mfaDevices(devices || []);
            setP1mfaMode(true);
          }
        } catch (mfaErr) {
          console.warn(
            "[MCP Authorize] P1MFA challenge failed, using basic OTP modal:",
            mfaErr.message,
          );
        }
        setShowOtpModal(true);
        addMessage(
          "assistant",
          ` Identity verification required\n\n${contextLine}\n\nPlease complete the verification to continue.`,
          actionId,
        );
        addMessage(
          "token-event",
          [
            " RFC 9470 — OAuth 2.0 Step-Up Authentication Challenge Protocol",
            '   The resource server returned `WWW-Authenticate: Bearer error="insufficient_user_authentication"`.',
            "   This means the current token was issued with a lower ACR (Authentication Context Reference) than the resource requires.",
            "   After MFA, PingOne issues a new token with `acr: Multi_Factor` (or equivalent) — the agent then retries automatically.",
            "",
            "RFCs: RFC 9470 (step-up) · RFC 6750 §3.1 (WWW-Authenticate) · RFC 8693 (token exchange for new ACR token)",
          ].join("\n"),
          actionId,
        );
      } else if (err?.code === "mcp_authorization_denied") {
        // MCP Authorize gate: PingOne (or simulated) denied tool access
        const reason =
          err.message || "MCP tool access was denied by authorization policy";
        const engine = err.authorizeEngine || "unknown";
        const denyLines = ["Access Denied", "", reason];
        if (err.denyReason) {
          denyLines.push("", `Rule: ${err.denyReason}`);
        }
        if (err.denyParameters) {
          const relevant = ["TokenAudience", "McpResourceUri", "ActClientId", "ToolName", "UserId"];
          const pairs = relevant
            .filter((k) => err.denyParameters[k] !== undefined && err.denyParameters[k] !== "")
            .map((k) => `  ${k}: ${err.denyParameters[k]}`);
          if (pairs.length) {
            denyLines.push("", "Policy inputs:", ...pairs);
          }
        }
        if (err.decisionId) {
          denyLines.push("", `Decision ID: ${err.decisionId}`);
        }
        addMessage("assistant", denyLines.join("\n"), actionId);
        const tokenEventLines = [
          ` RFC 6749 §3.1 / RFC 8693 — Authorization Policy Denied (engine: ${engine})`,
          "   The Authorize policy evaluated the request context (user, agent, action) and returned DENY.",
          "   This is a dynamic authorization decision — even a valid token can be rejected based on policy.",
        ];
        if (err.denyReason) {
          tokenEventLines.push(`   Deny rule: ${err.denyReason}`);
        }
        if (err.denyParameters?.TokenAudience && err.denyParameters?.McpResourceUri) {
          tokenEventLines.push(
            `   Token aud: ${err.denyParameters.TokenAudience}`,
            `   Expected aud (McpResourceUri): ${err.denyParameters.McpResourceUri}`,
          );
        }
        tokenEventLines.push(
          "",
          "RFCs: RFC 6749 §3.1 (authorization endpoint) · RFC 8693 §2.1 (exchange claims) · RFC 8707 (resource indicators)",
        );
        addMessage("token-event", tokenEventLines.join("\n"), actionId);
      } else if (err?.code === "mcp_hitl_required") {
        // MCP Authorize gate: HITL approval needed before tool can execute
        const reason =
          err.message ||
          "This action requires your approval before the agent can proceed";
        // Extract taskId from the error (bankingAgentService puts response fields on the thrown error)
        const taskId = err.taskId;
        addMessage(
          "assistant",
          ` Approval Required\n\n${reason}\n\nPlease review and approve or deny this action.`,
          actionId,
        );
        // Reuse existing HITL consent intent: actionId + form for retry, plus taskId for polling
        setHitlPendingIntent({
          actionId,
          form,
          taskId,
          reason,
          isMcpHitl: true,
          intentPayload: null,
        });
      } else if (err?.code === "agent_consent_required") {
        // Old server deployment still enforcing startup consent gate.
        // The consent gate has been removed — sign out and sign in to refresh the session,
        // or ask the admin to redeploy the latest server code.
        notifyError(
          "Server configuration: please sign out and sign in again to clear the consent state.",
          { autoClose: 10000 },
        );
      } else if (err?.requiresLogin) {
        // Genuine user session expiry (server sends requiresLogin: true).
        // actor_token_invalid (server CC config issue) no longer sets this flag.
        addMessage(
          "assistant",
          " Your session token has expired or is no longer valid.\n\n" +
            "Redirecting you to PingOne to sign in again…",
          actionId,
        );
        setTimeout(() => navigateToCustomerOAuthLogin(), 1500);
      } else if (err?.code === "gateway_policy_denied") {
        // MCP gateway rejected the token before it reached the MCP server.
        // Show a structured educational breakdown: what happened, which policy
        // rule fired, and how to fix it.
        const gwCode = err.gatewayErrorCode || "forbidden";
        const gwMsg = err.message || "Gateway policy denied the tool call";

        // Map gateway error codes to plain-English explanations + fix hints.
        const GW_POLICY_EXPLAINERS = {
          invalid_token: {
            label: "Invalid or malformed token",
            explain:
              "The MCP access token could not be parsed as a valid JWT. " +
              "This usually means the RFC 8693 token exchange produced a bad token, " +
              "or the token was altered in transit.",
            fix: "Retry the action. If this persists, sign out and sign in again to force a fresh token exchange.",
            rfcs: "RFC 7519 §7.2 (JWT validation) · RFC 8693 §3 (token exchange)",
          },
          expired_token: {
            label: "Token expired",
            explain:
              "The exchanged MCP token's `exp` claim is in the past. " +
              "Tokens are short-lived by design (RFC 7519 §4.1.4); the BFF should " +
              "exchange a fresh token on every tool call but something went wrong here.",
            fix: "Use Refresh access token in the left panel, then retry.",
            rfcs: "RFC 7519 §4.1.4 (exp claim) · RFC 6749 §5.1 (token lifetime)",
          },
          invalid_aud: {
            label: "Audience mismatch (RFC 8707)",
            explain:
              "The token's `aud` claim does not include the gateway's resource URI. " +
              "RFC 8707 (Resource Indicators) requires the token to be scoped to the " +
              "exact resource that will consume it. " +
              `Gateway received: "${(gwMsg.match(/got \[([^\]]+)\]/) || [])[1] || "(see logs)"}"`,
            fix:
              "Check that MCP_GW_RESOURCE_URI in the BFF config matches the " +
              "`resource` parameter sent during token exchange (RFC 8693 §2.1).",
            rfcs: "RFC 8707 (resource indicators) · RFC 8693 §2.1 · RFC 7519 §4.1.3 (aud)",
          },
          missing_token: {
            label: "Bearer token missing",
            explain:
              "The gateway received the request with no `Authorization: Bearer …` header. " +
              "The BFF should always attach the RFC 8693-issued MCP token before forwarding.",
            fix: "This is a BFF configuration issue. Check that MCP_GATEWAY_HTTP_URL is set correctly and the token resolution step succeeded.",
            rfcs: "RFC 6750 §2.1 (Bearer token usage)",
          },
          forbidden: {
            label: "Request forbidden by gateway policy",
            explain:
              "The gateway's policy layer blocked the request. " +
              "This could be a CORS origin restriction, a missing claim, " +
              "or a PingOne Authorize policy evaluation returning DENY.",
            fix: "Check the gateway logs for the specific policy that fired. Ensure the BFF origin is in the gateway's allowed list.",
            rfcs: "RFC 6749 §3.1 (authorization) · RFC 8693 §2.2 (exchange constraints)",
          },
        };
        const hint =
          GW_POLICY_EXPLAINERS[gwCode] || GW_POLICY_EXPLAINERS.forbidden;

        addMessage(
          "assistant",
          ` Gateway Policy Denied — \`${err.tool || actionId}\n\n` +
            `${hint.label}: ${hint.explain}\n\n` +
            `Fix: ${hint.fix}`,
          actionId,
        );
        addMessage(
          "token-event",
          [
            ` MCP Gateway — Policy Denial: \`${gwCode}`,
            `   Tool: \`${err.tool || actionId}`,
            `   Gateway error code: \`${gwCode}`,
            `   Message: ${gwMsg}`,
            "",
            `   ${hint.explain}`,
            "",
            `RFCs: ${hint.rfcs}`,
          ].join("\n"),
          actionId,
        );
      } else {
        notifyError(`❌ ${err.message}`, { autoClose: 6000 });
      }

      const authHint =
        err?.code === "session_not_hydrated"
          ? ""
          : err?.statusCode === 401 || err?.code === "authentication_required"
            ? "\n\nTip: use Refresh access token (left column), then retry. Sign in again only if refresh fails."
            : "";

      const showSessionFixBubble =
        err?.code === "session_not_hydrated" ||
        (cookieOnlyBffSession &&
          (err?.statusCode === 401 ||
            err?.code === "authentication_required" ||
            mcpToolsUnauthorized ||
            /sign in to use the banking agent/i.test(
              String(err?.message || ""),
            )));

      if (showSessionFixBubble) {
        if (!sessionFixBubbleShownRef.current) {
          sessionFixBubbleShownRef.current = true;
          addMessage("error", SESSION_NOT_HYDRATED_CHAT, actionId, {
            showSessionFixActions: true,
          });
        }
      } else if (err?.code === "agent_consent_required") {
        // Legacy startup consent gate — no longer enforced in current server code.
        addMessage(
          "assistant",
          "The server is requesting consent to use the agent, but this gate has been removed in the current version.\n\nPlease sign out and sign in again to clear the old session state.",
          actionId,
        );
      } else {
        addMessage(
          "error",
          isConnErr
            ? "AI Agent is unavailable.\n\nThe MCP server is not reachable.\n\nLocal: cd demo_mcp_server && npm run dev\nHosted: set MCP_SERVER_URL to your reachable MCP server URL (if your platform allows outbound WS)."
            : `Error: ${err.message}${authHint}`,
          actionId,
        );
      }

      const pathNorm = (location.pathname || "").replace(/\/$/, "") || "/";
      const onMarketingPublic = isPublicMarketingAgentPath(pathNorm);
      const authRelatedMarketingNudge =
        onMarketingPublic &&
        !isConnErr &&
        err?.code !== "agent_consent_required" &&
        (hydrationAuthFailure ||
          err?.statusCode === 401 ||
          err?.code === "authentication_required" ||
          err?.code === "session_not_hydrated" ||
          mcpToolsUnauthorized ||
          /sign in to use the banking agent/i.test(String(err?.message || "")));
      if (authRelatedMarketingNudge && !isLoggedIn) {
        addMessage("assistant", " Signing you in with PingOne…", actionId);
        handleLoginAction("login_user");
      }
    } finally {
      setLoading(false);
    }
  }

  function setNlInputFromTile(text) {
    setNlInput(text);
    requestAnimationFrame(() => {
      nlInputRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
      nlInputRef.current?.focus();
    });
  }

  // Slot-filling parser for the second turn of a clarification dialog.
  // The user just answered our "Which account?" / "How much?" prompt; we
  // know which action they were trying to do, so we only need to pull the
  // specific slot(s) out of the reply.
  //
  // Returns merged params on success, or null when we couldn't extract
  // anything useful (the caller re-asks once before giving up).
  function parseClarificationReply(action, text, partialParams) {
    const t = String(text || "")
      .toLowerCase()
      .trim();
    if (!t) return null;

    // Extract account-type mentions. Accepts bare "checking" / "savings",
    // or phrases like "my checking account" / "from savings".
    const accountTypes = [
      "checking",
      "savings",
      "credit",
      "credit card",
      "loan",
      "mortgage",
    ];
    const matchedTypes = accountTypes.filter((kind) => t.includes(kind));

    // Extract dollar amount. Accepts "$200", "200 dollars", "200".
    const amountMatch = t.match(
      /\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:dollars?|usd)?/,
    );
    const amount = amountMatch ? parseFloat(amountMatch[1]) : null;

    // Extract direction prepositions for transfers: "from X to Y".
    const fromTo = t.match(/from\s+(\w+)\s+to\s+(\w+)/);

    if (action === "balance") {
      // Slot: which account. Take the first account-type we found.
      // (Bare "checking" → matchedTypes=["checking"] → fills accountType.)
      if (matchedTypes.length > 0) {
        return { ...partialParams, accountType: matchedTypes[0] };
      }
      return null;
    }

    if (action === "deposit" || action === "withdraw") {
      // Slots: amount + account. Either or both can come in this turn.
      const next = { ...partialParams };
      if (amount != null) next.amount = amount;
      if (matchedTypes.length > 0) {
        // For deposit, the account is the destination (toId); for withdraw, source (fromId).
        if (action === "deposit") next.toId = matchedTypes[0];
        else next.fromId = matchedTypes[0];
      }
      // Need at least an amount AND an account to actually run.
      const hasAmount = next.amount != null;
      const hasAcct = action === "deposit" ? next.toId : next.fromId;
      return hasAmount && hasAcct ? next : null;
    }

    if (action === "transfer") {
      const next = { ...partialParams };
      if (amount != null) next.amount = amount;
      if (fromTo) {
        next.fromId = fromTo[1];
        next.toId = fromTo[2];
      } else if (matchedTypes.length >= 2) {
        // "checking to savings" without explicit "from"
        next.fromId = matchedTypes[0];
        next.toId = matchedTypes[1];
      }
      return next.amount != null && next.fromId && next.toId ? next : null;
    }

    return null;
  }

  // Inner body of sendAsNl — called only after the guard is acquired.
  // Contains all 3 original release sites (explicit release before no-merge
  // return; .finally on the clarification dispatch chain; .finally on the
  // rAF fetch chain). Do NOT add a fourth release here.
  function sendAsNlInner(text) {
    // AG-UI path (ff_agui_enabled=true): stream via POST /api/agent/run
    // The old NL pipeline is bypassed entirely when this flag is on.
    if (aguiEnabled) {
      // Stable thread ID for the session (persists across HITL resumes).
      // runId is per-message so each turn is distinct.
      if (!aguiThreadIdRef.current) {
        aguiThreadIdRef.current = 'ba-' + Date.now();
      }
      const threadId = aguiThreadIdRef.current;
      const runId = 'run-' + Date.now();
      aguiActiveRunIdRef.current = runId;
      addMessage('user', text);
      setNlLoading(true);
      aguiRun({
        threadId,
        runId,
        messages: [{ role: 'user', content: text }],
      }).finally(() => {
        setNlLoading(false);
        nlSendGuardRef.current.release();
      });
      return;
    }

    const signal = beginAbortableSend();

    // Clarification-follow-up path: if our previous turn asked "Which
    // account?"/"How much?", treat this message as the missing slot
    // instead of re-parsing it as a brand-new intent. This is what was
    // broken: the parser saw "checking" in isolation, found no keyword
    // match, and fell through to "I didn't recognize that."
    if (pendingClarification) {
      const pc = pendingClarification;
      setPendingClarification(null);

      // Echo the user's reply in the transcript before dispatching.
      setNlInput("");
      addMessage("user", text);

      // Parse the reply into params based on what we asked.
      // Heuristic but tight: enough to handle the common shapes a user
      // would type ("checking", "$50 to savings", "200 from checking
      // to savings"). Anything we can't parse falls back to one more
      // round of clarification.
      const merged = parseClarificationReply(
        pc.action,
        text,
        pc.partialParams || {},
      );
      if (!merged) {
        // Couldn't extract — re-ask once. After that, give up and let
        // the parser try a normal interpretation.
        addMessage("assistant", `Sorry, I didn't catch that. ${pc.asked}`);
        setPendingClarification(pc);
        nlSendGuardRef.current.release();
        return;
      }

      // Build a synthetic NL result that mirrors what the server would
      // have produced, and dispatch through the same path. source='clarify'
      // so the token-chain panel can label it correctly.
      const syntheticResult = {
        kind: "action",
        action: pc.action,
        params: merged,
      };
      dispatchNlResult(syntheticResult, "clarify", text)
        .catch((err) => { if (!isAbortError(err)) reportNlFailure(err); })
        .finally(() => nlSendGuardRef.current.release());
      return;
    }

    setNlInput(text);
    // Use rAF so the input state settles before the synthetic submit fires
    requestAnimationFrame(() => {
      setNlInput("");
      addMessage("user", text);
      setNlLoading(true);
      fetch("/api/banking-agent/nl", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          provider: activeLlmProvider || "heuristic",
        }),
        signal: anySignal([AbortSignal.timeout(15000), signal]),
      })
        .then((r) =>
          r.json().catch(() => ({
            result: { kind: "none", message: "Could not parse response." },
            source: "heuristic",
          })),
        )
        .then(({ result, source }) => {
          tokenChain?.setNlRoutingEvent({
            prompt: text,
            source: source || "heuristic",
            intent: result,
            timestamp: new Date().toISOString(),
            heuristicSavedEstimate: (source || "heuristic") === "heuristic" ? 400 : 0,
          });
          return dispatchNlResult(result, source || "heuristic", text);
        })
        .catch((err) => { if (!isAbortError(err)) reportNlFailure(err); })
        .finally(() => {
          setNlLoading(false);
          nlSendGuardRef.current.release();
        });
    });
  }

  // Sends text through the full NL pipeline (same path as typing in the chat box).
  function sendAsNl(text) {
    if (!nlSendGuardRef.current.tryAcquire()) return;
    try {
      sendAsNlInner(text);
    } catch (e) {
      // Synchronous failure before any async release path ran — free the
      // guard so the send box doesn't stay locked. (Parity with
      // handleNaturalLanguage's try/finally.)
      nlSendGuardRef.current.release();
      throw e;
    }
  }

  function handleActionClick(actionId) {
    if (actionId !== "logout" && isAgentBlockedByConsentDecline()) {
      addMessage("assistant", AGENT_CONSENT_BLOCK_USER_MESSAGE);
      return;
    }
    if (actionId === "logout") {
      aguiAbort();
      aguiReset();
      onLogout?.();
      return;
    }
    if (actionId === "demo_guide") {
      setShowDemoGuide(true);
      return;
    }

    // In LLM-only mode, route conversational chips through the NL pipeline so Helix handles them.
    // Data-retrieval chips always bypass Helix and hit the real API.
    if (!heuristicEnabled && !API_DIRECT_CHIPS.has(actionId)) {
      const prompt = CHIP_NL_PROMPTS[actionId];
      if (prompt) {
        // Prompts that need user input (e.g. query_user) still pre-fill the box.
        if (prompt.endsWith(": ")) {
          setNlInputFromTile(prompt);
        } else {
          sendAsNl(prompt);
        }
        return;
      }
    }

    // Run API-direct chips (and all chips in heuristic mode).
    if (API_DIRECT_CHIPS.has(actionId)) {
      runAction(actionId, {});
    } else if (actionId === "query_user") {
      setNlInputFromTile("Query user by email: ");
    } else if (actionId === "sequential_think") {
      setNlInputFromTile(
        "Think: Should I transfer money from checking to savings?",
      );
    } else if (actionId === "demo_nl_routing") {
      setNlInputFromTile("What is my checking account balance?");
    } else if (
      actionId === "ai_ask" ||
      actionId === "ai_helix_demo" ||
      actionId === "ai_explain" ||
      actionId === "ai_helix_explain" ||
      actionId === "ai_analyze" ||
      actionId === "ai_advice" ||
      actionId === "ai_helix_advice"
    ) {
      runAction(actionId, {});
    } else {
      runAction(actionId, {});
    }
  }

  function openEducationCommand(cmd) {
    if (isAgentBlockedByConsentDecline()) {
      addMessage("assistant", AGENT_CONSENT_BLOCK_USER_MESSAGE);
      return;
    }
    if (cmd.ciba && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("education-open-ciba", {
          detail: { tab: cmd.tab || "what" },
        }),
      );
      setIsOpen(false);
      return;
    }
    if (cmd.panel) {
      edu?.open(cmd.panel, cmd.tab || null);
      setIsOpen(false);
    }
  }

  /**
   * Shared NL dispatch: education panels, banking tools, or fallback hint.
   * @param {object} result - NL routing result from server
   * @param {string} _source - routing source tag ("heuristic" | "helix" |
   *   "ollama" | ...). Threaded into runAction via opts.nlSource so the
   *   assistant result renders the same source pill as conversational answers.
   * @param {string} nlUserText - original user text for post-auth replay
   */
  async function dispatchNlResult(
    result,
    _source = "heuristic",
    nlUserText = "",
  ) {
    // Degraded-mode detection: a real Helix->heuristic fallback is "Helix was
    // the selected provider but the answer came back from the heuristic".
    // A Helix-sourced answer (helix / helix_fallback) clears the banner.
    if (_source === "helix" || _source === "helix_fallback") {
      setHelixDegraded(false);
    } else if (activeLlmProvider === "helix" && _source === "heuristic") {
      setHelixDegraded(true);
    }

    // Model advisory: surface mismatches between configured mode and query complexity.
    if (modelAdvisoryTimerRef.current) clearTimeout(modelAdvisoryTimerRef.current);
    const _frontierModes = ["claude", "chatgpt"];
    if (_frontierModes.includes(agentProviderMode) && _source === "heuristic") {
      setModelAdvisory({ msg: "Tip: simple query matched a pattern — heuristics mode skips the LLM entirely." });
      modelAdvisoryTimerRef.current = setTimeout(() => setModelAdvisory(null), 6000);
    } else if (agentProviderMode === "heuristics" && result.kind === "none") {
      setModelAdvisory({ msg: "Tip: query not understood in heuristics-only mode — enable an LLM provider." });
      modelAdvisoryTimerRef.current = setTimeout(() => setModelAdvisory(null), 6000);
    } else {
      setModelAdvisory(null);
    }

    if (result.kind === "education" && result.ciba) {
      openEducationCommand({ ciba: true, tab: result.tab });
      setIsOpen(false);
      addMessage(
        "assistant",
        ` CIBA Guide opened — see the sliding panel on the right.\n\n` +
          `CIBA (Client-Initiated Backchannel Authentication) lets the server request user approval out-of-band:\n` +
          `• Server calls POST /bc-authorize → PingOne sends email or push to user\n` +
          `• User approves from their inbox or device — no browser redirect needed\n` +
          `• Server polls POST /token until approved, then stores tokens server-side\n\n` +
          `Great for chat agents (redirect would break the flow) and high-value step-up transactions.\n` +
          `The guide has 8 tabs: What is CIBA · Sign-in & roles · Full stack · Token exchange · vs Login · Try It (live demo) · App Flows · PingOne Setup`,
      );
      return;
    }
    if (result.kind === "education" && result.education?.panel) {
      const panel = result.education.panel;
      const tab = result.education.tab || null;
      if (panel === EDU.CIMD) {
        window.dispatchEvent(
          new CustomEvent("education-open-cimd", {
            detail: { tab: tab || "what" },
          }),
        );
        setIsOpen(false);
        addMessage(
          "assistant",
          ` CIMD Simulator opened — see the sliding panel on the right.\n\n` +
            `OAuth Client ID Metadata Document (CIMD) redefines what a client_id is:\n` +
            `• Instead of an opaque string, the client_id is a URL you control\n` +
            `• That URL hosts a JSON document describing the client (redirect_uris, grant_types, scopes…)\n` +
            `• A CIMD-capable AS fetches the URL to learn the client's metadata — no pre-registration needed\n` +
            `• The client controls updates: just update the hosted document\n\n` +
            `This demo registers the client in PingOne via the Management API and hosts the document at:\n` +
            `/.well-known/oauth-client/{pingone-app-id}\n\n` +
            `Panel tabs: What is CIMD · CIMD vs DCR · Doc format · How AS uses it · Flow diagram · ▶ Simulate · PingOne`,
        );
        return;
      }
      // Conversational LLM answer — no panel to open, just display the text.
      if (panel === "general-knowledge") {
        addMessage(
          "assistant",
          result.message || "I don't have an answer for that.",
        );
        return;
      }
      const topicMsg = TOPIC_MESSAGES[panel];
      edu?.open(panel, tab);
      addMessage(
        "assistant",
        topicMsg
          ? topicMsg
          : `Opened help panel: ${panel}. See the sliding panel on the right for details.`,
      );
      return;
    }
    if (result.kind === "banking" && result.banking?.action) {
      const { action, params } = result.banking;
      if (action === "logout") {
        addMessage("assistant", "Signing you out…");
        setTimeout(() => onLogout?.(), 800);
        return;
      }
      if (marketingGuestChatEnabled) {
        try {
          if (nlUserText && nlUserText.trim()) {
            sessionStorage.setItem(BX_AGENT_PENDING_NL_KEY, nlUserText.trim());
          }
        } catch (_) {}
        addMessage(
          "assistant",
          "Taking you to PingOne — after you sign in you’ll return here and we’ll continue with that banking request.",
        );
        handleLoginAction("login_user");
        return;
      }
      const p = normalizeBankingParams(params);
      if (action === "mcp_tools") {
        await runAction(
          "mcp_tools",
          {},
          { skipUserLabel: true, nlSource: _source },
        );
        return;
      }
      if (action === "biggest_purchase" || action === "spending_summary") {
        const txRes = await getMyTransactions(50).catch(() => null);
        const txNorm = txRes ? normalizeAgentToolResult(txRes.result) : null;
        const txList = txNorm?.transactions;
        if (!Array.isArray(txList) || txList.length === 0) {
          addMessage(
            "assistant",
            "No transaction history found for your accounts.",
          );
          return;
        }
        if (action === "biggest_purchase") {
          const purchases = txList.filter(
            (tx) =>
              tx.type === "debit" || tx.type === "purchase" || tx.amount < 0,
          );
          const candidates = purchases.length > 0 ? purchases : txList;
          const biggest = candidates.reduce((max, tx) =>
            Math.abs(tx.amount) > Math.abs(max.amount) ? tx : max,
          );
          const amt = Math.abs(biggest.amount).toFixed(2);
          const desc = biggest.merchant || biggest.description || "Unknown";
          const when = biggest.createdAt
            ? new Date(biggest.createdAt).toLocaleDateString()
            : "";
          addMessage(
            "assistant",
            `Your biggest purchase was $${amt} at ${desc}${when ? ` on ${when}` : ""}.`,
          );
        } else {
          const debits = txList.filter(
            (tx) =>
              tx.type === "debit" || tx.type === "purchase" || tx.amount < 0,
          );
          const total = debits.reduce(
            (sum, tx) => sum + Math.abs(tx.amount),
            0,
          );
          const byCategory = debits.reduce((acc, tx) => {
            const cat = tx.category || tx.merchant || "Other";
            acc[cat] = (acc[cat] || 0) + Math.abs(tx.amount);
            return acc;
          }, {});
          const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
          const lines = sorted
            .slice(0, 5)
            .map(([cat, amt]) => `- ${cat}: $${amt.toFixed(2)}`)
            .join("\n");
          addMessage(
            "assistant",
            `Total spending across ${debits.length} transactions: $${total.toFixed(2)}\n\nTop categories:\n${lines}`,
          );
        }
        setResultPanel({
          type: "transactions",
          title:
            action === "biggest_purchase"
              ? (terminology?.transactions || "Transactions")
              : "Spending Breakdown",
          data: txList,
          terminology,
        });
        return;
      }
      if (action === "accounts" || action === "transactions") {
        await runAction(action, {}, { skipUserLabel: true, nlSource: _source });
      } else if (action === "balance" && (p.accountId || p.accountType)) {
        let resolvedId = p.accountId;
        if (!resolvedId && p.accountType) {
          const match = liveAccounts.find(
            (a) => a.type?.toLowerCase() === p.accountType.toLowerCase(),
          );
          resolvedId = match?.id;
        }
        if (resolvedId) {
          await runAction(
            "balance",
            { accountId: resolvedId },
            { skipUserLabel: true, nlSource: _source },
          );
        } else {
          addMessage(
            "assistant",
            `I couldn't find a ${p.accountType || "matching"} ${terminology?.account || "account"}. Which ${terminology?.account || "account"} would you like to check?`,
          );
        }
      } else if (action === "transfer" && p.fromId && p.toId && p.amount) {
        // NL returns account type names ("checking"/"savings") — resolve to real IDs
        const resolveAcct = (val) => {
          if (!val) return val;
          const byId = liveAccounts.find((a) => a.id === val);
          if (byId) return byId.id;
          const byType = liveAccounts.find(
            (a) => a.type?.toLowerCase() === val.toLowerCase(),
          );
          return byType ? byType.id : val;
        };
        await runAction(
          "transfer",
          { ...p, fromId: resolveAcct(p.fromId), toId: resolveAcct(p.toId) },
          { skipUserLabel: true, nlSource: _source },
        );
      } else if (action === "deposit" && p.amount) {
        const depAcct = liveAccounts.find(
          (a) => a.type?.toLowerCase() === (p.toId || "checking").toLowerCase(),
        );
        await runAction(
          "deposit",
          { ...p, accountId: p.accountId || (depAcct ? depAcct.id : p.toId) },
          { skipUserLabel: true, nlSource: _source },
        );
      } else if (action === "withdraw" && p.amount) {
        const wdAcct = liveAccounts.find(
          (a) =>
            a.type?.toLowerCase() === (p.fromId || "checking").toLowerCase(),
        );
        await runAction(
          "withdraw",
          { ...p, accountId: p.accountId || (wdAcct ? wdAcct.id : p.fromId) },
          { skipUserLabel: true, nlSource: _source },
        );
      } else if (
        ["balance", "transfer", "deposit", "withdraw"].includes(action)
      ) {
        const termAccount  = terminology?.account  || "account";
        const termAccounts = terminology?.accounts || "accounts";
        const termBalance  = terminology?.balance  || "balance";
        const termHighValue = terminology?.highValueAction || "Transfer";
        const questions = {
          balance:  `Which ${termAccount} would you like to check the ${termBalance} for?`,
          deposit:  `How much would you like to deposit, and to which ${termAccount}?`,
          withdraw: `How much would you like to withdraw, and from which ${termAccount}?`,
          transfer: `Which ${termAccounts} would you like to ${termHighValue.toLowerCase()} between, and how much?`,
        };
        addMessage("assistant", questions[action]);
        // Remember WHAT we asked so the next user message can fill the slot.
        // sendAsNl() inspects this on the next turn and skips re-parsing
        // when we already know the intent. We also remember any partial
        // params the parser already filled so e.g. "checking" + previous
        // amount=$50 still works on the next turn.
        setPendingClarification({
          action,
          partialParams: p || {},
          asked: questions[action],
        });
      } else {
        await runAction(action, p, { skipUserLabel: true, nlSource: _source });
      }
      return;
    }
    if (result.kind === "vertical" && result.action) {
      // The /nl endpoint only routed intent; execute via the agent endpoint to get data+render.
      try {
        const response = await sendAgentMessage(nlUserText || result.action, null, {});
        if (response && response.success !== false) {
          addMessage("assistant", response.reply || "Done.", null, { source: _source });
          if (response.verticalResult) {
            const vr = response.verticalResult;
            const descriptor = pageManifest?.render?.[vr.render] || null;
            setResultPanel({ type: "vertical", title: descriptor?.title || "Result", descriptor, data: vr.data, terminology });
          }
          return;
        }
        // Non-success vertical response (e.g. needsParams). sendAgentMessage already
        // surfaces hitl_required / step_up_required via its own modal; for any other
        // vertical reply, show the vertical's message rather than the banking default.
        if (response && response.reply) {
          addMessage("assistant", response.reply, null, { source: _source });
          return;
        }
      } catch (e) { /* fall through to default below */ }
    }
    // Prefer the server's message (heuristic / LLM produces a useful one).
    // The hard-coded fallback is only for the rare case where result.message
    // is missing — e.g. server crashed before populating it.
    addMessage(
      "assistant",
      result.message ||
        `I didn't catch that. Try "show my accounts", "balance", "recent transactions", or "explain token exchange".`,
      null,
      { source: _source },
    );
  }

  /** NL API errors: 401 is session missing on server — not a parse failure. */
  function reportNlFailure(err) {
    if (err?.code === "session_not_hydrated") {
      if (!cookieOnlyBffSession) {
        notifyError(
          "Sign in again: server session has no tokens (Vercel needs Redis/Upstash + redeploy, then sign out & sign in).",
          { autoClose: 12000 },
        );
      }
      if (!sessionFixBubbleShownRef.current) {
        sessionFixBubbleShownRef.current = true;
        addMessage("error", SESSION_NOT_HYDRATED_CHAT, null, {
          showSessionFixActions: true,
        });
      }
      const pSess = (location.pathname || "").replace(/\/$/, "") || "/";
      if (isPublicMarketingAgentPath(pSess)) {
        window.dispatchEvent(new CustomEvent("marketing-scroll-login"));
      }
      return;
    }
    if (
      err?.statusCode === 401 ||
      err?._status === 401 ||
      err?.code === "authentication_required"
    ) {
      if (cookieOnlyBffSession) {
        if (!sessionFixBubbleShownRef.current) {
          sessionFixBubbleShownRef.current = true;
          addMessage("error", SESSION_NOT_HYDRATED_CHAT, null, {
            showSessionFixActions: true,
          });
        }
        return;
      }
      const p401 = (location.pathname || "").replace(/\/$/, "") || "/";
      if (isPublicMarketingAgentPath(p401) && !isLoggedIn) {
        addMessage("assistant", " Signing you in with PingOne…");
        handleLoginAction("login_user");
        return;
      }
      notifyError(
        "Sign in required — the server has no session for this request. Refresh the page and sign in again.",
        { autoClose: agentToastMs.errShort },
      );
      addMessage(
        "assistant",
        "You need an active server session to use the agent. If you already signed in, refresh the page (session may have expired or cookies may not have reached the API).",
      );
      return;
    }
    const errorMessage =
      err.message ||
      err.error ||
      "An unexpected error occurred. Please try again.";
    notifyError(`❌ Could not parse request: ${errorMessage}`, {
      autoClose: agentToastMs.errShort,
    });
    addMessage("assistant", `Could not parse: ${errorMessage}`);
  }

  async function handleNaturalLanguage() {
    const text = nlInput.trim();
    if (!text) return;
    // Synchronous single-flight: wins the same-tick double-submit race that
    // disabled={nlLoading} (async state) cannot. Released in the finally below.
    if (!nlSendGuardRef.current.tryAcquire()) return;
    try {
      return await handleNaturalLanguageInner(text);
    } finally {
      nlSendGuardRef.current.release();
    }
  }

  async function handleNaturalLanguageInner(text) {
    if (!isLoggedIn && !marketingGuestChatEnabled) return;
    if (isAgentBlockedByConsentDecline()) {
      addMessage("assistant", AGENT_CONSENT_BLOCK_USER_MESSAGE);
      return;
    }

    const signal = beginAbortableSend();

    // Sequential thinking trigger: "think: [query]" or "reason: [query]"
    const thinkMatch = text.match(/^(?:think|reason):\s*(.+)/i);
    if (thinkMatch) {
      const query = thinkMatch[1].trim();
      addMessage("user", text);
      setNlInput("");
      setNlLoading(true);
      try {
        // Route through /api/mcp/tool so the call goes through the MCP gateway
        const res = await fetch("/api/mcp/tool", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: "sequential_think", params: { query } }),
          signal: anySignal([AbortSignal.timeout(15000), signal]),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        let steps = [],
          conclusion = "";
        try {
          const raw = data.result;
          // Handle MCP content-array format: { content: [{ type: "text", text: "..." }] }
          const rawText =
            raw && Array.isArray(raw.content)
              ? raw.content[0]?.text || ""
              : raw;
          const parsed =
            typeof rawText === "string" ? JSON.parse(rawText) : rawText || {};
          steps = parsed.steps || [];
          conclusion = parsed.conclusion || "";
        } catch (_) {}
        if (!signal.aborted) addMessage("reasoning", "", null, { steps, conclusion });
      } catch (err) {
        if (isAbortError(err)) return;
        addMessage("error", `Sequential thinking failed: ${err.message}`);
      } finally {
        setNlLoading(false);
      }
      return;
    }

    try {
      agentFlowDiagram.resetComplianceSteps();
      agentFlowDiagram.startLlmReasoning(text);
    } catch (_) {}
    setNlLoading(true);
    addMessage("user", text);
    setNlInput("");
    tokenChain?.clearEvents();
    try {
      const logQuery = parseLogPrompt(text);
      if (logQuery) {
        if (logQuery.type === "errors") {
          const params = new URLSearchParams({
            level: "error",
            limit: String(logQuery.limit),
          });
          const sources = ["console", "app", "vercel"];
          const results = await Promise.allSettled(
            sources.map((src) =>
              fetch(`/api/logs/${src}?${params.toString()}`, {
                credentials: "include",
              }),
            ),
          );
          const merged = [];
          for (let i = 0; i < results.length; i += 1) {
            const res = results[i];
            if (res.status !== "fulfilled" || !res.value.ok) continue;
            const body = await res.value.json();
            (body.logs || []).forEach((log) => {
              merged.push({ ...log, _src: sources[i] });
            });
          }
          const top = merged
            .sort(
              (a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0),
            )
            .slice(0, logQuery.limit);
          if (top.length === 0) {
            addMessage(
              "assistant",
              `No error logs found in the last ${logQuery.limit} entries.`,
            );
          } else {
            const lines = top.map((l, idx) => {
              const when = new Date(l.timestamp || Date.now()).toLocaleString();
              return `${idx + 1}. [${(l.level || "error").toUpperCase()}] (${l._src}) ${when}\n   ${String(l.message || "").slice(0, 180)}`;
            });
            addMessage(
              "assistant",
              `Last ${top.length} errors:\n\n${lines.join("\n\n")}`,
            );
          }
        } else if (logQuery.type === "last_login") {
          const p = new URLSearchParams({
            username: logQuery.username,
            action: "LOGIN",
            limit: "1",
          });
          const res = await fetch(`/api/admin/activity?${p.toString()}`, {
            credentials: "include",
          });
          if (!res.ok) {
            if (res.status === 403) {
              addMessage(
                "assistant",
                "Log query requires admin access. Sign in as admin to query activity logs.",
              );
            } else {
              addMessage(
                "assistant",
                `Could not query login activity (HTTP ${res.status}).`,
              );
            }
          } else {
            const body = await res.json();
            const log = body.logs?.[0];
            if (!log) {
              addMessage(
                "assistant",
                `No successful login found for "${logQuery.username}".`,
              );
            } else {
              const when = new Date(log.timestamp).toLocaleString();
              addMessage(
                "assistant",
                `Last successful login for ${logQuery.username}:\n\n- Time: ${when}\n- Endpoint: ${log.endpoint || "/api/auth/login"}\n- IP: ${log.ipAddress || "n/a"}`,
              );
            }
          }
        }
        return;
      }
      // Route through /api/banking-agent/nl: heuristic regex first → Ollama LLM only if unrecognised.
      // On banking intent: dispatchNlResult → runAction → POST /api/mcp/tool → full 12-step token flow.
      const _nlRes = await fetch("/api/banking-agent/nl", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, provider: activeLlmProvider || "heuristic" }),
        signal: anySignal([AbortSignal.timeout(15000), signal]),
      });
      const { result: _nlResult, source: _nlSource } = await _nlRes
        .json()
        .catch(() => ({
          result: {
            kind: "none",
            message:
              'Could not parse request. Try: "show my accounts" or "transfer $100 to savings".',
          },
          source: "heuristic",
        }));
      // Record NL routing as step 0 in Token Chain before token events arrive
      tokenChain?.setNlRoutingEvent({
        prompt: text,
        source: _nlSource || "heuristic",
        intent: _nlResult,
        timestamp: new Date().toISOString(),
        heuristicSavedEstimate: (_nlSource || "heuristic") === "heuristic" ? 400 : 0,
      });
      await dispatchNlResult(_nlResult, _nlSource || "heuristic", text);
    } catch (err) {
      if (isAbortError(err)) return;
      reportNlFailure(err);
    } finally {
      setNlLoading(false);
    }
  }

  // After marketing OAuth return: replay NL that triggered the login redirect.
  useEffect(() => {
    if (!nlResumeAfterAuth || !isLoggedIn) return;
    const text = nlResumeAfterAuth;
    setNlResumeAfterAuth(null);
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      const signal = beginAbortableSend();
      addMessage("user", text);
      setNlLoading(true);
      try {
        const response = await sendAgentMessage(text, null, { signal });
        if (!cancelled && !signal.aborted) {
          if (response.error || !response.success) {
            reportNlFailure({ code: response.error || "unknown" });
          } else {
            addMessage("assistant", response.reply || "Done.");
            if (response.verticalResult) {
              const vr = response.verticalResult;
              const descriptor = pageManifest?.render?.[vr.render] || null;
              setResultPanel({ type: "vertical", title: descriptor?.title || "Result", descriptor, data: vr.data, terminology });
            }
            if (response.tokenEvents?.length) {
              appendTokenEvents(response.tokenEvents);
              if (tokenChain) {
                tokenChain.setTokenEvents("agent", response.tokenEvents);
              }
            }
            if (response.inputTokens || response.outputTokens) {
              const inc = {
                input: response.inputTokens ?? 0,
                output: response.outputTokens ?? 0,
              };
              setSessionTokens((prev) => ({
                input: prev.input + inc.input,
                output: prev.output + inc.output,
              }));
              setLifetimeTokens((prev) => {
                const next = { input: prev.input + inc.input, output: prev.output + inc.output };
                try { localStorage.setItem('ba_tokens_lifetime', JSON.stringify(next)); } catch (_) {}
                return next;
              });
            }
          }
        }
      } catch (e) {
        if (isAbortError(e)) return;
        if (!cancelled) reportNlFailure(e);
      } finally {
        if (!cancelled) setNlLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot replay when nlResumeAfterAuth is set after OAuth
  }, [nlResumeAfterAuth, isLoggedIn]);

  // Cancel any in-flight agent request when this instance unmounts OR the
  // route changes away from where it was issued — prevents state updates on
  // a dead/wrong instance and mis-attributed Token Chain events.
  useEffect(() => {
    return () => {
      if (sendAbortRef.current) {
        try { sendAbortRef.current.abort(); } catch (_) {}
        sendAbortRef.current = null;
      }
    };
  }, [location.pathname]);

  // Keep resultPanelRef current so the refresh handler below can read it without stale closure.
  useEffect(() => {
    resultPanelRef.current = resultPanel;
  }, [resultPanel]);

  // After a dashboard transaction (banking-transaction-completed), refresh liveAccounts and
  // whatever result panel is currently open. Agent-initiated writes are handled inline in
  // runAction (lines above) so this effect only needs to handle dashboard-sourced events.
  useEffect(() => {
    const normalizeAccountRow = (a) => ({
      id: a.id,
      // Vertical-neutral: prefer the server-stored name, then the actual
      // account type (e.g. "Pro Member", "Patient Record"). Never hardcode
      // banking names — absolute rule: render must work for every vertical.
      name: a.name || a.accountType || a.account_type || a.type || "Account",
      type: a.accountType || a.account_type || a.type || "Account",
      balance: a.balance || 0,
      accountNumber: a.accountNumber || a.account_number || a.id,
    });

    const refreshAfterTransaction = () => {
      const currentPanel = resultPanelRef.current;

      // Always refresh liveAccounts (drives form dropdowns + accounts/balance result panels)
      fetch("/api/accounts/my", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data?.accounts?.length) return;
          const fresh = data.accounts.map(normalizeAccountRow);
          setLiveAccounts(fresh);
          if (currentPanel?.type === "accounts") {
            setResultPanel({
              type: "accounts",
              title: terminology?.accounts || "Accounts",
              data: fresh,
              terminology,
            });
          } else if (currentPanel?.type === "balance") {
            // Switch to full accounts view so all updated balances are visible
            setResultPanel({
              type: "accounts",
              title: terminology?.accounts || "Accounts",
              data: fresh,
              terminology,
            });
          }
        })
        .catch(() => {});

      // Refresh transactions panel if it's currently open
      if (currentPanel?.type === "transactions") {
        fetch("/api/transactions/my?limit=30", { credentials: "include" })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (!data?.transactions) return;
            setResultPanel({
              type: "transactions",
              title: terminology?.transactions || "Recent Transactions",
              data: data.transactions,
              terminology,
            });
          })
          .catch(() => {});
      }
    };

    window.addEventListener(
      "banking-transaction-completed",
      refreshAfterTransaction,
    );
    return () => {
      window.removeEventListener(
        "banking-transaction-completed",
        refreshAfterTransaction,
      );
    };
  }, []); // stable \u2014 reads state via resultPanelRef

  // Float mode should return nothing when the dedicated /agent page is active
  if (!isInline && isAgentPage) return null;

  // OTP modal handlers (Phase 174)
  const handleOtpSubmit = (otp) => {
    // If a step-up callback was stored (e.g. sensitive data after HITL), fire it directly
    if (pendingStepUpCallbackRef.current) {
      const cb = pendingStepUpCallbackRef.current;
      pendingStepUpCallbackRef.current = null;
      setShowOtpModal(false);
      setStepUpMethod("otp");
      setP1mfaMode(false);
      setP1mfaDaId(null);
      setP1mfaDevices([]);
      agentFlowDiagram.completeMfaChallenge(true);
      cb();
      return;
    }
    if (pendingOtpActionRef.current) {
      const { actionId, form } = pendingOtpActionRef.current;
      pendingOtpActionRef.current = null;
      setShowOtpModal(false);
      setStepUpMethod("otp");
      setP1mfaMode(false);
      setP1mfaDaId(null);
      setP1mfaDevices([]);
      // Verify MFA in flow diagram
      agentFlowDiagram.completeMfaChallenge(true);
      // Retry the original action with MFA verified
      runAction(actionId, form, { isRefire: true });
    }
  };

  const handleOtpCancel = () => {
    setShowOtpModal(false);
    setOtpContextLine("");
    pendingOtpActionRef.current = null;
    pendingStepUpCallbackRef.current = null;
    setP1mfaMode(false);
    setP1mfaDaId(null);
    setP1mfaDevices([]);
    setStepUpMethod("otp");
    addMessage(
      "assistant",
      "MFA request was cancelled. Please try again if needed.",
      "mfa-cancelled",
    );
    agentFlowDiagram.completeMfaChallenge(false);
  };

  // FIDO submit handler (Phase 174-03)
  const handleFidoSubmit = (credentialResponse) => {
    if (pendingStepUpCallbackRef.current) {
      const cb = pendingStepUpCallbackRef.current;
      pendingStepUpCallbackRef.current = null;
      setShowOtpModal(false);
      setStepUpMethod("otp");
      agentFlowDiagram.completeMfaChallenge(true);
      cb();
      return;
    }
    if (pendingOtpActionRef.current) {
      const { actionId, form } = pendingOtpActionRef.current;
      pendingOtpActionRef.current = null;
      setShowOtpModal(false);
      setStepUpMethod("otp");
      agentFlowDiagram.completeMfaChallenge(true);
      runAction(actionId, form, { isRefire: true });
    }
  };

  const handleSwitchToOtp = () => {
    setStepUpMethod("otp");
  };

  const handleSwitchToFido = () => {
    setStepUpMethod("fido");
  };

  // P1MFA completion handler (Phase 174-04)
  const handleP1MfaComplete = () => {
    if (pendingStepUpCallbackRef.current) {
      const cb = pendingStepUpCallbackRef.current;
      pendingStepUpCallbackRef.current = null;
      setShowOtpModal(false);
      setP1mfaMode(false);
      setP1mfaDaId(null);
      setP1mfaDevices([]);
      agentFlowDiagram.completeMfaChallenge(true);
      cb();
      return;
    }
    if (pendingOtpActionRef.current) {
      const { actionId, form } = pendingOtpActionRef.current;
      pendingOtpActionRef.current = null;
      setShowOtpModal(false);
      setP1mfaMode(false);
      setP1mfaDaId(null);
      setP1mfaDevices([]);
      agentFlowDiagram.completeMfaChallenge(true);
      runAction(actionId, form, { isRefire: true });
    }
  };

  const handleP1MfaError = (errorMsg) => {
    console.error("[BankingAgent] P1MFA error:", errorMsg);
  };

  /** Phase 211: perform scope upgrade exchange and auto-replay the pending action. */
  async function handleScopeUpgradeConfirm() {
    setScopeErrorModal((prev) =>
      prev ? { ...prev, scopeUpgradeState: "exchanging" } : prev,
    );
    addMessage(
      "token-event",
      " Scope upgrade approved — exchanging token for write access (RFC 8693)…",
      "scope_upgrade",
    );
    try {
      const apiBase = process.env.REACT_APP_API_URL || "";
      const res = await fetch(`${apiBase}/api/mcp/scope-upgrade`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        setScopeErrorModal((prev) =>
          prev
            ? {
                ...prev,
                scopeUpgradeState: "error",
                upgradeError: data.message || "Exchange failed",
              }
            : prev,
        );
        addMessage(
          "token-event",
          `❌ Scope upgrade failed: ${data.message || "Exchange did not return a write-scoped token."}`,
          "scope_upgrade",
        );
        return;
      }
      // Push exchange token events to TokenChainContext for educational display
      if (
        tokenChain &&
        Array.isArray(data.tokenEvents) &&
        data.tokenEvents.length > 0
      ) {
        tokenChain.setTokenEvents("scope_upgrade", data.tokenEvents);
      }
      addMessage(
        "token-event",
        [
          " RFC 8693 Token Exchange — Scope Upgrade",
          "   Subject token: user access token (from BFF session)",
          "   Requested scope: write (added to MCP token)",
          "   Result: write-scoped MCP access token stored in session",
          "   RFC 8693 §2.1: token exchange cannot expand beyond subject token scopes.",
          "   RFC 8693 §4.2: `act` claim on result identifies BFF as actor.",
        ].join("\n"),
        "scope_upgrade",
      );
      setScopeErrorModal((prev) =>
        prev ? { ...prev, scopeUpgradeState: "done" } : prev,
      );
      addMessage(
        "token-event",
        " Write-scoped token ready — replaying original request…",
        "tool_replay",
      );
      // Auto-close and replay after brief delay
      setTimeout(() => {
        const pending = pendingScopeUpgradeRef.current;
        setScopeErrorModal(null);
        pendingScopeUpgradeRef.current = null;
        if (pending && pending.actionId) {
          runAction(pending.actionId, pending.form || {}, {
            skipUserLabel: true,
          });
        }
      }, 500);
    } catch (err) {
      setScopeErrorModal((prev) =>
        prev
          ? { ...prev, scopeUpgradeState: "error", upgradeError: err.message }
          : prev,
      );
      addMessage(
        "token-event",
        `❌ Scope upgrade network error: ${err.message}`,
        "scope_upgrade",
      );
    }
  }

  async function toggleHeuristicMode(wantHeuristic) {
    setLlmFlagSaving(true);
    try {
      const res = await fetch("/api/admin/feature-flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          updates: { ff_heuristic_enabled: wantHeuristic },
        }),
      });
      if (res.ok) setHeuristicEnabled(wantHeuristic);
    } catch (_) {
    } finally {
      setLlmFlagSaving(false);
    }
  }

  const floatShell = (
    <div
      className={`banking-agent-float-root${distinctFloatingChrome && !isInline ? " banking-agent-float-root--distinct" : ""}`}
      data-agent-ui="floating"
    >
      {/* FAB - only shown when floating agent is collapsed (not in inline mode) */}
      {!isInline && !isOpen && (
        <button
          type="button"
          className="banking-agent-fab"
          onClick={() => setIsOpen(true)}
          aria-label={`Open ${brandShortName} AI Agent`}
          title={`Open ${brandShortName} AI Agent`}
        >
          <span className="banking-agent-fab-icon"></span>
          <span className="banking-agent-fab-label">AI Agent</span>
        </button>
      )}

      {/* Results panel — sits to the left of the agent (portal-renders over page; works in all modes) */}
      {effectiveIsOpen && resultPanel && agentResultsPanelEnabled && (
        <ResultsPanel
          panel={resultPanel}
          onClose={() => setResultPanel(null)}
          style={resultsPanelStyle}
        />
      )}

      {/* Panel */}
      {effectiveIsOpen && (
        <div
          className={`banking-agent-panel ba-mode-light${isExpanded && !isInline ? " ba-expanded" : ""}${isInline ? " ba-mode-inline" : ""}${isBottomDock ? " ba-embedded-bottom-dock" : ""}${splitChrome ? " ba-split-column" : ""}${distinctFloatingChrome && isInline ? " ba-popout-mode" : ""}`}
          role="dialog"
          aria-label={
            isConfigEmbeddedFocus
              ? "Application setup assistant"
              : `${brandShortName} AI Agent`
          }
          ref={panelRef}
          style={panelStyle}
        >
          {/* Header — spans full width */}
          {/* In inline mode: no drag handle. In float mode: drag to reposition */}
          <div
            role="button"
            tabIndex={isInline ? -1 : 0}
            className={`ba-header${isInline ? "" : " banking-agent-drag-handle"}`}
            onPointerDown={isInline ? undefined : handleDragStart}
          >
            <div className="ba-header-top">
              <div className="ba-header-left">
                <span className="ba-status-dot" />
                <div>
                  <div className="ba-title">
                    {isConfigEmbeddedFocus
                      ? "Application setup assistant"
                      : splitChrome
                        ? `${brandShortName} Assistant`
                        : `${brandShortName} AI Agent`}
                  </div>
                  <div className="ba-subtitle">
                    {isConfigEmbeddedFocus
                      ? isLoggedIn
                        ? `PingOne · OAuth · branding (${brandShortName}) · environment variables`
                        : "Sign in to get started"
                      : splitChrome
                        ? isLoggedIn
                          ? `${effectiveUser.role === "admin" ? "Admin" : "Customer"} · ${effectiveUser.firstName || effectiveUser.name?.split(" ")[0] || "Signed in"}`
                          : marketingGuestChatEnabled
                            ? "Chat here — PingOne when you use banking"
                            : "Sign in to get started"
                        : isLoggedIn
                          ? `${effectiveUser.firstName || effectiveUser.name?.split(" ")[0] || "Signed in"} · ${effectiveUser.role === "admin" ? " Admin" : " Customer"}`
                          : marketingGuestChatEnabled
                            ? "Chat here — PingOne when you use banking"
                            : "Sign in to get started"}
                  </div>
                </div>
              </div>
              {helixDegraded && (
                <div className="ba-degraded-banner" role="status">
                  ⚠️ AI reasoning offline — running rule-based responses. Some
                  questions may not be understood.
                </div>
              )}
              {splitChrome &&
                isLoggedIn &&
                (effectiveUser?.id || effectiveUser?.username) && (
                  <div className="ba-header-session">
                    <div title="PingOne user id">
                      {effectiveUser?.id || effectiveUser?.username}
                    </div>
                    <SessionExpiryTimer
                      sessionInfo={effectiveUser}
                      className="ba-header-session-timer"
                    />
                  </div>
                )}
              <div className="ba-header-tools">
                {/* RFC info checkbox — always visible in header */}
                <label
                  className="ba-rfc-toggle-label"
                  title="Show or hide RFC token-event messages in the chat"
                >
                  <input
                    type="checkbox"
                    checked={showRfcInfo}
                    onChange={(e) => setShowRfcInfo(e.target.checked)}
                    className="ba-rfc-toggle-cb"
                  />
                  RFC info
                </label>
                {/* Five-mode agent provider selector — shared SSOT with /config */}
                <AgentModeSelector compact />
                {modelAdvisory && (
                  <span
                    className="ams-degraded-chip ba-model-advisory-chip"
                    role="note"
                    title={modelAdvisory.msg}
                  >
                    {modelAdvisory.msg}
                    <button
                      type="button"
                      aria-label="Dismiss"
                      className="ba-model-advisory-dismiss"
                      onClick={() => setModelAdvisory(null)}
                    >×</button>
                  </span>
                )}
                {/* Compliance 12-step toggle */}
                <button
                  type="button"
                  className={
                    "ba-actions-trigger ba-compliance-toggle-btn" +
                    (showCompliancePanel ? " active" : "")
                  }
                  title="Show or hide the 12-step compliance status"
                  onClick={() => {
                    setShowCompliancePanel((v) => {
                      const newVal = !v;
                      try {
                        localStorage.setItem(
                          "ba_show_compliance_panel",
                          newVal ? "1" : "0",
                        );
                      } catch {}
                      if (newVal) {
                        setComplianceSlideout(true);
                      }
                      return newVal;
                    });
                  }}
                >
                  Compliance
                </button>
                {showCompliancePanel && (
                  <label
                    className="ba-rfc-toggle-label"
                    title="Show compliance as side-panel overlay"
                  >
                    <input
                      type="checkbox"
                      checked={complianceSlideout}
                      onChange={(e) => {
                        try {
                          localStorage.setItem(
                            "ba_compliance_slideout",
                            e.target.checked ? "1" : "0",
                          );
                        } catch {}
                        setComplianceSlideout(e.target.checked);
                      }}
                      className="ba-rfc-toggle-cb"
                    />
                    Side panel
                  </label>
                )}
                {/* Token Chain modal toggle */}
                <button
                  type="button"
                  className={
                    "ba-actions-trigger" + (showTokenChain ? " active" : "")
                  }
                  title="View Token Chain — RFC 8693 token exchange and authorization decisions"
                  onClick={() => setShowTokenChain((v) => !v)}
                >
                  Token Chain
                </button>
                {/* Actions trigger — float + dashboard inline agents (D-01, D-02) */}
                {useActionsPopout && (
                  <button
                    ref={discoveryTriggerRef}
                    type="button"
                    className={
                      "ba-actions-trigger" + (showDiscovery ? " active" : "")
                    }
                    onClick={() => setShowDiscovery((v) => !v)}
                    disabled={consentBlocked}
                    aria-expanded={showDiscovery}
                    aria-haspopup="dialog"
                  >
                    Actions {showDiscovery ? "▴" : "▾"}
                  </button>
                )}
                {/* Expand/restore — float mode only (unchanged) */}
                {!isInline && (
                  <button
                    type="button"
                    className="ba-icon-btn"
                    onClick={() => {
                      setIsExpanded((e) => !e);
                      setDragPos(null);
                    }}
                    title={
                      isExpanded ? "Restore size" : "Expand to larger window"
                    }
                  >
                    {isExpanded ? "⊟" : "⊞"}
                  </button>
                )}
                {/* Split-column sign-out — inline split-column mode only (unchanged, D-02 untouched) */}
                {splitChrome && isLoggedIn && (
                  <button
                    type="button"
                    className="ba-header-signout"
                    onClick={() => onLogout?.()}
                  >
                    Sign out
                  </button>
                )}
                {/* Collapse to FAB — float mode only (unchanged) */}
                {!isInline && (
                  <button
                    type="button"
                    className="ba-icon-btn"
                    onClick={() => setIsOpen(false)}
                    aria-label="Collapse agent"
                    title="Collapse agent"
                  >
                    ↑
                  </button>
                )}
              </div>
            </div>
            {/* Phase 246: Actions popout — anchored to ba-header (position:relative in CSS) */}
            {showDiscovery && (
              <div
                className="ba-actions-popout"
                role="dialog"
                aria-label="Action browser"
                aria-modal="false"
                ref={actionsPopoutRef}
              >
                {/* Search */}
                <input
                  className="ba-popout-search"
                  type="search"
                  placeholder="Search actions or type a question…"
                  value={discoverySearch}
                  onChange={(e) => setDiscoverySearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    const text = discoverySearch.trim();
                    if (!text) return;
                    setShowDiscovery(false);
                    setDiscoverySearch("");
                    if (isAgentBlockedByConsentDecline()) {
                      addMessage("assistant", AGENT_CONSENT_BLOCK_USER_MESSAGE);
                      return;
                    }
                    if (!(isLoggedIn || marketingGuestChatEnabled)) return;
                    try {
                      sessionStorage.setItem(BX_AGENT_PENDING_NL_KEY, text);
                    } catch (_) {}
                    setNlInput("");
                    addMessage("user", text);
                    setNlLoading(true);
                    (async () => {
                      try {
                        const _discNlRes = await fetch(
                          "/api/banking-agent/nl",
                          {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              message: text,
                              provider: activeLlmProvider || "heuristic",
                            }),
                            signal: AbortSignal.timeout(15000),
                          },
                        );

                        const { result: _discNlResult } = await _discNlRes
                          .json()
                          .catch(() => ({
                            result: {
                              kind: "none",
                              message: "Could not parse request.",
                            },
                          }));
                        try {
                          sessionStorage.removeItem(BX_AGENT_PENDING_NL_KEY);
                        } catch (_) {}
                        await dispatchNlResult(_discNlResult, "nl", text);
                      } catch (err) {
                        reportNlFailure(err);
                      } finally {
                        setNlLoading(false);
                      }
                    })();
                  }}
                />
                {isLoggedIn && <VerticalHero />}
                {isLoggedIn && (
                  <BankingChips
                    customChips={customChips}
                    user={user}
                    llmAvailable={!!activeLlmProvider}
                    onChipClick={({ message, label, requiresLlm, chipId }) => {
                      setShowDiscovery(false);
                      if (isAgentBlockedByConsentDecline()) {
                        addMessage(
                          "assistant",
                          AGENT_CONSENT_BLOCK_USER_MESSAGE,
                        );
                        return;
                      }
                      addMessage("user", label || message);
                      setNlLoading(true);
                      (async () => {
                        try {
                          const res = await fetch("/api/banking-agent/nl", {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              message: message,
                              provider: requiresLlm
                                ? (PINGONE_ADMIN_CHIP_IDS.has(chipId) ? "pingone-admin" : (activeLlmProvider || "heuristic"))
                                : "heuristic",
                            }),
                            signal: AbortSignal.timeout(15000),
                          });
                          const { result, source, llm_attempted, llm_not_configured } = await res
                            .json()
                            .catch(() => ({
                              result: {
                                kind: "none",
                                message: "Could not parse request.",
                              },
                              source: "heuristic",
                            }));
                          if (result?.kind === "none") {
                            if (llm_not_configured) {
                              result.message =
                                `This chip needs an LLM (Helix or Ollama) to interpret freeform questions, ` +
                                `but no provider is configured.\n\n` +
                                `Open the Helix tab in the agent and add base_url + api_key + agent_id, ` +
                                `or pick a different chip from "Quick Actions" — those use the local ` +
                                `heuristic parser and work without an LLM.`;
                            } else if (llm_attempted) {
                              result.message =
                                `Helix couldn't map this to a banking action. ` +
                                `Try rephrasing, or pick a chip from "Quick Actions".`;
                            }
                          }
                          await dispatchNlResult(
                            result,
                            source || "heuristic",
                            message,
                          );
                        } catch (err) {
                          reportNlFailure(err);
                        } finally {
                          setNlLoading(false);
                        }
                      })();
                    }}
                    isLoading={nlLoading}
                  />
                )}
                <div className="ba-popout-body">
                  {filteredDiscoveryGroups.map((group) => {
                    if (
                      group.key === "admin" &&
                      effectiveUser?.role !== "admin"
                    )
                      return null;
                    if (group.chips.length === 0) return null;
                    const groupExpanded = !!chipGroupsState[group.key];
                    return (
                      <div key={group.key} className="ba-popout-section">
                        <button
                          type="button"
                          className="ba-popout-section-label ba-popout-section-toggle"
                          onClick={() => toggleGroupExpanded(group.key)}
                        >
                          {groupExpanded ? "▼" : "▶"} {group.label}
                        </button>
                        {groupExpanded && (
                          <div className="ba-popout-list">
                            {group.chips.map((action) => (
                              <button
                                key={action.id}
                                type="button"
                                className="ba-popout-list-item"
                                disabled={consentBlocked}
                                onClick={() => {
                                  setShowDiscovery(false);
                                  handleActionClick(action.id);
                                }}
                              >
                                <span className="ba-popout-item-name">
                                  {action.label}
                                </span>
                                {action.desc && (
                                  <span className="ba-popout-item-desc">
                                    {action.desc}
                                  </span>
                                )}
                                {action.rfcs?.length > 0 && (
                                  <span className="ba-popout-item-rfcs">
                                    {action.rfcs.map((r) => (
                                      <span key={r} className="ba-rfc-badge">
                                        {r}
                                      </span>
                                    ))}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {discoverySearch.trim() !== "" &&
                    filteredDiscoveryGroups.filter(
                      (g) => g.chips.length > 0,
                    ).length === 0 && (
                      <div className="ba-popout-empty">
                        <div className="ba-popout-empty-heading">
                          No matching actions
                        </div>
                        <div>
                          Try a different keyword, or type directly in the chat
                          below.
                        </div>
                      </div>
                    )}
                  {isLoggedIn && (
                    <div className="ba-popout-section">
                      <button
                        type="button"
                        className="ba-popout-section-label ba-popout-section-toggle"
                        onClick={() => toggleGroupExpanded("session")}
                      >
                        {chipGroupsState["session"] ? "▼" : "▶"} Session
                      </button>
                      {chipGroupsState["session"] && (
                        <div className="ba-popout-list">
                          <button
                            type="button"
                            className="ba-popout-list-item"
                            onClick={() => {
                              setShowDiscovery(false);
                              void handleSessionRefresh();
                            }}
                            disabled={
                              sessionRefreshing || loading || consentBlocked
                            }
                            title="Refresh your access token using PingOne refresh token"
                          >
                            <span className="ba-popout-item-name">
                              {sessionRefreshing
                                ? "Refreshing…"
                                : "Refresh token"}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="ba-popout-list-item"
                            onClick={() => {
                              setShowDiscovery(false);
                              onLogout?.();
                            }}
                            disabled={loading}
                            title="Sign out of your session"
                          >
                            <span className="ba-popout-item-name">
                              Sign out
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {isLoggedIn && (
                    <div className="ba-popout-section">
                      <button
                        type="button"
                        className="ba-popout-section-label ba-popout-section-toggle"
                        onClick={() => toggleGroupExpanded("view")}
                      >
                        {chipGroupsState["view"] ? "▼" : "▶"} View
                      </button>
                      {chipGroupsState["view"] && (
                        <div className="ba-popout-list">
                          <button
                            type="button"
                            className={`ba-popout-list-item${showRfcInfo ? " active" : ""}`}
                            onClick={() => setShowRfcInfo((v) => !v)}
                            aria-label={
                              showRfcInfo ? "Hide RFC info" : "Show RFC info"
                            }
                            title={
                              showRfcInfo
                                ? "Hide RFC info messages"
                                : "Show RFC info messages"
                            }
                          >
                            <span className="ba-popout-item-name">
                              {showRfcInfo ? "RFC info on" : "RFC info off"}
                            </span>
                          </button>
                          {(!isInline || showPopOut) && (
                            <button
                              type="button"
                              className="ba-popout-list-item"
                              onClick={() => {
                                setShowDiscovery(false);
                                const calculateOptimalSize = () => {
                                  const screenWidth = window.screen.width;
                                  const screenHeight = window.screen.height;
                                  const minWidth = 420;
                                  const minHeight = 500;
                                  const maxWidth = Math.min(
                                    800,
                                    screenWidth * 0.8,
                                  );
                                  const maxHeight = Math.min(
                                    900,
                                    screenHeight * 0.8,
                                  );
                                  const width = Math.max(
                                    minWidth,
                                    Math.min(maxWidth, panelSize.width || 420),
                                  );
                                  let height = Math.max(
                                    minHeight,
                                    Math.min(
                                      maxHeight,
                                      panelSize.height || 500,
                                    ),
                                  );
                                  const messageCount = messages.length;
                                  if (messageCount > 10) {
                                    height = Math.min(
                                      maxHeight,
                                      height + (messageCount - 10) * 30,
                                    );
                                  }
                                  const left = Math.max(
                                    50,
                                    Math.min(
                                      screenWidth - width - 50,
                                      window.screenX + 100,
                                    ),
                                  );
                                  const top = Math.max(
                                    50,
                                    Math.min(
                                      screenHeight - height - 50,
                                      window.screenY + 100,
                                    ),
                                  );
                                  return { width, height, left, top };
                                };
                                const { width, height, left, top } =
                                  calculateOptimalSize();
                                window.open(
                                  "/agent",
                                  "BankingAgent",
                                  `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,popup=yes,status=no`,
                                );
                                onPopout?.();
                              }}
                              title="Open agent in new window"
                              aria-label="Open agent in new window"
                            >
                              <span className="ba-popout-item-name">
                                ⧉ New window
                              </span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="ba-popout-status-bar">
                    <span
                      className="ba-server-chip"
                      title="AI Agent — always connected"
                    >
                      <span className="ba-chip-dot" />
                      Agent
                    </span>
                    <span
                      className={`ba-server-chip${mcpStatus.connected ? "" : " ba-server-chip--off"}`}
                      title="MCP Gateway — tool execution layer"
                    >
                      <span className="ba-chip-dot" />
                      MCP Gateway
                      {mcpStatus.toolCount != null &&
                        ` · ${mcpStatus.toolCount} tools`}
                    </span>
                    <span
                      className={`ba-server-chip${isConfigured ? "" : " ba-server-chip--warn"}`}
                      title="PingOne Authorize — token policies and scope approval"
                    >
                      <span className="ba-chip-dot" />
                      Authorize{isConfigured ? "" : " (mock)"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* Two-column body */}
          <div className="ba-body">
            {isLoggedIn && consentBlocked && (
              <div className="ba-consent-denied-banner" role="alert">
                <div className="ba-consent-denied-banner__text">
                  <strong>Access denied.</strong> You declined a high-value
                  transaction. The AI banking assistant is not available for
                  this session. Sign out and sign in again to restore it.
                </div>
                <div className="ba-consent-denied-banner__actions">
                  <button
                    type="button"
                    className="ba-consent-denied-banner__btn ba-consent-denied-banner__btn--secondary"
                    onClick={() => edu?.open(EDU.HUMAN_IN_LOOP, "decline")}
                  >
                    Learn: Human-in-the-loop
                  </button>
                  <button
                    type="button"
                    className="ba-consent-denied-banner__btn"
                    onClick={() => onLogout?.()}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}

            {hitlPendingIntent &&
              (() => {
                const handleHitlConfirm = async () => {
                  const { actionId, intentPayload } = hitlPendingIntent;

                  // MCP Authorize HITL flow — approve via polling endpoint, then retry tool
                  if (hitlPendingIntent.isMcpHitl && hitlPendingIntent.taskId) {
                    const taskId = hitlPendingIntent.taskId;
                    const retryActionId = hitlPendingIntent.actionId;
                    const retryForm = hitlPendingIntent.form;
                    setHitlPendingIntent(null);
                    try {
                      const approveResp = await fetch(
                        `/api/mcp/decision/${taskId}/approve`,
                        {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                        },
                      );
                      if (!approveResp.ok) {
                        const err = await approveResp.json().catch(() => ({}));
                        throw new Error(
                          err.message ||
                            `Approval failed: ${approveResp.status}`,
                        );
                      }
                      addMessage(
                        "assistant",
                        "✅ Approved — retrying your request…",
                        retryActionId,
                      );
                      // Refire with the approved challenge id so the write tool
                      // echoes `_hitl_challenge_id` to the BFF gate; the gate
                      // verifies it (3009) and discharges the consent gate, so
                      // the retry PERMITs instead of re-issuing the 428.
                      runAction(retryActionId, retryForm, {
                        isRefire: true,
                        hitlRetryChallengeId: taskId,
                      });
                    } catch (err) {
                      addMessage(
                        "error",
                        `Failed to approve: ${err.message}`,
                        retryActionId,
                      );
                    }
                    return;
                  }

                  // Sensitive data reveal — confirmed by user, now fetch and display
                  if (hitlPendingIntent.isSensitiveData) {
                    setHitlPendingIntent(null);
                    setNlLoading(true);
                    const sensToastId = toast.loading(
                      "\uD83D\uDD12 Retrieving sensitive account details\u2026",
                    );
                    try {
                      // Grant session consent so get_sensitive_account_details bypasses step-up gate.
                      // HITL approval IS the authorization — no separate MFA/OTP needed in demo mode.
                      try {
                        await fetch("/api/accounts/sensitive-consent", {
                          method: "POST",
                          credentials: "include",
                        });
                      } catch (_) {
                        /* non-fatal; server will fall back to ACR check */
                      }

                      const sensitiveRes = await sendAgentMessage(
                        "Show me my full account details with routing numbers",
                      );
                      if (sensitiveRes.stepUpRequired) {
                        // Consent fetch may have failed silently — fall back to OTP modal
                        addMessage(
                          "assistant",
                          "\uD83D\uDD10 Identity verification required\n\nViewing full account details requires step-up authentication. Please complete the verification to continue.",
                          "sensitive-account-details",
                        );
                        pendingStepUpCallbackRef.current = async () => {
                          setNlLoading(true);
                          const retryToastId = toast.loading(
                            "\uD83D\uDD12 Retrieving sensitive account details\u2026",
                          );
                          try {
                            const retryRes = await sendAgentMessage(
                              "Show me my full account details with routing numbers",
                            );
                            if (retryRes.error || !retryRes.success) {
                              addMessage(
                                "assistant",
                                `\u26A0\uFE0F ${retryRes.error || retryRes.reply || "Could not retrieve sensitive account details."}`,
                                "sensitive-account-details",
                              );
                              toast.update(retryToastId, {
                                render: "\u26A0\uFE0F Could not load details",
                                type: "error",
                                isLoading: false,
                                autoClose: 4000,
                              });
                            } else {
                              let detailsMsg =
                                retryRes.reply ||
                                "Sensitive account details retrieved.";
                              if (retryRes.accountData?.accounts) {
                                const { user: u, accounts: accs } =
                                  retryRes.accountData;
                                let fmt = "## \uD83D\uDCCB Account Details\n\n";
                                if (u) {
                                  fmt += `Customer: ${u.fullName || u.username}\n`;
                                  if (u.email) fmt += `Email: ${u.email}\n\n`;
                                }
                                fmt += "### Your Accounts\n";
                                accs.forEach((acc) => {
                                  fmt += `\n${acc.accountType.toUpperCase()} (${acc.name || acc.accountType})\n`;
                                  fmt += `\u2022 Balance: $${(acc.balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${acc.currency || "USD"}\n`;
                                  const num =
                                    acc.accountNumberFull || acc.accountNumber;
                                  if (num)
                                    fmt += `\u2022 Account #: \`${num}\n`;
                                  if (acc.routingNumber)
                                    fmt += `\u2022 Routing #: \`${acc.routingNumber}\n`;
                                  if (acc.swiftCode)
                                    fmt += `\u2022 SWIFT: \`${acc.swiftCode}\n`;
                                  if (acc.iban)
                                    fmt += `\u2022 IBAN: \`${acc.iban}\n`;
                                  fmt += `\u2022 Status: ${acc.status}\n`;
                                });
                                fmt +=
                                  "\n---\n_Protected by HITL consent \u00B7 scope: `sensitive`_";
                                detailsMsg = fmt;
                              }
                              addMessage(
                                "assistant",
                                detailsMsg,
                                "sensitive-account-details",
                              );
                              if (retryRes.accountData) {
                                setAccountDetailsPanel(retryRes.accountData);
                                setAccountDetailsPanelPos({ x: 200, y: 100 });
                              }
                              toast.update(retryToastId, {
                                render: "\u2705 Account details loaded",
                                type: "success",
                                isLoading: false,
                                autoClose: 3000,
                              });
                            }
                          } catch (retryErr) {
                            addMessage(
                              "error",
                              `Failed to retrieve sensitive data: ${retryErr.message}`,
                              "sensitive-account-details",
                            );
                            toast.update(retryToastId, {
                              render: "\u274C Failed",
                              type: "error",
                              isLoading: false,
                              autoClose: 4000,
                            });
                          } finally {
                            setNlLoading(false);
                          }
                        };
                        setOtpContextLine(
                          "Sensitive account details require identity verification (RFC 9470)",
                        );
                        setShowOtpModal(true);
                        toast.update(sensToastId, {
                          render: "\uD83D\uDD10 MFA required",
                          type: "warning",
                          isLoading: false,
                          autoClose: 4000,
                        });
                        return;
                      }
                      if (sensitiveRes.error || !sensitiveRes.success) {
                        addMessage(
                          "assistant",
                          `\u26A0\uFE0F ${sensitiveRes.error || sensitiveRes.reply || "Could not retrieve sensitive account details."}`,
                          "sensitive-account-details",
                        );
                        toast.update(sensToastId, {
                          render: "\u26A0\uFE0F Could not load details",
                          type: "error",
                          isLoading: false,
                          autoClose: 4000,
                        });
                      } else {
                        let detailsMessage =
                          sensitiveRes.reply ||
                          "Sensitive account details retrieved.";
                        if (
                          sensitiveRes.accountData &&
                          sensitiveRes.accountData.accounts
                        ) {
                          const { user, accounts } = sensitiveRes.accountData;
                          let formattedDetails =
                            "## \uD83D\uDCCB Account Details\n\n";
                          if (user) {
                            formattedDetails += `Customer: ${user.fullName || user.username}\n`;
                            if (user.email)
                              formattedDetails += `Email: ${user.email}\n\n`;
                          }
                          formattedDetails += "### Your Accounts\n";
                          accounts.forEach((acc) => {
                            formattedDetails += `\n${acc.accountType.toUpperCase()} (${acc.name || acc.accountType})\n`;
                            formattedDetails += `\u2022 Balance: $${(acc.balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${acc.currency || "USD"}\n`;
                            const displayAcctNum =
                              acc.accountNumberFull || acc.accountNumber;
                            if (displayAcctNum)
                              formattedDetails += `\u2022 Account #: \`${displayAcctNum}\n`;
                            if (acc.routingNumber)
                              formattedDetails += `\u2022 Routing #: \`${acc.routingNumber}\n`;
                            if (acc.swiftCode)
                              formattedDetails += `\u2022 SWIFT: \`${acc.swiftCode}\n`;
                            if (acc.iban)
                              formattedDetails += `\u2022 IBAN: \`${acc.iban}\n`;
                            formattedDetails += `\u2022 Status: ${acc.status}\n`;
                          });
                          formattedDetails +=
                            "\n---\n_Protected by HITL consent \u00B7 scope: `sensitive`_";
                          detailsMessage = formattedDetails;
                        }
                        addMessage(
                          "assistant",
                          detailsMessage,
                          "sensitive-account-details",
                        );
                        if (sensitiveRes.accountData) {
                          setAccountDetailsPanel(sensitiveRes.accountData);
                          setAccountDetailsPanelPos({ x: 200, y: 100 });
                        }
                        toast.update(sensToastId, {
                          render: "\u2705 Account details loaded",
                          type: "success",
                          isLoading: false,
                          autoClose: 3000,
                        });
                      }
                    } catch (err) {
                      addMessage(
                        "error",
                        `Failed to retrieve sensitive data: ${err.message}`,
                        "sensitive-account-details",
                      );
                      toast.update(sensToastId, {
                        render: "\u274C Failed",
                        type: "error",
                        isLoading: false,
                        autoClose: 4000,
                      });
                    } finally {
                      setNlLoading(false);
                    }
                    return;
                  }

                  // Agent HITL resume flow (LangChain agent)
                  if (actionId === "agent-hitl" && intentPayload?.consentId) {
                    const { consentId: pendingId, originalMessage } =
                      intentPayload;
                    setHitlPendingIntent(null);
                    if (originalMessage) {
                      setNlLoading(true);
                      try {
                        const response = await sendAgentMessage(
                          originalMessage,
                          pendingId,
                        );
                        if (response.tokenEvents?.length) {
                          appendTokenEvents(response.tokenEvents);
                          if (tokenChain) {
                            tokenChain.setTokenEvents(
                              "agent",
                              response.tokenEvents,
                            );
                          }
                        }
                        addMessage(
                          "assistant",
                          response.reply || "✅ Operation completed.",
                        );
                      } catch (err) {
                        addMessage(
                          "error",
                          `Failed to resume after consent: ${err.message}`,
                        );
                      } finally {
                        setNlLoading(false);
                      }
                    }
                    return;
                  }

                  // Existing transaction HITL flow
                  try {
                    const { data } = await bffAxios.post(
                      "/api/transactions/consent-challenge",
                      intentPayload,
                    );
                    const cid = data?.challengeId;
                    if (!cid) {
                      notifyError(
                        "Could not start consent — no challenge id from server.",
                      );
                      setHitlPendingIntent(null);
                      return;
                    }
                    // Pass snapshot from POST response directly — avoids GET race on Vercel
                    // Store the original form so we can re-fire the tool with consentChallengeId
                    setHitlChallengeId({
                      challengeId: cid,
                      actionId,
                      snapshot: data.snapshot || null,
                      form: hitlPendingIntent.form || {},
                    });
                    setHitlPendingIntent(null);
                  } catch (ex) {
                    const msg =
                      ex.response?.data?.message ||
                      ex.response?.data?.error ||
                      ex.message ||
                      "Could not start consent flow.";
                    notifyError(msg);
                    setHitlPendingIntent(null);
                  }
                };
                const handleHitlCancel = async () => {
                  // MCP HITL: also POST deny to the polling endpoint
                  if (hitlPendingIntent.isMcpHitl && hitlPendingIntent.taskId) {
                    try {
                      await fetch(
                        `/api/mcp/decision/${hitlPendingIntent.taskId}/deny`,
                        {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                        },
                      );
                    } catch {
                      /* best-effort */
                    }
                    addMessage(
                      "assistant",
                      " You denied the MCP tool authorization request.",
                      hitlPendingIntent.actionId,
                    );
                  }
                  setHitlPendingIntent(null);
                };
                return (
                  <AgentConsentModal
                    transaction={hitlPendingIntent.intentPayload}
                    hitlThreshold={hitlPendingIntent.threshold ?? 500}
                    onAccept={handleHitlConfirm}
                    onDismiss={handleHitlCancel}
                  />
                );
              })()}

            {/* ── Scope-upgrade consent modal (Phase 211) ── */}
            {scopeErrorModal && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 9999,
                  background: "rgba(0,0,0,0.55)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    background: "var(--color-bg-card, #1a1d27)",
                    border: "1px solid var(--color-border, #2e3147)",
                    borderRadius: "12px",
                    padding: "28px 32px",
                    maxWidth: "540px",
                    width: "100%",
                    boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
                    color: "var(--color-text, #e2e4ef)",
                    fontFamily: "inherit",
                  }}
                >
                  {/* ── error state ────────────────────────────────────────────────────────────────────────── */}
                  {scopeErrorModal.scopeUpgradeState === "error" && (
                    <>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          marginBottom: "16px",
                        }}
                      >
                        <span style={{ fontSize: "22px" }}></span>
                        <h3
                          style={{
                            margin: 0,
                            fontSize: "17px",
                            fontWeight: 700,
                          }}
                        >
                          Scope Upgrade Required
                        </h3>
                      </div>
                      <p
                        style={{
                          margin: "0 0 12px",
                          lineHeight: 1.6,
                          fontSize: "14px",
                        }}
                      >
                        This action requires{"  "}
                        <code
                          style={{
                            background: "rgba(255,200,80,0.15)",
                            padding: "1px 6px",
                            borderRadius: "4px",
                          }}
                        >
                          write
                        </code>
                        {"  "}scope. Your current MCP token does not include it.
                        You can approve a scope upgrade — the BFF will exchange
                        your token for a write-capable version via{"  "}
                        <strong>RFC 8693</strong>.
                      </p>
                      <div
                        style={{
                          background: "rgba(255,80,80,0.08)",
                          border: "1px solid rgba(255,80,80,0.25)",
                          borderRadius: "8px",
                          padding: "12px 14px",
                          marginBottom: "16px",
                          fontSize: "13px",
                        }}
                      >
                        <div style={{ marginBottom: "6px" }}>
                          <span style={{ opacity: 0.7 }}>Missing scopes:</span>{" "}
                          {(scopeErrorModal.missingScopes &&
                          scopeErrorModal.missingScopes.length
                            ? scopeErrorModal.missingScopes
                            : ["write"]
                          ).map((s) => (
                            <code
                              key={s}
                              style={{
                                background: "rgba(255,80,80,0.15)",
                                borderRadius: "4px",
                                padding: "1px 6px",
                                marginLeft: "4px",
                                fontSize: "12px",
                              }}
                            >
                              {s}
                            </code>
                          ))}
                        </div>
                        <div>
                          <span style={{ opacity: 0.7 }}>Your token has:</span>{" "}
                          {(scopeErrorModal.userScopes || "")
                            .split(" ")
                            .filter(Boolean)
                            .map((s) => (
                              <code
                                key={s}
                                style={{
                                  background: "rgba(100,100,200,0.15)",
                                  borderRadius: "4px",
                                  padding: "1px 6px",
                                  marginLeft: "4px",
                                  fontSize: "12px",
                                }}
                              >
                                {s}
                              </code>
                            ))}
                        </div>
                      </div>
                      {scopeErrorModal.upgradeError && (
                        <p
                          style={{
                            color: "var(--color-error, #f87171)",
                            fontSize: "13px",
                            marginBottom: "12px",
                          }}
                        >
                          {scopeErrorModal.upgradeError}
                        </p>
                      )}
                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setScopeErrorModal(null)}
                          style={{
                            padding: "8px 20px",
                            borderRadius: "8px",
                            border: "1px solid var(--color-border, #2e3147)",
                            background: "transparent",
                            color: "var(--color-text, #e2e4ef)",
                            fontWeight: 600,
                            fontSize: "14px",
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setScopeErrorModal((prev) =>
                              prev
                                ? { ...prev, scopeUpgradeState: "confirm" }
                                : prev,
                            )
                          }
                          style={{
                            padding: "8px 20px",
                            borderRadius: "8px",
                            border: "none",
                            background: "var(--color-primary, #4f7df3)",
                            color: "#fff",
                            fontWeight: 600,
                            fontSize: "14px",
                            cursor: "pointer",
                          }}
                        >
                          Approve Scope Upgrade
                        </button>
                      </div>
                    </>
                  )}

                  {/* ── confirm state ────────────────────────────────────────────────────────────────────────── */}
                  {scopeErrorModal.scopeUpgradeState === "confirm" && (
                    <>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          marginBottom: "16px",
                        }}
                      >
                        <h3
                          style={{
                            margin: 0,
                            fontSize: "17px",
                            fontWeight: 700,
                          }}
                        >
                          Confirm Scope Upgrade
                        </h3>
                      </div>
                      <p
                        style={{
                          margin: "0 0 16px",
                          lineHeight: 1.6,
                          fontSize: "14px",
                        }}
                      >
                        You are granting the AI agent{" "}
                        <code
                          style={{
                            background: "rgba(100,200,100,0.12)",
                            padding: "1px 6px",
                            borderRadius: "4px",
                          }}
                        >
                          write
                        </code>{" "}
                        access for this session. This allows the agent to
                        complete{"  "}
                        <strong>transfers, deposits, and withdrawals</strong> on
                        your behalf.
                      </p>
                      <p
                        style={{
                          margin: "0 0 16px",
                          lineHeight: 1.6,
                          fontSize: "13px",
                          opacity: 0.8,
                        }}
                      >
                        The BFF will perform an{"  "}
                        <strong>RFC 8693 Token Exchange</strong> — your user
                        access token becomes the subject, the agent client is
                        the actor, and the result is a narrowly-scoped MCP token
                        valid for this session only.
                      </p>
                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setScopeErrorModal((prev) =>
                              prev
                                ? { ...prev, scopeUpgradeState: "error" }
                                : prev,
                            )
                          }
                          style={{
                            padding: "8px 20px",
                            borderRadius: "8px",
                            border: "1px solid var(--color-border, #2e3147)",
                            background: "transparent",
                            color: "var(--color-text, #e2e4ef)",
                            fontWeight: 600,
                            fontSize: "14px",
                            cursor: "pointer",
                          }}
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={handleScopeUpgradeConfirm}
                          style={{
                            padding: "8px 20px",
                            borderRadius: "8px",
                            border: "none",
                            background: "var(--color-primary, #4f7df3)",
                            color: "#fff",
                            fontWeight: 600,
                            fontSize: "14px",
                            cursor: "pointer",
                          }}
                        >
                          Confirm &amp; Exchange Token
                        </button>
                      </div>
                    </>
                  )}

                  {/* ── exchanging state ──────────────────────────────────────────────────────────────────────── */}
                  {scopeErrorModal.scopeUpgradeState === "exchanging" && (
                    <>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          marginBottom: "16px",
                        }}
                      >
                        <h3
                          style={{
                            margin: 0,
                            fontSize: "17px",
                            fontWeight: 700,
                          }}
                        >
                          Exchanging Token…
                        </h3>
                      </div>
                      <p style={{ margin: 0, fontSize: "14px", opacity: 0.8 }}>
                        Performing RFC 8693 token exchange to obtain a{" "}
                        <code style={{ padding: "1px 5px" }}>
                          write
                        </code>
                        {"-scoped MCP token."}
                      </p>
                    </>
                  )}

                  {/* ── done state ───────────────────────────────────────────────────────────────────────────────── */}
                  {scopeErrorModal.scopeUpgradeState === "done" && (
                    <>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          marginBottom: "16px",
                        }}
                      >
                        <span style={{ fontSize: "22px" }}>✅</span>
                        <h3
                          style={{
                            margin: 0,
                            fontSize: "17px",
                            fontWeight: 700,
                          }}
                        >
                          Scope Upgraded — Replaying Request
                        </h3>
                      </div>
                      <p style={{ margin: 0, fontSize: "14px", opacity: 0.8 }}>
                        Write-scoped MCP token obtained. Retrying your original
                        request automatically…
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* OTP + transaction execution — rendered once challenge is created */}
            {hitlChallengeId && (
              <TransactionConsentModal
                open
                challengeId={hitlChallengeId.challengeId}
                preloadedSnapshot={hitlChallengeId.snapshot}
                user={effectiveUser}
                onClose={() => setHitlChallengeId(null)}
                onTransactionSuccess={(msg) => {
                  const { actionId, challengeId, form } = hitlChallengeId;
                  setHitlChallengeId(null);
                  addMessage(
                    "assistant",
                    ` Consent verified.\n\nNow checking for additional verification requirements...`,
                    actionId,
                  );
                  // Re-fire the original tool with consentChallengeId so API can check step-up
                  // Use the *WithConsent versions to properly pass consentChallengeId through
                  setTimeout(async () => {
                    try {
                      let response;
                      if (actionId === "transfer") {
                        response = await createTransferWithConsent(
                          form.fromId,
                          form.toId,
                          parseFloat(form.amount),
                          form.note,
                          challengeId,
                        );
                      } else if (actionId === "deposit") {
                        response = await createDepositWithConsent(
                          form.toId || form.accountId,
                          parseFloat(form.amount),
                          form.note,
                          challengeId,
                        );
                      } else if (actionId === "withdraw") {
                        response = await createWithdrawalWithConsent(
                          form.fromId || form.accountId,
                          parseFloat(form.amount),
                          form.note,
                          challengeId,
                        );
                      }
                      // Response should contain success
                      if (response?.result?.transaction_id) {
                        console.log(
                          "[HITL Consent] Transaction successful:",
                          response.result.transaction_id,
                        );
                        addMessage(
                          "assistant",
                          `✅ Transaction completed successfully. ID: ${response.result.transaction_id}`,
                          actionId,
                        );
                      }
                    } catch (err) {
                      // callRestTransaction throws on non-2xx status codes, so we handle 428 (step_up_required) here
                      if (
                        err.statusCode === 428 &&
                        err.code === "step_up_required"
                      ) {
                        console.log(
                          "[HITL Consent] Step-up required, triggering MFA",
                        );
                        addMessage(
                          "assistant",
                          " Additional verification required.\n\nPlease verify your identity.",
                          actionId,
                        );
                        // Extract step-up method from error response
                        const stepUpMethod = err.data?.step_up_method || "otp"; // Default to OTP
                        console.log(
                          "[HITL Consent] Step-up method:",
                          stepUpMethod,
                          "full data:",
                          err.data,
                        );
                        setStepUpMethod(stepUpMethod);

                        // If P1MFA mode, fetch devices
                        if (stepUpMethod === "p1mfa") {
                          try {
                            const apiBase = process.env.REACT_APP_API_URL || "";
                            const mfaResp = await fetch(
                              `${apiBase}/api/auth/mfa/challenge`,
                              {
                                method: "POST",
                                credentials: "include",
                                headers: { "Content-Type": "application/json" },
                              },
                            );
                            if (!mfaResp.ok)
                              throw new Error(
                                `MFA initiation failed: ${mfaResp.status}`,
                              );
                            const { daId, devices } = await mfaResp.json();
                            console.log("[HITL Consent] P1MFA initialized:", {
                              daId,
                              deviceCount: devices?.length || 0,
                            });
                            setP1mfaDaId(daId);
                            setP1mfaDevices(devices || []);
                            setP1mfaMode(true);
                          } catch (mfaErr) {
                            console.error(
                              "[HITL Consent] P1MFA initiation failed, falling back to stub:",
                              mfaErr,
                            );
                            setP1mfaMode(false);
                          }
                        } else {
                          setP1mfaMode(false);
                        }

                        setShowOtpModal(true);
                      } else {
                        console.error(
                          "[HITL Consent] Re-fire tool failed:",
                          err,
                        );
                        notifyError(
                          "Transaction processing failed. Please try again.",
                        );
                      }
                    }
                  }, 500);
                }}
                onDeclinedConfirmed={() => {
                  setHitlChallengeId(null);
                  addMessage(
                    "assistant",
                    "❌ Transaction declined.\n\nThe transaction was not completed.",
                    hitlChallengeId.actionId,
                  );
                }}
              />
            )}

            {/* OTP/FIDO Step-Up Modal (Phase 174) */}
            {stepUpMethod === "fido" && !p1mfaMode ? (
              <FidoStepUpModal
                show={showOtpModal}
                contextLine={otpContextLine}
                onSubmit={handleFidoSubmit}
                onCancel={handleOtpCancel}
                fallbackToOtp={handleSwitchToOtp}
              />
            ) : (
              <OtpStepUpModal
                show={showOtpModal}
                contextLine={otpContextLine}
                onSubmit={handleOtpSubmit}
                onCancel={handleOtpCancel}
                allowFido={supportsFido && !p1mfaMode}
                onSwitchToFido={handleSwitchToFido}
                mode={p1mfaMode ? "p1mfa" : "stub"}
                daId={p1mfaDaId}
                devices={p1mfaDevices}
                onP1MfaComplete={handleP1MfaComplete}
                onP1MfaError={handleP1MfaError}
              />
            )}

            {/* Gateway HITL Consent Modal — hitl_required from /api/banking-agent/message */}
            <GatewayConsentModal
              show={!!gatewayHitlChallenge}
              challengeId={gatewayHitlChallenge?.challengeId || ""}
              challengeType={gatewayHitlChallenge?.challengeType || "consent"}
              expiresAt={gatewayHitlChallenge?.expiresAt || ""}
              onApprove={() => setGatewayHitlChallenge(null)}
              onDismiss={() => setGatewayHitlChallenge(null)}
            />

            {/* AG-UI Step 7 — HITL interrupt consent modal */}
            <GatewayConsentModal
              show={!!aguiHitlPending}
              challengeId={aguiHitlPending?.id || ""}
              challengeType="consent"
              expiresAt={aguiHitlPending?.expiresAt || ""}
              onApprove={handleAguiHitlApprove}
              onDismiss={handleAguiHitlDismiss}
            />

            {/* Transaction failure modal — replaces auto-closing toast for write actions */}
            {txErrorModal && (
              <div
                className="ba-tx-error-overlay"
                onClick={() => setTxErrorModal(null)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setTxErrorModal(null);
                }}
                role="dialog"
                aria-modal="true"
                aria-label="Transaction error"
              >
                <div className="ba-tx-error-modal">
                  <div className="ba-tx-error-modal__header">
                    ❌ {txErrorModal.title}
                  </div>
                  <div className="ba-tx-error-modal__body">
                    {typeof txErrorModal.message === "string" ? txErrorModal.message : JSON.stringify(txErrorModal.message)}
                  </div>
                  <button
                    type="button"
                    className="ba-tx-error-modal__close"
                    onClick={() => setTxErrorModal(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* MCP Tools List Modal */}
            <MCPToolsListModal
              show={showMcpToolsModal}
              onClose={() => setShowMcpToolsModal(false)}
              tools={mcpToolsList}
            />

            {/* Demo Guide Modal */}
            {showDemoGuide && (
              <AgentDemoGuide onClose={() => setShowDemoGuide(false)} />
            )}

            {/* Account Details Side Panel */}
            {accountDetailsPanel && (
              <AccountDetailsPanel
                accountData={accountDetailsPanel}
                initialPos={accountDetailsPanelPos}
                onClose={() => setAccountDetailsPanel(null)}
              />
            )}

            {/* ── Left column: suggestions + actions/auth ── */}
            {!useActionsPopout && (
              <div className="ba-left-col">
                {isLoggedIn && (
                  <div className="ba-session-row">
                    <button
                      type="button"
                      className="ba-action-item"
                      onClick={() => void handleSessionRefresh()}
                      disabled={sessionRefreshing || loading || consentBlocked}
                      title="Refresh your access token using PingOne refresh token (no logout)"
                    >
                      {sessionRefreshing ? "Refreshing…" : "Refresh"}
                    </button>
                    <button
                      type="button"
                      className="ba-action-item"
                      onClick={() => onLogout?.()}
                      disabled={loading}
                      title="Sign out of your session"
                    >
                      Sign out
                    </button>
                  </div>
                )}

                {suggestionList.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="ba-suggestion"
                    disabled={consentBlocked}
                    onClick={() => {
                      if (isAgentBlockedByConsentDecline()) {
                        addMessage(
                          "assistant",
                          AGENT_CONSENT_BLOCK_USER_MESSAGE,
                        );
                        return;
                      }
                      setNlInput(s);
                      if (isLoggedIn || marketingGuestChatEnabled) {
                        // Save chip text before clearing input — if an auth error fires mid-flight
                        // and triggers handleLoginAction (which reads sessionStorage), the prompt survives.
                        try {
                          sessionStorage.setItem(
                            BX_AGENT_PENDING_NL_KEY,
                            s.trim(),
                          );
                        } catch (_) {}
                        setNlInput("");
                        addMessage("user", s);
                        setNlLoading(true);
                        // Chip dispatch: check for log queries before hitting BFF sendAgentMessage.
                        // "Show me last 5 errors" is handled client-side via parseLogPrompt to avoid LLM fallback.
                        const _chipLogQuery = parseLogPrompt(s);
                        if (_chipLogQuery && _chipLogQuery.type === "errors") {
                          (async () => {
                            try {
                              const _params = new URLSearchParams({
                                level: "error",
                                limit: String(_chipLogQuery.limit),
                              });
                              const _sources = ["console", "app", "vercel"];
                              const _results = await Promise.allSettled(
                                _sources.map((src) =>
                                  fetch(
                                    `/api/logs/${src}?${_params.toString()}`,
                                    {
                                      credentials: "include",
                                    },
                                  ),
                                ),
                              );
                              const _merged = [];
                              for (let _i = 0; _i < _results.length; _i += 1) {
                                const _r = _results[_i];
                                if (_r.status !== "fulfilled" || !_r.value.ok)
                                  continue;
                                const _body = await _r.value.json();
                                (_body.logs || []).forEach((log) => {
                                  _merged.push({ ...log, _src: _sources[_i] });
                                });
                              }
                              const _top = _merged
                                .sort(
                                  (a, b) =>
                                    new Date(b.timestamp || 0) -
                                    new Date(a.timestamp || 0),
                                )
                                .slice(0, _chipLogQuery.limit);
                              if (_top.length === 0) {
                                addMessage(
                                  "assistant",
                                  `No error logs found in the last ${_chipLogQuery.limit} entries.`,
                                );
                              } else {
                                const _lines = _top.map((l, idx) => {
                                  const when = new Date(
                                    l.timestamp || Date.now(),
                                  ).toLocaleString();
                                  return `${idx + 1}. [${(l.level || "error").toUpperCase()}] (${l._src}) ${when}\n   ${String(l.message || "").slice(0, 180)}`;
                                });
                                addMessage(
                                  "assistant",
                                  `Last ${_top.length} errors:\n\n${_lines.join("\n\n")}`,
                                );
                              }
                              try {
                                sessionStorage.removeItem(
                                  BX_AGENT_PENDING_NL_KEY,
                                );
                              } catch (_) {}
                            } catch (_chipErr) {
                              addMessage(
                                "assistant",
                                `Could not fetch error logs: ${_chipErr.message}`,
                              );
                            } finally {
                              setNlLoading(false);
                            }
                          })();
                        } else {
                          (async () => {
                            try {
                              const _chipNlRes = await fetch(
                                "/api/banking-agent/nl",
                                {
                                  method: "POST",
                                  credentials: "include",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    message: s,
                                    provider: activeLlmProvider || "heuristic",
                                  }),
                                  signal: AbortSignal.timeout(15000),
                                },
                              );
                              const { result: _chipNlResult } = await _chipNlRes
                                .json()
                                .catch(() => ({
                                  result: {
                                    kind: "none",
                                    message: "Could not parse request.",
                                  },
                                }));
                              try {
                                sessionStorage.removeItem(
                                  BX_AGENT_PENDING_NL_KEY,
                                );
                              } catch (_) {}
                              await dispatchNlResult(_chipNlResult, "nl", s);
                            } catch (err) {
                              reportNlFailure(err);
                            } finally {
                              setNlLoading(false);
                            }
                          })();
                        }
                      }
                    }}
                  >
                    "{s}"
                  </button>
                ))}

                <div className="ba-left-divider" />

                {isLoggedIn ? (
                  <>
                    {isLoggedIn && renderActionGroups()}

                    <div className="ba-left-divider" />

                    <div className="ba-left-divider" />

                    {/* "All actions" discovery popout trigger */}
                    <button
                      ref={discoveryTriggerRef}
                      type="button"
                      className={
                        "ba-all-actions-btn" + (showDiscovery ? " active" : "")
                      }
                      onClick={() => setShowDiscovery((v) => !v)}
                      disabled={consentBlocked}
                      aria-expanded={showDiscovery}
                      aria-haspopup="dialog"
                    >
                      ⊞ All actions
                    </button>
                  </>
                ) : (
                  <>
                    {/* Enhanced unauthenticated agent chip group with login prompt */}
                    <div className="ba-left-guest-chips">
                      <div className="ba-left-label">
                        Get started with AI Demo:
                      </div>

                      {/* Primary login chip - more prominent */}
                      <button
                        type="button"
                        className="ba-action-item ba-action-item--login"
                        onClick={() => handleLoginAction("login_user")}
                      >
                        <span className="ba-action-item-text">
                          <span className="ba-action-item-title">
                            Sign in to access banking features
                          </span>
                          <span className="ba-action-item-desc">
                            Secure login with PingOne
                          </span>
                        </span>
                        <span className="ba-action-item-arrow">&#8594;</span>
                      </button>

                      <div className="ba-left-label-secondary">
                        Or explore these topics:
                      </div>

                      {/* Educational chips */}
                      <div className="ba-guest-chips-grid">
                        {[
                          { id: "guest_oauth", label: "What is OAuth?" },
                          { id: "guest_pkce", label: "Explain PKCE" },
                          { id: "guest_mcp", label: "Explain MCP" },
                          { id: "guest_agent", label: "How AI agents work" },
                        ].map((chip) => (
                          <button
                            key={chip.id}
                            type="button"
                            className="ba-action-item ba-action-item--guest"
                            onClick={() => {
                              setNlInput("");
                              addMessage("user", chip.label);
                              setNlLoading(true);
                              (async () => {
                                try {
                                  const _guestNlRes = await fetch(
                                    "/api/banking-agent/nl",
                                    {
                                      method: "POST",
                                      credentials: "include",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify({
                                        message: chip.label,
                                        provider: activeLlmProvider || "heuristic",
                                      }),
                                      signal: AbortSignal.timeout(15000),
                                    },
                                  );
                                  const { result: _guestNlResult } =
                                    await _guestNlRes.json().catch(() => ({
                                      result: {
                                        kind: "none",
                                        message: "Could not parse request.",
                                      },
                                    }));
                                  await dispatchNlResult(
                                    _guestNlResult,
                                    "nl",
                                    chip.label,
                                  );
                                } catch (err) {
                                  reportNlFailure(err);
                                } finally {
                                  setNlLoading(false);
                                }
                              })();
                            }}
                          >
                            <span className="ba-action-item-text">
                              {chip.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="ba-left-auth">
                      <div className="ba-left-auth-notice">
                        {marketingGuestChatEnabled
                          ? "Banking uses PingOne — we’ll redirect you when you ask for accounts, transfers, etc."
                          : "Sign in required to access AI banking features"}
                      </div>
                      <button
                        type="button"
                        className="ba-left-auth-btn primary"
                        onClick={() => handleLoginAction("login_user")}
                        disabled={oauthConfig === null || !oauthConfig?.user}
                        title={
                          oauthConfig?.user
                            ? "Sign in as a bank customer"
                            : "Configure credentials first"
                        }
                      >
                        Customer Sign In
                      </button>
                      <button
                        type="button"
                        className="ba-left-auth-btn"
                        onClick={() => handleLoginAction("login_admin")}
                        disabled={oauthConfig === null || !oauthConfig?.admin}
                        title={
                          oauthConfig?.admin
                            ? "Sign in as administrator"
                            : "Configure credentials first"
                        }
                      >
                        Admin Sign In
                      </button>
                      <button
                        type="button"
                        className={`ba-left-config-btn${isConfigured ? " configured" : ""}`}
                        onClick={() => {
                          setIsOpen(false);
                          navigate("/config");
                        }}
                      >
                        {isConfigured
                          ? "PingOne Configured"
                          : "Configure PingOne"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="ba-right-col">
              {/* Messages */}
              <div
                className="banking-agent-messages"
                ref={messagesContainerRef}
              >
                {messages.length === 0 && (
                  <div className="ba-welcome">
                    <p>
                      {isLoggedIn
                        ? "Type a message or use Actions to explore."
                        : marketingGuestChatEnabled
                          ? isConfigured
                            ? "Ask about OAuth or try a suggestion - we will open PingOne only when you need banking."
                            : "Set up PingOne in Application setup - you can still ask general questions once configured."
                          : isConfigured
                            ? "PingOne is configured - sign in to get started."
                            : "Set up your PingOne credentials to get started."}
                    </p>
                  </div>
                )}
                {messages
                  .filter(
                    (msg) =>
                      msg.role === "user" ||
                      msg.role === "assistant" ||
                      (showRfcInfo && msg.role === "token-event"),
                  )
                  .map((msg) => {
                    if (msg.role === "reasoning") {
                      return (
                        <div
                          key={msg.id}
                          className="banking-agent-msg reasoning"
                        >
                          <span
                            className="banking-agent-msg-avatar banking-agent-msg-avatar--tool"
                            aria-hidden
                          >
                            [R]
                          </span>
                          <div className="banking-agent-msg-bubble banking-agent-msg-bubble--reasoning">
                            <ReasoningSteps
                              steps={msg.steps}
                              conclusion={msg.conclusion}
                            />
                          </div>
                        </div>
                      );
                    }
                    if (msg.role === "tool-progress") {
                      return (
                        <div
                          key={msg.id}
                          className="banking-agent-msg tool-progress"
                        >
                          <span
                            className="banking-agent-msg-avatar banking-agent-msg-avatar--tool"
                            aria-hidden
                          >
                            [T]
                          </span>
                          <div className="banking-agent-msg-bubble banking-agent-msg-bubble--toolsteps">
                            <ToolProgressChips steps={msg.steps} />
                          </div>
                        </div>
                      );
                    }
                    if (msg.role === "error" && msg.showSessionFixActions) {
                      return (
                        <div key={msg.id} className="banking-agent-msg error">
                          <div className="banking-agent-msg-bubble banking-agent-msg-bubble--session-fix">
                            <MessageContent text={msg.content} terminology={terminology} />
                            <div className="ba-session-fix-actions">
                              <button
                                type="button"
                                className="ba-session-fix-btn ba-session-fix-btn--secondary"
                                onClick={() =>
                                  window.open(
                                    "/api/auth/debug?deep=1",
                                    "_blank",
                                    "noopener,noreferrer",
                                  )
                                }
                              >
                                Open session debug
                              </button>
                              <button
                                type="button"
                                className="ba-session-fix-btn ba-session-fix-btn--secondary"
                                onClick={() => handleLoginAction("login_admin")}
                              >
                                Admin
                              </button>
                              <button
                                type="button"
                                className="ba-session-fix-btn ba-session-fix-btn--secondary"
                                onClick={() => handleLoginAction("login_user")}
                              >
                                Login
                              </button>
                              <button
                                type="button"
                                className="ba-session-fix-btn"
                                onClick={() => onLogout?.()}
                              >
                                Sign out (then sign in again)
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={msg.id}
                        className={`banking-agent-msg ${msg.role}`}
                        data-source={msg.source}
                      >
                        {msg.role === "user" && (
                          <span
                            className="banking-agent-msg-avatar banking-agent-msg-avatar--user"
                            aria-hidden
                          >
                            You
                          </span>
                        )}
                        {msg.role === "assistant" && (
                          <span className="banking-agent-msg-avatar banking-agent-msg-avatar--helix">
                            <img
                              src="/images/helix.png"
                              alt="AI"
                              style={{
                                width: 22,
                                height: "auto",
                                display: "block",
                              }}
                            />
                          </span>
                        )}
                        <div>
                          {msg.source && msg.role === "assistant" && (
                            <div
                              className={`banking-agent-msg-label banking-agent-msg-label--${msg.source}`}
                            >
                              {msg.source === "heuristic"
                                ? "Heuristic"
                                : msg.source === "helix"
                                  ? "Helix LLM"
                                  : msg.source === "ollama"
                                    ? "Ollama LLM"
                                    : msg.source}
                            </div>
                          )}
                          <div
                            className={`banking-agent-msg-bubble${msg.tool ? " banking-agent-msg-bubble--tool-result" : ""}`}
                          >
                            <MessageContent text={msg.content} terminology={terminology} />
                            {msg.tool && (
                              <span className="banking-agent-tool-badge">
                                {msg.tool}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                {nlLoading && (
                  <div className="banking-agent-msg user">
                    <span
                      className="banking-agent-msg-avatar banking-agent-msg-avatar--user"
                      aria-hidden
                    >
                      You
                    </span>
                    <div>
                      <div className="banking-agent-msg-bubble ba-typing-indicator">
                        <span className="ba-typing-dot" />
                        <span className="ba-typing-dot" />
                        <span className="ba-typing-dot" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Compliance 12-step panel — inline (default) or hidden when pop-out is active */}
              {showCompliancePanel &&
                !complianceSlideout &&
                {
                  /* ba-compliance-panel direct render removed; use ComplianceModal only */
                }}

              {/* Compliance 12-step panel — draggable, resizable modal */}
              <ComplianceModal
                open={showCompliancePanel && complianceSlideout}
                onClose={() => setComplianceSlideout(false)}
                complianceStripState={complianceStripState}
                messages={messages}
                onClearSteps={() => {
                  try {
                    agentFlowDiagram.resetComplianceSteps();
                  } catch (_) {}
                }}
                CHIP_APPLICABLE_STEPS={CHIP_APPLICABLE_STEPS}
                getStepSkipExplanation={getStepSkipExplanation}
              />

              {/* Bottom input bar */}
              <div className="ba-bottom">
                {isLoggedIn || marketingGuestChatEnabled ? (
                  <>
                    <div className="ba-input-row">
                      <input
                        ref={nlInputRef}
                        className="ba-input"
                        value={nlInput}
                        onChange={(e) => {
                          setNlInput(e.target.value);
                          setHistoryIndex(-1);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (nlInput.trim()) {
                              const newHistory = [
                                nlInput,
                                ...inputHistory,
                              ].slice(0, 10);
                              setInputHistory(newHistory);
                            }
                            handleNaturalLanguage();
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            const newIndex = Math.min(
                              historyIndex + 1,
                              inputHistory.length - 1,
                            );
                            if (
                              newIndex >= 0 &&
                              newIndex < inputHistory.length
                            ) {
                              setHistoryIndex(newIndex);
                              setNlInput(inputHistory[newIndex]);
                            }
                          } else if (e.key === "ArrowDown") {
                            e.preventDefault();
                            if (historyIndex > 0) {
                              const newIndex = historyIndex - 1;
                              setHistoryIndex(newIndex);
                              setNlInput(inputHistory[newIndex]);
                            } else if (historyIndex === 0) {
                              setHistoryIndex(-1);
                              setNlInput("");
                            }
                          }
                        }}
                        placeholder={
                          marketingGuestChatEnabled && !isLoggedIn
                            ? `Ask about OAuth or type a request…`
                            : splitChrome && !nlMeta?.groqConfigured
                              ? `Ask about your ${terminology?.accounts || "accounts"}…`
                              : nlMeta?.groqConfigured
                                ? `Message ${brandShortName} AI… (Groq AI)`
                                : `Message ${brandShortName} AI…`
                        }
                        disabled={nlLoading || consentBlocked}
                      />
                      <button
                        type="button"
                        className="ba-send-btn"
                        onClick={() => {
                          handleNaturalLanguage();
                        }}
                        disabled={
                          nlLoading || !nlInput.trim() || consentBlocked
                        }
                        aria-label="Send"
                      >
                        {nlLoading ? "…" : "Send"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      padding: "10px 12px",
                      textAlign: "center",
                      color: "var(--ba-muted)",
                      fontSize: "12px",
                    }}
                  >
                    Sign in using the buttons on the left to start chatting
                  </div>
                )}
              </div>

              {/* Start Over + nav + chips — always visible below input bar */}
              <div className="ba-bottom-extra">
                {/* Start Over button — clear conversation */}
                {messages.length > 0 && (
                  <button
                    type="button"
                    className="ba-start-over-btn"
                    onClick={() => {
                      setMessages([]);
                      setNlInput("");
                      setInputHistory([]);
                      setHistoryIndex(-1);
                    }}
                    title="Clear conversation and start fresh"
                  >
                    Start Over
                  </button>
                )}

                {/* Dashboard navigation button — pinned below prompt (hidden on marketing pages) */}
                {isLoggedIn &&
                  !isPublicMarketingAgentPath(
                    (location.pathname || "").replace(/\/$/, "") || "/",
                  ) && (
                    <button
                      type="button"
                      className="ba-left-auth-btn primary"
                      style={{ display: "block" }}
                      onClick={() => {
                        setIsOpen(false);
                        navigate(
                          effectiveUser?.role === "admin"
                            ? "/admin"
                            : "/dashboard",
                        );
                      }}
                    >
                      {effectiveUser?.role === "admin"
                        ? "Admin Dashboard"
                        : "My Dashboard"}
                    </button>
                  )}

                {/* Connected services chips — below prompt */}
                <div className="ba-chips-footer">
                  <span
                    className="ba-server-chip ba-server-chip--active"
                    title={
                      isConfigEmbeddedFocus
                        ? "MCP tools (same server — use for discovery)"
                        : "AI tools service — connected"
                    }
                  >
                    <span className="ba-chip-dot" />
                    {isConfigEmbeddedFocus ? "MCP tools" : "AI Tools"}
                    {mcpStatus.connected && mcpStatus.toolCount != null && (
                      <span className="ba-chip-count">
                        {mcpStatus.toolCount} actions
                      </span>
                    )}
                  </span>
                  <span
                    className="ba-server-chip ba-server-chip--active"
                    title="PingOne Identity — connected"
                  >
                    <span className="ba-chip-dot" />
                    PingOne Identity
                  </span>
                  <span
                    className="ba-server-chip ba-server-chip--active"
                    title="MCP Gateway"
                  >
                    <span className="ba-chip-dot" />
                    MCP Gateway
                  </span>
                  <span
                    className="ba-server-chip ba-server-chip--active"
                    title="PingOne Authorize"
                  >
                    <span className="ba-chip-dot" />
                    Authorize
                  </span>
                  <span
                    className="ba-server-chip ba-server-chip--active"
                    title="MCP Server"
                  >
                    <span className="ba-chip-dot" />
                    MCP Server
                  </span>
                </div>
              </div>
              {/* Token Teller — session + lifetime token counter */}
              <div className="ba-token-footer">
                <span>⬆ {sessionTokens.input.toLocaleString()} in</span>
                <span>⬇ {sessionTokens.output.toLocaleString()} out</span>
                <span>∑ {(lifetimeTokens.input + lifetimeTokens.output).toLocaleString()}</span>
              </div>
            </div>
          </div>
          {/* Resize handles — all 8 directions, float mode only */}
          {!isInline && (
            <>
              <div
                role="button"
                tabIndex="0"
                className="ba-resize-handle ba-resize-handle--se"
                onPointerDown={(e) => handleResize(e, "se")}
                aria-label="Resize southeast"
              />
              <div
                role="button"
                tabIndex="0"
                className="ba-resize-handle ba-resize-handle--e"
                onPointerDown={(e) => handleResize(e, "e")}
                aria-label="Resize east"
              />
              <div
                role="button"
                tabIndex="0"
                className="ba-resize-handle ba-resize-handle--s"
                onPointerDown={(e) => handleResize(e, "s")}
                aria-label="Resize south"
              />
              <div
                role="button"
                tabIndex="0"
                className="ba-resize-handle ba-resize-handle--n"
                onPointerDown={(e) => handleResize(e, "n")}
                aria-label="Resize north"
              />
              <div
                role="button"
                tabIndex="0"
                className="ba-resize-handle ba-resize-handle--ne"
                onPointerDown={(e) => handleResize(e, "ne")}
                aria-label="Resize northeast"
              />
              <div
                role="button"
                tabIndex="0"
                className="ba-resize-handle ba-resize-handle--nw"
                onPointerDown={(e) => handleResize(e, "nw")}
                aria-label="Resize northwest"
              />
              <div
                role="button"
                tabIndex="0"
                className="ba-resize-handle ba-resize-handle--w"
                onPointerDown={(e) => handleResize(e, "w")}
                aria-label="Resize west"
              />
              <div
                role="button"
                tabIndex="0"
                className="ba-resize-handle ba-resize-handle--sw"
                onPointerDown={(e) => handleResize(e, "sw")}
                aria-label="Resize southwest"
              />
            </>
          )}
        </div>
      )}
      <TokenChainModal
        isOpen={showTokenChain}
        onClose={() => setShowTokenChain(false)}
      />
      {showLoginModal && (
        <QuickLoginModal pathname={window.location.pathname} onClose={() => setShowLoginModal(false)} />
      )}
    </div>
  );

  // Inline/embed stays in React tree; float mounts on body so position:fixed is never trapped
  // by .App / shell overflow or theme transforms, and works the same on /logs and app routes.
  if (surfaceHostEl) return createPortal(floatShell, surfaceHostEl);
  if (isInline) return <>{floatShell}</>;
  return createPortal(floatShell, document.body);
}
