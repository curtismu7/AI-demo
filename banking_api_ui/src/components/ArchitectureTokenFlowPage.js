/**
 * ArchitectureTokenFlowPage.js — /architecture/token-flow
 *
 * Simulate Flow walks through TOKEN_FLOW_SIMULATE_STEPS with:
 *   - Current step: bright active color + explanation label in box
 *   - Previous steps: muted grey (active-prev) + label stays visible
 *   - Token side card: real token/PingAuthorize/RFC 8693 detail per step
 *   - Pause / Resume / Next-Step controls
 *   - Aud trail strip showing token lineage
 *
 * Live events (admin): regions activate for 4s; historical on mount for 15s.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../services/apiClient';
import ArchitectureDiagramPage from './ArchitectureDiagramPage';
import { TOKEN_FLOW_REGIONS } from '../config/diagram-token-flow-regions';

const TOKEN_FLOW_EVENT_MAP = [
  { category: 'agent_prompt', tags: ['agent_prompt/llm_invoke'], regionIds: ['agent1', 'llm'], colorClass: 'active' },
  { category: 'agent_prompt', tags: ['agent_prompt/llm_complete'], regionIds: ['agent1'], colorClass: 'active' },
  { category: 'agent_prompt', tags: ['agent_prompt/heuristic_tool'], regionIds: ['agent1'], colorClass: 'active' },
  { category: 'token_exchange', tags: ['token_exchange/rfc8693-success'], regionIds: ['pingone-aic', 'token-exchange-box', 'mcp-gateway-tf'], colorClass: 'active' },
  { category: 'token_exchange', tags: ['token_exchange/rfc8693-error'], regionIds: ['pingone-aic', 'token-exchange-box', 'mcp-gateway-tf'], colorClass: 'active-error' },
  { category: 'authorize', tags: ['authorize/bypass'], regionIds: ['pingauthorize-tf'], colorClass: 'active' },
  { category: 'authorize', tags: ['authorize/permit'], regionIds: ['pingauthorize-tf'], colorClass: 'active-permit' },
  { category: 'authorize', tags: ['authorize/deny'], regionIds: ['pingauthorize-tf'], colorClass: 'active-error' },
  { category: 'oauth', tags: ['oauth/user/callback'], regionIds: ['olb-application', 'pingone-aic'], colorClass: 'active' },
  { category: 'oauth', tags: [], regionIds: ['olb-application', 'pingone-aic'], colorClass: 'active' },
  { category: 'mcp', tags: [], regionIds: ['mcp-gateway-tf'], colorClass: 'active' },
  { category: 'agent', tags: ['agent/message'], regionIds: ['chatbot'], colorClass: 'active' },
];

// Steps based on real banking demo code flow.
// token = card shown on the right; tokenOut = second column (for RFC 8693 exchange).
const TOKEN_FLOW_SIMULATE_STEPS = [
  {
    regionIds: ['olb-application'], colorClass: 'active', label: 'User sends request',
    token: null,
  },
  {
    regionIds: ['olb-application', 'chatbot'], colorClass: 'active', label: 'Chatbot receives message',
    token: null,
  },
  {
    regionIds: ['chatbot', 'agent1'], colorClass: 'active', label: 'Agent takes over — holds user token',
    token: {
      type: 'User Access Token (held by BFF)',
      aud: 'banking-app-client',
      sub: 'alice@bank.com',
      scope: 'openid profile banking:read banking:write',
      may_act: '{ "client_id": "bff-client-id" }',
      note: 'may_act pre-authorizes BFF/gateway to exchange on behalf of user (RFC 8693 §4.2)',
    },
  },
  {
    regionIds: ['agent1', 'llm'], colorClass: 'active', label: 'LLM processes intent',
    token: {
      type: 'LLM Reasoning',
      model: 'claude-3-5-sonnet',
      intent: 'show me my accounts',
      action: 'tools/call: get_my_accounts',
      note: 'LangGraph heuristic fallback routes to tool node',
    },
  },
  {
    regionIds: ['agent1', 'pingone-aic'], colorClass: 'active', label: 'RFC 8693: get delegation token',
    isTokenExchange: true,
    token: {
      type: 'Token Exchange Request (1st)',
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      subject_aud: 'banking-app-client',
      audience: 'mcp-gateway',
      scope: 'banking:read banking:write',
      note: 'BFF exchanges user token for a delegation token scoped to MCP Gateway',
    },
    tokenOut: {
      type: 'Delegated Token (issued)',
      aud: 'mcp-gateway',
      scope: 'banking:read banking:write',
      sub: 'alice@bank.com',
      act: '{ "sub": "agent-client-id" }',
    },
  },
  {
    regionIds: ['pingone-aic', 'token-exchange-box'], colorClass: 'active', label: 'IdP issues delegation token',
    token: {
      type: 'Delegated Token (active)',
      aud: 'mcp-gateway',
      sub: 'alice@bank.com',
      scope: 'banking:read banking:write',
      act: '{ "sub": "agent-client-id" }',
      note: 'act claim chains delegation — act.sub identifies the acting agent',
    },
  },
  {
    regionIds: ['token-exchange-box', 'mcp-gateway-tf'], colorClass: 'active', label: 'Delegated token arrives at MCP Gateway',
    token: {
      type: 'Delegated Token (inbound at gateway)',
      aud: 'mcp-gateway',
      sub: 'alice@bank.com',
      scope: 'banking:read banking:write',
      act: '{ "sub": "agent-client-id" }',
      note: 'Gateway validates: aud=mcp-gateway ✓  sub≠∅ ✓  act.sub≠∅ ✓  D-05 anti-bypass ✓',
    },
  },
  {
    regionIds: ['mcp-gateway-tf', 'pingauthorize-tf'], colorClass: 'active', label: 'PingAuthorize: McpToolsList check',
    token: {
      type: 'PingAuthorize Request',
      DecisionContext: 'McpToolsList',
      ClientId: 'alice@bank.com',
      ActClientId: 'agent-client-id',
      TokenScopes: 'banking:read banking:write',
      TokenAudience: 'mcp-gateway',
      note: 'Can this agent discover available tools for this user?',
    },
  },
  {
    regionIds: ['pingauthorize-tf'], colorClass: 'active-permit', label: 'PERMIT — tools discovery allowed',
    token: {
      type: 'Authorization Decision',
      decision: '✅ PERMIT',
      DecisionContext: 'McpToolsList',
      policy: 'mcp-tools-access-v2',
    },
  },
  {
    regionIds: ['mcp-gateway-tf', 'pingauthorize-tf'], colorClass: 'active', label: 'PingAuthorize: McpToolCall check',
    token: {
      type: 'PingAuthorize Request',
      DecisionContext: 'McpToolCall',
      ClientId: 'alice@bank.com',
      ActClientId: 'agent-client-id',
      ToolName: 'get_my_accounts',
      TokenScopes: 'banking:read',
      TokenAudience: 'mcp-gateway',
      note: 'Adds ToolName — per-tool fine-grained control vs McpToolsList',
    },
  },
  {
    regionIds: ['pingauthorize-tf'], colorClass: 'active-permit', label: 'PERMIT — tool call allowed',
    token: {
      type: 'Authorization Decision',
      decision: '✅ PERMIT',
      DecisionContext: 'McpToolCall',
      ToolName: 'get_my_accounts',
      policy: 'mcp-tool-call-v2',
    },
  },
  {
    regionIds: ['mcp-gateway-tf', 'mcp-olb'], colorClass: 'active', label: 'RFC 8693: scope-narrowed exchange → MCP Server',
    isTokenExchange: true,
    token: {
      type: 'Token Exchange Request (2nd)',
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      subject_aud: 'mcp-gateway',
      audience: 'mcp-olb-server',
      scope: 'banking:read',
      note: 'D-04: original token never forwarded — new aud+scope-narrowed token issued',
    },
    tokenOut: {
      type: 'Tool-Scoped Token (MCP Server)',
      aud: 'mcp-olb-server',
      scope: 'banking:read',
      sub: 'alice@bank.com',
      act: '{ "sub": "agent-client-id" }',
    },
  },
  {
    regionIds: ['mcp-olb', 'oauth-rs'], colorClass: 'active', label: 'MCP Server calls Banking API',
    token: {
      type: 'Resource Token (Banking API)',
      aud: 'banking-api',
      scope: 'banking:read',
      sub: 'alice@bank.com',
      endpoint: 'GET /accounts',
      note: 'MCP Server validates: aud=mcp-olb-server ✓  may_act ✓  act.sub ✓  before calling API',
    },
  },
  {
    regionIds: ['mcp-invest', 'oauth-rs'], colorClass: 'active', label: 'Investments API called',
    token: {
      type: 'Resource Token (Investments API)',
      aud: 'banking-api',
      scope: 'banking:read',
      sub: 'alice@bank.com',
      endpoint: 'GET /investments',
      note: 'Same token reused — MCP Server holds it for the duration of the tool call',
    },
  },
];

// Aud trail hops — which token is "live" at each step index
const TOKEN_FLOW_AUD_HOPS = [
  { icon: '👤', label: 'User Token',     aud: 'banking-app-client', may_act: 'bff-client-id',    activeFrom: 2,  activeTo: 3  },
  { icon: '🔄', label: 'RFC 8693 #1',   aud: '(exchange)',          isExchange: true,              activeFrom: 4,  activeTo: 4  },
  { icon: '🔀', label: 'Gateway Token',  aud: 'mcp-gateway',        act: 'agent-client-id',        activeFrom: 5,  activeTo: 10 },
  { icon: '🔄', label: 'RFC 8693 #2',   aud: '(exchange)',          isExchange: true,              activeFrom: 11, activeTo: 11 },
  { icon: '🛠️', label: 'Tool Token',    aud: 'mcp-olb-server',     act: 'agent-client-id',        activeFrom: 12, activeTo: 13 },
];

const HIGHLIGHT_TIMEOUT_MS  = 4000;
const HISTORICAL_TIMEOUT_MS = 15000;
const STEP_INTERVAL_MS      = 2500;

function mapEventToRegions(event) {
  for (const rule of TOKEN_FLOW_EVENT_MAP) {
    if (event.category !== rule.category) continue;
    if (rule.tags.length > 0 && !rule.tags.includes(event.tag)) continue;
    return rule.regionIds.map((regionId) => ({ regionId, colorClass: rule.colorClass }));
  }
  return [];
}

function scanKeywords(responseText) {
  if (!responseText || typeof responseText !== 'string') return [];
  const lower = responseText.toLowerCase();
  return TOKEN_FLOW_REGIONS.filter(
    (r) => r.keywords?.some((kw) => lower.includes(kw))
  ).map((r) => ({ regionId: r.id, colorClass: 'active' }));
}

export default function ArchitectureTokenFlowPage({ user }) {
  const [activeRegions, setActiveRegions] = useState({});
  const [regionLabels, setRegionLabels]   = useState({});
  const [isSimulating, setIsSimulating]   = useState(false);
  const [isPaused,     setIsPaused]       = useState(false);
  const [currentStep,  setCurrentStep]    = useState(-1);
  const [stepDetail,   setStepDetail]     = useState(null);
  const [stepDetailOut,setStepDetailOut]  = useState(null);
  const [isTokenExch,  setIsTokenExch]    = useState(false);
  const [isHitl,       setIsHitl]         = useState(false);

  const clearTimers   = useRef({});
  const simTimeouts   = useRef([]);
  const pausedStep    = useRef(-1);
  const lastFetchedAt = useRef(null);
  const pollRef       = useRef(null);

  const activateRegion = useCallback((regionId, colorClass = 'active', timeoutMs = HIGHLIGHT_TIMEOUT_MS) => {
    if (clearTimers.current[regionId]) clearTimeout(clearTimers.current[regionId]);
    setActiveRegions((prev) => ({ ...prev, [regionId]: colorClass }));
    clearTimers.current[regionId] = setTimeout(() => {
      setActiveRegions((prev) => { const n = { ...prev }; delete n[regionId]; return n; });
      delete clearTimers.current[regionId];
    }, timeoutMs);
  }, []);

  const processEvents = useCallback((events, historical = false) => {
    const timeout = historical ? HISTORICAL_TIMEOUT_MS : HIGHLIGHT_TIMEOUT_MS;
    events.forEach((evt) => {
      mapEventToRegions(evt).forEach(({ regionId, colorClass }) =>
        activateRegion(regionId, colorClass, timeout)
      );
      if (evt.tag === 'agent_prompt/llm_complete' && evt.metadata?.response) {
        scanKeywords(evt.metadata.response).forEach(({ regionId, colorClass }) =>
          activateRegion(regionId, colorClass, timeout)
        );
      }
    });
  }, [activateRegion]);

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    try {
      const since = lastFetchedAt.current || new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const isHistorical = !lastFetchedAt.current;
      const res = await apiClient.get(`/api/admin/app-events?limit=50&since=${since}`);
      const events = res.data?.events || [];
      if (events.length > 0) processEvents(events, isHistorical);
      lastFetchedAt.current = new Date().toISOString();
    } catch (_err) {
      if (!lastFetchedAt.current) lastFetchedAt.current = new Date().toISOString();
    }
  }, [user, processEvents]);

  // Apply a single step's visual state
  const applyStep = useCallback((i) => {
    if (i >= TOKEN_FLOW_SIMULATE_STEPS.length) return;
    const step = TOKEN_FLOW_SIMULATE_STEPS[i];
    setCurrentStep(i);
    setStepDetail(step.token || null);
    setStepDetailOut(step.tokenOut || null);
    setIsTokenExch(Boolean(step.isTokenExchange));
    setIsHitl(Boolean(step.isHitl));

    const regions = {};
    const labels  = {};
    for (let j = 0; j < i; j++) {
      TOKEN_FLOW_SIMULATE_STEPS[j].regionIds.forEach((id) => {
        regions[id] = 'active-prev';
        labels[id]  = TOKEN_FLOW_SIMULATE_STEPS[j].label;
      });
    }
    step.regionIds.forEach((id) => {
      regions[id] = step.colorClass;
      labels[id]  = step.label;
    });
    setActiveRegions(regions);
    setRegionLabels(labels);
  }, []);

  // Schedule remaining steps from startIdx
  const scheduleFrom = useCallback((startIdx) => {
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];
    for (let i = startIdx; i < TOKEN_FLOW_SIMULATE_STEPS.length; i++) {
      const delay = (i - startIdx) * STEP_INTERVAL_MS;
      const t = setTimeout(() => {
        applyStep(i);
        if (i === TOKEN_FLOW_SIMULATE_STEPS.length - 1) {
          const done = setTimeout(() => {
            setActiveRegions({});
            setRegionLabels({});
            setIsSimulating(false);
            setIsPaused(false);
            setCurrentStep(-1);
            setStepDetail(null);
            setStepDetailOut(null);
          }, HIGHLIGHT_TIMEOUT_MS);
          simTimeouts.current.push(done);
        }
      }, delay);
      simTimeouts.current.push(t);
    }
  }, [applyStep]);

  const runSimulation = useCallback(() => {
    if (isSimulating) return;
    setIsSimulating(true);
    setIsPaused(false);
    pausedStep.current = -1;
    scheduleFrom(0);
  }, [isSimulating, scheduleFrom]);

  const pause = useCallback(() => {
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];
    pausedStep.current = currentStep;
    setIsPaused(true);
  }, [currentStep]);

  const resume = useCallback(() => {
    setIsPaused(false);
    scheduleFrom(pausedStep.current + 1);
  }, [scheduleFrom]);

  const nextStep = useCallback(() => {
    const next = pausedStep.current + 1;
    if (next >= TOKEN_FLOW_SIMULATE_STEPS.length) return;
    pausedStep.current = next;
    applyStep(next);
  }, [applyStep]);

  const stop = useCallback(() => {
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];
    setActiveRegions({});
    setRegionLabels({});
    setIsSimulating(false);
    setIsPaused(false);
    setCurrentStep(-1);
    setStepDetail(null);
    setStepDetailOut(null);
    pausedStep.current = -1;
  }, []);

  useEffect(() => {
    fetchEvents();
    pollRef.current = setInterval(fetchEvents, 10000);
    return () => {
      clearInterval(pollRef.current);
      Object.values(clearTimers.current).forEach(clearTimeout);
      simTimeouts.current.forEach(clearTimeout);
      clearTimers.current = {};
    };
  }, [fetchEvents]);

  return (
    <ArchitectureDiagramPage
      title="Token Flow Diagram"
      imageSrc="/architecture/token-flow.png"
      imageAlt="Token flow: OLB App, agent1, LLM, PingOne AIC, Token Exchange, PingAuthorize, MCP Gateway, MCP OLB, MCP Invest, OAuth RS"
      regions={TOKEN_FLOW_REGIONS}
      activeRegions={activeRegions}
      regionLabels={regionLabels}
      user={user}
      onSimulate={runSimulation}
      isSimulating={isSimulating}
      isPaused={isPaused}
      onPause={pause}
      onResume={resume}
      onNextStep={nextStep}
      onStop={stop}
      currentStep={currentStep}
      totalSteps={TOKEN_FLOW_SIMULATE_STEPS.length}
      stepDetail={stepDetail}
      stepDetailOut={stepDetailOut}
      isTokenExchange={isTokenExch}
      isHitl={isHitl}
      audHops={TOKEN_FLOW_AUD_HOPS}
    />
  );
}
