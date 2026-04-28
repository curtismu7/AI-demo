/**
 * ArchitectureOverviewPage.js — /architecture/overview
 *
 * 15-step simulation matching real banking demo code flow.
 * Each step shows:
 *   - Highlighted regions on the PNG diagram
 *   - Token side card (white bg, readable text, RFC badges)
 *   - Dual tokens where applicable (ID token + Access token at login)
 *   - RFC 8693 stacked Request/Issued for exchange steps
 *   - Aud trail strip above diagram
 *   - ← Prev / Pause / Resume / Next → / Stop controls
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../services/apiClient';
import ArchitectureDiagramPage from './ArchitectureDiagramPage';
import { OVERVIEW_REGIONS } from '../config/diagram-overview-regions';

const OVERVIEW_EVENT_MAP = [
  { category: 'agent_prompt',  tags: ['agent_prompt/llm_invoke', 'agent_prompt/heuristic_tool'], regionIds: ['agent'],                   colorClass: 'active' },
  { category: 'agent_prompt',  tags: ['agent_prompt/llm_complete'],                               regionIds: ['agent'],                   colorClass: 'active' },
  { category: 'token_exchange',tags: ['token_exchange/rfc8693-success'],                          regionIds: ['idp-oauth-as', 'mcp-gw'],  colorClass: 'active' },
  { category: 'token_exchange',tags: ['token_exchange/rfc8693-error'],                            regionIds: ['idp-oauth-as', 'mcp-gw'],  colorClass: 'active-error' },
  { category: 'authorize',     tags: ['authorize/bypass'],  regionIds: ['pingauthorize'], colorClass: 'active' },
  { category: 'authorize',     tags: ['authorize/permit'],  regionIds: ['pingauthorize'], colorClass: 'active-permit' },
  { category: 'authorize',     tags: ['authorize/deny'],    regionIds: ['pingauthorize'], colorClass: 'active-error' },
  { category: 'oauth',         tags: ['oauth/user/callback'], regionIds: ['user', 'idp-oauth-as'], colorClass: 'active' },
  { category: 'oauth',         tags: [],                      regionIds: ['user', 'idp-oauth-as'], colorClass: 'active' },
  { category: 'mcp',           tags: [], regionIds: ['mcp-gw'], colorClass: 'active' },
  { category: 'agent',         tags: ['agent/message'], regionIds: ['agent'], colorClass: 'active' },
];

// ─── Simulation steps ─────────────────────────────────────────────────────────
// token  = primary card   token2 = secondary card (dual display)
// isTokenExchange = true  → stacked Request / ↓ Issued layout
// _type controls accent border color: oauth | exchange | permit | hitl | idtoken | mcp
// _rfcs = RFC badge pills shown in card header

const OVERVIEW_SIMULATE_STEPS = [
  {
    regionIds: ['user'], colorClass: 'active', label: 'User sends message',
    token: null,
  },
  {
    regionIds: ['user', 'idp-oauth-as'], colorClass: 'active', label: 'OAuth 2.0 PKCE login',
    token: {
      type: 'Authorization Code Request',
      _type: 'oauth', _rfcs: ['RFC 6749', 'RFC 7636'],
      response_type: 'code',
      scope: 'openid profile banking:read banking:write',
      code_challenge_method: 'S256',
      note: 'PKCE: code_verifier stored client-side; only code_challenge sent — prevents auth-code interception',
    },
  },
  {
    regionIds: ['idp-oauth-as', 'agent'], colorClass: 'active', label: 'IdP issues ID Token + Access Token (with may_act)',
    // Dual: ID token + Access token shown side by side
    token: {
      type: 'ID Token (OIDC)',
      _type: 'idtoken', _rfcs: ['RFC 7519', 'OIDC Core'],
      iss: 'https://your-idp.example.com',
      sub: 'alice@bank.com',
      aud: 'banking-app-client',
      email: 'alice@bank.com',
      name: 'Alice Smith',
      note: 'ID token is for the UI only — never sent to APIs or MCP tools',
    },
    token2: {
      type: 'Access Token',
      _type: 'oauth', _rfcs: ['RFC 6749', 'RFC 8693'],
      aud: 'banking-app-client',
      sub: 'alice@bank.com',
      scope: 'openid profile banking:read banking:write',
      may_act: '{ "client_id": "bff-client-id" }',
      note: 'may_act pre-authorizes BFF/gateway to exchange on behalf of user (RFC 8693 §4.2)',
    },
  },
  {
    regionIds: ['agent'], colorClass: 'active', label: 'LLM interprets user intent',
    token: {
      type: 'LLM Reasoning',
      _type: 'mcp',
      model: 'claude-3-5-sonnet',
      intent: '"show me my accounts"',
      action: 'tools/call: get_my_accounts',
      note: 'LangGraph heuristic fallback routes to MCP tool node when LLM selects tool',
    },
  },
  {
    regionIds: ['agent', 'idp-oauth-as'], colorClass: 'active', label: 'BFF: RFC 8693 exchange → delegation token',
    isTokenExchange: true,
    token: {
      type: 'Token Exchange Request',
      _type: 'exchange', _rfcs: ['RFC 8693'],
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      subject_aud: 'banking-app-client',
      audience: 'mcp-gateway',
      scope: 'banking:read banking:write',
      note: 'BFF exchanges user access token for agent delegation token scoped to MCP Gateway',
    },
    tokenOut: {
      type: 'Delegated Token (issued)',
      _type: 'exchange',
      aud: 'mcp-gateway',
      sub: 'alice@bank.com',
      scope: 'banking:read banking:write',
      act: '{ "sub": "agent-client-id" }',
    },
  },
  {
    regionIds: ['agent', 'mcp-gw'], colorClass: 'active', label: 'Agent → MCP Gateway: tools/list',
    token: {
      type: 'Delegated Token (inbound)',
      _type: 'oauth', _rfcs: ['RFC 8693', 'RFC 6750'],
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
      _type: 'mcp',
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
      _type: 'permit',
      decision: '✅ PERMIT',
      DecisionContext: 'McpToolsList',
      policy: 'mcp-tools-access-v2',
    },
  },
  {
    regionIds: ['agent', 'mcp-gw'], colorClass: 'active', label: 'Agent → MCP Gateway: tools/call get_my_accounts',
    token: {
      type: 'Delegated Token (tools/call)',
      _type: 'oauth', _rfcs: ['RFC 8693'],
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
      _type: 'mcp',
      DecisionContext: 'McpToolCall',
      ClientId: 'alice@bank.com',
      ActClientId: 'agent-client-id',
      ToolName: 'get_my_accounts',
      TokenScopes: 'banking:read',
      TokenAudience: 'mcp-gateway',
      note: 'Adds ToolName for per-tool policy — finer control than McpToolsList',
    },
  },
  {
    regionIds: ['pingauthorize'], colorClass: 'active-permit', label: 'PERMIT — tool call allowed',
    token: {
      type: 'Authorization Decision',
      _type: 'permit',
      decision: '✅ PERMIT',
      DecisionContext: 'McpToolCall',
      ToolName: 'get_my_accounts',
      policy: 'mcp-tool-call-v2',
    },
  },
  {
    regionIds: ['mcp-gw', 'idp-oauth-as'], colorClass: 'active', label: 'Gateway: RFC 8693 scope-narrowed exchange',
    isTokenExchange: true,
    token: {
      type: 'Token Exchange Request (scope-narrowed)',
      _type: 'exchange', _rfcs: ['RFC 8693', 'RFC 8707'],
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      subject_aud: 'mcp-gateway',
      audience: 'mcp-olb-server',
      scope: 'banking:read',
      note: 'D-04: original token never forwarded — gateway issues new aud+scope-narrowed token',
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
    regionIds: ['api-gw', 'service-a'], colorClass: 'active', label: 'MCP Server → Banking API',
    token: {
      type: 'Resource Token',
      _type: 'oauth', _rfcs: ['RFC 6750'],
      aud: 'banking-api',
      scope: 'banking:read',
      sub: 'alice@bank.com',
      endpoint: 'GET /accounts',
      note: 'MCP Server validates: aud=mcp-olb-server ✓  may_act ✓  act.sub ✓  before forwarding',
    },
  },
  {
    regionIds: ['service-b', 'service-c'], colorClass: 'active', label: 'Results flow back to user',
    token: {
      type: 'API Response',
      _type: 'mcp',
      status: '200 OK',
      data: '[{ "accountId":"ACC-001","balance":12450.00 },...]',
      route: 'Banking API → MCP Server → MCP Gateway → Agent → User',
    },
  },
];

const OVERVIEW_AUD_HOPS = [
  { icon: '👤', label: 'User Token',     aud: 'banking-app-client', may_act: 'bff-client-id',  activeFrom: 2,  activeTo: 3  },
  { icon: '🔄', label: 'RFC 8693 #1',   aud: '(exchange)',          isExchange: true,            activeFrom: 4,  activeTo: 4  },
  { icon: '🔀', label: 'Gateway Token',  aud: 'mcp-gateway',        act: 'agent-client-id',      activeFrom: 5,  activeTo: 10 },
  { icon: '🔄', label: 'RFC 8693 #2',   aud: '(exchange)',          isExchange: true,            activeFrom: 11, activeTo: 11 },
  { icon: '🛠️', label: 'Tool Token',    aud: 'mcp-olb-server',     act: 'agent-client-id',      activeFrom: 12, activeTo: 12 },
  { icon: '🏦', label: 'Resource Token', aud: 'banking-api',                                     activeFrom: 12, activeTo: 13 },
];

const HIGHLIGHT_MS  = 4000;
const HISTORICAL_MS = 15000;
const STEP_MS       = 2500;
const TOTAL         = OVERVIEW_SIMULATE_STEPS.length;

function mapEventToRegions(event) {
  for (const rule of OVERVIEW_EVENT_MAP) {
    if (event.category !== rule.category) continue;
    if (rule.tags.length > 0 && !rule.tags.includes(event.tag)) continue;
    return rule.regionIds.map((id) => ({ regionId: id, colorClass: rule.colorClass }));
  }
  return [];
}

function scanKeywords(text) {
  if (!text || typeof text !== 'string') return [];
  const lower = text.toLowerCase();
  return OVERVIEW_REGIONS.filter((r) => r.keywords?.some((kw) => lower.includes(kw)))
    .map((r) => ({ regionId: r.id, colorClass: 'active' }));
}

export default function ArchitectureOverviewPage({ user }) {
  const [activeRegions, setActiveRegions] = useState({});
  const [regionLabels,  setRegionLabels]  = useState({});
  const [isSimulating,  setIsSimulating]  = useState(false);
  const [isPaused,      setIsPaused]      = useState(false);
  const [currentStep,   setCurrentStep]   = useState(-1);
  const [stepDetail,    setStepDetail]    = useState(null);
  const [stepDetail2,   setStepDetail2]   = useState(null);
  const [stepDetailOut, setStepDetailOut] = useState(null);
  const [isTokenExch,   setIsTokenExch]   = useState(false);
  const [isHitl,        setIsHitl]        = useState(false);
  const [history,       setHistory]       = useState([]);

  const clearTimers   = useRef({});
  const simTimeouts   = useRef([]);
  const pausedStep    = useRef(-1);
  const lastFetchedAt = useRef(null);
  const pollRef       = useRef(null);

  const activateRegion = useCallback((regionId, colorClass = 'active', ms = HIGHLIGHT_MS) => {
    if (clearTimers.current[regionId]) clearTimeout(clearTimers.current[regionId]);
    setActiveRegions((prev) => ({ ...prev, [regionId]: colorClass }));
    clearTimers.current[regionId] = setTimeout(() => {
      setActiveRegions((prev) => { const n = { ...prev }; delete n[regionId]; return n; });
      delete clearTimers.current[regionId];
    }, ms);
  }, []);

  const processEvents = useCallback((events, historical = false) => {
    const ms = historical ? HISTORICAL_MS : HIGHLIGHT_MS;
    events.forEach((evt) => {
      mapEventToRegions(evt).forEach(({ regionId, colorClass }) => activateRegion(regionId, colorClass, ms));
      if (evt.tag === 'agent_prompt/llm_complete' && evt.metadata?.response)
        scanKeywords(evt.metadata.response).forEach(({ regionId, colorClass }) => activateRegion(regionId, colorClass, ms));
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

  const applyStep = useCallback((i) => {
    if (i < 0 || i >= TOTAL) return;
    const step = OVERVIEW_SIMULATE_STEPS[i];
    setCurrentStep(i);
    setStepDetail(step.token   || null);
    setStepDetail2(step.token2 || null);
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

    // Accumulate history (skip steps with no token data; don't duplicate same step)
    if (step.token || step.token2) {
      const entry = { stepNum: i + 1, label: step.label, token: step.token || null, token2: step.token2 || null, tokenOut: step.tokenOut || null, isTokenExchange: Boolean(step.isTokenExchange), isHitl: Boolean(step.isHitl) };
      setHistory((prev) => {
        if (prev.some((e) => e.stepNum === entry.stepNum)) return prev;
        return [...prev, entry].sort((a, b) => a.stepNum - b.stepNum);
      });
    }
  }, []);

  const scheduleFrom = useCallback((startIdx) => {
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];
    for (let i = startIdx; i < TOTAL; i++) {
      const t = setTimeout(() => {
        applyStep(i);
        if (i === TOTAL - 1) {
          const done = setTimeout(() => {
            setActiveRegions({}); setRegionLabels({});
            setIsSimulating(false); setIsPaused(false);
            setCurrentStep(-1); setStepDetail(null); setStepDetail2(null); setStepDetailOut(null);
          }, HIGHLIGHT_MS);
          simTimeouts.current.push(done);
        }
      }, (i - startIdx) * STEP_MS);
      simTimeouts.current.push(t);
    }
  }, [applyStep]);

  const clearHistory = useCallback(() => setHistory([]), []);

  const runSimulation = useCallback(() => {
    if (isSimulating) return;
    setHistory([]);
    setIsSimulating(true); setIsPaused(false);
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

  const prevStep = useCallback(() => {
    const prev = pausedStep.current - 1;
    if (prev < 0) return;
    pausedStep.current = prev;
    applyStep(prev);
  }, [applyStep]);

  const nextStep = useCallback(() => {
    const next = pausedStep.current + 1;
    if (next >= TOTAL) return;
    pausedStep.current = next;
    applyStep(next);
  }, [applyStep]);

  const stop = useCallback(() => {
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];
    setActiveRegions({}); setRegionLabels({});
    setIsSimulating(false); setIsPaused(false);
    setCurrentStep(-1); setStepDetail(null); setStepDetail2(null); setStepDetailOut(null);
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
      imageAlt="Architecture: User → IdP → Agent → MCP Gateway → PingAuthorize → Backend Services"
      regions={OVERVIEW_REGIONS}
      activeRegions={activeRegions}
      regionLabels={regionLabels}
      user={user}
      onSimulate={runSimulation}
      isSimulating={isSimulating}
      isPaused={isPaused}
      onPause={pause}
      onResume={resume}
      onPrevStep={prevStep}
      onNextStep={nextStep}
      onStop={stop}
      currentStep={currentStep}
      totalSteps={TOTAL}
      stepDetail={stepDetail}
      stepDetail2={stepDetail2}
      stepDetailOut={stepDetailOut}
      isTokenExchange={isTokenExch}
      isHitl={isHitl}
      audHops={OVERVIEW_AUD_HOPS}
      tokenHistory={history}
      onClearHistory={clearHistory}
    />
  );
}
