/**
 * ArchitectureTokenFlowPage.js — /architecture/token-flow
 *
 * 15-step simulation showing every token hop in the banking demo flow.
 * Each step shows:
 *   - Highlighted regions on the PNG diagram
 *   - Token side card (white bg, readable text, RFC badges)
 *   - Dual tokens where applicable (ID token + Access token at login)
 *   - RFC 8693 stacked Request/Issued for both exchange steps
 *   - Aud trail strip above diagram
 *   - ← Prev / Pause / Resume / Next → / Stop controls
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../services/apiClient';
import ArchitectureDiagramPage from './ArchitectureDiagramPage';
import { TOKEN_FLOW_REGIONS } from '../config/diagram-token-flow-regions';

const TOKEN_FLOW_EVENT_MAP = [
  { category: 'agent_prompt',  tags: ['agent_prompt/llm_invoke'],         regionIds: ['agent1', 'llm'],  colorClass: 'active' },
  { category: 'agent_prompt',  tags: ['agent_prompt/llm_complete'],        regionIds: ['agent1'],         colorClass: 'active' },
  { category: 'agent_prompt',  tags: ['agent_prompt/heuristic_tool'],      regionIds: ['agent1'],         colorClass: 'active' },
  { category: 'token_exchange',tags: ['token_exchange/rfc8693-success'],   regionIds: ['pingone-aic', 'token-exchange-box', 'mcp-gateway-tf'], colorClass: 'active' },
  { category: 'token_exchange',tags: ['token_exchange/rfc8693-error'],     regionIds: ['pingone-aic', 'token-exchange-box', 'mcp-gateway-tf'], colorClass: 'active-error' },
  { category: 'authorize',     tags: ['authorize/bypass'],  regionIds: ['pingauthorize-tf'], colorClass: 'active' },
  { category: 'authorize',     tags: ['authorize/permit'],  regionIds: ['pingauthorize-tf'], colorClass: 'active-permit' },
  { category: 'authorize',     tags: ['authorize/deny'],    regionIds: ['pingauthorize-tf'], colorClass: 'active-error' },
  { category: 'oauth',         tags: ['oauth/user/callback'], regionIds: ['olb-application', 'pingone-aic'], colorClass: 'active' },
  { category: 'oauth',         tags: [],                      regionIds: ['olb-application', 'pingone-aic'], colorClass: 'active' },
  { category: 'mcp',           tags: [], regionIds: ['mcp-gateway-tf'], colorClass: 'active' },
  { category: 'agent',         tags: ['agent/message'], regionIds: ['chatbot'], colorClass: 'active' },
];

// ─── Simulation steps ─────────────────────────────────────────────────────────
// token  = primary card   token2 = secondary card (dual display)
// isTokenExchange = true  → stacked Request / ↓ Issued layout
// _type controls accent border color: oauth | exchange | permit | hitl | idtoken | mcp
// _rfcs = RFC badge pills shown in card header

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
    regionIds: ['olb-application', 'pingone-aic'], colorClass: 'active', label: 'OAuth 2.0 PKCE login',
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
    regionIds: ['pingone-aic', 'chatbot'], colorClass: 'active', label: 'IdP issues ID Token + Access Token (with may_act)',
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
    regionIds: ['chatbot', 'agent1'], colorClass: 'active', label: 'Agent takes over — BFF holds access token',
    token: {
      type: 'Access Token (held by BFF)',
      _type: 'oauth', _rfcs: ['RFC 8693'],
      aud: 'banking-app-client',
      sub: 'alice@bank.com',
      scope: 'openid profile banking:read banking:write',
      may_act: '{ "client_id": "bff-client-id" }',
      note: 'may_act is the key that enables RFC 8693 delegation — BFF is the authorized exchanger',
    },
  },
  {
    regionIds: ['agent1', 'llm'], colorClass: 'active', label: 'LLM processes intent → selects tool',
    token: {
      type: 'LLM Reasoning',
      _type: 'mcp',
      model: 'claude-3-5-sonnet',
      intent: '"show me my accounts"',
      action: 'tools/call: get_my_accounts',
      note: 'LangGraph heuristic fallback routes to MCP tool node',
    },
  },
  {
    regionIds: ['agent1', 'pingone-aic'], colorClass: 'active', label: 'RFC 8693 Exchange #1: user token → delegation token',
    isTokenExchange: true,
    token: {
      type: 'Token Exchange Request',
      _type: 'exchange', _rfcs: ['RFC 8693'],
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      subject_aud: 'banking-app-client',
      audience: 'mcp-gateway',
      scope: 'banking:read banking:write',
      note: 'BFF sends user access token; IdP validates may_act claim before issuing delegation token',
    },
    tokenOut: {
      type: 'Delegated Token (issued)',
      aud: 'mcp-gateway',
      sub: 'alice@bank.com',
      scope: 'banking:read banking:write',
      act: '{ "sub": "agent-client-id" }',
      note: 'act chain added — identifies the acting agent throughout the delegation path',
    },
  },
  {
    regionIds: ['pingone-aic', 'token-exchange-box'], colorClass: 'active', label: 'Delegation token in transit',
    token: {
      type: 'Delegated Token (active)',
      _type: 'oauth', _rfcs: ['RFC 8693', 'RFC 6750'],
      aud: 'mcp-gateway',
      sub: 'alice@bank.com',
      scope: 'banking:read banking:write',
      act: '{ "sub": "agent-client-id" }',
      note: 'act claim chains delegation — carried through all subsequent MCP calls',
    },
  },
  {
    regionIds: ['token-exchange-box', 'mcp-gateway-tf'], colorClass: 'active', label: 'Delegated token arrives at MCP Gateway',
    token: {
      type: 'Delegated Token (inbound at gateway)',
      _type: 'oauth', _rfcs: ['RFC 8693'],
      aud: 'mcp-gateway',
      sub: 'alice@bank.com',
      scope: 'banking:read banking:write',
      act: '{ "sub": "agent-client-id" }',
      note: 'Gateway validates: aud=mcp-gateway ✓  sub≠∅ ✓  act.sub≠∅ ✓  D-05 anti-bypass ✓',
    },
  },
  {
    regionIds: ['mcp-gateway-tf', 'pingauthorize-tf'], colorClass: 'active', label: 'PingAuthorize: McpToolsList + McpToolCall checks',
    token: {
      type: 'PingAuthorize Request',
      _type: 'mcp',
      DecisionContext: 'McpToolCall',
      ClientId: 'alice@bank.com',
      ActClientId: 'agent-client-id',
      ToolName: 'get_my_accounts',
      TokenScopes: 'banking:read',
      TokenAudience: 'mcp-gateway',
      note: 'Two calls: McpToolsList first (can agent discover?), McpToolCall second (can agent call this tool?)',
    },
  },
  {
    regionIds: ['pingauthorize-tf'], colorClass: 'active-permit', label: 'PERMIT — tool call allowed',
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
    regionIds: ['mcp-gateway-tf', 'mcp-olb'], colorClass: 'active', label: 'RFC 8693 Exchange #2: scope-narrowed → MCP Server',
    isTokenExchange: true,
    token: {
      type: 'Token Exchange Request (scope-narrowed)',
      _type: 'exchange', _rfcs: ['RFC 8693', 'RFC 8707'],
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      subject_aud: 'mcp-gateway',
      audience: 'mcp-olb-server',
      scope: 'banking:read',
      note: 'D-04: original token never forwarded — gateway requests new token scoped to MCP Server only',
    },
    tokenOut: {
      type: 'Tool-Scoped Token (issued)',
      aud: 'mcp-olb-server',
      scope: 'banking:read',
      sub: 'alice@bank.com',
      act: '{ "sub": "agent-client-id" }',
      note: 'Minimal scope: banking:read only — MCP Server cannot use this for write operations',
    },
  },
  {
    regionIds: ['mcp-olb', 'oauth-rs'], colorClass: 'active', label: 'MCP Server validates token → calls Banking API',
    token: {
      type: 'Resource Token (Banking API)',
      _type: 'oauth', _rfcs: ['RFC 6750'],
      aud: 'mcp-olb-server',
      scope: 'banking:read',
      sub: 'alice@bank.com',
      endpoint: 'GET /accounts',
      note: 'MCP Server validates: aud=mcp-olb-server ✓  may_act ✓  act.sub ✓  before calling API',
    },
  },
  {
    regionIds: ['mcp-invest', 'oauth-rs'], colorClass: 'active', label: 'Investments API called (same token)',
    token: {
      type: 'Resource Token (Investments API)',
      _type: 'oauth', _rfcs: ['RFC 6750'],
      aud: 'mcp-olb-server',
      scope: 'banking:read',
      sub: 'alice@bank.com',
      endpoint: 'GET /investments',
      note: 'Same tool-scoped token reused — MCP Server holds it for the duration of the tool call',
    },
  },
  {
    regionIds: ['chatbot'], colorClass: 'active', label: 'Results returned to user',
    token: {
      type: 'API Response',
      _type: 'mcp',
      status: '200 OK',
      data: '[{ "accountId":"ACC-001","balance":12450.00 },...]',
      route: 'Banking API → MCP Server → MCP Gateway → Agent → Chatbot → User',
    },
  },
];

const TOKEN_FLOW_AUD_HOPS = [
  { icon: '👤', label: 'User Token',     aud: 'banking-app-client', may_act: 'bff-client-id',  activeFrom: 3,  activeTo: 5  },
  { icon: '🔄', label: 'RFC 8693 #1',   aud: '(exchange)',          isExchange: true,            activeFrom: 6,  activeTo: 6  },
  { icon: '🔀', label: 'Gateway Token',  aud: 'mcp-gateway',        act: 'agent-client-id',      activeFrom: 7,  activeTo: 11 },
  { icon: '🔄', label: 'RFC 8693 #2',   aud: '(exchange)',          isExchange: true,            activeFrom: 12, activeTo: 12 },
  { icon: '🛠️', label: 'Tool Token',    aud: 'mcp-olb-server',     act: 'agent-client-id',      activeFrom: 13, activeTo: 14 },
];

const HIGHLIGHT_MS  = 4000;
const HISTORICAL_MS = 15000;
const STEP_MS       = 2500;
const TOTAL         = TOKEN_FLOW_SIMULATE_STEPS.length;

function mapEventToRegions(event) {
  for (const rule of TOKEN_FLOW_EVENT_MAP) {
    if (event.category !== rule.category) continue;
    if (rule.tags.length > 0 && !rule.tags.includes(event.tag)) continue;
    return rule.regionIds.map((id) => ({ regionId: id, colorClass: rule.colorClass }));
  }
  return [];
}

function scanKeywords(text) {
  if (!text || typeof text !== 'string') return [];
  const lower = text.toLowerCase();
  return TOKEN_FLOW_REGIONS.filter((r) => r.keywords?.some((kw) => lower.includes(kw)))
    .map((r) => ({ regionId: r.id, colorClass: 'active' }));
}

export default function ArchitectureTokenFlowPage({ user }) {
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
    const step = TOKEN_FLOW_SIMULATE_STEPS[i];
    setCurrentStep(i);
    setStepDetail(step.token   || null);
    setStepDetail2(step.token2 || null);
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
      audHops={TOKEN_FLOW_AUD_HOPS}
      tokenHistory={history}
      onClearHistory={clearHistory}
    />
  );
}
