/**
 * ArchitectureOverviewPage.js — /architecture/overview
 *
 * Simulate Flow walks through OVERVIEW_SIMULATE_STEPS with:
 *   - Current step: bright active color + explanation label in box
 *   - Previous steps: muted grey (active-prev) + label stays visible
 *   - Token side card: real token/PingAuthorize/MCP detail per step
 *   - Pause / Resume / Next-Step controls
 *   - Aud trail strip showing token lineage
 *
 * Live events (admin): regions activate for 4s; historical on mount for 15s.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../services/apiClient';
import ArchitectureDiagramPage from './ArchitectureDiagramPage';
import { OVERVIEW_REGIONS } from '../config/diagram-overview-regions';

const OVERVIEW_EVENT_MAP = [
  { category: 'agent_prompt', tags: ['agent_prompt/llm_invoke', 'agent_prompt/heuristic_tool'], regionIds: ['agent'], colorClass: 'active' },
  { category: 'agent_prompt', tags: ['agent_prompt/llm_complete'], regionIds: ['agent'], colorClass: 'active' },
  { category: 'token_exchange', tags: ['token_exchange/rfc8693-success'], regionIds: ['idp-oauth-as', 'mcp-gw'], colorClass: 'active' },
  { category: 'token_exchange', tags: ['token_exchange/rfc8693-error'], regionIds: ['idp-oauth-as', 'mcp-gw'], colorClass: 'active-error' },
  { category: 'authorize', tags: ['authorize/bypass'], regionIds: ['pingauthorize'], colorClass: 'active' },
  { category: 'authorize', tags: ['authorize/permit'], regionIds: ['pingauthorize'], colorClass: 'active-permit' },
  { category: 'authorize', tags: ['authorize/deny'], regionIds: ['pingauthorize'], colorClass: 'active-error' },
  { category: 'oauth', tags: ['oauth/user/callback'], regionIds: ['user', 'idp-oauth-as'], colorClass: 'active' },
  { category: 'oauth', tags: [], regionIds: ['user', 'idp-oauth-as'], colorClass: 'active' },
  { category: 'mcp', tags: [], regionIds: ['mcp-gw'], colorClass: 'active' },
  { category: 'agent', tags: ['agent/message'], regionIds: ['agent'], colorClass: 'active' },
];

// Steps based on real banking demo code flow.
// token = card shown on the right; tokenOut = second column (for RFC 8693 exchange).
const OVERVIEW_SIMULATE_STEPS = [
  {
    regionIds: ['user'], colorClass: 'active', label: 'User sends message',
    token: null,
  },
  {
    regionIds: ['user', 'idp-oauth-as'], colorClass: 'active', label: 'OAuth 2.0 PKCE login',
    token: {
      type: 'Auth Code Request',
      response_type: 'code',
      scope: 'openid profile banking:read banking:write',
      code_challenge_method: 'S256',
      note: 'PKCE: code_verifier + code_challenge prevent auth-code interception',
    },
  },
  {
    regionIds: ['idp-oauth-as', 'agent'], colorClass: 'active', label: 'User access token issued (with may_act)',
    token: {
      type: 'User Access Token',
      aud: 'banking-app-client',
      sub: 'alice@bank.com',
      scope: 'openid profile banking:read banking:write',
      may_act: '{ "client_id": "bff-client-id" }',
      note: 'may_act pre-authorizes BFF/gateway to exchange on behalf of user (RFC 8693 §4.2)',
    },
  },
  {
    regionIds: ['agent'], colorClass: 'active', label: 'LLM decides tool to call',
    token: {
      type: 'LLM Reasoning',
      model: 'claude-3-5-sonnet',
      intent: 'show me my accounts',
      action: 'tools/call: get_my_accounts',
      note: 'LangGraph heuristic fallback routes to tool node when LLM selects MCP tool',
    },
  },
  {
    regionIds: ['agent', 'mcp-gw'], colorClass: 'active', label: 'Agent calls MCP Gateway (tools/list)',
    token: {
      type: 'Delegated Token (inbound)',
      aud: 'mcp-gateway',
      sub: 'alice@bank.com',
      scope: 'banking:read banking:write',
      act: '{ "sub": "agent-client-id" }',
      note: 'Gateway validates: aud=mcp-gateway ✓  sub≠∅ ✓  act.sub≠∅ ✓  D-05 anti-bypass ✓',
    },
  },
  {
    regionIds: ['mcp-gw', 'pingauthorize'], colorClass: 'active', label: 'PingAuthorize: McpToolsList check',
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
    regionIds: ['pingauthorize'], colorClass: 'active-permit', label: 'PERMIT — tools discovery allowed',
    token: {
      type: 'Authorization Decision',
      decision: '✅ PERMIT',
      DecisionContext: 'McpToolsList',
      policy: 'mcp-tools-access-v2',
    },
  },
  {
    regionIds: ['agent', 'mcp-gw'], colorClass: 'active', label: 'Agent calls MCP Gateway (tools/call)',
    token: {
      type: 'Delegated Token (tools/call)',
      aud: 'mcp-gateway',
      sub: 'alice@bank.com',
      scope: 'banking:read banking:write',
      act: '{ "sub": "agent-client-id" }',
      method: 'tools/call',
      tool_name: 'get_my_accounts',
    },
  },
  {
    regionIds: ['mcp-gw', 'pingauthorize'], colorClass: 'active', label: 'PingAuthorize: McpToolCall check',
    token: {
      type: 'PingAuthorize Request',
      DecisionContext: 'McpToolCall',
      ClientId: 'alice@bank.com',
      ActClientId: 'agent-client-id',
      ToolName: 'get_my_accounts',
      TokenScopes: 'banking:read',
      TokenAudience: 'mcp-gateway',
      note: 'Adds ToolName vs McpToolsList — per-tool fine-grained control',
    },
  },
  {
    regionIds: ['pingauthorize'], colorClass: 'active-permit', label: 'PERMIT — tool call allowed',
    token: {
      type: 'Authorization Decision',
      decision: '✅ PERMIT',
      DecisionContext: 'McpToolCall',
      ToolName: 'get_my_accounts',
      policy: 'mcp-tool-call-v2',
    },
  },
  {
    regionIds: ['mcp-gw', 'idp-oauth-as'], colorClass: 'active', label: 'RFC 8693: scope-narrowed token exchange',
    isTokenExchange: true,
    token: {
      type: 'Token Exchange Request',
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      subject_aud: 'mcp-gateway',
      audience: 'mcp-olb-server',
      scope: 'banking:read',
      note: 'D-04: original token never forwarded — new aud-scoped token issued',
    },
    tokenOut: {
      type: 'Tool-Scoped Token (issued)',
      aud: 'mcp-olb-server',
      scope: 'banking:read',
      sub: 'alice@bank.com',
      act: '{ "sub": "agent-client-id" }',
    },
  },
  {
    regionIds: ['api-gw', 'service-a'], colorClass: 'active', label: 'Banking API called',
    token: {
      type: 'Resource Token (Banking API)',
      aud: 'banking-api',
      scope: 'banking:read',
      sub: 'alice@bank.com',
      endpoint: 'GET /accounts',
      note: 'MCP Server validates: aud=mcp-olb-server ✓  may_act ✓  act.sub ✓',
    },
  },
  {
    regionIds: ['service-b', 'service-c'], colorClass: 'active', label: 'Services respond — results flow back',
    token: {
      type: 'API Response',
      status: '200 OK',
      data: '[{ "accountId":"ACC-001","balance":12450.00 },...]',
      route: 'Banking API → MCP Server → MCP Gateway → Agent → User',
    },
  },
];

// Aud trail hops — which token is "live" at each step index
const OVERVIEW_AUD_HOPS = [
  { icon: '👤', label: 'User Token',     aud: 'banking-app-client', may_act: 'bff-client-id',    activeFrom: 2,  activeTo: 3  },
  { icon: '🔀', label: 'Gateway Token',  aud: 'mcp-gateway',        act: 'agent-client-id',       activeFrom: 4,  activeTo: 9  },
  { icon: '🔄', label: 'RFC 8693 ↕',    aud: '(exchange)',          isExchange: true,              activeFrom: 10, activeTo: 10 },
  { icon: '🛠️', label: 'Tool Token',    aud: 'mcp-olb-server',     act: 'agent-client-id',        activeFrom: 11, activeTo: 11 },
  { icon: '🏦', label: 'Resource Token', aud: 'banking-api',                                       activeFrom: 11, activeTo: 12 },
];

const HIGHLIGHT_TIMEOUT_MS  = 4000;
const HISTORICAL_TIMEOUT_MS = 15000;
const STEP_INTERVAL_MS      = 2500;

function mapEventToRegions(event) {
  for (const rule of OVERVIEW_EVENT_MAP) {
    if (event.category !== rule.category) continue;
    if (rule.tags.length > 0 && !rule.tags.includes(event.tag)) continue;
    return rule.regionIds.map((regionId) => ({ regionId, colorClass: rule.colorClass }));
  }
  return [];
}

function scanKeywords(responseText) {
  if (!responseText || typeof responseText !== 'string') return [];
  const lower = responseText.toLowerCase();
  return OVERVIEW_REGIONS.filter(
    (r) => r.keywords?.some((kw) => lower.includes(kw))
  ).map((r) => ({ regionId: r.id, colorClass: 'active' }));
}

export default function ArchitectureOverviewPage({ user }) {
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
    if (i >= OVERVIEW_SIMULATE_STEPS.length) return;
    const step = OVERVIEW_SIMULATE_STEPS[i];
    setCurrentStep(i);
    setStepDetail(step.token || null);
    setStepDetailOut(step.tokenOut || null);
    setIsTokenExch(Boolean(step.isTokenExchange));
    setIsHitl(Boolean(step.isHitl));

    const regions = {};
    const labels  = {};
    for (let j = 0; j < i; j++) {
      OVERVIEW_SIMULATE_STEPS[j].regionIds.forEach((id) => {
        regions[id] = 'active-prev';
        labels[id]  = OVERVIEW_SIMULATE_STEPS[j].label;
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
    for (let i = startIdx; i < OVERVIEW_SIMULATE_STEPS.length; i++) {
      const delay = (i - startIdx) * STEP_INTERVAL_MS;
      const t = setTimeout(() => {
        applyStep(i);
        if (i === OVERVIEW_SIMULATE_STEPS.length - 1) {
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
    if (next >= OVERVIEW_SIMULATE_STEPS.length) return;
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
      title="Architecture Overview"
      imageSrc="/architecture/overview.png"
      imageAlt="Ping Identity Digital Assistants: User, Trust Boundary, IdP, Agent, MCP Gateway, PingAuthorize, Backend Services"
      regions={OVERVIEW_REGIONS}
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
      totalSteps={OVERVIEW_SIMULATE_STEPS.length}
      stepDetail={stepDetail}
      stepDetailOut={stepDetailOut}
      isTokenExchange={isTokenExch}
      isHitl={isHitl}
      audHops={OVERVIEW_AUD_HOPS}
    />
  );
}
